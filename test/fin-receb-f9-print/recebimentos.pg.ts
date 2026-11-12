/**
 * OMNI-GESTAO-FINANCEIRO-RECEBIMENTOS-F9-PRINT-001 — PostgreSQL REAL (local, descartável).
 *
 * Handlers de produção contra o banco: `POST /api/financeiro/receber-lote`,
 * `GET /api/financeiro/recibo-recebimento`, `POST /api/pdv/receber-conta(-lote)`,
 * `GET /api/ops/contas-receber-list` e a busca `/api/clientes(/search)`.
 * Só `@/auth` (sessão sintética ADMIN) e `next/cache` são simulados; guards de módulo,
 * loja e permissão são os REAIS. Massa 100% sintética (lojas `qa-f9-*`).
 */
import { afterAll, describe, expect, it, vi } from "vitest"

/**
 * ADMIN de LOJA (não plataforma): acesso só às lojas QA criadas aqui, com os módulos
 * que o operador real tem. Os guards de módulo/loja/permissão rodam de verdade.
 */
const sessao = vi.hoisted(() => ({ id: "qa-f9-admin", name: "Operador QA F9", role: "ADMIN", lojas: [] as string[] }))
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({
    user: {
      id: sessao.id,
      name: sessao.name,
      role: sessao.role,
      allowedStoreIds: [...sessao.lojas],
      storeModules: Object.fromEntries(sessao.lojas.map((id) => [id, ["finance", "pdv", "cash", "catalog", "service", "sales"]])),
      lojaId: sessao.lojas[0],
    },
  })),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Selo de assinatura (cookie) da busca de clientes — mesmo papel da sessão: só identidade.
vi.mock("@/lib/api-auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-auth")>()),
  getVerifiedSubscriptionFromCookies: vi.fn(async () => ({ ok: true, vencimento: "2099-12-31", plano: "OURO", status: "ativa" })),
}))

import type { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { POST as receberLoteFinanceiro } from "@/app/api/financeiro/receber-lote/route"
import { GET as reciboRecebimento } from "@/app/api/financeiro/recibo-recebimento/route"
import { POST as pdvReceberConta } from "@/app/api/pdv/receber-conta/route"
import { POST as pdvReceberLote } from "@/app/api/pdv/receber-conta-lote/route"
import { GET as contasReceberList } from "@/app/api/ops/contas-receber-list/route"
import { GET as clientesGet } from "@/app/api/clientes/route"
import { POST as clientesSearch } from "@/app/api/clientes/search/route"
import { PATCH as receberPatch } from "@/app/api/financeiro/receber/route"

// ─── ambiente: só PostgreSQL loopback descartável ─────────────────────────────

function exigirBancoDescartavel(): void {
  const urls = [process.env.FIN_F9_TEST_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => v?.trim() || "")
  if (urls.some((v) => !v)) throw new Error("BLOQUEIO_EXPLICITO_PG: defina FIN_F9_TEST_DATABASE_URL, DATABASE_URL e DIRECT_URL (iguais).")
  const parsed = urls.map((v) => new URL(v))
  if (parsed.some((u) => !["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: só PostgreSQL em loopback.")
  }
  const alvo = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`
  if (parsed.some((u) => alvo(u) !== alvo(parsed[0]!))) throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem ser o MESMO banco.")
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("fin_receb_f9_qa")) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: o banco precisa ser o descartável fin_receb_f9_qa*.")
  }
}
exigirBancoDescartavel()

// ─── massa sintética ──────────────────────────────────────────────────────────

const SUFIXO = Date.now().toString(36)
let seq = 0
const lojas: string[] = []
const H = "x-assistec-loja-id"
type Json = Record<string, any>

async function novaLoja(): Promise<string> {
  const id = `qa-f9-${SUFIXO}-${++seq}`
  await prisma.store.create({ data: { id, name: `Loja QA F9 ${seq}` } })
  lojas.push(id)
  sessao.lojas.push(id)
  return id
}

async function novoCliente(storeId: string, name: string, extra: { phone?: string; document?: string } = {}) {
  return prisma.cliente.create({ data: { storeId, name, phone: extra.phone ?? null, document: extra.document ?? "" } })
}

async function novoTitulo(
  storeId: string,
  o: { cliente: string; valor: number; clienteId?: string; descricao?: string; historico?: Json[] },
): Promise<string> {
  const localKey = `receber:qa:${storeId}:${++seq}`
  await prisma.contaReceberTitulo.create({
    data: {
      storeId,
      localKey,
      descricao: o.descricao ?? `Crediário QA ${seq}`,
      cliente: o.cliente,
      valor: o.valor,
      vencimento: "2026-12-10",
      status: "pendente",
      payload: { ...(o.clienteId ? { clienteId: o.clienteId } : {}), historico: o.historico ?? [] } as Prisma.InputJsonValue,
    },
  })
  return localKey
}

function req(url: string, storeId: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Request {
  return new Request(`http://127.0.0.1${url}`, {
    method,
    headers: { [H]: storeId, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json(res: Response): Promise<{ status: number; body: Json }> {
  return { status: res.status, body: (await res.json()) as Json }
}

async function titulo(storeId: string, localKey: string) {
  const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId, localKey } } })
  const hist = ((t.payload as Json)?.historico ?? []) as Json[]
  return { ...t, hist }
}

