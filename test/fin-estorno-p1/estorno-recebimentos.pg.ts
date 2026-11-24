/**
 * FINANCEIRO-ESTORNO-RECEBIMENTOS-P1-001 — PostgreSQL REAL (local, descartável).
 *
 * Handlers de produção contra o banco: `PATCH /api/financeiro/receber` (Financeiro HUB),
 * `POST /api/pdv/receber-conta` (PDV F9/F5) e `POST /api/pdv/receber-conta-lote`.
 * Só `@/auth` (sessão sintética ADMIN de loja) e `next/cache` são simulados; guards de
 * módulo, loja e permissão são os REAIS. Massa 100% sintética (lojas `qa-estp1-*`).
 *
 * Invariante conferida em todo cenário (`conciliado`):
 *   ledger do título (soma líquida) = movimentações (entradas − estornos)
 *   e, para o que passou pelo caixa, recebimento_cr − estorno_recebimento_cr = o que segue recebido.
 */
import { afterAll, describe, expect, it, vi } from "vitest"

const sessao = vi.hoisted(() => ({ id: "qa-estp1-admin", name: "Operador QA Estorno", role: "ADMIN", lojas: [] as string[] }))
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

import type { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { PATCH as receberPatch } from "@/app/api/financeiro/receber/route"
import { POST as pdvReceberConta } from "@/app/api/pdv/receber-conta/route"
import { POST as pdvReceberLote } from "@/app/api/pdv/receber-conta-lote/route"
import { estornarMovimentacaoPorReferencia } from "@/lib/financeiro/services/movimentacoes-service"
import { sumPagamentosFromHistoricoPayload } from "@/lib/financeiro/services/contas-receber-service"
import { aggregateCaixaOperacoes } from "@/lib/caixa-fechamento-resumo"

// ─── ambiente: só PostgreSQL loopback descartável ─────────────────────────────

function exigirBancoDescartavel(): void {
  const urls = [process.env.FIN_ESTORNO_TEST_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => v?.trim() || "")
  if (urls.some((v) => !v)) throw new Error("BLOQUEIO_EXPLICITO_PG: defina FIN_ESTORNO_TEST_DATABASE_URL (loopback).")
  const parsed = urls.map((v) => new URL(v))
  if (parsed.some((u) => !["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: só PostgreSQL em loopback.")
  }
  const alvo = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`
  if (parsed.some((u) => alvo(u) !== alvo(parsed[0]!))) throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem ser o MESMO banco.")
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("fin_estorno_p1_qa")) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: o banco precisa ser o descartável fin_estorno_p1_qa*.")
  }
}
exigirBancoDescartavel()

// ─── massa sintética ──────────────────────────────────────────────────────────

const SUFIXO = Date.now().toString(36)
let seq = 0
const H = "x-assistec-loja-id"
type Json = Record<string, any>

async function novaLoja(): Promise<string> {
  const id = `qa-estp1-${SUFIXO}-${++seq}`
  await prisma.store.create({ data: { id, name: `Loja QA Estorno ${seq}` } })
  sessao.lojas.push(id)
  return id
}

async function abrirCaixa(storeId: string): Promise<string> {
  const s = await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", saldoInicial: 0, status: "ABERTA" } })
  return s.id
}

async function fecharCaixa(sessaoId: string): Promise<void> {
  await prisma.sessaoCaixa.update({ where: { id: sessaoId }, data: { status: "FECHADA", fechadaEm: new Date() } })
}

async function novoTitulo(storeId: string, valor: number, historico: Json[] = []): Promise<string> {
  const localKey = `receber:qa:${storeId}:${++seq}`
  await prisma.contaReceberTitulo.create({
    data: {
      storeId,
      localKey,
      descricao: `Crediário QA ${seq}`,
      cliente: `Cliente QA ${seq}`,
      valor,
      vencimento: "2026-12-10",
      status: historico.length ? "parcial" : "pendente",
      payload: { historico } as Prisma.InputJsonValue,
    },
  })
  return localKey
}

function req(url: string, storeId: string, body: unknown, method = "POST"): Request {
  return new Request(`http://127.0.0.1${url}`, {
    method,
    headers: { [H]: storeId, "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function json(res: Response): Promise<{ status: number; body: Json }> {
  return { status: res.status, body: (await res.json()) as Json }
}

const chave = () => `qa-${SUFIXO}-${++seq}-${Math.random().toString(36).slice(2, 8)}`

async function receberPdv(storeId: string, sessaoId: string, localKey: string, valor: number | null, forma = "dinheiro") {
  return json(
    await pdvReceberConta(
      req("/api/pdv/receber-conta", storeId, {
        op: valor === null ? "liquidar" : "parcial",
        localKey,
        ...(valor === null ? {} : { valor }),
        formaPagamento: forma,
        sessaoId,
        idempotencyKey: chave(),
      }),
    ),
  )
}

async function receberHub(storeId: string, localKey: string, valor: number) {
  return json(await receberPatch(req("/api/financeiro/receber", storeId, { op: "parcial", localKey, valor, formaPagamento: "pix" }, "PATCH")))
}

async function estornarHub(storeId: string, localKey: string, extra: Json = {}) {
  return json(
    await receberPatch(
      req("/api/financeiro/receber", storeId, { op: "estornar", localKey, modo: "ultimo_pagamento", motivo: "QA", ...extra }, "PATCH"),
    ),
  )
}

async function estado(storeId: string, localKey: string) {
  const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId, localKey } } })
  const hist = ((t.payload as Json)?.historico ?? []) as Json[]
  const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: t.id }, orderBy: { createdAt: "asc" } })
  const caixa = await prisma.caixaOperacao.findMany({ where: { storeId }, orderBy: { at: "asc" } })
  const r2 = (n: number) => Math.round(n * 100) / 100
  const entradas = r2(movs.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.valor, 0))
  const saidas = r2(movs.filter((m) => m.tipo === "saida").reduce((s, m) => s + m.valor, 0))
  const recebido = sumPagamentosFromHistoricoPayload(t.payload)
  return {
    titulo: t,
    hist,
    movs,
    caixa,
    recebido,
    saldo: r2(t.valor - recebido),
    movLiquido: r2(entradas - saidas),
    saidas: movs.filter((m) => m.tipo === "saida").map((m) => m.valor),
    caixaRec: caixa.filter((c) => c.tipo === "recebimento_cr"),
    caixaEst: caixa.filter((c) => c.tipo === "estorno_recebimento_cr"),
  }
}

