/**
 * FINANCEIRO-F9-ESTORNO-INTEGRACAO-ISOLADA-001 — #384 (estorno por identidade) + #341
 * (recebimento F9 / Financeiro HUB / comprovante) reunidas, em PostgreSQL REAL descartável.
 *
 * Handlers de produção: `POST /api/financeiro/receber-lote` (HUB, #341), `PATCH
 * /api/financeiro/receber op=estornar` (#384), `GET /api/financeiro/recibo-recebimento` (#341),
 * `POST /api/pdv/receber-conta(-lote)` (PDV F9/F5, as duas). Só `@/auth`, `next/cache` e o selo
 * de assinatura são simulados; guards de módulo, loja e permissão são os REAIS.
 * Massa 100% sintética (lojas `qa-integ-*`).
 *
 * Invariante em todo cenário: ledger líquido do título = movimentações (entradas − saídas)
 * e, no que passou pela gaveta, `aggregateCaixaOperacoes` = o que segue recebido pelo caixa.
 */
import { afterAll, describe, expect, it, vi } from "vitest"

const sessao = vi.hoisted(() => ({ id: "qa-integ-admin", name: "Operador QA Integ", role: "ADMIN", lojas: [] as string[] }))
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
import { GET as reciboGet } from "@/app/api/financeiro/recibo-recebimento/route"
import { PATCH as receberPatch } from "@/app/api/financeiro/receber/route"
import { POST as pdvReceberConta } from "@/app/api/pdv/receber-conta/route"
import { POST as pdvReceberLote } from "@/app/api/pdv/receber-conta-lote/route"
import { sumPagamentosFromHistoricoPayload } from "@/lib/financeiro/services/contas-receber-service"
import { aggregateCaixaOperacoes } from "@/lib/caixa-fechamento-resumo"
import { generalAggregates } from "@/lib/relatorios/geral"
import { parseReportQuery } from "@/lib/relatorios/contracts"

// ─── ambiente: só PostgreSQL loopback descartável ─────────────────────────────