async function movs(storeId: string) {
  return prisma.movimentacaoFinanceira.findMany({ where: { storeId } })
}

function chave(): string {
  return `qa-${SUFIXO}-${++seq}-${Math.random().toString(36).slice(2, 10)}`
}

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS qa_f9_falha_mov ON "movimentacoes_financeiras"`)
  await prisma.$disconnect()
})

// ─── Financeiro HUB: POST /api/financeiro/receber-lote ────────────────────────

describe("Financeiro HUB · recebimento atômico e idempotente", () => {
  it("quitação total: grava liquidação com forma + operação no ledger, 1 movimentação e devolve o comprovante", async () => {
    const s = await novaLoja()
    const c = await novoCliente(s, "Ana QA")
    const lk = await novoTitulo(s, { cliente: "Ana QA", valor: 180, clienteId: c.id })
    const op = chave()
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, {
      formaPagamento: "pix", idempotencyKey: op, itens: [{ localKey: lk, saldoEsperado: 180, valorReceber: 180 }],
    })))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, jaRegistrado: false, operacaoId: op, cliente: "Ana QA", formaPagamento: "pix", totalRecebido: 180, saldoDevedorCliente: 0 })
    expect(r.body.itens).toEqual([expect.objectContaining({ localKey: lk, valorRecebido: 180, saldoDepois: 0, statusFinal: "pago" })])
    expect(Date.parse(r.body.recebidoEm)).toBeGreaterThan(Date.now() - 60_000)
    const t = await titulo(s, lk)
    expect(t.status).toBe("pago")
    expect(t.hist).toEqual([expect.objectContaining({ tipo: "liquidacao", valor: 180, formaPagamento: "pix", loteId: op })])
    expect((await movs(s)).map((m) => m.valor)).toEqual([180])
  })

  it("parcial 131,82 de 180,00: saldo restante 48,18 no título, na resposta e no saldo do cliente", async () => {
    const s = await novaLoja()
    const c = await novoCliente(s, "Bruno QA")
    const lk = await novoTitulo(s, { cliente: "Bruno QA", valor: 180, clienteId: c.id })
    const outro = await novoTitulo(s, { cliente: "Bruno QA", valor: 50, clienteId: c.id })
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, {
      formaPagamento: "dinheiro", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 180, valorReceber: 131.82 }],
    })))
    expect(r.status).toBe(200)
    expect(r.body.itens[0]).toMatchObject({ valorRecebido: 131.82, saldoDepois: 48.18, statusFinal: "parcial" })
    expect(r.body.saldoDevedorCliente).toBe(98.18) // 48,18 deste + 50,00 do outro título
    expect((await titulo(s, lk)).status).toBe("parcial")
    expect((await titulo(s, outro)).hist).toHaveLength(0)
  })

  it("lote de 3 títulos do mesmo cliente: uma operação, um total do servidor, ledger carimbado em todos", async () => {
    const s = await novaLoja()
    const c = await novoCliente(s, "Carla QA")
    const a = await novoTitulo(s, { cliente: "Carla QA", valor: 100, clienteId: c.id })
    const b = await novoTitulo(s, { cliente: "Carla QA", valor: 60, clienteId: c.id })
    const d = await novoTitulo(s, { cliente: "Carla QA", valor: 40, clienteId: c.id })
    const op = chave()
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, {
      formaPagamento: "debito", idempotencyKey: op,
      itens: [
        { localKey: a, saldoEsperado: 100, valorReceber: 100 },
        { localKey: b, saldoEsperado: 60, valorReceber: 60 },
        { localKey: d, saldoEsperado: 40, valorReceber: 15 },
      ],
    })))
    expect(r.status).toBe(200)
    expect(r.body.totalRecebido).toBe(175)
    expect(r.body.saldoDevedorCliente).toBe(25)
    for (const lk of [a, b, d]) expect((await titulo(s, lk)).hist.every((e) => e.loteId === op)).toBe(true)
    expect(await movs(s)).toHaveLength(3)
  })

  it("retry com a MESMA chave devolve o mesmo resultado sem nova baixa nem nova movimentação", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, { cliente: "Davi QA", valor: 90 })
    const body = { formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 90, valorReceber: 40 }] }
    const r1 = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, body)))
    const r2 = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, body)))
    expect(r1.body.jaRegistrado).toBe(false)
    expect(r2.status).toBe(200)
    expect(r2.body).toMatchObject({ jaRegistrado: true, totalRecebido: 40, operacaoId: body.idempotencyKey })
    expect(r2.body.itens[0]).toMatchObject({ valorRecebido: 40, saldoDepois: 50 })
    expect((await titulo(s, lk)).hist).toHaveLength(1)
    expect(await movs(s)).toHaveLength(1)
  })

  it("clique duplo concorrente (mesma chave, mesmo instante): uma baixa só — a outra vira replay", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, { cliente: "Eva QA", valor: 70 })
    const body = { formaPagamento: "dinheiro", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 70, valorReceber: 70 }] }
    const [x, y] = await Promise.all([
      receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, body)).then(json),
      receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, body)).then(json),
    ])
    expect([x.status, y.status]).toEqual([200, 200])
    expect([x.body.jaRegistrado, y.body.jaRegistrado].sort()).toEqual([false, true])
    expect((await titulo(s, lk)).hist).toHaveLength(1)
    expect(await movs(s)).toHaveLength(1)
  })

  it("mesma chave com outro pedido = 409 idempotency_conflict, nada gravado de novo", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, { cliente: "Fábio QA", valor: 100 })
    const k = chave()
    await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, { formaPagamento: "pix", idempotencyKey: k, itens: [{ localKey: lk, saldoEsperado: 100, valorReceber: 30 }] }))
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, { formaPagamento: "pix", idempotencyKey: k, itens: [{ localKey: lk, saldoEsperado: 70, valorReceber: 20 }] })))
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("idempotency_conflict")
    expect((await titulo(s, lk)).hist).toHaveLength(1)
  })

  it("saldo esperado desatualizado (outra baixa no meio) = 409 saldo_divergente e lote inteiro recusado", async () => {
    const s = await novaLoja()
    const a = await novoTitulo(s, { cliente: "Gil QA", valor: 100 })
    const b = await novoTitulo(s, { cliente: "Gil QA", valor: 50, historico: [{ tipo: "pagamento", valor: 10, at: "2026-11-01T10:00:00.000Z" }] })
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, {
      formaPagamento: "pix", idempotencyKey: chave(),
      itens: [{ localKey: a, saldoEsperado: 100, valorReceber: 100 }, { localKey: b, saldoEsperado: 50, valorReceber: 50 }],
    })))
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("saldo_divergente")
    expect((await titulo(s, a)).hist).toHaveLength(0)
    expect(await movs(s)).toHaveLength(0)
  })

  it("título de OUTRA loja é invisível: 409 e nenhuma escrita em nenhuma das lojas", async () => {
    const s1 = await novaLoja()
    const s2 = await novaLoja()
    const alheio = await novoTitulo(s2, { cliente: "Hugo QA", valor: 80 })
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s1, {
      formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: alheio, saldoEsperado: 80, valorReceber: 80 }],
    })))
    expect(r.status).toBe(409)
    expect(r.body.detalhes[0].motivo).toBe("titulo_nao_encontrado")
    expect((await titulo(s2, alheio)).hist).toHaveLength(0)
  })

  it("body com lojaId diferente do header = 400 (nada lido nem gravado)", async () => {
    const s1 = await novaLoja()
    const s2 = await novaLoja()
    const lk = await novoTitulo(s1, { cliente: "Iara QA", valor: 10 })
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s1, {
      lojaId: s2, formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 10, valorReceber: 10 }],
    })))
    expect([400, 403]).toContain(r.status)
    expect((await titulo(s1, lk)).hist).toHaveLength(0)
  })

  it("homônimos sem vínculo de cadastro: lote recusado (422 cliente_divergente); título isolado continua possível", async () => {
    const s = await novaLoja()
    await novoCliente(s, "Maria Silva", { phone: "11911110001" })
    await novoCliente(s, "Maria  Silva", { phone: "11922220002" })
    const a = await novoTitulo(s, { cliente: "Maria Silva", valor: 30 })
    const b = await novoTitulo(s, { cliente: "MARIA SILVA", valor: 20 })
    const lote = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, {
      formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: a, saldoEsperado: 30, valorReceber: 30 }, { localKey: b, saldoEsperado: 20, valorReceber: 20 }],
    })))
    expect(lote.status).toBe(422)
    expect(lote.body.code).toBe("cliente_divergente")
    expect((await titulo(s, a)).hist).toHaveLength(0)
    const um = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, {
      formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: a, saldoEsperado: 30, valorReceber: 30 }],
    })))
    expect(um.status).toBe(200)
    expect(um.body.saldoDevedorCliente).toBeNull() // sem Cliente.id não se afirma o saldo total
  })

  it("títulos de clientes diferentes (clienteId distintos) num lote = 422, nada gravado", async () => {
    const s = await novaLoja()
    const c1 = await novoCliente(s, "João QA")
    const c2 = await novoCliente(s, "João QA")
    const a = await novoTitulo(s, { cliente: "João QA", valor: 10, clienteId: c1.id })
    const b = await novoTitulo(s, { cliente: "João QA", valor: 10, clienteId: c2.id })
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, {
      formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: a, saldoEsperado: 10, valorReceber: 10 }, { localKey: b, saldoEsperado: 10, valorReceber: 10 }],
    })))
    expect(r.status).toBe(422)
    expect((await titulo(s, a)).hist).toHaveLength(0)
  })

  it("falha na movimentação do 2º título desfaz TUDO (título 1 inclusive) e devolve erro — nunca sucesso", async () => {
    const s = await novaLoja()
    const a = await novoTitulo(s, { cliente: "Kátia QA", valor: 10 })
    const b = await novoTitulo(s, { cliente: "Kátia QA", valor: 20 })
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION qa_f9_falha_mov() RETURNS trigger AS $$ BEGIN IF NEW."storeId" = '${s}' AND NEW."valor" = 20 THEN RAISE EXCEPTION 'FALHA_INJETADA_MOV'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
    )
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS qa_f9_falha_mov ON "movimentacoes_financeiras"`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_f9_falha_mov BEFORE INSERT ON "movimentacoes_financeiras" FOR EACH ROW EXECUTE FUNCTION qa_f9_falha_mov()`)
    try {
      const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, {
        formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: a, saldoEsperado: 10, valorReceber: 10 }, { localKey: b, saldoEsperado: 20, valorReceber: 20 }],
      })))
      expect(r.status).toBeGreaterThanOrEqual(500)
      expect(r.body.ok).toBe(false)
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS qa_f9_falha_mov ON "movimentacoes_financeiras"`)
    }
    expect((await titulo(s, a)).hist).toHaveLength(0)
    expect((await titulo(s, a)).status).toBe("pendente")
    expect(await movs(s)).toHaveLength(0)
  })

  it("falha no 3º título de um lote de 3 desfaz os 2 primeiros (ledger, status e movimentações) e o retry grava tudo uma vez", async () => {
    const s = await novaLoja()
    const a = await novoTitulo(s, { cliente: "Nina QA", valor: 11 })
    const b = await novoTitulo(s, { cliente: "Nina QA", valor: 22 })
    const c = await novoTitulo(s, { cliente: "Nina QA", valor: 33 })
    const body = {
      formaPagamento: "dinheiro", idempotencyKey: chave(),
      itens: [{ localKey: a, saldoEsperado: 11, valorReceber: 11 }, { localKey: b, saldoEsperado: 22, valorReceber: 22 }, { localKey: c, saldoEsperado: 33, valorReceber: 33 }],
    }
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION qa_f9_falha_mov3() RETURNS trigger AS $$ BEGIN IF NEW."storeId" = '${s}' AND NEW."valor" = 33 THEN RAISE EXCEPTION 'FALHA_INJETADA_MOV_3'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
    )
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS qa_f9_falha_mov3 ON "movimentacoes_financeiras"`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_f9_falha_mov3 BEFORE INSERT ON "movimentacoes_financeiras" FOR EACH ROW EXECUTE FUNCTION qa_f9_falha_mov3()`)
    try {
      const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, body)))
      expect(r.status).toBeGreaterThanOrEqual(500)
      expect(r.body.ok).toBe(false)
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS qa_f9_falha_mov3 ON "movimentacoes_financeiras"`)
    }
    for (const lk of [a, b, c]) {
      expect((await titulo(s, lk)).hist).toHaveLength(0)
      expect((await titulo(s, lk)).status).toBe("pendente")
    }
    expect(await movs(s)).toHaveLength(0)

    // Falha transitória resolvida: o retry com a MESMA chave grava os 3 numa operação só.
    const ok = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, body)))
    expect(ok.status).toBe(200)
    expect(ok.body.totalRecebido).toBe(66)
    for (const lk of [a, b, c]) expect((await titulo(s, lk)).hist.map((e) => e.loteId)).toEqual([body.idempotencyKey])
    expect(await movs(s)).toHaveLength(3)
  })

  it("valor maior que o saldo e forma ausente são recusados antes de qualquer escrita (400)", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, { cliente: "Léo QA", valor: 10 })
    const a = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, { formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 10, valorReceber: 11 }] })))
    const b = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, { formaPagamento: " ", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 10, valorReceber: 5 }] })))
    expect([a.status, b.status]).toEqual([400, 400])
    expect((await titulo(s, lk)).hist).toHaveLength(0)
  })
})

describe("Financeiro HUB · correções da revisão independente", () => {
  it("retry de operação estornada depois NÃO devolve 'recebido' (409) e não grava", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, { cliente: "Rita QA", valor: 50 })
    const body = { formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 50, valorReceber: 20 }] }
    await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, body))
    await receberPatch(req("/api/financeiro/receber", s, { op: "estornar", localKey: lk, modo: "ultimo_pagamento" }, "PATCH"))
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, body)))
    expect(r.status).toBe(409)
    expect(r.body.ok).toBe(false)
    expect((await titulo(s, lk)).hist.filter((e) => e.tipo === "pagamento")).toHaveLength(1)
  })

  it("chave já usada em OUTRO título = 409 idempotency_conflict (não abre 2ª operação com o mesmo loteId)", async () => {
    const s = await novaLoja()
    const a = await novoTitulo(s, { cliente: "Saulo QA", valor: 10 })
    const b = await novoTitulo(s, { cliente: "Saulo QA", valor: 10 })
    const k = chave()
    await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, { formaPagamento: "pix", idempotencyKey: k, itens: [{ localKey: a, saldoEsperado: 10, valorReceber: 10 }] }))
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, { formaPagamento: "pix", idempotencyKey: k, itens: [{ localKey: b, saldoEsperado: 10, valorReceber: 10 }] })))
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("idempotency_conflict")
    expect((await titulo(s, b)).hist).toHaveLength(0)
  })

  it("título legado em aberto com o mesmo nome e sem vínculo: saldo devedor total fica null (não subestima)", async () => {
    const s = await novaLoja()
    const c = await novoCliente(s, "Tânia QA")
    const lk = await novoTitulo(s, { cliente: "Tânia QA", valor: 30, clienteId: c.id })
    await novoTitulo(s, { cliente: "tânia qa", valor: 500 })
    const r = await json(await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, { formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 30, valorReceber: 30 }] })))
    expect(r.status).toBe(200)
    expect(r.body.saldoDevedorCliente).toBeNull()
  })
})

// ─── 2ª via: GET /api/financeiro/recibo-recebimento ───────────────────────────

describe("2ª via do comprovante a partir do registro original", () => {
  it("lote de 2 títulos: reimprimir a partir de QUALQUER um devolve o comprovante consolidado da operação", async () => {
    const s = await novaLoja()
    const c = await novoCliente(s, "Nina QA")
    const a = await novoTitulo(s, { cliente: "Nina QA", valor: 100, clienteId: c.id, descricao: "Venda #1" })
    const b = await novoTitulo(s, { cliente: "Nina QA", valor: 80, clienteId: c.id, descricao: "Venda #2" })
    const op = chave()
    await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, {
      formaPagamento: "pix", idempotencyKey: op, itens: [{ localKey: a, saldoEsperado: 100, valorReceber: 100 }, { localKey: b, saldoEsperado: 80, valorReceber: 30 }],
    }))
    const lista = await json(await reciboRecebimento(req(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(b)}`, s)))
    expect(lista.body.pagamentos).toEqual([expect.objectContaining({ loteId: op, valor: 30, estornado: false })])
    const histAntes = (await titulo(s, a)).hist.length
    const via = await json(await reciboRecebimento(req(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(b)}&index=${lista.body.pagamentos[0].index}`, s)))
    expect(via.status).toBe(200)
    expect(via.body.recibo).toMatchObject({ operacaoId: op, cliente: "Nina QA", formaPagamento: "pix", totalRecebido: 130 })
    expect(via.body.recibo.itens).toEqual(expect.arrayContaining([
      expect.objectContaining({ descricao: "Venda #1", valorRecebido: 100, saldoRestante: 0 }),
      expect.objectContaining({ descricao: "Venda #2", valorRecebido: 30, saldoRestante: 50 }),
    ]))
    // Somente leitura: nenhuma baixa nova.
    expect((await titulo(s, a)).hist).toHaveLength(histAntes)
    expect(await movs(s)).toHaveLength(2)
  })

  it("pagamento estornado não tem 2ª via (409); título de outra loja não é lido (404)", async () => {
    const s = await novaLoja()
    const outra = await novaLoja()
    const lk = await novoTitulo(s, { cliente: "Otto QA", valor: 50 })
    await receberLoteFinanceiro(req("/api/financeiro/receber-lote", s, { formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 50, valorReceber: 20 }] }))
    const est = await receberPatch(req("/api/financeiro/receber", s, { op: "estornar", localKey: lk, modo: "ultimo_pagamento" }, "PATCH"))
    expect(est.status).toBe(200)
    const lista = await json(await reciboRecebimento(req(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(lk)}`, s)))
    expect(lista.body.pagamentos[0].estornado).toBe(true)
    const via = await json(await reciboRecebimento(req(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(lk)}&index=${lista.body.pagamentos[0].index}`, s)))
    expect(via.status).toBe(409)
    expect(via.body.code).toBe("pagamento_estornado")
    const alheio = await json(await reciboRecebimento(req(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(lk)}`, outra)))
    expect(alheio.status).toBe(404)
  })
})