/** Financeiro e (quando aplicável) Caixa batem com o ledger do título. */
function conciliado(e: Awaited<ReturnType<typeof estado>>, recebidoNoCaixa: number | null) {
  expect(e.movLiquido).toBeCloseTo(e.recebido, 2)
  if (recebidoNoCaixa !== null) {
    const agg = aggregateCaixaOperacoes(e.caixa.map((c) => ({ tipo: c.tipo, valor: c.valor, payload: c.payload })))
    expect(agg.recebimentosContas).toBeCloseTo(recebidoNoCaixa, 2)
  }
}

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS qa_estp1_falha ON "caixa_operacoes"`)
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS qa_estp1_falha()`)
  await prisma.$disconnect()
})

// ─── cenários ─────────────────────────────────────────────────────────────────

describe("Estorno de recebimento — identidade do pagamento (P1-A)", () => {
  it("1. pagamento único (PDV, caixa aberto) + estorno pelo Financeiro: ledger, movimentação e caixa voltam ao zero", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 120)
    expect((await receberPdv(loja, sessaoId, lk, null)).status).toBe(200)

    const r = await estornarHub(loja, lk)
    expect(r.status).toBe(200)
    const e = await estado(loja, lk)
    expect(e.recebido).toBe(0)
    expect(e.saldo).toBe(120)
    expect(e.saidas).toEqual([120])
    expect(e.caixaEst).toHaveLength(1)
    expect(e.caixaEst[0]!.valor).toBe(120)
    expect(e.caixaEst[0]!.sessaoId).toBe(sessaoId)
    expect((e.caixaEst[0]!.payload as Json).refCaixaOperacaoId).toBe(e.caixaRec[0]!.id)
    conciliado(e, 0)
  })

  it("2+3. dois parciais (100 + 50) no PDV: as duas entradas existem; estornar o 2º desfaz SÓ os 50", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300)
    expect((await receberPdv(loja, sessaoId, lk, 100)).status).toBe(200)
    expect((await receberPdv(loja, sessaoId, lk, 50)).status).toBe(200)

    const antes = await estado(loja, lk)
    expect(antes.movs.filter((m) => m.tipo === "entrada").map((m) => m.valor)).toEqual([100, 50])
    conciliado(antes, 150)

    const r = await estornarHub(loja, lk)
    expect(r.status).toBe(200)
    const e = await estado(loja, lk)
    expect(e.recebido).toBe(100)
    expect(e.saldo).toBe(200)
    expect(e.saidas).toEqual([50])
    expect(e.caixaEst.map((c) => c.valor)).toEqual([50])
    expect((e.caixaEst[0]!.payload as Json).refCaixaOperacaoId).toBe(e.caixaRec[1]!.id)
    expect(e.hist.at(-1)).toMatchObject({ tipo: "estorno_pagamento", valor: 50, refHistoricoIndex: 1 })
    conciliado(e, 100)
  })

  it("4. estorno posterior do 1º pagamento: mais 100 de saída, caixa zerado, título pendente", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300)
    await receberPdv(loja, sessaoId, lk, 100)
    await receberPdv(loja, sessaoId, lk, 50)
    expect((await estornarHub(loja, lk)).status).toBe(200)
    expect((await estornarHub(loja, lk)).status).toBe(200)

    const e = await estado(loja, lk)
    expect(e.recebido).toBe(0)
    expect(e.saldo).toBe(300)
    expect(e.titulo.status).toBe("pendente")
    expect(e.saidas).toEqual([50, 100])
    expect(e.caixaEst.map((c) => c.valor)).toEqual([50, 100])
    expect(e.hist.filter((h) => h.tipo === "estorno_pagamento").map((h) => h.refHistoricoIndex)).toEqual([1, 0])
    conciliado(e, 0)
  })

  it("5. estornar de novo o MESMO pagamento (pagamentoIndex) é recusado sem nenhuma escrita", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300)
    await receberPdv(loja, sessaoId, lk, 100)
    await receberPdv(loja, sessaoId, lk, 50)
    expect((await estornarHub(loja, lk, { pagamentoIndex: 1 })).status).toBe(200)
    const antes = await estado(loja, lk)

    const r = await estornarHub(loja, lk, { pagamentoIndex: 1 })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("estornar_pagamento_ja_estornado")
    const e = await estado(loja, lk)
    expect(e.hist).toHaveLength(antes.hist.length)
    expect(e.movs).toHaveLength(antes.movs.length)
    expect(e.caixa).toHaveLength(antes.caixa.length)
    expect(e.recebido).toBe(100)
    conciliado(e, 100)
  })

  it("5b. sem pagamento ativo: 'estornar último' não reverte nada de novo", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 80)
    await receberPdv(loja, sessaoId, lk, 30)
    expect((await estornarHub(loja, lk)).status).toBe(200)
    const r = await estornarHub(loja, lk)
    expect(r.status).toBe(422)
    const e = await estado(loja, lk)
    expect(e.hist.filter((h) => h.tipo === "estorno_pagamento")).toHaveLength(1)
    expect(e.saidas).toEqual([30])
    conciliado(e, 0)
  })
})

