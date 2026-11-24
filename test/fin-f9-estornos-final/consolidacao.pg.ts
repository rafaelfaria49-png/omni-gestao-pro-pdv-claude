/**
 * OMNI-FINANCEIRO-F9-ESTORNOS-CONSOLIDACAO-FINAL-001 — riscos residuais das PRs #341/#384/#388,
 * em PostgreSQL REAL descartável (banco `fin_final_qa*`).
 *
 *  F. `PATCH /api/financeiro/receber` op=parcial/liquidar: mesmo motor transacional do
 *     `receber-lote` — retry/clique duplo com `idempotencyKey` = replay; movimentação na
 *     mesma transação; saldo divergente = 409 sem escrita.
 *  G. `estornarRecebimentoOSV3`: identidade do pagamento, saída na movimentação, compensação
 *     de caixa referenciando a entrada original (ou nenhuma, se o dinheiro não passou pela
 *     gaveta), recusa de 2º clique e de caixa legado não identificável.
 *
 * Handlers/actions de produção; só `@/auth`, `next/cache` e o selo de assinatura são
 * simulados. Massa 100% sintética (lojas `qa-final-*`).
 */
import { afterAll, describe, expect, it, vi } from "vitest"

const sessao = vi.hoisted(() => ({ id: "qa-final-admin", name: "Operador QA Final", role: "ADMIN", lojas: [] as string[] }))
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
import { POST as receberLoteHub } from "@/app/api/financeiro/receber-lote/route"
import { PATCH as receberPatch } from "@/app/api/financeiro/receber/route"
import { estornarRecebimentoOSV3, receberOSV3 } from "@/lib/operacoes-v3/pdv-servico-actions"
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model"
import { sumPagamentosFromHistoricoPayload } from "@/lib/financeiro/services/contas-receber-service"
import { aggregateCaixaOperacoes } from "@/lib/caixa-fechamento-resumo"
import { generalAggregates } from "@/lib/relatorios/geral"
import { parseReportQuery } from "@/lib/relatorios/contracts"

// ─── ambiente: só PostgreSQL loopback descartável ─────────────────────────────

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

// ─── massa sintética ──────────────────────────────────────────────────────────

const SUFIXO = Date.now().toString(36)
let seq = 0
const H = "x-assistec-loja-id"
type Json = Record<string, any>
const r2 = (n: number) => Math.round(n * 100) / 100

async function novaLoja(): Promise<string> {
  const id = `qa-final-${SUFIXO}-${++seq}`
  await prisma.store.create({ data: { id, name: `Loja QA Final ${seq}` } })
  sessao.lojas.push(id)
  return id
}

