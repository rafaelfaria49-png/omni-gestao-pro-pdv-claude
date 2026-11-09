/**
 * PADARIA-KG-F8-TROCAS-CONFIGURAVEIS-FINAL-001 — F8 × KG com trocas por peso CONFIGURÁVEIS.
 *
 * Contrato aprovado pelo proprietário: trocas/devoluções de linhas KG são permitidas por
 * padrão (F8_KG_EXCHANGE_DEFAULT=ENABLED), por loja (printerConfig.pdvTrocasPeso),
 * com quantidade fracionária de 3 casas, vendas mistas KG+UN por linha, condição da
 * mercadoria no retorno e proteções de banco (trigger + CHECK + unique parcial).
 *
 * Roda os handlers de PRODUÇÃO (`POST /api/ops/devolucao`, `GET …/elegibilidade`,
 * `POST /api/vendas/[id]/cancelar`, `PUT /api/stores/[id]/settings`) e o writer real de
 * venda (`upsertVendaInTransaction`) contra o banco isolado das suítes KG. Só roda pelo
 * `scripts/pdv/run-manual-kg-tests.mjs`; sem a variável a suíte é pulada. Dados sintéticos.
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const SESSAO = { user: { id: "fixture-op", role: "ADMIN", name: "Operador Sintético", platformAuthority: true } }
vi.mock("@/auth", () => ({ auth: async () => SESSAO }))
vi.mock("@/lib/auth/api-enterprise-guard", async (orig) => {
  const { getEnterprisePermissions } = await import("@/lib/auth/enterprise-permissions")
  return {
    ...(await orig<typeof import("@/lib/auth/api-enterprise-guard")>()),
    apiGuardEnterpriseOrOps: async (_s: string, check: (p: unknown) => boolean, msg: string) =>
      check(getEnterprisePermissions("ADMIN") as never) ? null : new Response(JSON.stringify({ error: msg }), { status: 403 }),
  }
})
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: async () => ({ ok: true, session: SESSAO }) }))
vi.mock("@/lib/vendas/guard-estorno-venda", () => ({
  requireEstornoStepUp: async () => ({ ok: true, supervisorId: "sup-sintetico", supervisorNome: "Supervisor Sintético" }),
}))
vi.mock("@/lib/auth/enterprise-permissions", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/enterprise-permissions")>()),
  canAccessStore: () => true,
}))
vi.mock("@/lib/automation/automation-engine", () => ({ handleEvent: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { applyStockMutation, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import { MANUAL_KG_SALE, saleLineTotalCents } from "@/lib/vendas/manual-kg-contract"
import { POST as postDevolucao } from "@/app/api/ops/devolucao/route"
import { GET as getElegibilidade } from "@/app/api/ops/devolucao/elegibilidade/route"
import { POST as postCancelar } from "@/app/api/vendas/[id]/cancelar/route"
import { PUT as putStoreSettings } from "@/app/api/stores/[id]/settings/route"

const url = "postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated"
const enabled = process.env.MANUAL_KG_TEST_DATABASE_URL === url
if (process.env.MANUAL_KG_TEST_DATABASE_URL && !enabled) throw Error("MANUAL_KG_ISOLATION_REQUIRED")
const suite = enabled ? describe : describe.skip

const A = "kg-f8-a", B = "kg-f8-b"
const CPF = "52998224725" // CPF sintético válido de documentação
const NOME = "Cliente Sintético"
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
const UN = { comercial: { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } }
const LIVE = { enforceStock: true, requireCaixaSession: true }
const deps = { db: prisma as unknown as { $transaction<T>(fn: (tx: StockLedgerTx) => Promise<T>): Promise<T> } }

/** Condições da mercadoria devolvida (GOAL §5). */
const APTO = "apto_revenda" as const
const NAO_APTO = "nao_apto_revenda" as const

type Linha = { id: string; name: string; quantity: number; price: number; produtoId?: string }

async function produto(input: { name: string; price: number; metadata: object; sku: string; storeId?: string; estoque: number }) {
  const storeId = input.storeId ?? A
  const p = await prisma.produto.create({
    data: { id: "kg-f8-" + randomUUID(), storeId, name: input.name, stock: 0, price: input.price, metadata: input.metadata, sku: input.sku + "-" + randomUUID().slice(0, 6) },
  })
  const r = await applyStockMutation({ storeId, principal: null, source: "kg-f8" }, { kind: "entrada", produtoId: p.id, quantidade: input.estoque, origem: "manual" }, deps)
  if (!r.ok) throw Error(r.code)
  return p
}

