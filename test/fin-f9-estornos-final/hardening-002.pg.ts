/**
 * OMNI-FINANCEIRO-F9-ESTORNOS-FINAL-HARDENING-002 — PostgreSQL REAL descartável (`fin_final_qa*`).
 *
 *  H. `POST /api/pdv/receber-conta` (F9) × fechamento de caixa: a sessão é relida e travada
 *     (FOR SHARE) dentro da transação; recebimento novo nunca cai em sessão fechada e o
 *     replay de uma operação já gravada continua valendo depois do fechamento.
 *  P. `PATCH /api/financeiro/pagar` op=liquidar|parcial|estornar: título travado + ledger
 *     (CAS) + movimentação numa transação; estorno pelo pagamento ATIVO (identidade =
 *     índice no histórico) com o valor exato; `pagoEsperado` contra 2º clique/retry.
 *
 * Handlers de produção; só `@/auth`, `next/cache` e o selo de assinatura são simulados.
 * Massa 100% sintética (lojas `qa-h002-*`).
 */
import { afterAll, describe, expect, it, vi } from "vitest"

const sessao = vi.hoisted(() => ({ id: "qa-h002-admin", name: "Operador QA H002", role: "ADMIN", lojas: [] as string[] }))
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
vi.mock("@/lib/api-auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-auth")>()),
  getVerifiedSubscriptionFromCookies: vi.fn(async () => ({ ok: true, vencimento: "2099-12-31", plano: "OURO", status: "ativa" })),
}))

import type { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { POST as pdvReceberConta } from "@/app/api/pdv/receber-conta/route"
import { GET as pagarGet, PATCH as pagarPatch } from "@/app/api/financeiro/pagar/route"
import { sumPagamentosFromHistoricoPayloadContaPagar } from "@/lib/financeiro/services/contas-pagar-service"
import { sumPagamentosFromHistoricoPayload } from "@/lib/financeiro/services/contas-receber-service"
import { generalAggregates } from "@/lib/relatorios/geral"
import { parseReportQuery } from "@/lib/relatorios/contracts"

function exigirBancoDescartavel(): void {
  const urls = [process.env.FIN_FINAL_TEST_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => v?.trim() || "")
  if (urls.some((v) => !v)) throw new Error("BLOQUEIO_EXPLICITO_PG: defina FIN_FINAL_TEST_DATABASE_URL (loopback).")
  const parsed = urls.map((v) => new URL(v))
  if (parsed.some((u) => !["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: só PostgreSQL em loopback.")
  }
  const alvo = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`
  if (parsed.some((u) => alvo(u) !== alvo(parsed[0]!))) throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem ser o MESMO banco.")
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("fin_final_qa")) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: o banco precisa ser o descartável fin_final_qa*.")
  }
}
exigirBancoDescartavel()

const SUFIXO = Date.now().toString(36)
let seq = 0
const H = "x-assistec-loja-id"
type Json = Record<string, any>
const r2 = (n: number) => Math.round(n * 100) / 100
const chave = () => `qa-h002-${SUFIXO}-${++seq}-${Math.random().toString(36).slice(2, 8)}`

async function novaLoja(): Promise<string> {
  const id = `qa-h002-${SUFIXO}-${++seq}`
  await prisma.store.create({ data: { id, name: `Loja QA H002 ${seq}` } })
  sessao.lojas.push(id)
  return id
}

async function abrirCaixa(storeId: string): Promise<string> {
  return (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", saldoInicial: 0, status: "ABERTA" } })).id
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

/** Espera até haver `minimo` backends deste banco bloqueados em trava (prova de espera real). */
async function esperarBloqueio(minimo = 1, timeoutMs = 15_000): Promise<void> {
  const fim = Date.now() + timeoutMs
  while (Date.now() < fim) {
    const [r] = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
    if ((r?.n ?? 0) >= minimo) return
    await new Promise((ok) => setTimeout(ok, 50))
  }
  const ativos = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT pid, state, wait_event_type, wait_event, left(query, 160) AS query FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()`
  throw new Error(`nenhuma espera por trava (mínimo ${minimo}) em ${timeoutMs} ms: ${JSON.stringify(ativos)}`)
}

/** Transação que executa `fn` e fica ABERTA (segurando as travas) até `soltar()`. */
function segurar(fn: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let soltar!: () => void
  let pronto!: () => void
  const liberado = new Promise<void>((ok) => (soltar = ok))
  const travado = new Promise<void>((ok) => (pronto = ok))
  const fim = prisma.$transaction(
    async (tx) => {
      await fn(tx)
      pronto()
      await liberado
    },
    { maxWait: 10_000, timeout: 60_000 },
  )
  return { travado, soltar, fim }
}

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── H — F9 × fechamento de caixa ─────────────────────────────────────────────

async function novoTituloReceber(storeId: string, valor: number): Promise<string> {
  const localKey = `receber:qa:${storeId}:${++seq}`
  await prisma.contaReceberTitulo.create({
    data: { storeId, localKey, descricao: `Crediário QA ${seq}`, cliente: `Cliente QA ${seq}`, valor, vencimento: "2026-12-10", status: "pendente", payload: { historico: [] } },
  })
  return localKey
}

function corpoF9(sessaoId: string, localKey: string, valor: number, key = chave()) {
  return { op: "parcial", localKey, valor, formaPagamento: "dinheiro", sessaoId, idempotencyKey: key }
}
async function f9(storeId: string, corpo: Json) {
  return json(await pdvReceberConta(req("/api/pdv/receber-conta", storeId, corpo)))
}

async function estadoReceber(storeId: string, localKey: string) {
  const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId, localKey } } })
  return {
    titulo: t,
    recebido: sumPagamentosFromHistoricoPayload(t.payload),
    hist: ((t.payload as Json)?.historico ?? []) as Json[],
    movs: await prisma.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: t.id } }),
    caixa: await prisma.caixaOperacao.findMany({ where: { storeId }, orderBy: { at: "asc" } }),
  }
}