describe("Estorno pelo Financeiro de recebimento do PDV — Caixa conciliado (P1-B)", () => {
  it("6+7. recebimento PDV (caixa aberto, dinheiro) estornado no HUB: a gaveta perde exatamente o valor", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 200)
    await receberPdv(loja, sessaoId, lk, 70, "dinheiro")
    await receberPdv(loja, sessaoId, lk, 30, "pix")

    expect((await estornarHub(loja, lk, { pagamentoIndex: 0 })).status).toBe(200)
    const e = await estado(loja, lk)
    const agg = aggregateCaixaOperacoes(e.caixa.map((c) => ({ tipo: c.tipo, valor: c.valor, payload: c.payload })))
    expect(agg.recebimentosContas).toBe(30)
    expect(agg.recebimentosContasDinheiro).toBe(0)
    expect((e.caixaEst[0]!.payload as Json).formaPagamento).toBe("dinheiro")
    expect(e.saidas).toEqual([70])
    conciliado(e, 30)
  })

  it("8. recebimento direto no Financeiro HUB (sem caixa): estorno exato e NENHUMA operação de caixa inventada", async () => {
    const loja = await novaLoja()
    await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300)
    expect((await receberHub(loja, lk, 100)).status).toBe(200)
    expect((await receberHub(loja, lk, 50)).status).toBe(200)
    const antes = await estado(loja, lk)
    expect(antes.movs.filter((m) => m.tipo === "entrada").map((m) => m.valor)).toEqual([100, 50])

    expect((await estornarHub(loja, lk)).status).toBe(200)
    const e = await estado(loja, lk)
    expect(e.saidas).toEqual([50])
    expect(e.caixa).toHaveLength(0)
    expect(e.saldo).toBe(200)
    conciliado(e, 0)
  })

  it("9. lote com múltiplos títulos: estornar um título compensa só o item dele na operação do lote", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const a = await novoTitulo(loja, 90)
    const b = await novoTitulo(loja, 60)
    const lote = await json(
      await pdvReceberLote(
        req("/api/pdv/receber-conta-lote", loja, {
          sessaoId,
          formaPagamento: "dinheiro",
          idempotencyKey: chave(),
          itens: [
            { localKey: a, saldoEsperado: 90, valorReceber: 40 },
            { localKey: b, saldoEsperado: 60, valorReceber: 60 },
          ],
        }),
      ),
    )
    expect(lote.status).toBe(200)

    expect((await estornarHub(loja, a)).status).toBe(200)
    const ea = await estado(loja, a)
    const eb = await estado(loja, b)
    expect(ea.saidas).toEqual([40])
    expect(ea.caixaEst.map((c) => c.valor)).toEqual([40])
    expect((ea.caixaEst[0]!.payload as Json).refCaixaOperacaoId).toBe(ea.caixaRec[0]!.id)
    expect(eb.recebido).toBe(60)
    expect(eb.movLiquido).toBe(60)
    conciliado(ea, 60) // sobra no caixa só o item do título B
  })

  it("12. caixa FECHADO: estorno bloqueado com orientação; nada é gravado e a sessão fechada não muda", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 100)
    await receberPdv(loja, sessaoId, lk, 100)
    await fecharCaixa(sessaoId)
    await abrirCaixa(loja) // há outro caixa aberto, mas o pagamento não entrou nele
    const antes = await estado(loja, lk)

    const r = await estornarHub(loja, lk)
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("estornar_caixa_sessao_fechada")
    expect(String(r.body.error)).toMatch(/fechado/i)
    const e = await estado(loja, lk)
    expect(e.hist).toHaveLength(antes.hist.length)
    expect(e.movs).toHaveLength(antes.movs.length)
    expect(e.caixa).toHaveLength(antes.caixa.length)
    conciliado(e, 100)
  })

  it("13. outra loja: não estorna título alheio nem compensa operação de caixa de outra loja", async () => {
    const lojaA = await novaLoja()
    const lojaB = await novaLoja()
    const sA = await abrirCaixa(lojaA)
    const sB = await abrirCaixa(lojaB)
    const lk = await novoTitulo(lojaA, 100)
    await receberPdv(lojaA, sA, lk, 100)
    const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: lojaA, localKey: lk } } })
    // Operação "isca" na loja B apontando o mesmo título (não pode ser tocada).
    await prisma.caixaOperacao.create({
      data: { sessaoId: sB, storeId: lojaB, tipo: "recebimento_cr", valor: 100, payload: { tituloId: t.id, formaPagamento: "dinheiro" } },
    })

    const alheio = await estornarHub(lojaB, lk)
    expect(alheio.status).toBe(404)
    expect((await estado(lojaA, lk)).recebido).toBe(100)

    expect((await estornarHub(lojaA, lk)).status).toBe(200)
    expect(await prisma.caixaOperacao.count({ where: { storeId: lojaB, tipo: "estorno_recebimento_cr" } })).toBe(0)
    conciliado(await estado(lojaA, lk), 0)
  })

  it("14a. legado sem identidade e ambíguo (2 pagamentos de mesmo valor, só 1 no caixa): bloqueia sem escrever", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const at = new Date().toISOString()
    const lk = await novoTitulo(loja, 300, [
      { tipo: "pagamento", valor: 100, at },
      { tipo: "pagamento", valor: 100, at },
    ])
    const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: loja, localKey: lk } } })
    await prisma.movimentacaoFinanceira.createMany({
      data: [
        { storeId: loja, tipo: "entrada", valor: 100, origem: "receber_parcial", referenciaId: t.id, descricao: "legado" },
        { storeId: loja, tipo: "entrada", valor: 100, origem: "receber_parcial", referenciaId: t.id, descricao: "legado" },
      ],
    })
    await prisma.caixaOperacao.create({
      data: { sessaoId, storeId: loja, tipo: "recebimento_cr", valor: 100, payload: { localId: `pdv-rc:${loja}:${sessaoId}:legado`, tituloId: t.id, formaPagamento: "dinheiro" } },
    })
    const antes = await estado(loja, lk)

    const r = await estornarHub(loja, lk)
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("estornar_caixa_identidade_insuficiente")
    const e = await estado(loja, lk)
    expect(e.hist).toHaveLength(antes.hist.length)
    expect(e.movs).toHaveLength(antes.movs.length)
    expect(e.caixa).toHaveLength(antes.caixa.length)
  })

  it("14b. legado sem identidade mas inequívoco (1 pagamento, 1 entrada de caixa): estorna e compensa", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300, [{ tipo: "pagamento", valor: 80, at: new Date().toISOString() }])
    const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: loja, localKey: lk } } })
    await prisma.movimentacaoFinanceira.create({
      data: { storeId: loja, tipo: "entrada", valor: 80, origem: "receber_parcial", referenciaId: t.id, descricao: "legado" },
    })
    await prisma.caixaOperacao.create({
      data: { sessaoId, storeId: loja, tipo: "recebimento_cr", valor: 80, payload: { localId: `pdv-rc:${loja}:${sessaoId}:legado`, tituloId: t.id, formaPagamento: "dinheiro" } },
    })
    expect((await estornarHub(loja, lk)).status).toBe(200)
    const e = await estado(loja, lk)
    expect(e.caixaEst.map((c) => c.valor)).toEqual([80])
    conciliado(e, 0)
  })

  it("14c. ledger legado com estorno sem referência ao pagamento: bloqueado (não adivinha qual voltou)", async () => {
    const loja = await novaLoja()
    const at = new Date().toISOString()
    const lk = await novoTitulo(loja, 300, [
      { tipo: "pagamento", valor: 100, at },
      { tipo: "pagamento", valor: 50, at },
      { tipo: "estorno_pagamento", valor: 50, at },
    ])
    const r = await estornarHub(loja, lk)
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("estornar_historico_ambiguo")
  })

  it("14d. legado cuja entrada da 2ª parcial nunca foi gravada: o estorno não cria saída sem entrada", async () => {
    const loja = await novaLoja()
    const at = new Date().toISOString()
    const lk = await novoTitulo(loja, 300, [
      { tipo: "pagamento", valor: 100, at },
      { tipo: "pagamento", valor: 50, at },
    ])
    const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: loja, localKey: lk } } })
    // Heurística antiga: a 2ª parcial (menor) foi descartada — só a entrada de 100 existe.
    await prisma.movimentacaoFinanceira.create({
      data: { storeId: loja, tipo: "entrada", valor: 100, origem: "receber_parcial", referenciaId: t.id, descricao: "legado" },
    })
    expect((await estornarHub(loja, lk)).status).toBe(200)
    const e = await estado(loja, lk)
    expect(e.saidas).toEqual([])
    expect(e.recebido).toBe(100)
    conciliado(e, null)
  })
})