function venda(lines: Linha[], opts: { kg: boolean; storeId?: string; pb?: SalePayload["paymentBreakdown"]; totalPago?: number; discountReais?: number }): SalePayload {
  const storeId = opts.storeId ?? A
  const items = lines.map((l) => ({
    inventoryId: l.id, ...(l.produtoId ? { produtoId: l.produtoId } : {}), name: l.name, quantity: l.quantity, unitPrice: l.price,
    lineTotal: (opts.kg ? saleLineTotalCents(l.quantity, l.price)! : Math.round(l.quantity * l.price * 100)) / 100,
  }))
  const subtotal = items.reduce((s, l) => s + Math.round(l.lineTotal * 100), 0) / 100
  const total = opts.totalPago ?? subtotal
  return {
    id: "KG-F8-" + randomUUID(), ...(opts.kg ? { manualKgSale: MANUAL_KG_SALE } : {}), sessaoId: storeId + "-cash",
    at: new Date().toISOString(), total, ...(opts.discountReais !== undefined ? { discountReais: opts.discountReais } : {}),
    customerCpf: CPF, customerName: NOME, lines: items, paymentBreakdown: opts.pb ?? { dinheiro: total },
  }
}
const persist = (sale: SalePayload, lojaId = A) =>
  prisma.$transaction((tx) => upsertVendaInTransaction(tx, lojaId, sale, "Operador sintético", LIVE), { timeout: 20000, maxWait: 20000 })

const headers = (loja = A) => ({ "Content-Type": "application/json", "x-assistec-loja-id": loja })
async function devolver(body: Record<string, unknown>, loja = A) {
  const res = await postDevolucao(new Request("http://localhost/api/ops/devolucao", {
    method: "POST", headers: headers(loja), body: JSON.stringify({ clienteNome: NOME, clienteDoc: CPF, sessaoId: loja + "-cash", ...body }),
  }))
  return { status: res.status, body: await res.json() }
}
async function eleg(q: string, loja = A) {
  const res = await getElegibilidade(new Request(`http://localhost/api/ops/devolucao/elegibilidade?q=${encodeURIComponent(q)}`, { headers: { "x-assistec-loja-id": loja } }))
  return { status: res.status, body: await res.json() }
}
async function cancelar(id: string, loja = A) {
  const res = await postCancelar(
    new Request(`http://localhost/api/vendas/${id}/cancelar`, { method: "POST", headers: headers(loja), body: JSON.stringify({ motivo: "teste sintético", forcar: true }) }),
    { params: Promise.resolve({ id }) },
  )
  return { status: res.status, body: await res.json() }
}
async function salvarConfig(storeId: string, printerConfig: Record<string, unknown>) {
  const res = await putStoreSettings(new Request(`http://localhost/api/stores/${storeId}/settings`, {
    method: "PUT", headers: headers(storeId), body: JSON.stringify({ printerConfig }),
  }), { params: Promise.resolve({ id: storeId }) })
  return { status: res.status, body: await res.json() }
}

/** Texto do PostgreSQL (sem conversão para double) do saldo de produto + depósitos. */
async function saldo(id: string) {
  const [row] = await prisma.$queryRaw<Array<{ stock: string; dep: string | null }>>`
    SELECT p.stock::text AS stock, (SELECT string_agg(d.quantidade::text, ',') FROM produto_depositos d WHERE d."produtoId" = p.id) AS dep
    FROM estoque_produtos p WHERE p.id = ${id}`
  return row
}
const saldoVale = async (loja = A) =>
  (await prisma.clienteCredito.aggregate({ where: { storeId: loja, clienteDoc: CPF, status: "ativo" }, _sum: { saldoAtual: true } }))._sum.saldoAtual ?? 0
const auditoriaConfig = (storeId: string) => prisma.logsAuditoria.findFirst({ where: { detail: { contains: "pdvTrocasPeso" } }, orderBy: { createdAt: "desc" } })

/** Tudo que uma devolução poderia alterar, lido como texto do banco. */
async function efeitos(pedidoId: string, produtos: string[], loja = A) {
  const venda = await prisma.$queryRaw<Array<{ status: string; total: string; payload: string }>>`
    SELECT status::text AS status, total::text AS total, payload::text AS payload FROM vendas WHERE "pedidoId" = ${pedidoId} AND "storeId" = ${loja}`
  const itens = await prisma.$queryRaw<Array<{ q: string | null; kg: string | null; lt: string }>>`
    SELECT i.quantidade::text AS q, i."quantidadeKg"::text AS kg, i."lineTotal"::text AS lt FROM venda_itens i JOIN vendas v ON v.id = i."vendaId"
    WHERE v."pedidoId" = ${pedidoId} AND v."storeId" = ${loja} ORDER BY i.id`
  return {
    venda, itens,
    saldos: await Promise.all(produtos.map(saldo)),
    devolucoes: await prisma.devolucaoVenda.count({ where: { storeId: loja } }),
    itensDevolucao: await prisma.itemDevolucaoVenda.count({ where: { devolucao: { storeId: loja } } }),
    creditos: await prisma.clienteCredito.count({ where: { storeId: loja } }),
    movFin: await prisma.movimentacaoFinanceira.count({ where: { storeId: loja } }),
    movEstoque: await prisma.movimentacaoEstoque.count({ where: { storeId: loja } }),
  }
}