function exigirBancoDescartavel(): void {
  const urls = [process.env.FIN_INTEG_TEST_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => v?.trim() || "")
  if (urls.some((v) => !v)) throw new Error("BLOQUEIO_EXPLICITO_PG: defina FIN_INTEG_TEST_DATABASE_URL (loopback).")
  const parsed = urls.map((v) => new URL(v))
  if (parsed.some((u) => !["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: só PostgreSQL em loopback.")
  }
  const alvo = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`
  if (parsed.some((u) => alvo(u) !== alvo(parsed[0]!))) throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem ser o MESMO banco.")
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("fin_integ_qa")) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: o banco precisa ser o descartável fin_integ_qa*.")
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
  const id = `qa-integ-${SUFIXO}-${++seq}`
  await prisma.store.create({ data: { id, name: `Loja QA Integ ${seq}` } })
  sessao.lojas.push(id)
  return id
}

async function abrirCaixa(storeId: string): Promise<string> {
  return (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", saldoInicial: 0, status: "ABERTA" } })).id
}

async function novoCliente(storeId: string, name: string) {
  return prisma.cliente.create({ data: { storeId, name, document: "" } })
}

async function novoTitulo(storeId: string, valor: number, o: { cliente?: string; clienteId?: string; historico?: Json[] } = {}): Promise<string> {
  const localKey = `receber:qa:${storeId}:${++seq}`
  await prisma.contaReceberTitulo.create({
    data: {
      storeId,
      localKey,
      descricao: `Crediário QA ${seq}`,
      cliente: o.cliente ?? `Cliente QA ${seq}`,
      valor,
      vencimento: "2026-12-10",
      status: o.historico?.length ? "parcial" : "pendente",
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

const chave = () => `qa-integ-${SUFIXO}-${++seq}-${Math.random().toString(36).slice(2, 8)}`

/** HUB (#341): 1..N títulos numa operação idempotente. */
function corpoHub(itens: Array<{ localKey: string; saldoEsperado: number; valorReceber: number }>, forma = "pix", key = chave()) {
  return { formaPagamento: forma, idempotencyKey: key, itens }
}
async function hub(storeId: string, corpo: Json) {
  return json(await receberLoteHub(req("/api/financeiro/receber-lote", storeId, corpo)))
}

/** PDV F9 singular. */
function corpoPdv(sessaoId: string, localKey: string, valor: number | null, forma = "dinheiro", key = chave()) {
  return {
    op: valor === null ? "liquidar" : "parcial",
    localKey,
    ...(valor === null ? {} : { valor }),
    formaPagamento: forma,
    sessaoId,
    idempotencyKey: key,
  }
}
async function pdv(storeId: string, corpo: Json) {
  return json(await pdvReceberConta(req("/api/pdv/receber-conta", storeId, corpo)))
}

/** Estorno pelo Financeiro HUB (#384), com a pré-condição que o HUB envia. */
async function estornar(storeId: string, localKey: string, extra: Json = {}) {
  return json(
    await receberPatch(req("/api/financeiro/receber", storeId, { op: "estornar", localKey, modo: "ultimo_pagamento", motivo: "QA", ...extra }, "PATCH")),
  )
}

async function recibo(storeId: string, localKey: string, index?: number) {
  const q = new URLSearchParams({ localKey, ...(index === undefined ? {} : { index: String(index) }) })
  return json(await reciboGet(req(`/api/financeiro/recibo-recebimento?${q}`, storeId)))
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
  }
}

function conciliado(e: Awaited<ReturnType<typeof estado>>, recebidoNoCaixa: number | null) {
  expect(e.movLiquido).toBeCloseTo(e.recebido, 2)
  if (recebidoNoCaixa !== null) {
    const agg = aggregateCaixaOperacoes(e.caixa.map((c) => ({ tipo: c.tipo, valor: c.valor, payload: c.payload })))
    expect(agg.recebimentosContas).toBeCloseTo(recebidoNoCaixa, 2)
  }
}

async function contagem(storeId: string) {
  const [titulos, movs, caixa] = await Promise.all([
    prisma.contaReceberTitulo.findMany({ where: { storeId }, select: { localKey: true, status: true, updatedAt: true, payload: true } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
    prisma.caixaOperacao.count({ where: { storeId } }),
  ])
  return { titulos: JSON.stringify(titulos), movs, caixa }
}

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── A, B, C — parciais e estornos pelo Financeiro HUB ────────────────────────

describe("A–C · parciais no HUB (#341) e estornos por identidade (#384)", () => {
  it("A. 300 → recebe 100 e depois 50: recebido 150, saldo 150, duas entradas, nenhuma duplicidade", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, 300)
    const c1 = corpoHub([{ localKey: lk, saldoEsperado: 300, valorReceber: 100 }])
    const c2 = corpoHub([{ localKey: lk, saldoEsperado: 200, valorReceber: 50 }])
    expect((await hub(s, c1)).status).toBe(200)
    const r2nd = await hub(s, c2)
    expect(r2nd.status).toBe(200)
    expect(r2nd.body).toMatchObject({ jaRegistrado: false, totalRecebido: 50 })
    // a 2ª parcial MENOR tem a sua entrada (o defeito A4 da main a descartava)
    const e = await estado(s, lk)
    expect(e.recebido).toBe(150)
    expect(e.saldo).toBe(150)
    expect(e.entradas).toEqual([100, 50])
    expect(e.hist.map((h) => h.loteId)).toEqual([c1.idempotencyKey, c2.idempotencyKey])
    // reenvio de cada operação = replay, nada novo
    expect((await hub(s, c1)).body.jaRegistrado).toBe(true)
    expect((await hub(s, c2)).body.jaRegistrado).toBe(true)
    const depois = await estado(s, lk)
    expect(depois.hist).toHaveLength(2)
    expect(depois.movs).toHaveLength(2)
    expect(depois.caixa).toHaveLength(0)
    conciliado(depois, null)
  })

  it("B+C. estorna só os 50 (saldo 200, saída 50) e depois os 100 (saldo 300); 2ª via coerente; sem estorno duplicado", async () => {
    const s = await novaLoja()
    await abrirCaixa(s) // caixa aberto na loja: o HUB continua sem lançar na gaveta
    const lk = await novoTitulo(s, 300)
    await hub(s, corpoHub([{ localKey: lk, saldoEsperado: 300, valorReceber: 100 }]))
    await hub(s, corpoHub([{ localKey: lk, saldoEsperado: 200, valorReceber: 50 }]))

    const b = await estornar(s, lk, { recebidoEsperado: 150 })
    expect(b.status).toBe(200)
    expect(b.body.valorEstornado).toBe(50)
    let e = await estado(s, lk)
    expect(e.recebido).toBe(100)
    expect(e.saldo).toBe(200)
    expect(e.saidas).toEqual([50])
    expect(e.hist.at(-1)).toMatchObject({ tipo: "estorno_pagamento", valor: 50, refHistoricoIndex: 1 })
    expect(e.caixa).toHaveLength(0)
    conciliado(e, null)
    // 2ª via: a 1ª parcial segue válida; a estornada não tem comprovante
    const v1 = await recibo(s, lk, 0)
    expect(v1.status).toBe(200)
    expect(v1.body.recibo).toMatchObject({ totalRecebido: 100 })
    expect(v1.body.saldoAtualTitulo).toBe(200)
    expect((await recibo(s, lk, 1)).body.code).toBe("pagamento_estornado")

    const c = await estornar(s, lk, { recebidoEsperado: 100 })
    expect(c.status).toBe(200)
    e = await estado(s, lk)
    expect(e.recebido).toBe(0)
    expect(e.saldo).toBe(300)
    expect(e.titulo.status).toBe("pendente")
    expect(e.saidas).toEqual([50, 100])
    expect(e.hist.filter((h) => h.tipo === "estorno_pagamento").map((h) => h.refHistoricoIndex)).toEqual([1, 0])
    conciliado(e, null)
    expect((await recibo(s, lk, 0)).body.code).toBe("pagamento_estornado")

    // nada mais a estornar: recusa sem escrita
    const antes = await contagem(s)
    const d = await estornar(s, lk)
    expect(d.status).toBe(422)
    expect(await contagem(s)).toEqual(antes)
  })
})

// ─── D — PDV F9 + estorno pelo HUB + Relatório Geral ──────────────────────────

describe("D · recebimento F9 com caixa aberto, estorno pelo Financeiro", () => {
  it("entrada original e compensação na MESMA sessão, ligadas por referência; retry antigo e 2ª via recusados; relatório coerente", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const lk = await novoTitulo(s, 300)
    const p1 = corpoPdv(sessaoId, lk, 100)
    const p2 = corpoPdv(sessaoId, lk, 50)
    const r1 = await pdv(s, p1)
    const rr2 = await pdv(s, p2)
    expect([r1.status, rr2.status]).toEqual([200, 200])
    expect(rr2.body).toMatchObject({ operacaoId: p2.idempotencyKey, formaPagamento: "dinheiro", jaRegistrado: false })

    const est = await estornar(s, lk, { recebidoEsperado: 150 })
    expect(est.status).toBe(200)
    const e = await estado(s, lk)
    expect(e.recebido).toBe(100)
    expect(e.saidas).toEqual([50])
    expect(e.caixaRec).toHaveLength(2)
    expect(e.caixaEst).toHaveLength(1)
    const comp = e.caixaEst[0]!
    expect(comp.sessaoId).toBe(sessaoId)
    expect(comp.valor).toBe(50)
    expect(comp.payload as Json).toMatchObject({ refCaixaOperacaoId: e.caixaRec[1]!.id, historicoIndex: 1, formaPagamento: "dinheiro", tituloId: e.titulo.id })
    // a entrada do 2º pagamento carrega as DUAS identidades, e elas concordam
    expect((e.caixaRec[1]!.payload as Json).historicoIndex).toBe(1)
    expect(e.hist[1]).toMatchObject({ loteId: p2.idempotencyKey, formaPagamento: "dinheiro" })
    conciliado(e, 100)

    // I (PDV): repetir a requisição antiga do pagamento estornado → 409, sem nova baixa nem caixa
    const antes = await contagem(s)
    const retry = await pdv(s, p2)
    expect(retry.status).toBe(409)
    expect(retry.body.code).toBe("operacao_estornada")
    expect(await contagem(s)).toEqual(antes)
    // o 1º pagamento continua com replay normal (resposta perdida)
    const replay1 = await pdv(s, p1)
    expect(replay1.status).toBe(200)
    expect(replay1.body.jaRegistrado).toBe(true)
    expect(await contagem(s)).toEqual(antes)

    // 2ª via: 1º pagamento sai com a forma real; o estornado é recusado
    const v1 = await recibo(s, lk, 0)
    expect(v1.status).toBe(200)
    expect(v1.body.recibo).toMatchObject({ totalRecebido: 100, formaPagamento: "dinheiro", operacaoId: p1.idempotencyKey })
    expect((await recibo(s, lk, 1)).status).toBe(409)

    // Relatório Geral (consulta real): recebimentos − estornos = líquido; caixa idem
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
    const raw = await generalAggregates(prisma, s, parseReportQuery(new URLSearchParams({ from: hoje, to: hoje })), { service: false })
    const soma = (classe: string) => r2(raw.ledger.filter((l) => l.classe === classe).reduce((t, l) => t + Number(l.valor), 0))
    expect(soma("recebimento_titulo")).toBeCloseTo(150, 2)
    expect(soma("estorno_recebimento")).toBeCloseTo(-50, 2)
    expect(raw.conference.caixaRecebimentos).toBeCloseTo(150, 2)
    expect(raw.conference.caixaEstornos).toBeCloseTo(50, 2)
  })
})

// ─── E — HUB não inventa gaveta ───────────────────────────────────────────────

describe("E · recebimento exclusivo do HUB", () => {
  it("com caixa aberto na loja: nem o recebimento nem o estorno lançam na gaveta; a sessão fica intacta", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const sessaoAntes = await prisma.sessaoCaixa.findUniqueOrThrow({ where: { id: sessaoId } })
    const lk = await novoTitulo(s, 80)
    const r = await hub(s, corpoHub([{ localKey: lk, saldoEsperado: 80, valorReceber: 80 }], "dinheiro"))
    expect(r.status).toBe(200)
    expect(await prisma.caixaOperacao.count({ where: { storeId: s } })).toBe(0)
    expect((await estornar(s, lk, { recebidoEsperado: 80 })).status).toBe(200)
    const e = await estado(s, lk)
    expect(e.caixa).toHaveLength(0)
    expect(e.saidas).toEqual([80])
    conciliado(e, 0)
    expect(await prisma.sessaoCaixa.findUniqueOrThrow({ where: { id: sessaoId } })).toEqual(sessaoAntes)
  })
})

// ─── F — lote ─────────────────────────────────────────────────────────────────

describe("F · lote: estorno individual preserva os demais", () => {
  it("HUB: 3 títulos numa operação; estornar um não toca os outros; retry do lote e 2ª via consolidada recusados", async () => {
    const s = await novaLoja()
    const cli = await novoCliente(s, "Lia QA")
    const a = await novoTitulo(s, 40, { cliente: "Lia QA", clienteId: cli.id })
    const b = await novoTitulo(s, 30, { cliente: "Lia QA", clienteId: cli.id })
    const c = await novoTitulo(s, 25, { cliente: "Lia QA", clienteId: cli.id })
    const corpo = corpoHub([
      { localKey: a, saldoEsperado: 40, valorReceber: 40 },
      { localKey: b, saldoEsperado: 30, valorReceber: 10 },
      { localKey: c, saldoEsperado: 25, valorReceber: 25 },
    ])
    const r = await hub(s, corpo)
    expect(r.status).toBe(200)
    expect(r.body.totalRecebido).toBe(75)
    const antesA = await estado(s, a)
    const antesC = await estado(s, c)

    expect((await estornar(s, b, { recebidoEsperado: 10 })).status).toBe(200)
    const eb = await estado(s, b)
    expect(eb.recebido).toBe(0)
    expect(eb.saidas).toEqual([10])
    conciliado(eb, null)
    for (const [lk, antes] of [[a, antesA], [c, antesC]] as const) {
      const e = await estado(s, lk)
      expect(e.hist).toEqual(antes.hist)
      expect(e.movs.map((m) => [m.tipo, m.valor])).toEqual(antes.movs.map((m) => [m.tipo, m.valor]))
      expect(e.titulo.status).toBe("pago")
    }

    const snap = await contagem(s)
    const retry = await hub(s, corpo)
    expect(retry.status).toBe(409)
    expect(retry.body.detalhes).toEqual([{ localKey: b, motivo: "operacao_estornada" }])
    expect(await contagem(s)).toEqual(snap)
    // o comprovante da operação incluía o valor devolvido: nenhuma 2ª via consolidada
    expect((await recibo(s, a, 0)).body.code).toBe("pagamento_estornado")
  })

  it("PDV: lote de 2 títulos na gaveta; estornar um compensa só o item dele, apontando a operação do lote", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const cli = await novoCliente(s, "Rui QA")
    const a = await novoTitulo(s, 40, { cliente: "Rui QA", clienteId: cli.id })
    const b = await novoTitulo(s, 30, { cliente: "Rui QA", clienteId: cli.id })
    const key = chave()
    const r = await json(
      await pdvReceberLote(
        req("/api/pdv/receber-conta-lote", s, {
          sessaoId, formaPagamento: "pix", idempotencyKey: key,
          itens: [{ localKey: a, saldoEsperado: 40, valorReceber: 40 }, { localKey: b, saldoEsperado: 30, valorReceber: 30 }],
        }),
      ),
    )
    expect(r.status).toBe(200)
    expect((await estornar(s, b, { recebidoEsperado: 30 })).status).toBe(200)
    const ea = await estado(s, a)
    const eb = await estado(s, b)
    expect(eb.caixaEst).toHaveLength(1)
    expect(eb.caixaEst[0]!.valor).toBe(30)
    expect((eb.caixaEst[0]!.payload as Json).refCaixaOperacaoId).toBe(eb.caixaRec[0]!.id)
    expect(ea.recebido).toBe(40)
    expect(ea.saidas).toEqual([])
    const agg = aggregateCaixaOperacoes(eb.caixa.map((o) => ({ tipo: o.tipo, valor: o.valor, payload: o.payload })))
    expect(agg.recebimentosContas).toBeCloseTo(40, 2)
  })
})

// ─── G, H — clique duplo e resposta perdida ───────────────────────────────────

describe("G · clique duplo (mesma chave, mesmo instante)", () => {
  it("HUB singular e HUB lote: uma baixa por título, uma movimentação", async () => {
    const s = await novaLoja()
    const cli = await novoCliente(s, "Bia QA")
    const u = await novoTitulo(s, 50)
    const x = await novoTitulo(s, 20, { cliente: "Bia QA", clienteId: cli.id })
    const y = await novoTitulo(s, 30, { cliente: "Bia QA", clienteId: cli.id })
    const um = corpoHub([{ localKey: u, saldoEsperado: 50, valorReceber: 20 }])
    const lote = corpoHub([{ localKey: x, saldoEsperado: 20, valorReceber: 20 }, { localKey: y, saldoEsperado: 30, valorReceber: 30 }])
    const rs = await Promise.all([hub(s, um), hub(s, um), hub(s, lote), hub(s, lote)])
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200, 200])
    expect(rs.filter((r) => r.body.jaRegistrado === false)).toHaveLength(2)
    for (const lk of [u, x, y]) {
      const e = await estado(s, lk)
      expect(e.hist).toHaveLength(1)
      expect(e.movs).toHaveLength(1)
      conciliado(e, null)
    }
  })

  it("PDV singular e PDV lote: uma baixa, uma entrada financeira, uma operação de caixa", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const cli = await novoCliente(s, "Davi QA")
    const u = await novoTitulo(s, 60)
    const x = await novoTitulo(s, 10, { cliente: "Davi QA", clienteId: cli.id })
    const y = await novoTitulo(s, 15, { cliente: "Davi QA", clienteId: cli.id })
    const um = corpoPdv(sessaoId, u, 25)
    const lote = {
      sessaoId, formaPagamento: "pix", idempotencyKey: chave(),
      itens: [{ localKey: x, saldoEsperado: 10, valorReceber: 10 }, { localKey: y, saldoEsperado: 15, valorReceber: 15 }],
    }
    const rs = await Promise.all([
      pdv(s, um),
      pdv(s, um),
      json(await pdvReceberLote(req("/api/pdv/receber-conta-lote", s, lote))),
      json(await pdvReceberLote(req("/api/pdv/receber-conta-lote", s, lote))),
    ])
    // Lote: advisory lock → a 2ª vira replay (200). Singular: sem trava prévia do título, a
    // perdedora da corrida cai no CAS de `updatedAt` (409 titulo_alterado, nada gravado) —
    // comportamento PRÉ-EXISTENTE na main; o reenvio seguinte é replay normal.
    expect(rs.slice(2).map((r) => r.status)).toEqual([200, 200])
    const singular = rs.slice(0, 2)
    expect(singular.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1)
    for (const r of singular.filter((r) => r.status !== 200)) expect(r).toMatchObject({ status: 409, body: { code: "titulo_alterado" } })
    const reenvio = await pdv(s, um)
    expect(reenvio.status).toBe(200)
    expect(reenvio.body.jaRegistrado).toBe(true)
    for (const lk of [u, x, y]) {
      const e = await estado(s, lk)
      expect(e.hist).toHaveLength(1)
      expect(e.movs).toHaveLength(1)
    }
    expect(await prisma.caixaOperacao.count({ where: { storeId: s, tipo: "recebimento_cr" } })).toBe(2)
    const caixa = await prisma.caixaOperacao.findMany({ where: { storeId: s } })
    expect(aggregateCaixaOperacoes(caixa.map((c) => ({ tipo: c.tipo, valor: c.valor, payload: c.payload }))).recebimentosContas).toBeCloseTo(50, 2)
  })
})

describe("H · servidor confirma, resposta se perde, cliente repete", () => {
  it("PDV e HUB devolvem o MESMO resultado (operação e hora do ledger) sem gravar de novo; estorno repetido é recusado", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const lp = await novoTitulo(s, 90)
    const lh = await novoTitulo(s, 70)
    const cp = corpoPdv(sessaoId, lp, 40, "debito")
    const ch = corpoHub([{ localKey: lh, saldoEsperado: 70, valorReceber: 30 }])
    const p1 = await pdv(s, cp)
    const h1 = await hub(s, ch)
    const snap = await contagem(s)

    const p2 = await pdv(s, cp)
    const h2 = await hub(s, ch)
    expect(p2.status).toBe(200)
    expect(p2.body).toMatchObject({ jaRegistrado: true, operacaoId: p1.body.operacaoId, recebidoEm: p1.body.recebidoEm, valorRecebido: 40 })
    expect(h2.status).toBe(200)
    expect(h2.body).toMatchObject({ jaRegistrado: true, operacaoId: h1.body.operacaoId, recebidoEm: h1.body.recebidoEm, totalRecebido: 30 })
    expect(await contagem(s)).toEqual(snap)

    // Estorno confirmado cuja resposta se perdeu, com OUTRO pagamento ativo no título (o caso
    // perigoso: um retry cego reverteria o 1º). O HUB repete com o recebido que o operador viu.
    expect((await pdv(s, corpoPdv(sessaoId, lp, 20, "debito"))).status).toBe(200)
    const est = await estornar(s, lp, { recebidoEsperado: 60 })
    expect(est.status).toBe(200)
    expect(est.body.valorEstornado).toBe(20)
    const snapEst = await contagem(s)
    const retry = await estornar(s, lp, { recebidoEsperado: 60 })
    expect(retry.status).toBe(409)
    expect(retry.body.code).toBe("estornar_titulo_alterado")
    expect(await contagem(s)).toEqual(snapEst)
    const e = await estado(s, lp)
    expect(e.recebido).toBe(40)
    conciliado(e, null)
  })
})

// ─── I — estorno seguido de retry do recebimento ──────────────────────────────

describe("I · estorno seguido de retry do recebimento original", () => {
  it("HUB singular: a requisição antiga é recusada (409), não grava e não gera 2ª via", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, 55)
    const corpo = corpoHub([{ localKey: lk, saldoEsperado: 55, valorReceber: 55 }])
    expect((await hub(s, corpo)).status).toBe(200)
    expect((await estornar(s, lk, { recebidoEsperado: 55 })).status).toBe(200)
    const snap = await contagem(s)
    const r = await hub(s, corpo)
    expect(r.status).toBe(409)
    expect(r.body.detalhes).toEqual([{ localKey: lk, motivo: "operacao_estornada" }])
    expect(await contagem(s)).toEqual(snap)
    expect((await recibo(s, lk, 0)).body.code).toBe("pagamento_estornado")
  })
})

// ─── J — caixa fechado ────────────────────────────────────────────────────────

describe("J · caixa fechado", () => {
  it("estorno de pagamento cuja sessão fechou: 409 com orientação, nenhuma escrita, sessão intacta; 2ª via segue válida", async () => {
    const s = await novaLoja()
    const sessaoId = await abrirCaixa(s)
    const lk = await novoTitulo(s, 100)
    expect((await pdv(s, corpoPdv(sessaoId, lk, 60))).status).toBe(200)
    await prisma.sessaoCaixa.update({ where: { id: sessaoId }, data: { status: "FECHADA", fechadaEm: new Date() } })
    const sessaoAntes = await prisma.sessaoCaixa.findUniqueOrThrow({ where: { id: sessaoId } })
    const snap = await contagem(s)

    const r = await estornar(s, lk, { recebidoEsperado: 60 })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("estornar_caixa_sessao_fechada")
    expect(String(r.body.error)).toMatch(/caixa/i)
    expect(await contagem(s)).toEqual(snap)
    expect(await prisma.sessaoCaixa.findUniqueOrThrow({ where: { id: sessaoId } })).toEqual(sessaoAntes)
    expect((await recibo(s, lk, 0)).status).toBe(200)

    // novo recebimento contra a sessão fechada também não grava
    const novo = await pdv(s, corpoPdv(sessaoId, lk, 10))
    expect(novo.status).not.toBe(200)
    expect(await contagem(s)).toEqual(snap)
  })
})

// ─── K — segurança e integridade ──────────────────────────────────────────────

describe("K · outra loja, perfil sem permissão, legado ambíguo", () => {
  it("título de OUTRA loja: recebimento, estorno e 2ª via não leem nem gravam nada em nenhuma das lojas", async () => {
    const minha = await novaLoja()
    const outra = await novaLoja()
    const alheio = await novoTitulo(outra, 70)
    expect((await hub(outra, corpoHub([{ localKey: alheio, saldoEsperado: 70, valorReceber: 20 }]))).status).toBe(200)
    const snapM = await contagem(minha)
    const snapO = await contagem(outra)

    const rec = await hub(minha, corpoHub([{ localKey: alheio, saldoEsperado: 50, valorReceber: 10 }]))
    expect(rec.status).toBe(409)
    expect(rec.body.detalhes).toEqual([{ localKey: alheio, motivo: "titulo_nao_encontrado" }])
    expect((await estornar(minha, alheio)).status).toBe(404)
    expect((await recibo(minha, alheio, 0)).status).toBe(404)
    // header de uma loja com lojaId de outra no corpo
    const mismatch = await hub(minha, { ...corpoHub([{ localKey: alheio, saldoEsperado: 50, valorReceber: 10 }]), lojaId: outra })
    expect(mismatch.status).toBe(400)
    expect(await contagem(minha)).toEqual(snapM)
    expect(await contagem(outra)).toEqual(snapO)
  })

  it("perfil sem permissão financeira (TÉCNICO): recebimento e estorno recusados, nada gravado", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, 45)
    expect((await hub(s, corpoHub([{ localKey: lk, saldoEsperado: 45, valorReceber: 15 }]))).status).toBe(200)
    const snap = await contagem(s)
    sessao.role = "TECNICO"
    try {
      const rec = await hub(s, corpoHub([{ localKey: lk, saldoEsperado: 30, valorReceber: 10 }]))
      const est = await estornar(s, lk, { recebidoEsperado: 15 })
      expect(rec.status).toBe(403)
      expect(est.status).toBe(403)
    } finally {
      sessao.role = "ADMIN"
    }
    expect(await contagem(s)).toEqual(snap)
  })

  it("legado ambíguo (estorno sem referência ao pagamento): estorno bloqueado e nenhuma 2ª via, sem escrita", async () => {
    const s = await novaLoja()
    const lk = await novoTitulo(s, 200, {
      historico: [
        { tipo: "pagamento", valor: 50, at: "2026-10-01T12:00:00.000Z" },
        { tipo: "pagamento", valor: 50, at: "2026-10-02T12:00:00.000Z" },
        { tipo: "estorno_pagamento", valor: 50, at: "2026-10-03T12:00:00.000Z" },
      ],
    })
    const snap = await contagem(s)
    const r = await estornar(s, lk, { recebidoEsperado: 50 })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("estornar_historico_ambiguo")
    expect((await recibo(s, lk, 0)).body.code).toBe("pagamento_estornado")
    expect((await recibo(s, lk, 1)).body.code).toBe("pagamento_estornado")
    expect(await contagem(s)).toEqual(snap)
  })
})