describe("H · F9 (PDV) × fechamento de caixa", () => {
  it("H1. fechamento em voo commita primeiro → o F9 espera, vê FECHADA e recusa sem escrever nada", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const lk = await novoTituloReceber(s, 300)
    const fechamento = segurar((tx) => tx.$executeRaw`UPDATE "sessoes_caixa" SET "status" = 'FECHADA', "fechadaEm" = now() WHERE "id" = ${sessaoId}`)
    await fechamento.travado
    const recebimento = f9(s, corpoF9(sessaoId, lk, 100))
    await esperarBloqueio(1) // o F9 está parado na trava da sessão
    fechamento.soltar()
    await fechamento.fim
    const r = await recebimento
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("caixa_fechado")
    const e = await estadoReceber(s, lk)
    expect(e.hist).toHaveLength(0)
    expect(e.movs).toHaveLength(0)
    expect(e.caixa).toHaveLength(0)
  })

  it("H2. recebimento em voo → o fechamento espera ele terminar; a entrada fica na sessão ANTES do fechamento", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const lk = await novoTituloReceber(s, 300)
    // Segura o título: o F9 trava a sessão (FOR SHARE) e para na escrita do título.
    const titulo = segurar((tx) => tx.$queryRaw`SELECT "id" FROM "contas_receber_titulos" WHERE "storeId" = ${s} AND "localKey" = ${lk} FOR UPDATE`)
    await titulo.travado
    const recebimento = f9(s, corpoF9(sessaoId, lk, 100))
    await esperarBloqueio(1)
    // `.then` dispara a PrismaPromise agora (ela é preguiçosa: sem consumidor, nada é enviado).
    const fechar = prisma.sessaoCaixa.update({ where: { id: sessaoId }, data: { status: "FECHADA", fechadaEm: new Date() } }).then((r) => r)
    await esperarBloqueio(2) // o fechamento espera a trava do F9 na sessão
    titulo.soltar()
    await titulo.fim
    const r = await recebimento
    const fechada = await fechar
    expect(r.status).toBe(200)
    expect(r.body.jaRegistrado).toBe(false)
    expect(fechada.status).toBe("FECHADA")
    // O fechamento ESPEROU (esperarBloqueio(2) acima): a entrada foi gravada com a sessão
    // ainda aberta e entra no fechamento dela.
    const e = await estadoReceber(s, lk)
    expect(e.recebido).toBe(100)
    expect(e.caixa).toHaveLength(1)
    expect(e.caixa[0]!.sessaoId).toBe(sessaoId)
  })

  it("H3. resposta perdida + caixa fechado depois → o retry com a mesma chave devolve o original (replay), sem escrever", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const lk = await novoTituloReceber(s, 300)
    const corpo = corpoF9(sessaoId, lk, 100)
    expect((await f9(s, corpo)).status).toBe(200)
    await prisma.sessaoCaixa.update({ where: { id: sessaoId }, data: { status: "FECHADA", fechadaEm: new Date() } })
    const antes = await estadoReceber(s, lk)
    const retry = await f9(s, corpo)
    expect(retry.status).toBe(200)
    expect(retry.body).toMatchObject({ jaRegistrado: true, valorRecebido: 100 })
    const depois = await estadoReceber(s, lk)
    expect(depois.hist).toHaveLength(antes.hist.length)
    expect(depois.caixa).toHaveLength(antes.caixa.length)
    // operação NOVA na sessão fechada continua recusada
    const nova = await f9(s, corpoF9(sessaoId, lk, 50))
    expect(nova.status).toBe(409)
    expect(nova.body.code).toBe("caixa_fechado")
  })

  it("H4. clique duplo simultâneo (mesma chave) → UM pagamento, UMA entrada de caixa, UMA movimentação", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const lk = await novoTituloReceber(s, 300)
    const corpo = corpoF9(sessaoId, lk, 100)
    const rs = await Promise.all([f9(s, corpo), f9(s, corpo)])
    expect(rs.some((r) => r.status === 200)).toBe(true)
    const e = await estadoReceber(s, lk)
    expect(e.hist.filter((h) => h.tipo === "pagamento")).toHaveLength(1)
    expect(e.caixa).toHaveLength(1)
    expect(e.movs).toHaveLength(1)
  })
})