describe("Atomicidade, concorrência e cancelamento", () => {
  it("10a. dois estornos simultâneos do MESMO pagamento: exatamente um vale", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300)
    await receberPdv(loja, sessaoId, lk, 100)
    await receberPdv(loja, sessaoId, lk, 50)

    const rs = await Promise.all([estornarHub(loja, lk, { pagamentoIndex: 1 }), estornarHub(loja, lk, { pagamentoIndex: 1 })])
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409])
    const e = await estado(loja, lk)
    expect(e.saidas).toEqual([50])
    expect(e.caixaEst).toHaveLength(1)
    conciliado(e, 100)
  })

  it("10b. recebimento e estorno simultâneos no mesmo título: estado final sempre conciliado", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300)
    await receberPdv(loja, sessaoId, lk, 100)

    const [rec, est] = await Promise.all([receberPdv(loja, sessaoId, lk, 60), estornarHub(loja, lk, { pagamentoIndex: 0 })])
    expect([200, 409]).toContain(rec.status)
    expect(est.status).toBe(200)
    const e = await estado(loja, lk)
    const noCaixa = Math.round(
      (e.caixaRec.reduce((s, c) => s + c.valor, 0) - e.caixaEst.reduce((s, c) => s + c.valor, 0)) * 100,
    ) / 100
    expect(noCaixa).toBeCloseTo(e.recebido, 2)
    conciliado(e, e.recebido)
  })

  it("11. falha simulada no meio (insert de caixa): nada do estorno persiste", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 100)
    await receberPdv(loja, sessaoId, lk, 100)
    const antes = await estado(loja, lk)

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION qa_estp1_falha() RETURNS trigger AS $$
      BEGIN
        IF NEW."tipo" = 'estorno_recebimento_cr' AND NEW."storeId" = '${loja}' THEN RAISE EXCEPTION 'falha simulada QA'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_estp1_falha BEFORE INSERT ON "caixa_operacoes" FOR EACH ROW EXECUTE FUNCTION qa_estp1_falha()`)
    try {
      const r = await estornarHub(loja, lk)
      expect(r.status).toBe(503)
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS qa_estp1_falha ON "caixa_operacoes"`)
    }
    const e = await estado(loja, lk)
    expect(e.hist).toHaveLength(antes.hist.length)
    expect(e.movs).toHaveLength(antes.movs.length)
    expect(e.caixa).toHaveLength(antes.caixa.length)
    expect(e.recebido).toBe(100)
    conciliado(e, 100)
  })

  it("estorno por referência (cancelamento de venda) depois de um estorno parcial reverte o LÍQUIDO restante", async () => {
    const loja = await novaLoja()
    const lk = await novoTitulo(loja, 300)
    await receberHub(loja, lk, 100)
    await receberHub(loja, lk, 50)
    await estornarHub(loja, lk)
    const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: loja, localKey: lk } } })

    const r = await estornarMovimentacaoPorReferencia(loja, t.id, "receber")
    expect(r.ok).toBe(true)
    const e = await estado(loja, lk)
    expect(e.saidas).toEqual([50, 100])
    expect(e.movLiquido).toBe(0)
    // Idempotente: a 2ª chamada não lança nada.
    await estornarMovimentacaoPorReferencia(loja, t.id, "receber")
    expect((await estado(loja, lk)).saidas).toEqual([50, 100])
  })

  it("modo título completo com dois pagamentos no caixa: compensa cada um, uma vez", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300)
    await receberPdv(loja, sessaoId, lk, 100)
    await receberPdv(loja, sessaoId, lk, 50)
    const r = await estornarHub(loja, lk, { modo: "titulo_completo" })
    expect(r.status).toBe(200)
    const e = await estado(loja, lk)
    expect(e.titulo.status).toBe("estornado")
    expect(e.saidas).toEqual([150])
    expect(e.caixaEst.map((c) => c.valor).sort()).toEqual([100, 50].sort())
    expect(e.movLiquido).toBe(0)
    // retry do título completo: sem escrita
    expect((await estornarHub(loja, lk, { modo: "titulo_completo" })).status).toBe(200)
    const e2 = await estado(loja, lk)
    expect(e2.movs).toHaveLength(e.movs.length)
    expect(e2.caixa).toHaveLength(e.caixa.length)
  })
})