/** Linha KG de devolução pronta (condição explícita é obrigatória para KG). */
const kgItem = (produtoId: string, kg: number | string, condicao: string = APTO, justificativa?: string) => ({
  inventoryId: produtoId, quantidadeKg: String(kg), condicao, ...(justificativa ? { justificativa } : {}),
})
const unItem = (produtoId: string, quantidade: number, condicao?: string) => ({
  inventoryId: produtoId, quantidade, ...(condicao ? { condicao } : {}),
})

suite("F8 × KG — trocas por peso configuráveis (PostgreSQL real)", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    for (const [id, code] of [[A, "KFA"], [B, "KFB"]] as const) {
      await prisma.store.upsert({ where: { id }, create: { id, name: "Padaria F8 sintética " + code, codigoNumeracaoVenda: code }, update: {} })
      const sessao = await prisma.sessaoCaixa.findFirst({ where: { id: id + "-cash" }, select: { id: true } })
      if (!sessao) await prisma.sessaoCaixa.create({ data: { id: id + "-cash", storeId: id, operador: "Operador", status: "ABERTA" } })
      // Política por loja começa ausente (= padrão APROVADO ativado) em cada rodada.
      await prisma.storeSettings.deleteMany({ where: { storeId: id } })
    }
  })
  afterAll(() => prisma.$disconnect())

  // ── A · B · K: parcial, integral e múltiplas devoluções KG ────────────────────
  it("KG parcial em etapas: 0,500 + 0,875 de 2,375 kg; saldo, crédito e estoque exatos; sobra 1,000 kg", async () => {
    const pao = await produto({ name: "Pão salgado", price: 20, metadata: KG, sku: "PSL", estoque: 5 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 2.375, price: 20 }], { kg: true }) // R$ 47,50
    await persist(sale)
    const valeAntes = await saldoVale()
    expect((await saldo(pao.id)).stock).toBe("2.625")
    const pago = 4750 // centavos pagos pela linha

    const d1 = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.500")] })
    expect(d1.status, JSON.stringify(d1.body)).toBe(200)
    expect(d1.body.itens[0]).toMatchObject({ quantidadeKg: 0.5, valorTotal: 10 })
    expect((await saldo(pao.id)).stock).toBe("3.125")

    const d2 = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.875")] })
    expect(d2.status, JSON.stringify(d2.body)).toBe(200)
    expect(d2.body.itens[0].valorTotal).toBe(17.5)
    expect(await saldoVale()).toBe(valeAntes + 27.5)
    expect((await saldo(pao.id)).stock).toBe("4")

    // Elegibilidade relata o saldo exato em kg com 3 casas.
    const e = await eleg(sale.id!)
    const kgLine = (e.body.vendas[0].lines as Array<{ produtoId: string; quantity: number; qtyReturned: number; unidade: string; bloqueioDevolucao?: string }>).find((l) => l.produtoId === pao.id)!
    expect(kgLine.quantity).toBe(2.375)
    expect(kgLine.qtyReturned).toBe(1.375)
    expect(kgLine.unidade).toBe("KG")
    expect(kgLine.bloqueioDevolucao).toBeUndefined()
    expect(e.body.trocasPesoPermitidas).toBe(true)

    // Exceder o saldo devolvível continua recusado — nada gravado.
    const excede = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "1.001")] })
    expect(excede.status).toBe(409)
    expect(excede.body.code).toBe("QUANTIDADE_EXCEDE_DEVOLVIVEL")

    // Integral: a última devolução absorve o resto — Σ créditos = pago, nunca acima.
    const d3 = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "1.000")] })
    expect(d3.status).toBe(200)
    expect(d3.body.itens[0].valorTotal).toBe((pago - 1000 - 1750) / 100)
    expect(await saldoVale()).toBe(valeAntes + 47.5)
    expect((await prisma.venda.findFirstOrThrow({ where: { pedidoId: sale.id } })).status).toBe("devolvida")
  })

  it("KG com desconto global proporcional e centavos: crédito = valor efetivamente pago, sem perda nem sobra", async () => {
    const queijo = await produto({ name: "Queijo minas", price: 30, metadata: KG, sku: "QMN", estoque: 4 })
    // 0,820 kg × R$30 = R$ 24,60 de linha; desconto global de R$ 4,60 → total R$ 20,00.
    const sale = venda([{ id: queijo.id, name: queijo.name, quantity: 0.82, price: 30 }], { kg: true, totalPago: 20, discountReais: 4.6 })
    await persist(sale)
    const valeAntes = await saldoVale()
    const d1 = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(queijo.id, "0.100")] })
    expect(d1.body.itens[0].valorTotal).toBe(2.44) // 2000 cents × 100/820 = 243,9 → 244
    const d2 = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(queijo.id, "0.720")] })
    expect(d2.body.itens[0].valorTotal).toBe(17.56) // última absorve o arredondamento
    expect(await saldoVale()).toBe(valeAntes + 20)
  })

  // ── E · F: venda mista e troca mista simultânea ───────────────────────────────
  it("venda mista 1,500 kg + 2 UN + 0,750 kg: cada linha devolve isolada ou juntas na mesma operação", async () => {
    const pao = await produto({ name: "Pão mista", price: 18.9, metadata: KG, sku: "PMS", estoque: 5 })
    const refri = await produto({ name: "Refrigerante mista", price: 7.5, metadata: UN, sku: "RMS", estoque: 10 })
    const queijo = await produto({ name: "Queijo mista", price: 40, metadata: KG, sku: "QMS", estoque: 3 })
    const sale = venda([
      { id: pao.id, name: pao.name, quantity: 1.5, price: 18.9 },
      { id: refri.id, name: refri.name, quantity: 2, price: 7.5 },
      { id: queijo.id, name: queijo.name, quantity: 0.75, price: 40 },
    ], { kg: true })
    await persist(sale)
    const antes = await efeitos(sale.id!, [pao.id, refri.id, queijo.id])

    // Só 1 refrigerante (UN parcial numa venda KG).
    const soUn = await devolver({ localId: "TF-" + randomUUID(), tipo: "troca", vendaLocalId: sale.id, itens: [unItem(refri.id, 1)] })
    expect(soUn.status, JSON.stringify(soUn.body)).toBe(200)
    expect(soUn.body.itens[0]).toMatchObject({ quantidade: 1, valorTotal: 7.5 })
    expect((await saldo(refri.id)).stock).toBe("9")

    // Os três itens NA MESMA operação: KG parcial + UN parcial + KG parcial.
    const juntos = await devolver({
      localId: "TF-" + randomUUID(), tipo: "troca", vendaLocalId: sale.id,
      itens: [kgItem(pao.id, "0.500"), unItem(refri.id, 1), kgItem(queijo.id, "0.250", NAO_APTO, "embalagem violada")],
    })
    expect(juntos.status, JSON.stringify(juntos.body)).toBe(200)
    expect(juntos.body.itens).toHaveLength(3)
    // Apto volta ao estoque; não apto NÃO aumenta o disponível.
    expect((await saldo(pao.id)).stock).toBe("4")
    expect((await saldo(refri.id)).stock).toBe("10")
    expect((await saldo(queijo.id)).stock).toBe("2.25")
    const devRow = await prisma.devolucaoVenda.findFirstOrThrow({ where: { localId: juntos.body.localId } })
    const mercadoria = (devRow.payload as { mercadoria?: Array<{ produtoId: string; condicao: string; justificativa?: string; estoque: string }> }).mercadoria
    expect(mercadoria).toEqual(expect.arrayContaining([
      { produtoId: pao.id, condicao: APTO, estoque: "entrada" },
      { produtoId: refri.id, condicao: APTO, estoque: "entrada" },
      { produtoId: queijo.id, condicao: NAO_APTO, justificativa: "embalagem violada", estoque: "sem_entrada" },
    ]))
    // Sem movimento de estoque para o queijo não apto: 3 linhas devolvidas, 2 entradas.
    const entradas = await prisma.movimentacaoEstoque.count({ where: { storeId: A, documento: juntos.body.localId } })
    expect(entradas).toBe(2)
    expect(antes.devolucoes + 2).toBe(await prisma.devolucaoVenda.count({ where: { storeId: A } }))
  })

  // ── Validações de quantidade KG ────────────────────────────────────────────────
  it("quantidade KG fora do contrato é recusada sem gravar: zero, negativa, 4 casas, abaixo de 0,001, NaN", async () => {
    const pao = await produto({ name: "Pão validação", price: 10, metadata: KG, sku: "PVD", estoque: 2 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 1, price: 10 }], { kg: true })
    await persist(sale)
    const antes = await efeitos(sale.id!, [pao.id])
    for (const kg of ["0", "-0.5", "0.1234", "0.0009", "1e-3", "abc"]) {
      const r = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, kg)] })
      expect(r.status, `${kg} → ${JSON.stringify(r.body)}`).toBe(422)
      expect(r.body.code).toBe("QUANTIDADE_KG_INVALIDA")
    }
    // KG sem condição explícita da mercadoria também não grava (perecível exige aptidão confirmada).
    const semCondicao = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [{ inventoryId: pao.id, quantidadeKg: "0.5" }] })
    expect(semCondicao.status).toBe(422)
    expect(semCondicao.body.code).toBe("CONDICAO_MERCADORIA_OBRIGATORIA_KG")
    // Condição não-aptos sem justificativa não grava.
    const semJust = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.5", NAO_APTO)] })
    expect(semJust.status).toBe(422)
    expect(semJust.body.code).toBe("JUSTIFICATIVA_CONDICAO_OBRIGATORIA")
    expect(await efeitos(sale.id!, [pao.id])).toEqual(antes)
  })

  // ── P · Q · R · S: configuração por loja ──────────────────────────────────────
  it("config desativada: recusa linhas KG (motivo claro), mantém UN da mesma venda mista, não desativa o F8", async () => {
    const pao = await produto({ name: "Pão config-off", price: 20, metadata: KG, sku: "PCO", estoque: 3 })
    const refri = await produto({ name: "Refri config-off", price: 5, metadata: UN, sku: "RCO", estoque: 10 })
    const sale = venda([
      { id: pao.id, name: pao.name, quantity: 0.9, price: 20 },
      { id: refri.id, name: refri.name, quantity: 3, price: 5 },
    ], { kg: true })
    await persist(sale)
    expect((await prisma.storeSettings.findUnique({ where: { storeId: A } }))?.printerConfig ?? {}).toEqual({}) // ausente = ATIVADO (padrão)

    // Padrão ausente = liberado.
    const livre = await devolver({ localId: "TF-" + randomUUID(), tipo: "troca", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.100")] })
    expect(livre.status, JSON.stringify(livre.body)).toBe(200)

    const saved = await salvarConfig(A, { pdvTrocasPeso: "disabled" })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)

    const antes = await efeitos(sale.id!, [pao.id, refri.id])
    const kg = await devolver({ localId: "TF-" + randomUUID(), tipo: "troca", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.200")] })
    expect(kg.status).toBe(409)
    expect(kg.body.code).toBe("TROCA_KG_DESATIVADA_LOJA")
    expect(kg.body.error).toMatch(/peso/i)
    // O próprio banco defende a política: mesmo com o writer do F8, linha KG não passa.
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('omni.f8_kg_return_writer', 'f8-kg-v1', true)`
      const dev = await tx.devolucaoVenda.create({
        data: { storeId: A, localId: "TF-DBPOL-" + randomUUID(), vendaLocalId: sale.id!, tipo: "vale_credito", valorTotal: 1, creditoEmitido: 1 },
        select: { id: true },
      })
      await tx.itemDevolucaoVenda.create({
        data: { devolucaoId: dev.id, inventoryId: pao.id, nome: pao.name, quantidade: null, quantidadeKg: "0.100", valorUnitario: 2, valorTotal: 2 },
      })
    })).rejects.toThrow(/F8_KG_RETURN_POLICY_DISABLED/)
    // UN da MESMA venda mista segue liberado; nada de financeiro/estoque na recusada.
    const un = await devolver({ localId: "TF-" + randomUUID(), tipo: "troca", vendaLocalId: sale.id, itens: [unItem(refri.id, 1)] })
    expect(un.status, JSON.stringify(un.body)).toBe(200)
    expect((await saldo(refri.id)).stock).toBe("8")
    expect(await efeitos(sale.id!, [pao.id, refri.id])).toEqual({
      ...antes,
      saldos: [antes.saldos[0], { stock: "8", dep: "8" }],
      devolucoes: antes.devolucoes + 1,
      itensDevolucao: antes.itensDevolucao + 1,
      creditos: antes.creditos + 1,
      movEstoque: antes.movEstoque + 1,
    })

    // Elegibilidade explica o bloqueio só nas linhas KG e informa a política.
    const e = await eleg(sale.id!)
    expect(e.body.trocasPesoPermitidas).toBe(false)
    const lines = e.body.vendas[0].lines as Array<{ produtoId: string; unidade: string; bloqueioDevolucao?: string }>
    expect(lines.find((l) => l.produtoId === pao.id)!.bloqueioDevolucao).toMatch(/peso/i)
    expect(lines.find((l) => l.produtoId === refri.id)!.bloqueioDevolucao).toBeUndefined()

    // Auditoria da alteração de configuração: usuário, loja, valores antigo/novo.
    const audit = await auditoriaConfig(A)
    expect(audit).toBeTruthy()
    expect(audit!.detail).toContain("pdvTrocasPeso")

    // Reativar volta a liberar (alteração imediata, lida do servidor no commit).
    await salvarConfig(A, { pdvTrocasPeso: "enabled" })
    const deNovo = await devolver({ localId: "TF-" + randomUUID(), tipo: "troca", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.200")] })
    expect(deNovo.status, JSON.stringify(deNovo.body)).toBe(200)
  })

  it("isolamento da configuração: desativada na loja A não afeta a loja B", async () => {
    await salvarConfig(A, { pdvTrocasPeso: "disabled" })
    const paoB = await produto({ name: "Pão loja B", price: 10, metadata: KG, sku: "PLB", estoque: 2, storeId: B })
    const saleB = venda([{ id: paoB.id, name: paoB.name, quantity: 0.5, price: 10 }], { kg: true, storeId: B })
    await persist(saleB, B)
    const rB = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: saleB.id, itens: [kgItem(paoB.id, "0.250")] }, B)
    expect(rB.status, JSON.stringify(rB.body)).toBe(200)
    const paoA = await produto({ name: "Pão loja A off", price: 10, metadata: KG, sku: "PLA", estoque: 2 })
    const saleA = venda([{ id: paoA.id, name: paoA.name, quantity: 0.5, price: 10 }], { kg: true })
    await persist(saleA)
    const rA = await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: saleA.id, itens: [kgItem(paoA.id, "0.250")] })
    expect(rA.status).toBe(409)
    expect(rA.body.code).toBe("TROCA_KG_DESATIVADA_LOJA")
    await salvarConfig(A, { pdvTrocasPeso: "enabled" })
  })

  // ── L · M: concorrência e replay/idempotência KG ──────────────────────────────
  it("dois caixas simultâneos na mesma venda KG: só uma devolução passa; replay do mesmo localId não duplica", async () => {
    const pao = await produto({ name: "Pão corrida KG", price: 20, metadata: KG, sku: "PCR", estoque: 4 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 1, price: 20 }], { kg: true })
    await persist(sale)
    const valeAntes = await saldoVale()
    const [a, b] = await Promise.all([
      devolver({ localId: "TF-RACE-A-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.600")] }),
      devolver({ localId: "TF-RACE-B-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.600")] }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    // estoque 4 − 1,000 vendido + 0,600 devolvido (vencedora) = 3,600.
    expect((await saldo(pao.id)).stock).toBe("3.6")
    expect(await saldoVale()).toBe(valeAntes + 12)

    // Replay idêntico (resposta perdida): mesma devolução, crédito uma vez só.
    const vencedora = a.status === 200 ? a : b
    const replay = await devolver({ localId: vencedora.body.localId, tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.600")] })
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    expect(replay.body.idempotente).toBe(true)
    expect(replay.body.devolucaoId).toBe(vencedora.body.devolucaoId)
    expect(await saldoVale()).toBe(valeAntes + 12)
    // Mesmo localId com conteúdo diferente = conflito, sem segunda devolução.
    const conflito = await devolver({ localId: vencedora.body.localId, tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.400")] })
    expect(conflito.status).toBe(409)
    expect(conflito.body.code).toBe("LOCAL_ID_CONFLITO")
    expect(await prisma.devolucaoVenda.count({ where: { storeId: A, vendaLocalId: sale.id! } })).toBe(1)
  })

  it("cancelamento concorrente com devolução KG: uma vence, estoque e vale nunca em dobro", async () => {
    const pao = await produto({ name: "Pão cancel race", price: 20, metadata: KG, sku: "PCA", estoque: 3 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 1, price: 20 }], { kg: true })
    await persist(sale)
    const valeAntes = await saldoVale()
    const [c, d] = await Promise.all([
      cancelar(sale.id!),
      devolver({ localId: "TF-CR-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.500")] }),
    ])
    expect([c.status, d.status].sort()).toEqual([200, 409])
    if (c.status === 200) {
      expect(await saldo(pao.id)).toEqual({ stock: "3", dep: "3" })
      expect(await prisma.devolucaoVenda.count({ where: { storeId: A, vendaLocalId: sale.id! } })).toBe(0)
    } else {
      expect(await saldo(pao.id)).toEqual({ stock: "2.5", dep: "2.5" })
      expect(await saldoVale()).toBe(valeAntes + 10)
    }
  })

  // ── W: identidade histórica da linha ──────────────────────────────────────────
  it("cadastro mudou depois da venda: linha KG continua KG e linha UN continua UN (crédito exato, estoque íntegro)", async () => {
    const pao = await produto({ name: "Pão virou UN", price: 20, metadata: KG, sku: "PVU", estoque: 2 })
    const bolo = await produto({ name: "Bolo virou KG", price: 12, metadata: UN, sku: "BVK", estoque: 4 })
    const sale = venda([
      { id: pao.id, name: pao.name, quantity: 0.8, price: 20 },
      { id: bolo.id, name: bolo.name, quantity: 2, price: 12 },
    ], { kg: true })
    await persist(sale)
    // O pão virou UN no cadastro; a linha vendida era KG.
    await prisma.produto.update({ where: { id: pao.id }, data: { metadata: UN } })
    // O bolo virou KG no cadastro; a linha vendida era UN.
    await prisma.produto.update({ where: { id: bolo.id }, data: { metadata: KG } })
    const kg = await devolver({ localId: "TF-" + randomUUID(), tipo: "troca", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.300")] })
    expect(kg.status, JSON.stringify(kg.body)).toBe(200)
    expect(kg.body.itens[0].quantidadeKg).toBe(0.3)
    expect(kg.body.itens[0].valorTotal).toBe(6) // 0,300 kg × R$20 — valor da LINHA, não do cadastro
    const un = await devolver({ localId: "TF-" + randomUUID(), tipo: "troca", vendaLocalId: sale.id, itens: [unItem(bolo.id, 1)] })
    expect(un.status, JSON.stringify(un.body)).toBe(200)
    expect(un.body.itens[0].quantidade).toBe(1)
    expect(un.body.itens[0].valorTotal).toBe(12)
    // Unidade do cadastro divergente da linha: crédito exato, SEM entrada de estoque
    // (0,3 não pode virar 300 UN, nem 1 UN virar 1 kg).
    expect((await saldo(pao.id)).stock).toBe("1.2")
    expect((await saldo(bolo.id)).stock).toBe("2")
  })

  // ── X · Y: clientes legados, triggers e CHECKs do banco ───────────────────────
  it("cliente legado (só quantidade inteira) continua gravando devolução UN", async () => {
    const refri = await produto({ name: "Refri legado", price: 5, metadata: UN, sku: "RLG", estoque: 10 })
    const sale = venda([{ id: refri.id, name: refri.name, quantity: 4, price: 5 }], { kg: false })
    await persist(sale)
    // Formato legado: apenas quantidade inteira (cliente Prisma Int antigo).
    const legado = await devolver({ localId: "TF-" + randomUUID(), tipo: "somente_estoque", vendaLocalId: sale.id, itens: [{ inventoryId: refri.id, quantidade: 2 }] })
    expect(legado.status, JSON.stringify(legado.body)).toBe(200)
    expect(legado.body.itens[0].quantidade).toBe(2)
    expect((await saldo(refri.id)).stock).toBe("8")
  })

  it("defesa em profundidade: escrita DIRETA sem o writer do F8 é recusada pelo trigger do banco", async () => {
    const pao = await produto({ name: "Pão trigger KG", price: 20, metadata: KG, sku: "PTG", estoque: 1 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 0.5, price: 20 }], { kg: true })
    await persist(sale)
    // Sem o GUC do escritor F8: nem o documento, nem a linha KG passam.
    await expect(prisma.devolucaoVenda.create({
      data: { storeId: A, localId: "TF-RAW-" + randomUUID(), vendaLocalId: sale.id!, tipo: "vale_credito", valorTotal: 1, creditoEmitido: 1 },
    })).rejects.toThrow(/MANUAL_KG_PARTIAL_RETURN_BLOCKED/)
    // Com o writer DENTRO da transação o documento passa — a linha KG ainda é validada.
    const dev = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('omni.f8_kg_return_writer', 'f8-kg-v1', true)`
      return tx.devolucaoVenda.create({
        data: { storeId: A, localId: "TF-RAW-" + randomUUID(), vendaLocalId: sale.id!, tipo: "vale_credito", valorTotal: 1, creditoEmitido: 1 },
        select: { id: true },
      })
    })
    // Linha KG FORA do writer (gravação legada direta) continua recusada.
    await expect(prisma.itemDevolucaoVenda.create({
      data: { devolucaoId: dev.id, inventoryId: pao.id, nome: pao.name, quantidade: null, quantidadeKg: "0.100", valorUnitario: 2, valorTotal: 2 },
    })).rejects.toThrow(/F8_KG_/)
    // Teto no banco: com o writer, exceder o vendido não passa.
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('omni.f8_kg_return_writer', 'f8-kg-v1', true)`
      await tx.itemDevolucaoVenda.create({
        data: { devolucaoId: dev.id, inventoryId: pao.id, nome: pao.name, quantidade: null, quantidadeKg: "0.600", valorUnitario: 2, valorTotal: 2 },
      })
    })).rejects.toThrow(/F8_KG_RETURN_EXCEEDS_SOLD/)
    // Duplicata da mesma linha KG na mesma devolução é impedida pelo índice único parcial.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('omni.f8_kg_return_writer', 'f8-kg-v1', true)`
      await tx.itemDevolucaoVenda.create({
        data: { devolucaoId: dev.id, inventoryId: pao.id, nome: pao.name, quantidade: null, quantidadeKg: "0.100", valorUnitario: 2, valorTotal: 2 },
      })
    })
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('omni.f8_kg_return_writer', 'f8-kg-v1', true)`
      await tx.itemDevolucaoVenda.create({
        data: { devolucaoId: dev.id, inventoryId: pao.id, nome: pao.name, quantidade: null, quantidadeKg: "0.200", valorUnitario: 2, valorTotal: 2 },
      })
    })).rejects.toThrow()
  })

  it("CHECK de contrato impede quantidade KG inválida e violação XOR no banco", async () => {
    const dev = await prisma.devolucaoVenda.create({
      data: { storeId: A, localId: "TF-CHK-" + randomUUID(), vendaLocalId: "sem-venda", tipo: "somente_estoque" },
      select: { id: true },
    })
    for (const row of [
      { quantidade: null, quantidadeKg: "0" },
      { quantidade: null, quantidadeKg: "-0.5" },
      { quantidade: null, quantidadeKg: "0.1234" },
      { quantidade: 2, quantidadeKg: "0.5" },
    ]) {
      await expect(prisma.itemDevolucaoVenda.create({
        data: { devolucaoId: dev.id, inventoryId: "x", nome: "x", ...row },
      })).rejects.toThrow()
    }
  })

  // ── Config: valores inválidos não viram política ──────────────────────────────
  it("PUT settings normaliza/valida a chave: valor inválido é recusado e não destrói a política", async () => {
    const antes = (await prisma.storeSettings.findUnique({ where: { storeId: A } }))?.printerConfig ?? {}
    const r = await salvarConfig(A, { pdvTrocasPeso: "maybe" })
    expect(r.status).toBe(400)
    expect((await prisma.storeSettings.findUnique({ where: { storeId: A } }))?.printerConfig ?? {}).toEqual(antes)
  })

  it("reembolso em dinheiro permanece bloqueado por política; devolução sem estoque (não recebido) não gera movimento", async () => {
    const pao = await produto({ name: "Pão dinheiro", price: 20, metadata: KG, sku: "PDN", estoque: 1 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 0.4, price: 20 }], { kg: true })
    await persist(sale)
    const dinheiro = await devolver({ localId: "TF-" + randomUUID(), tipo: "devolucao", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.4")] })
    expect(dinheiro.status).toBe(409)
    expect(dinheiro.body.code).toBe("REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA")
    const naoRecebido = await devolver({
      localId: "TF-" + randomUUID(), tipo: "somente_estoque", vendaLocalId: sale.id,
      itens: [kgItem(pao.id, "0.4", "nao_recebido", "cliente ficou com o produto")],
    })
    expect(naoRecebido.status, JSON.stringify(naoRecebido.body)).toBe(200)
    expect(naoRecebido.body.creditoEmitido).toBe(0)
    expect((await saldo(pao.id)).stock).toBe("0.6") // não recebido: nada entra
  })

  it("elegibilidade da venda KG mostra vendido/devolvido/disponível por linha sem bloqueio global", async () => {
    const pao = await produto({ name: "Pão eleg", price: 20, metadata: KG, sku: "PEG", estoque: 2 })
    const refri = await produto({ name: "Refri eleg", price: 5, metadata: UN, sku: "REG", estoque: 6 })
    const sale = venda([
      { id: pao.id, name: pao.name, quantity: 1.5, price: 20 },
      { id: refri.id, name: refri.name, quantity: 2, price: 5 },
    ], { kg: true })
    await persist(sale)
    await devolver({ localId: "TF-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [kgItem(pao.id, "0.350")] })
    const e = await eleg(sale.id!)
    const lines = e.body.vendas[0].lines as Array<{ produtoId: string; quantity: number; qtyReturned: number; unidade: string }>
    const kg = lines.find((l) => l.produtoId === pao.id)!
    expect(kg).toMatchObject({ quantity: 1.5, qtyReturned: 0.35, unidade: "KG" })
    const un = lines.find((l) => l.produtoId === refri.id)!
    expect(un).toMatchObject({ quantity: 2, qtyReturned: 0, unidade: "UN" })
  })
})