// ─── P — Contas a Pagar ───────────────────────────────────────────────────────

async function novoTituloPagar(storeId: string, valor: number, historico: Json[] = []): Promise<string> {
  const localKey = `pagar:qa:${storeId}:${++seq}`
  await prisma.contaPagarTitulo.create({
    data: {
      storeId, localKey, descricao: `Fornecedor QA ${seq}`, valor, vencimento: "2026-12-10",
      status: historico.length ? "parcial" : "pendente", payload: { historico } as Prisma.InputJsonValue,
    },
  })
  return localKey
}

async function pagar(storeId: string, body: Json) {
  return json(await pagarPatch(req("/api/financeiro/pagar", storeId, body, "PATCH")))
}
const parcialP = (s: string, localKey: string, valor: number) => pagar(s, { op: "parcial", localKey, valor })
const estornarP = (s: string, localKey: string, extra: Json = {}) => pagar(s, { op: "estornar", localKey, motivo: "QA", ...extra })

async function estadoPagar(storeId: string, localKey: string) {
  const t = await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId, localKey } } })
  const hist = ((t.payload as Json)?.historico ?? []) as Json[]
  const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: t.id }, orderBy: { createdAt: "asc" } })
  const saidas = movs.filter((m) => m.tipo === "saida").map((m) => m.valor)
  const entradas = movs.filter((m) => m.tipo === "entrada").map((m) => m.valor)
  const pago = sumPagamentosFromHistoricoPayloadContaPagar(t.payload)
  return {
    titulo: t, hist, movs, saidas, entradas, pago,
    movLiquido: r2(saidas.reduce((a, b) => a + b, 0) - entradas.reduce((a, b) => a + b, 0)),
    refs: hist.filter((h) => h.tipo === "estorno_pagamento").map((h) => h.refHistoricoIndex),
  }
}