describe("Achados da revisão independente", () => {
  it("R1. retry com o recebido que o operador VIU (resposta perdida): 409, nenhum 2º pagamento revertido", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300)
    await receberPdv(loja, sessaoId, lk, 30)
    await receberPdv(loja, sessaoId, lk, 70)
    expect((await estornarHub(loja, lk, { recebidoEsperado: 100 })).status).toBe(200)
    const antes = await estado(loja, lk)

    const retry = await estornarHub(loja, lk, { recebidoEsperado: 100 })
    expect(retry.status).toBe(409)
    expect(retry.body.code).toBe("estornar_titulo_alterado")
    const e = await estado(loja, lk)
    expect(e.recebido).toBe(30)
    expect(e.movs).toHaveLength(antes.movs.length)
    expect(e.caixa).toHaveLength(antes.caixa.length)
    conciliado(e, 30)
  })

  it("R2. título completo com 2 entradas legadas intercambiáveis: cada compensação aponta uma operação diferente", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const at = new Date().toISOString()
    const lk = await novoTitulo(loja, 300, [
      { tipo: "pagamento", valor: 50, at },
      { tipo: "pagamento", valor: 50, at },
    ])
    const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: loja, localKey: lk } } })
    for (const n of [1, 2]) {
      await prisma.movimentacaoFinanceira.create({
        data: { storeId: loja, tipo: "entrada", valor: 50, origem: "receber_parcial", referenciaId: t.id, descricao: "legado" },
      })
      await prisma.caixaOperacao.create({
        data: { sessaoId, storeId: loja, tipo: "recebimento_cr", valor: 50, payload: { localId: `pdv-rc:${loja}:${sessaoId}:leg${n}`, tituloId: t.id, formaPagamento: "dinheiro" } },
      })
    }
    expect((await estornarHub(loja, lk, { modo: "titulo_completo" })).status).toBe(200)
    const e = await estado(loja, lk)
    const refs = e.caixaEst.map((c) => (c.payload as Json).refCaixaOperacaoId)
    expect(new Set(refs).size).toBe(2)
    expect(e.movLiquido).toBe(0)
  })

  it("R3. entrada de caixa legada que nenhum pagamento explica: bloqueia em vez de presumir 'fora do caixa'", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const lk = await novoTitulo(loja, 300, [{ tipo: "pagamento", valor: 80, at: new Date().toISOString() }])
    const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: loja, localKey: lk } } })
    await prisma.caixaOperacao.create({
      data: { sessaoId, storeId: loja, tipo: "recebimento_cr", valor: 75, payload: { localId: `rc-caixa:${loja}:mov-x`, origem: "financeiro", tituloId: t.id, formaPagamento: "dinheiro" } },
    })
    const r = await estornarHub(loja, lk)
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("estornar_caixa_identidade_insuficiente")
  })

  it("R4. pagamento dividido em N entradas de caixa com a mesma identidade (V3): compensa todas, valor a valor", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const op = `op-${chave()}`
    const lk = await novoTitulo(loja, 300, [{ tipo: "pagamento", valor: 100, loteId: op, at: new Date().toISOString() }])
    const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: loja, localKey: lk } } })
    await prisma.movimentacaoFinanceira.create({
      data: { storeId: loja, tipo: "entrada", valor: 100, origem: "receber_parcial", referenciaId: t.id, descricao: "v3" },
    })
    for (const [i, forma, valor] of [[0, "dinheiro", 60], [1, "pix", 40]] as const) {
      await prisma.caixaOperacao.create({
        data: {
          sessaoId, storeId: loja, tipo: "recebimento_cr", valor,
          payload: { origem: "operacoes-v3-os", operacaoId: op, tituloId: t.id, formaPagamento: forma, localId: `ops-v3-receber:${loja}:os:${op}:${i}` },
        },
      })
    }
    expect((await estornarHub(loja, lk)).status).toBe(200)
    const e = await estado(loja, lk)
    expect(e.caixaEst.map((c) => [(c.payload as Json).formaPagamento, c.valor]).sort()).toEqual([["dinheiro", 60], ["pix", 40]])
    const agg = aggregateCaixaOperacoes(e.caixa.map((c) => ({ tipo: c.tipo, valor: c.valor, payload: c.payload })))
    expect(agg.recebimentosContasDinheiro).toBe(0)
    conciliado(e, 0)
  })

  it("R5. lote na mesma sessão concorrendo com o estorno do mesmo título: nunca 503, sempre conciliado", async () => {
    const loja = await novaLoja()
    const sessaoId = await abrirCaixa(loja)
    const a = await novoTitulo(loja, 200)
    await receberPdv(loja, sessaoId, a, 50)
    const loteBody = () => ({
      sessaoId, formaPagamento: "dinheiro", idempotencyKey: chave(),
      itens: [{ localKey: a, saldoEsperado: 150, valorReceber: 20 }],
    })
    for (let i = 0; i < 3; i++) {
      const e0 = await estado(loja, a)
      const [lote, est] = await Promise.all([
        json(await pdvReceberLote(req("/api/pdv/receber-conta-lote", loja, { ...loteBody(), itens: [{ localKey: a, saldoEsperado: e0.saldo, valorReceber: 20 }] }))),
        estornarHub(loja, a),
      ])
      expect([200, 409]).toContain(lote.status)
      expect([200, 409, 422]).toContain(est.status)
    }
    const e = await estado(loja, a)
    const noCaixa = Math.round((e.caixaRec.reduce((s, c) => {
      const itens = (c.payload as Json).itens as Json[] | undefined
      return s + (itens ? itens.reduce((x, it) => x + (it.valor as number), 0) : c.valor)
    }, 0) - e.caixaEst.reduce((s, c) => s + c.valor, 0)) * 100) / 100
    expect(noCaixa).toBeCloseTo(e.recebido, 2)
    conciliado(e, null)
  })
})