// ─── PDV F5/F9 ────────────────────────────────────────────────────────────────

describe("PDV F5/F9 · ledger com forma e operação, lista inicial e busca", () => {
  it("singular grava forma + operação no histórico e a 2ª via sai com a forma real", async () => {
    const s = await novaLoja()
    const sessaoId = (await prisma.sessaoCaixa.create({ data: { storeId: s, operador: "QA", status: "ABERTA" } })).id
    const lk = await novoTitulo(s, { cliente: "Paula QA", valor: 60 })
    const op = chave()
    const r = await json(await pdvReceberConta(req("/api/pdv/receber-conta", s, { op: "parcial", localKey: lk, valor: 25, formaPagamento: "dinheiro", sessaoId, idempotencyKey: op })))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, valorRecebido: 25, operacaoId: op, formaPagamento: "dinheiro" })
    expect(r.body.audit.saldoAberto).toBe(35)
    const t = await titulo(s, lk)
    expect(t.hist[0]).toMatchObject({ tipo: "pagamento", valor: 25, formaPagamento: "dinheiro", loteId: op })
    const via = await json(await reciboRecebimento(req(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(lk)}&index=0`, s)))
    expect(via.body.recibo).toMatchObject({ formaPagamento: "dinheiro", totalRecebido: 25, operacaoId: op })
    expect(via.body.recibo.itens[0].saldoRestante).toBe(35)
  })

  it("lote do PDV devolve operacaoId/recebidoEm e a 2ª via consolida os N títulos num comprovante", async () => {
    const s = await novaLoja()
    const sessaoId = (await prisma.sessaoCaixa.create({ data: { storeId: s, operador: "QA", status: "ABERTA" } })).id
    const c = await novoCliente(s, "Rui QA")
    const a = await novoTitulo(s, { cliente: "Rui QA", valor: 40, clienteId: c.id })
    const b = await novoTitulo(s, { cliente: "Rui QA", valor: 30, clienteId: c.id })
    const op = chave()
    const r = await json(await pdvReceberLote(req("/api/pdv/receber-conta-lote", s, {
      sessaoId, formaPagamento: "pix", idempotencyKey: op,
      itens: [{ localKey: a, saldoEsperado: 40, valorReceber: 40 }, { localKey: b, saldoEsperado: 30, valorReceber: 10 }],
    })))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ operacaoId: op, totalRecebido: 50 })
    expect(typeof r.body.recebidoEm).toBe("string")
    const via = await json(await reciboRecebimento(req(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(a)}&index=0`, s)))
    expect(via.body.recibo.itens).toHaveLength(2)
    expect(via.body.recibo.totalRecebido).toBe(50)
  })

  it("contas-receber-list: clientes com aberto por id ou nome ÚNICO; homônimos e outra loja ficam de fora", async () => {
    const s = await novaLoja()
    const outra = await novaLoja()
    const ana = await novoCliente(s, "Ana Lista", { phone: "11900000001", document: "123.456.789-09" })
    await novoCliente(s, "Beto Único")
    await novoCliente(s, "Zé Homônimo")
    await novoCliente(s, "Zé  Homonimo")
    await novoCliente(s, "Sem Dívida")
    await novoTitulo(s, { cliente: "Ana Lista", valor: 100, clienteId: ana.id })
    await novoTitulo(s, { cliente: "Ana Lista", valor: 50, clienteId: ana.id, historico: [{ tipo: "pagamento", valor: 20, at: "2026-11-01T00:00:00.000Z" }] })
    await novoTitulo(s, { cliente: "beto unico", valor: 10 })
    await novoTitulo(s, { cliente: "Zé Homônimo", valor: 999 })
    const alheio = await novoCliente(outra, "Ana Lista")
    await novoTitulo(outra, { cliente: "Ana Lista", valor: 777, clienteId: alheio.id })

    const r = await json(await contasReceberList(req("/api/ops/contas-receber-list", s)))
    expect(r.status).toBe(200)
    expect(r.body.clientesComAberto).toEqual([
      expect.objectContaining({ id: ana.id, name: "Ana Lista", qtdAbertos: 2, totalAberto: 130, phone: "•••0001", document: "•••909" }),
      expect.objectContaining({ name: "Beto Único", qtdAbertos: 1, totalAberto: 10 }),
    ])
  })

  it("busca de clientes: GET ?q= é recusado (400) e POST /api/clientes/search acha por nome, telefone e CPF só na loja", async () => {
    const s = await novaLoja()
    const outra = await novaLoja()
    await novoCliente(s, "Carlos Busca", { phone: "11955554444", document: "98765432100" })
    await novoCliente(outra, "Carlos Busca Outra Loja")
    const get = await clientesGet(req("/api/clientes?q=Carlos", s))
    expect(get.status).toBe(400)
    for (const q of ["carlos", "55554444", "98765432100"]) {
      const r = await json(await clientesSearch(req("/api/clientes/search", s, { q })))
      expect(r.status).toBe(200)
      expect(r.body.clientes.map((c: Json) => c.name)).toEqual(["Carlos Busca"])
    }
    const vazio = await json(await clientesSearch(req("/api/clientes/search", s, { q: "inexistente-xyz" })))
    expect(vazio.body.clientes).toEqual([])
  })
})