async function contagem(storeId: string) {
  const [titulos, movs] = await Promise.all([
    prisma.contaPagarTitulo.findMany({ where: { storeId }, select: { localKey: true, status: true, payload: true } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
  ])
  return { titulos: JSON.stringify(titulos), movs }
}

function conciliado(e: Awaited<ReturnType<typeof estadoPagar>>) {
  // líquido movimentado (saídas − entradas de estorno) = o que o ledger diz pago
  expect(e.movLiquido).toBeCloseTo(e.pago, 2)
}

describe("P · Contas a Pagar — pagamento e estorno por identidade", () => {
  it("P1. integral: liquidar 300 → UMA saída 300; liquidar de novo responde ok sem gravar", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    const r = await pagar(s, { op: "liquidar", localKey: lk })
    expect(r.status).toBe(200)
    expect(r.body.valorPago).toBe(300)
    let e = await estadoPagar(s, lk)
    expect(e.titulo.status).toBe("pago")
    expect(e.saidas).toEqual([300])
    conciliado(e)
    const antes = await contagem(s)
    expect((await pagar(s, { op: "liquidar", localKey: lk })).status).toBe(200)
    expect(await contagem(s)).toEqual(antes)
    e = await estadoPagar(s, lk)
    conciliado(e)
  })

  it("P2. parciais 100 + 50 (a 2ª MENOR) → saídas [100, 50]; liquidar o resto → +150", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    expect((await parcialP(s, lk, 100)).status).toBe(200)
    expect((await parcialP(s, lk, 50)).status).toBe(200)
    expect((await pagar(s, { op: "liquidar", localKey: lk })).body.valorPago).toBe(150)
    const e = await estadoPagar(s, lk)
    expect(e.saidas).toEqual([100, 50, 150])
    expect(e.pago).toBe(300)
    conciliado(e)
  })

  it("P3. estorno do último (50): entrada EXATA de 50, ref ao pagamento 1, saldo devedor 200", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    await parcialP(s, lk, 100)
    await parcialP(s, lk, 50)
    const r = await estornarP(s, lk, { pagoEsperado: 150 })
    expect(r.status).toBe(200)
    expect(r.body.valorEstornado).toBe(50)
    const e = await estadoPagar(s, lk)
    expect(e.entradas).toEqual([50])
    expect(e.refs).toEqual([1])
    expect(e.pago).toBe(100)
    expect(e.titulo.status).toBe("parcial")
    conciliado(e)
    // saldo devedor pela API (audit)
    const g = await json(await pagarGet(req("/api/financeiro/pagar", s)))
    const audit = (g.body.audit as Json[]).find((a) => a.localKey === lk)!
    expect(audit).toMatchObject({ pago: 100, restante: 200 })
  })

  it("P4. pagar 100 → estornar → pagar 100 → pagar 50 → estornar o último: só os 50 voltam", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    await parcialP(s, lk, 100)
    expect((await estornarP(s, lk)).body.valorEstornado).toBe(100)
    await parcialP(s, lk, 100)
    await parcialP(s, lk, 50)
    const r = await estornarP(s, lk, { pagoEsperado: 150 })
    expect(r.body.valorEstornado).toBe(50)
    const e = await estadoPagar(s, lk)
    expect(e.saidas).toEqual([100, 100, 50])
    expect(e.entradas).toEqual([100, 50])
    expect(e.refs).toEqual([0, 3])
    expect(e.pago).toBe(100)
    conciliado(e)
  })

  it("P5. dois estornos seguidos estornam pagamentos DIFERENTES (antes: o mesmo 50 duas vezes)", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    await parcialP(s, lk, 100)
    await parcialP(s, lk, 50)
    expect((await estornarP(s, lk)).body.valorEstornado).toBe(50)
    expect((await estornarP(s, lk)).body.valorEstornado).toBe(100)
    const e = await estadoPagar(s, lk)
    expect(e.refs).toEqual([1, 0])
    expect(e.pago).toBe(0)
    expect(e.titulo.status).toBe("pendente")
    conciliado(e)
    const antes = await contagem(s)
    const nada = await estornarP(s, lk)
    expect(nada.status).toBe(422)
    expect(nada.body.code).toBe("estornar_sem_pagamento_para_estornar")
    expect(await contagem(s)).toEqual(antes)
  })

  it("P6. três pagamentos IGUAIS (50) → dois estornos atingem os índices 2 e 1, nunca o mesmo", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    for (let i = 0; i < 3; i++) await parcialP(s, lk, 50)
    await estornarP(s, lk, { pagoEsperado: 150 })
    await estornarP(s, lk, { pagoEsperado: 100 })
    const e = await estadoPagar(s, lk)
    expect(e.refs).toEqual([2, 1])
    expect(e.pago).toBe(50)
    conciliado(e)
  })

  it("P7. clique duplo simultâneo com pagoEsperado → UM estorno; o outro 409 sem escrita", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    await parcialP(s, lk, 100)
    await parcialP(s, lk, 50)
    const rs = await Promise.all([estornarP(s, lk, { pagoEsperado: 150 }), estornarP(s, lk, { pagoEsperado: 150 })])
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409])
    expect(rs.find((r) => r.status === 409)!.body.code).toBe("estornar_titulo_alterado")
    const e = await estadoPagar(s, lk)
    expect(e.refs).toEqual([1])
    expect(e.pago).toBe(100)
    conciliado(e)
  })

  it("P8. retry do estorno depois da resposta perdida (mesmo pagoEsperado) → 409, nada muda", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    await parcialP(s, lk, 100)
    await parcialP(s, lk, 50)
    expect((await estornarP(s, lk, { pagoEsperado: 150 })).status).toBe(200)
    const antes = await contagem(s)
    const retry = await estornarP(s, lk, { pagoEsperado: 150 })
    expect(retry.status).toBe(409)
    expect(await contagem(s)).toEqual(antes)
  })

  it("P9. pagamento e estorno CONCORRENTES no mesmo título → serializados; nenhum lançamento perdido", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    await parcialP(s, lk, 100)
    const [p, est] = await Promise.all([parcialP(s, lk, 50), estornarP(s, lk)])
    expect(p.status).toBe(200)
    expect(est.status).toBe(200)
    const e = await estadoPagar(s, lk)
    expect(e.hist.filter((h) => h.tipo === "pagamento")).toHaveLength(2)
    expect(e.refs).toHaveLength(1)
    expect(e.pago).toBe(r2(150 - Number(est.body.valorEstornado)))
    conciliado(e)
  })

  it("P10. índice explícito: estornar o pagamento 0 quando há 0 e 1; repetir o índice → 409 pagamento_ja_estornado", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    await parcialP(s, lk, 100)
    await parcialP(s, lk, 50)
    expect((await estornarP(s, lk, { pagamentoIndex: 0 })).body.valorEstornado).toBe(100)
    const antes = await contagem(s)
    const de2 = await estornarP(s, lk, { pagamentoIndex: 0 })
    expect(de2.status).toBe(409)
    expect(de2.body.code).toBe("estornar_pagamento_ja_estornado")
    expect(await contagem(s)).toEqual(antes)
    const e = await estadoPagar(s, lk)
    expect(e.pago).toBe(50)
    conciliado(e)
  })

  it("P11. histórico ambíguo (estorno legado sem referência, ou o mesmo índice estornado 2×) → 409 sem escrita", async () => {
    const s = await novaLoja()
    const semRef = await novoTituloPagar(s, 300, [
      { tipo: "pagamento", valor: 50, at: "2026-10-01T12:00:00.000Z" },
      { tipo: "pagamento", valor: 50, at: "2026-10-02T12:00:00.000Z" },
      { tipo: "estorno_pagamento", valor: 50, at: "2026-10-03T12:00:00.000Z" },
    ])
    const duplicado = await novoTituloPagar(s, 300, [
      { tipo: "pagamento", valor: 100, at: "2026-10-01T12:00:00.000Z" },
      { tipo: "pagamento", valor: 50, at: "2026-10-02T12:00:00.000Z" },
      { tipo: "estorno_pagamento", valor: 50, refHistoricoIndex: 1, at: "2026-10-03T12:00:00.000Z" },
      { tipo: "estorno_pagamento", valor: 50, refHistoricoIndex: 1, at: "2026-10-04T12:00:00.000Z" },
    ])
    const antes = await contagem(s)
    for (const lk of [semRef, duplicado]) {
      const r = await estornarP(s, lk)
      expect(r.status).toBe(409)
      expect(r.body.code).toBe("estornar_historico_ambiguo")
    }
    expect(await contagem(s)).toEqual(antes)
  })

  it("P12. Relatório Geral: pagamentos e estornos do Pagar aparecem com o valor exato, sem venda nem recebimento", async () => {
    const s = await novaLoja()
    const lk = await novoTituloPagar(s, 300)
    await parcialP(s, lk, 100)
    await parcialP(s, lk, 50)
    await estornarP(s, lk, { pagoEsperado: 150 })
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
    const raw = await generalAggregates(prisma, s, parseReportQuery(new URLSearchParams({ from: hoje, to: hoje })), { service: false })
    const soma = (classe: string) => r2(Math.abs(raw.ledger.filter((l) => l.classe === classe).reduce((t, l) => t + Number(l.valor), 0)))
    expect(soma("pagamento_titulo")).toBeCloseTo(150, 2)
    expect(soma("estorno_pagamento")).toBeCloseTo(50, 2)
    expect(soma("recebimento_titulo")).toBe(0)
    expect(soma("venda_avista")).toBe(0)
  })

  it("P13. título de outra loja não existe aqui → recusa, nada gravado em nenhuma das duas", async () => {
    const a = await novaLoja()
    const b = await novaLoja()
    const lkB = await novoTituloPagar(b, 300)
    await parcialP(b, lkB, 100)
    const antesA = await contagem(a)
    const antesB = await contagem(b)
    for (const body of [{ op: "estornar", localKey: lkB }, { op: "parcial", localKey: lkB, valor: 50 }, { op: "liquidar", localKey: lkB }]) {
      const r = await pagar(a, body)
      expect(r.status).toBe(422)
      expect(r.body.code).toMatch(/_not_found$/)
    }
    expect(await contagem(a)).toEqual(antesA)
    expect(await contagem(b)).toEqual(antesB)
  })
})