async function abrirCaixa(storeId: string): Promise<string> {
  return (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", saldoInicial: 0, status: "ABERTA" } })).id
}

async function novoTitulo(storeId: string, valor: number): Promise<string> {
  const localKey = `receber:qa:${storeId}:${++seq}`
  await prisma.contaReceberTitulo.create({
    data: {
      storeId,
      localKey,
      descricao: `Crediário QA ${seq}`,
      cliente: `Cliente QA ${seq}`,
      valor,
      vencimento: "2026-12-10",
      status: "pendente",
      payload: { historico: [] } as Prisma.InputJsonValue,
    },
  })
  return localKey
}

/** OS pronta, orçamento aprovado de 400 (mesma massa da suíte Operações V3). */
async function novaOS(storeId: string): Promise<string> {
  const n = ++seq
  const servicos = [{ id: `s1-${n}`, descricao: "Troca de tela", valor: 400 }]
  const row = await prisma.ordemServico.create({
    data: {
      storeId,
      numero: `OS-QA-FINAL-${SUFIXO}-${n}`,
      equipamento: "Samsung A54",
      defeito: "Tela quebrada",
      valorTotal: 400,
      payload: {
        codigo: `OS-QA-${n}`,
        storeId,
        cliente: { nome: `Cliente OS QA ${n}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" },
        status: "pronta",
        operacaoStatusV3: "pronta",
        orcamento: { id: `orc-${n}`, status: "aprovado", pecas: [], servicos, desconto: 0, total: 400, criadoEm: "2026-10-01T12:00:00.000Z" },
        valorTotal: 400,
        garantia: { ativa: false, prazoDias: 90 },
        aberturaV3: { defeitoRelatado: "Tela quebrada" },
        timeline: [],
      } as Prisma.InputJsonValue,
    },
  })
  return row.id
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

const chave = () => `qa-final-${SUFIXO}-${++seq}-${Math.random().toString(36).slice(2, 8)}`

async function patch(storeId: string, body: Json) {
  return json(await receberPatch(req("/api/financeiro/receber", storeId, body, "PATCH")))
}

async function estado(storeId: string, localKey: string) {
  const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId, localKey } } })
  const hist = ((t.payload as Json)?.historico ?? []) as Json[]
  const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: t.id }, orderBy: { createdAt: "asc" } })
  const caixa = await prisma.caixaOperacao.findMany({ where: { storeId }, orderBy: { at: "asc" } })
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
    entradas: movs.filter((m) => m.tipo === "entrada").map((m) => m.valor),
    saidas: movs.filter((m) => m.tipo === "saida").map((m) => m.valor),
    caixaRec: caixa.filter((c) => c.tipo === "recebimento_cr"),
    caixaEst: caixa.filter((c) => c.tipo === "estorno_recebimento_cr"),
    gaveta: aggregateCaixaOperacoes(caixa.map((c) => ({ tipo: c.tipo, valor: c.valor, payload: c.payload }))),
  }
}

async function contagem(storeId: string) {
  const [titulos, movs, caixa, os] = await Promise.all([
    prisma.contaReceberTitulo.findMany({ where: { storeId }, select: { localKey: true, status: true, payload: true } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
    prisma.caixaOperacao.count({ where: { storeId } }),
    prisma.ordemServico.findMany({ where: { storeId }, select: { payload: true } }),
  ])
  return { titulos: JSON.stringify(titulos), movs, caixa, os: JSON.stringify(os) }
}

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── F — PATCH parcial/liquidar ───────────────────────────────────────────────

describe("F · PATCH /api/financeiro/receber op=parcial|liquidar", () => {
  it("F1. parcial com idempotencyKey: clique duplo simultâneo + retry → UM pagamento, UMA entrada, replay", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, 300)
    const corpo = { op: "parcial", localKey: lk, valor: 100, formaPagamento: "pix", idempotencyKey: chave(), saldoEsperado: 300 }
    const [a, b] = await Promise.all([patch(s, corpo), patch(s, corpo)])
    expect([a.status, b.status]).toEqual([200, 200])
    expect([a.body.jaRegistrado, b.body.jaRegistrado].sort()).toEqual([false, true])
    const retry = await patch(s, corpo)
    expect(retry.status).toBe(200)
    expect(retry.body).toMatchObject({ op: "parcial", jaRegistrado: true, operacaoId: corpo.idempotencyKey, valorRecebido: 100, saldoDepois: 200 })
    const e = await estado(s, lk)
    expect(e.hist.filter((h) => h.tipo === "pagamento")).toHaveLength(1)
    expect(e.hist[0]).toMatchObject({ loteId: corpo.idempotencyKey, formaPagamento: "pix", valor: 100 })
    expect(e.entradas).toEqual([100])
    expect(e.recebido).toBe(100)
    expect(e.movLiquido).toBe(e.recebido)
  })

  it("F2. mesma chave com outro valor → 409 idempotency_conflict, sem escrita", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, 300)
    const k = chave()
    expect((await patch(s, { op: "parcial", localKey: lk, valor: 100, idempotencyKey: k, saldoEsperado: 300 })).status).toBe(200)
    const antes = await contagem(s)
    const r = await patch(s, { op: "parcial", localKey: lk, valor: 90, idempotencyKey: k, saldoEsperado: 300 })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("parcial_idempotency_conflict")
    expect(await contagem(s)).toEqual(antes)
  })

  it("F3. saldoEsperado diferente do real (outra baixa no meio) → 409 saldo_divergente, sem escrita", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, 300)
    expect((await patch(s, { op: "parcial", localKey: lk, valor: 50 })).status).toBe(200)
    const antes = await contagem(s)
    const r = await patch(s, { op: "parcial", localKey: lk, valor: 50, idempotencyKey: chave(), saldoEsperado: 300 })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("parcial_saldo_divergente")
    expect(await contagem(s)).toEqual(antes)
  })

  it("F4. chave sem saldoEsperado → 400, sem escrita", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, 300)
    const antes = await contagem(s)
    const r = await patch(s, { op: "parcial", localKey: lk, valor: 50, idempotencyKey: chave() })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe("parcial_saldo_esperado_obrigatorio")
    expect(await contagem(s)).toEqual(antes)
  })

  it("F5. legado sem chave: parcial 100 + 50 + liquidar → entradas [100, 50, 150] na mesma transação; 2º liquidar = 422 sem escrita", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, 300)
    expect((await patch(s, { op: "parcial", localKey: lk, valor: 100, formaPagamento: "dinheiro" })).status).toBe(200)
    expect((await patch(s, { op: "parcial", localKey: lk, valor: 50 })).status).toBe(200)
    const liq = await patch(s, { op: "liquidar", localKey: lk, formaPagamento: "pix" })
    expect(liq.status).toBe(200)
    expect(liq.body).toMatchObject({ op: "liquidar", valorRecebido: 150, saldoDepois: 0, statusFinal: "pago" })
    const e = await estado(s, lk)
    expect(e.entradas).toEqual([100, 50, 150])
    expect(e.titulo.status).toBe("pago")
    expect(e.movLiquido).toBe(300)
    expect(e.caixa).toHaveLength(0) // HUB/PATCH nunca lança na gaveta
    const antes = await contagem(s)
    const again = await patch(s, { op: "liquidar", localKey: lk })
    expect(again.status).toBe(422)
    expect(again.body.code).toBe("liquidar_ja_pago")
    expect(await contagem(s)).toEqual(antes)
  })

  it("F6. título de outra loja não existe aqui → recusa, nada gravado em nenhuma das duas", async () => {
    const a = await novaLoja()
    const b = await novaLoja()
    const lkB = await novoTitulo(b, 300)
    const antesA = await contagem(a)
    const antesB = await contagem(b)
    const r = await patch(a, { op: "parcial", localKey: lkB, valor: 50 })
    expect(r.status).toBe(422)
    expect(await contagem(a)).toEqual(antesA)
    expect(await contagem(b)).toEqual(antesB)
  })
})

// ─── G — estorno pela OS (Operações V3/V4) ────────────────────────────────────

describe("G · estornarRecebimentoOSV3 conciliado com Caixa e Financeiro", () => {
  it("G1. 100 dinheiro + 50 pix → estorna os 50: saída 50, compensação ligada à entrada pix; 2º clique recusado sem escrita", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const osId = await novaOS(s)
    await receberOSV3(s, osId, { valor: 100, forma: "dinheiro", sessaoId })
    await receberOSV3(s, osId, { valor: 50, forma: "pix", sessaoId })
    const lk = localKeyContaReceberOSV3(s, osId)

    const est = await estornarRecebimentoOSV3(s, osId, { sessaoId, motivo: "QA G1", recebidoEsperado: 150 })
    expect(est.estornado).toBe(50)
    const e = await estado(s, lk)
    expect(e.recebido).toBe(100)
    expect(e.entradas).toEqual([100, 50])
    expect(e.saidas).toEqual([50])
    expect(e.movLiquido).toBe(e.recebido)
    expect(e.caixaEst).toHaveLength(1)
    const pix = e.caixaRec.find((c) => (c.payload as Json).formaPagamento === "pix")!
    expect(e.caixaEst[0]!.valor).toBe(50)
    expect(e.caixaEst[0]!.payload as Json).toMatchObject({ refCaixaOperacaoId: pix.id, formaPagamento: "pix", historicoIndex: 1, origem: "operacoes-v3-os" })
    expect(e.gaveta.recebimentosContas).toBeCloseTo(100, 2)
    expect(e.hist.at(-1)).toMatchObject({ tipo: "estorno_pagamento", valor: 50, refHistoricoIndex: 1 })

    // 2º clique / retry com o que a tela mostrava antes → recusa, nada muda
    const antes = await contagem(s)
    await expect(estornarRecebimentoOSV3(s, osId, { sessaoId, motivo: "QA G1", recebidoEsperado: 150 })).rejects.toThrow(/mudou desde que a tela carregou/)
    expect(await contagem(s)).toEqual(antes)
  })

  it("G2. depois do estorno pela OS, o Financeiro estorna o pagamento restante sem bloqueio e o Caixa zera", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const osId = await novaOS(s)
    await receberOSV3(s, osId, { valor: 100, forma: "dinheiro", sessaoId })
    await receberOSV3(s, osId, { valor: 50, forma: "dinheiro", sessaoId })
    const lk = localKeyContaReceberOSV3(s, osId)
    await estornarRecebimentoOSV3(s, osId, { sessaoId, recebidoEsperado: 150 })

    const hub = await patch(s, { op: "estornar", localKey: lk, modo: "ultimo_pagamento", recebidoEsperado: 100 })
    expect(hub.status).toBe(200)
    expect(hub.body.valorEstornado).toBe(100)
    const e = await estado(s, lk)
    expect(e.recebido).toBe(0)
    expect(e.saidas).toEqual([50, 100])
    expect(e.movLiquido).toBe(0)
    expect(e.caixaEst).toHaveLength(2)
    // cada compensação aponta para uma entrada distinta — nenhuma entrada compensada duas vezes
    const refs = e.caixaEst.map((c) => (c.payload as Json).refCaixaOperacaoId)
    expect(new Set(refs).size).toBe(2)
    expect(refs.every((r) => e.caixaRec.some((c) => c.id === r))).toBe(true)
    expect(e.gaveta.recebimentosContas).toBeCloseTo(0, 2)

    // Relatório Geral: recebimentos 150, estornos 150 — nenhum recebimento contado como venda
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
    const raw = await generalAggregates(prisma, s, parseReportQuery(new URLSearchParams({ from: hoje, to: hoje })), { service: false })
    expect(raw.conference.caixaRecebimentos).toBeCloseTo(150, 2)
    expect(raw.conference.caixaEstornos).toBeCloseTo(150, 2)
  })

  it("G3. pagamento feito pelo Financeiro HUB (sem gaveta) estornado pela OS → saída financeira, nenhuma compensação de caixa", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const osId = await novaOS(s)
    await receberOSV3(s, osId, { valor: 100, forma: "dinheiro", sessaoId })
    const lk = localKeyContaReceberOSV3(s, osId)
    const hub = await json(
      await receberLoteHub(req("/api/financeiro/receber-lote", s, { formaPagamento: "pix", idempotencyKey: chave(), itens: [{ localKey: lk, saldoEsperado: 300, valorReceber: 80 }] })),
    )
    expect(hub.status).toBe(200)

    const est = await estornarRecebimentoOSV3(s, osId, { sessaoId, recebidoEsperado: 180 })
    expect(est.estornado).toBe(80)
    const e = await estado(s, lk)
    expect(e.recebido).toBe(100)
    expect(e.saidas).toEqual([80])
    expect(e.caixaEst).toHaveLength(0) // os 80 nunca entraram na gaveta
    expect(e.gaveta.recebimentosContas).toBeCloseTo(100, 2)
  })

  it("G4. legado: entrada de caixa sem identidade e com valor que nenhum pagamento explica → recusa, nada gravado", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const osId = await novaOS(s)
    await receberOSV3(s, osId, { valor: 100, forma: "dinheiro", sessaoId })
    const lk = localKeyContaReceberOSV3(s, osId)
    // Simula o formato antigo: a entrada de caixa não carrega a identidade da operação e foi
    // lançada com outro valor — não dá para afirmar quanto deste pagamento passou pela gaveta.
    const [op] = await prisma.caixaOperacao.findMany({ where: { storeId: s, tipo: "recebimento_cr" } })
    const { operacaoId: _o, localId: _l, requestFingerprint: _f, ...semIdentidade } = op!.payload as Json
    await prisma.caixaOperacao.update({ where: { id: op!.id }, data: { valor: 37, payload: semIdentidade } })
    const antes = await contagem(s)
    await expect(estornarRecebimentoOSV3(s, osId, { sessaoId, recebidoEsperado: 100 })).rejects.toThrow(/entrada de caixa/)
    expect(await contagem(s)).toEqual(antes)
  })

  it("G5. caixa atual fechado → recusa, nada gravado (sessão fechada nunca é editada)", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const osId = await novaOS(s)
    await receberOSV3(s, osId, { valor: 100, forma: "dinheiro", sessaoId })
    await prisma.sessaoCaixa.update({ where: { id: sessaoId }, data: { status: "FECHADA" } })
    const antes = await contagem(s)
    await expect(estornarRecebimentoOSV3(s, osId, { sessaoId })).rejects.toThrow(/Caixa fechado/)
    expect(await contagem(s)).toEqual(antes)
  })
})
