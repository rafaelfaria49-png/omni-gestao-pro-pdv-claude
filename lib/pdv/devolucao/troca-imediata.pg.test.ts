/**
 * PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — PostgreSQL REAL e descartável.
 *
 * Roda os handlers de PRODUÇÃO (`POST /api/ops/devolucao`, `GET …/elegibilidade`,
 * `POST /api/ops/venda-persist`, `POST /api/vendas/[id]/cancelar`) contra um banco
 * criado só para o teste. Sem dados reais: lojas/produtos/clientes sintéticos.
 *
 * Execução (nunca aponta para produção — o guard abaixo recusa qualquer outro alvo):
 *   F8_TROCA_DISPOSABLE_DB=true F8_TROCA_TEST_DATABASE_URL=postgresql://…@127.0.0.1:55471/f8_troca_test \
 *     npx vitest run lib/pdv/devolucao/troca-imediata.pg.test.ts
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { createProduct, type ProductWriteDb } from "@/lib/cadastros/product-write-service"
import type { SalePayload } from "@/lib/ops-upsert-venda"

const SESSAO = { user: { id: "fixture-op", role: "ADMIN", name: "Operador Sintético", platformAuthority: true } }
const h = vi.hoisted(() => ({
  db: undefined as unknown,
  session: undefined as unknown,
  perms: undefined as unknown,
}))
vi.mock("@/lib/prisma", () => ({ get prisma() { return h.db }, prismaEnsureConnected: async () => {} }))
vi.mock("@/auth", () => ({ auth: async () => h.session }))
// Avalia o predicado REAL de cada rota contra as permissões do operador sintético.
vi.mock("@/lib/auth/api-enterprise-guard", () => ({
  apiGuardEnterpriseOrOps: async (_s: string, check: (p: unknown) => boolean, msg: string) =>
    check(h.perms as never) ? null : new Response(JSON.stringify({ error: msg }), { status: 403 }),
}))
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: async () => ({ ok: true }) }))
vi.mock("@/lib/vendas/guard-estorno-venda", () => ({
  requireEstornoStepUp: async () => ({ ok: true, supervisorId: "sup-sintetico", supervisorNome: "Supervisor Sintético" }),
}))
vi.mock("@/lib/auth/enterprise-permissions", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/enterprise-permissions")>()),
  canAccessStore: () => true,
}))
vi.mock("@/lib/automation/automation-engine", () => ({ handleEvent: vi.fn() }))

import { POST as postDevolucao } from "@/app/api/ops/devolucao/route"
import { GET as getElegibilidade } from "@/app/api/ops/devolucao/elegibilidade/route"
import { POST as postVenda } from "@/app/api/ops/venda-persist/route"
import { POST as postCancelar } from "@/app/api/vendas/[id]/cancelar/route"
import { getEnterprisePermissions, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { GET as getPendencias, POST as postPendencia } from "@/app/api/ops/devolucao/pendencias/route"

/** Só 127.0.0.1/localhost, porta própria (nunca 5432/6543) e banco `*_test`. */
function disposableUrl(): string | undefined {
  const raw = process.env.F8_TROCA_TEST_DATABASE_URL
  if (!raw) return undefined
  const u = new URL(raw)
  const ok =
    process.env.F8_TROCA_DISPOSABLE_DB === "true" &&
    ["127.0.0.1", "localhost"].includes(u.hostname) &&
    u.port !== "" && !["5432", "6543"].includes(u.port) &&
    /_test$/.test(u.pathname.replace(/^\//, ""))
  if (!ok) throw new Error("F8_TROCA_DISPOSABLE_DATABASE_REQUIRED")
  return raw
}
const url = disposableUrl()

function permsCom(pdv: Partial<EnterprisePermissions["pdv"]>): EnterprisePermissions {
  const base = getEnterprisePermissions("ADMIN")
  return { ...base, pdv: { ...base.pdv, ...pdv } }
}

const CPF = "52998224725" // CPF sintético válido de documentação
const NOME = "Cliente Sintético"

describe.skipIf(!url)("F8 troca imediata — integração real (PG descartável)", () => {
  let db: PrismaClient
  let storeId: string
  let sessaoId: string

  beforeAll(() => { db = new PrismaClient({ datasourceUrl: url }); h.db = db })
  afterAll(async () => { await db?.$disconnect() })

  beforeEach(async () => {
    h.session = SESSAO
    h.perms = getEnterprisePermissions("ADMIN")
    storeId = `f8-${randomUUID()}`
    await db.store.create({ data: { id: storeId, name: "Loja F8 sintética", codigoNumeracaoVenda: randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase() } })
    const ctx = { storeId, principal: { userId: "fixture-op", role: "ADMIN", email: "op@example.test", displayLabel: "Operador Sintético" } }
    const unit = { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } as const
    for (const p of [
      { nome: "Camiseta P", sku: "CAM-P", barcode: "7890000000017", estoque: 10, preco: 10 },
      { nome: "Camiseta G", sku: "CAM-G", barcode: "7890000000024", estoque: 10, preco: 15 },
      { nome: "Meia", sku: "MEIA", barcode: "7890000000031", estoque: 10, preco: 5 },
    ]) {
      const r = await createProduct(ctx as never, { ...p, custo: 1, metadata: { comercial: unit } } as never, { db: db as unknown as ProductWriteDb })
      if (!r.ok) throw new Error(r.message)
    }
    sessaoId = (await db.sessaoCaixa.create({ data: { storeId, operador: "Operador Sintético" } })).id
  })

  const headers = () => ({ "Content-Type": "application/json", "x-assistec-loja-id": storeId })

  async function vender(lines: Array<{ sku: string; qty: number; unit: number }>, pb: SalePayload["paymentBreakdown"], cpf = CPF, totalPago?: number): Promise<{ status: number; body: Record<string, unknown>; id: string }> {
    const total = totalPago ?? lines.reduce((s, l) => s + l.qty * l.unit, 0)
    const sale: SalePayload = {
      id: `VDA-F8-${randomUUID().slice(0, 8)}`,
      at: new Date().toISOString(),
      total,
      sessaoId,
      customerCpf: cpf,
      customerName: NOME,
      lines: lines.map((l) => ({ inventoryId: l.sku, name: l.sku, quantity: l.qty, unitPrice: l.unit, lineTotal: l.qty * l.unit })),
      paymentBreakdown: pb,
    }
    const res = await postVenda(new Request("http://localhost/api/ops/venda-persist", { method: "POST", headers: headers(), body: JSON.stringify({ sale }) }))
    return { status: res.status, body: await res.json(), id: sale.id! }
  }

  async function devolver(body: Record<string, unknown>) {
    const res = await postDevolucao(new Request("http://localhost/api/ops/devolucao", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ clienteNome: NOME, clienteDoc: CPF, sessaoId, ...body }),
    }))
    return { status: res.status, body: await res.json() }
  }

  const stock = async (sku: string) => (await db.produto.findFirst({ where: { storeId, sku }, select: { stock: true } }))!.stock
  const saldoVale = async () =>
    (await db.clienteCredito.aggregate({ where: { storeId, clienteDoc: CPF, status: "ativo" }, _sum: { saldoAtual: true } }))._sum.saldoAtual ?? 0
  const saidasDevolucao = () => db.movimentacaoFinanceira.count({ where: { storeId, origem: "devolucao_pdv" } })

  it("diferença POSITIVA: devolve 1×10, leva 1×15 pagando 5 — vale gerado e consumido no mesmo fluxo", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { dinheiro: 20 })
    expect(origem.status).toBe(200)
    expect(await stock("CAM-P")).toBe(8)

    const dev = await devolver({ localId: "DEV-T-1", vendaLocalId: origem.id, tipo: "troca", itens: [{ inventoryId: "CAM-P", quantidade: 1 }], valorTotal: 999, creditoEmitido: 999 })
    expect(dev.status).toBe(200)
    expect(dev.body).toMatchObject({ valorTotal: 10, creditoEmitido: 10, saldoCreditoCliente: 10, idempotente: false })
    expect(await stock("CAM-P")).toBe(9)
    expect(await saidasDevolucao()).toBe(0) // vale-troca NÃO é saída financeira

    const nova = await vender([{ sku: "CAM-G", qty: 1, unit: 15 }], { creditoVale: 10, dinheiro: 5 })
    expect(nova.status).toBe(200)
    expect(await saldoVale()).toBe(0)
    expect(await stock("CAM-G")).toBe(9)
    expect(await db.usoCreditoCliente.count({ where: { storeId, vendaId: nova.id } })).toBe(1)
    // Caixa: só a diferença em dinheiro entrou pela nova venda; o vale não entra.
    const entradasNova = await db.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: nova.id, tipo: "entrada" }, select: { valor: true } })
    expect(entradasNova.reduce((s, m) => s + m.valor, 0)).toBe(5)
    expect((await db.venda.findFirst({ where: { pedidoId: origem.id } }))!.status).toBe("parcialmente_devolvida")
  })

  it("diferença NEGATIVA: devolve 2×10, leva 1×10 — sobra de 10 fica como vale persistente", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { pix: 20 })
    const dev = await devolver({ localId: "DEV-T-2", vendaLocalId: origem.id, tipo: "troca", itens: [{ inventoryId: "CAM-P", quantidade: 2 }] })
    expect(dev.body.creditoEmitido).toBe(20)
    const nova = await vender([{ sku: "MEIA", qty: 2, unit: 5 }], { creditoVale: 10 })
    expect(nova.status).toBe(200)
    expect(await saldoVale()).toBe(10)
    expect(await saidasDevolucao()).toBe(0)
    expect((await db.venda.findFirst({ where: { pedidoId: origem.id } }))!.status).toBe("devolvida")
  })

  it("diferença ZERO: troca casada", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }], { dinheiro: 10 })
    await devolver({ localId: "DEV-T-3", vendaLocalId: origem.id, tipo: "troca", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    const nova = await vender([{ sku: "MEIA", qty: 2, unit: 5 }], { creditoVale: 10 })
    expect(nova.status).toBe(200)
    expect(await saldoVale()).toBe(0)
  })

  it("teto: não devolve mais do que o vendido (inclusive somando devoluções anteriores)", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { dinheiro: 20 })
    expect((await devolver({ localId: "DEV-T-4a", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })).status).toBe(200)
    const excede = await devolver({ localId: "DEV-T-4b", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 2 }] })
    expect(excede.status).toBe(409)
    expect(excede.body.code).toBe("QUANTIDADE_EXCEDE_DEVOLVIVEL")
    expect(excede.body.detail).toMatchObject({ disponivel: 1, solicitado: 2 })
    const fora = await devolver({ localId: "DEV-T-4c", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "MEIA", quantidade: 1 }] })
    expect(fora.body.code).toBe("ITEM_NAO_CONSTA_NA_VENDA")
    expect(await saldoVale()).toBe(10)
    expect(await stock("CAM-P")).toBe(9)
  })

  it("concorrência: duas devoluções simultâneas da mesma venda (localIds distintos) — só uma passa", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { dinheiro: 20 })
    const [a, b] = await Promise.all([
      devolver({ localId: "DEV-C-A", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 2 }] }),
      devolver({ localId: "DEV-C-B", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 2 }] }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect([a.body.code, b.body.code]).toContain("QUANTIDADE_EXCEDE_DEVOLVIVEL")
    expect(await saldoVale()).toBe(20)
    expect(await stock("CAM-P")).toBe(10)
    expect(await db.devolucaoVenda.count({ where: { storeId } })).toBe(1)
  })

  it("idempotência: mesmo localId em paralelo e em reenvio — um documento, um crédito, um estoque", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { dinheiro: 20 })
    const body = { localId: "DEV-I-1", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] }
    const [a, b] = await Promise.all([devolver(body), devolver(body)])
    expect([a.status, b.status]).toEqual([200, 200])
    expect([a.body.idempotente, b.body.idempotente].sort()).toEqual([false, true])
    const c = await devolver(body)
    expect(c.body).toMatchObject({ idempotente: true, creditoEmitido: 10, devolucaoId: a.body.devolucaoId })
    expect(await db.clienteCredito.count({ where: { storeId } })).toBe(1)
    expect(await saldoVale()).toBe(10)
    expect(await stock("CAM-P")).toBe(9)
  })

  it("mesmo localId com conteúdo diferente é CONFLITO (antes sumia como replay)", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { dinheiro: 20 })
    await devolver({ localId: "DEV-X", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    const outro = await devolver({ localId: "DEV-X", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 2 }] })
    expect(outro.status).toBe(409)
    expect(outro.body.code).toBe("LOCAL_ID_CONFLITO")
    expect(await saldoVale()).toBe(10)
  })

  it("política: reembolso em dinheiro bloqueado — nada é gravado", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }], { dinheiro: 10 })
    const r = await devolver({ localId: "DEV-R", vendaLocalId: origem.id, tipo: "devolucao", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA")
    expect(await db.devolucaoVenda.count({ where: { storeId } })).toBe(0)
    expect(await saidasDevolucao()).toBe(0)
    expect(await stock("CAM-P")).toBe(9)
  })

  it("sem lastro: venda inexistente no servidor ou vale sem CPF não geram crédito", async () => {
    const semVenda = await devolver({ localId: "DEV-N", vendaLocalId: "VDA-NAO-EXISTE", tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(semVenda.body.code).toBe("VENDA_ORIGEM_NAO_ENCONTRADA")
    const origem = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }], { dinheiro: 10 })
    const semDoc = await devolver({ localId: "DEV-D", vendaLocalId: origem.id, tipo: "vale_credito", clienteDoc: "", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(semDoc.status).toBe(422)
    expect(semDoc.body.code).toBe("CLIENTE_DOC_OBRIGATORIO")
    expect(await db.clienteCredito.count({ where: { storeId } })).toBe(0)
    expect(await db.devolucaoVenda.count({ where: { storeId } })).toBe(0)
  })

  it("vale não pode ser gasto duas vezes: a 2ª venda com o mesmo vale é recusada inteira", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }], { dinheiro: 10 })
    await devolver({ localId: "DEV-V", vendaLocalId: origem.id, tipo: "troca", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    const [x, y] = await Promise.all([
      vender([{ sku: "MEIA", qty: 2, unit: 5 }], { creditoVale: 10 }),
      vender([{ sku: "MEIA", qty: 2, unit: 5 }], { creditoVale: 10 }),
    ])
    expect([x.status, y.status].sort()).toEqual([200, 409])
    expect(await saldoVale()).toBe(0)
    expect(await stock("MEIA")).toBe(8)
  })

  it("busca no servidor por código de barras, SKU e venda traz o devolvível agregado", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 3, unit: 10 }, { sku: "MEIA", qty: 1, unit: 5 }], { dinheiro: 35 })
    await devolver({ localId: "DEV-B", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 2 }] })
    for (const q of ["7890000000017", "CAM-P", origem.id, origem.id.toLowerCase()]) {
      const res = await getElegibilidade(new Request(`http://localhost/api/ops/devolucao/elegibilidade?q=${encodeURIComponent(q)}`, { headers: headers() }))
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.vendas.map((v: { id: string }) => v.id)).toContain(origem.id)
      const line = j.vendas.find((v: { id: string }) => v.id === origem.id).lines.find((l: { inventoryId: string }) => l.inventoryId === "CAM-P")
      expect(line).toMatchObject({ quantity: 3, qtyReturned: 2 })
    }
    // Isolamento por loja: outra loja não enxerga a venda.
    const outra = await getElegibilidade(new Request(`http://localhost/api/ops/devolucao/elegibilidade?q=${origem.id}`, { headers: { "x-assistec-loja-id": `${storeId}-x` } }))
    expect((await outra.json()).vendas).toHaveLength(0)
  })

  it("desconto da venda: vale = valor PAGO (2×10 vendidos por 10), nunca o preço de tabela", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { dinheiro: 10 }, CPF, 10)
    expect(origem.status, JSON.stringify(origem.body)).toBe(200)
    const a = await devolver({ localId: "DEV-DESC-1", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(a.body).toMatchObject({ valorTotal: 5, creditoEmitido: 5 })
    const b = await devolver({ localId: "DEV-DESC-2", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(b.body).toMatchObject({ valorTotal: 5, creditoEmitido: 5 })
    expect(await saldoVale()).toBe(10)
    const res = await getElegibilidade(new Request(`http://localhost/api/ops/devolucao/elegibilidade?q=${origem.id}`, { headers: headers() }))
    expect((await res.json()).vendas[0].lines[0]).toMatchObject({ quantity: 2, lineTotal: 10, qtyReturned: 2 })
  })

  async function cancelar(id: string) {
    const res = await postCancelar(
      new Request(`http://localhost/api/vendas/${id}/cancelar`, { method: "POST", headers: headers(), body: JSON.stringify({ motivo: "teste sintético", forcar: true }) }),
      { params: Promise.resolve({ id }) },
    )
    return { status: res.status, body: await res.json() }
  }

  it("cancelamento bloqueado quando a venda foi paga com vale e teve vale emitido em devolução (sem valor em dobro)", async () => {
    const base = await vender([{ sku: "MEIA", qty: 2, unit: 5 }], { dinheiro: 10 })
    await devolver({ localId: "DEV-BASE", vendaLocalId: base.id, tipo: "vale_credito", itens: [{ inventoryId: "MEIA", quantidade: 2 }] })
    const comVale = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { creditoVale: 10, dinheiro: 10 })
    expect(comVale.status).toBe(200)
    await devolver({ localId: "DEV-CV", vendaLocalId: comVale.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 2 }] })
    const r = await cancelar(comVale.id)
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("vale_emitido_bloqueia_cancelamento")
    expect((await db.venda.findFirst({ where: { pedidoId: comVale.id } }))!.status).toBe("devolvida")
    expect(await saldoVale()).toBe(20)
  })

  it("corrida cancelamento × devolução: nunca estoque em dobro nem vale + estorno acima do pago", async () => {
    for (let i = 0; i < 5; i++) {
      const estoqueAntes = await stock("CAM-P")
      const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { dinheiro: 20 })
      const [c, d] = await Promise.all([
        cancelar(origem.id),
        devolver({ localId: `DEV-RACE-${i}`, vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] }),
      ])
      expect([200, 409]).toContain(c.status)
      expect([200, 409]).toContain(d.status)
      expect(await stock("CAM-P")).toBe(c.status === 200 ? estoqueAntes : estoqueAntes - 2 + (d.status === 200 ? 1 : 0))
      const vale = (await db.clienteCredito.aggregate({ where: { storeId, vendaOrigemId: origem.id }, _sum: { valorOriginal: true } }))._sum.valorOriginal ?? 0
      const estorno = (await db.movimentacaoFinanceira.aggregate({ where: { storeId, origem: "cancelamento_pdv", referenciaId: origem.id }, _sum: { valor: true } }))._sum.valor ?? 0
      expect(vale + estorno).toBeLessThanOrEqual(20)
    }
  })

  it("cancelamento após vale: estorno desconta o vale já entregue (sem saída fictícia, sem pagar duas vezes)", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { dinheiro: 20 })
    await devolver({ localId: "DEV-K", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    const res = await postCancelar(
      new Request(`http://localhost/api/vendas/${origem.id}/cancelar`, { method: "POST", headers: headers(), body: JSON.stringify({ motivo: "teste sintético", forcar: true }) }),
      { params: Promise.resolve({ id: origem.id }) },
    )
    const body = await res.json()
    expect(res.status, JSON.stringify(body)).toBe(200)
    const estorno = await db.movimentacaoFinanceira.findMany({ where: { storeId, origem: "cancelamento_pdv", referenciaId: origem.id }, select: { valor: true } })
    expect(estorno.reduce((s, m) => s + m.valor, 0)).toBe(10)
  })

  // ── PDV-F8-FINALIZACAO-COMPLETA-001 ─────────────────────────────────────────

  const produtoId = async (sku: string) => (await db.produto.findFirst({ where: { storeId, sku }, select: { id: true } }))!.id
  const stockById = async (id: string) => (await db.produto.findUnique({ where: { id }, select: { stock: true } }))!.stock
  const eleg = async (q: string, loja = storeId) => {
    const res = await getElegibilidade(new Request(`http://localhost/api/ops/devolucao/elegibilidade?q=${encodeURIComponent(q)}`, { headers: { "x-assistec-loja-id": loja } }))
    return { status: res.status, body: await res.json() }
  }
  const efeitos = async () => ({
    devolucoes: await db.devolucaoVenda.count({ where: { storeId } }),
    creditos: await db.clienteCredito.count({ where: { storeId } }),
    movFin: await db.movimentacaoFinanceira.count({ where: { storeId, origem: { in: ["devolucao_pdv", "cancelamento_pdv"] } } }),
    movEstoqueDev: await db.movimentacaoEstoque.count({ where: { storeId, origem: "devolucao" } }),
  })

  it("SKU ALTERADO após a venda: o SKU antigo e o Produto.id ainda identificam o item; replay continua idempotente", async () => {
    const pid = await produtoId("CAM-P")
    const origem = await vender([{ sku: "CAM-P", qty: 3, unit: 10 }], { dinheiro: 30 })
    await db.produto.update({ where: { id: pid }, data: { sku: "CAM-P-NOVO" } })

    // SKU antigo (o que o terminal guardou) → identidade histórica da venda.
    const a = await devolver({ localId: "DEV-SKU-1", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(a.status, JSON.stringify(a.body)).toBe(200)
    expect(a.body.itens[0]).toMatchObject({ produtoId: pid, quantidade: 1, valorTotal: 10 })
    expect(await stockById(pid)).toBe(8)
    // Reenvio idêntico depois do rename: replay (não conflito → não vira 2ª devolução).
    const replay = await devolver({ localId: "DEV-SKU-1", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(replay.body).toMatchObject({ idempotente: true, devolucaoId: a.body.devolucaoId })
    // SKU novo e Produto.id também resolvem para a MESMA linha e somam no teto.
    const b = await devolver({ localId: "DEV-SKU-2", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P-NOVO", quantidade: 1 }] })
    expect(b.status).toBe(200)
    const c = await devolver({ localId: "DEV-SKU-3", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "qualquer", produtoId: pid, quantidade: 2 }] })
    expect(c.body.code).toBe("QUANTIDADE_EXCEDE_DEVOLVIVEL")
    expect(c.body.detail).toMatchObject({ disponivel: 1 })
    expect(await stockById(pid)).toBe(9)
    expect(await saldoVale()).toBe(20)
    // Busca pelo SKU de hoje acha a venda antiga; a linha traz a identidade histórica.
    const e = await eleg("CAM-P-NOVO")
    const linha = e.body.vendas.find((v: { id: string }) => v.id === origem.id).lines[0]
    expect(linha).toMatchObject({ produtoId: pid, quantity: 3, qtyReturned: 2 })
  })

  it("SKU REMOVIDO do cadastro: Produto.id e o SKU da época continuam valendo", async () => {
    const pid = await produtoId("MEIA")
    const origem = await vender([{ sku: "MEIA", qty: 2, unit: 5 }], { dinheiro: 10 })
    await db.produto.update({ where: { id: pid }, data: { sku: null, barcode: null } })
    const a = await devolver({ localId: "DEV-RM-1", vendaLocalId: origem.id, tipo: "somente_estoque", itens: [{ inventoryId: "MEIA", quantidade: 1 }] })
    expect(a.status, JSON.stringify(a.body)).toBe(200)
    const b = await devolver({ localId: "DEV-RM-2", vendaLocalId: origem.id, tipo: "somente_estoque", itens: [{ produtoId: pid, quantidade: 1 }] })
    expect(b.status).toBe(200)
    expect(await stockById(pid)).toBe(10)
    expect(await saldoVale()).toBe(0) // somente estoque: sem vale
  })

  it("SKU REUTILIZADO por outro produto: nunca devolve o produto errado", async () => {
    const camP = await produtoId("CAM-P")
    const meia = await produtoId("MEIA")
    const origem = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }], { dinheiro: 10 })
    // CAM-P vira outro código e a MEIA herda o SKU "CAM-P".
    await db.produto.update({ where: { id: camP }, data: { sku: "CAM-P-OLD" } })
    await db.produto.update({ where: { id: meia }, data: { sku: "CAM-P" } })
    const meiaAntes = await stockById(meia)
    // "CAM-P" na venda antiga = a camiseta (identidade da época), não a meia de hoje.
    const a = await devolver({ localId: "DEV-RE-1", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(a.status, JSON.stringify(a.body)).toBe(200)
    expect(a.body.itens[0]).toMatchObject({ produtoId: camP, valorTotal: 10 })
    expect(await stockById(camP)).toBe(10)
    expect(await stockById(meia)).toBe(meiaAntes)
    // Pedir a meia (Produto.id) contra essa venda: não consta.
    const outra = await vender([{ sku: "CAM-G", qty: 1, unit: 15 }], { dinheiro: 15 })
    const b = await devolver({ localId: "DEV-RE-2", vendaLocalId: outra.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", produtoId: meia, quantidade: 1 }] })
    expect(b.body.code).toBe("ITEM_NAO_CONSTA_NA_VENDA")
    expect(await saldoVale()).toBe(10)
  })

  it("produto REPETIDO no carrinho (uma linha por bipe): uma linha devolvível com o total, teto somado", async () => {
    const pid = await produtoId("CAM-P")
    const origem = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }, { sku: "CAM-P", qty: 1, unit: 10 }, { sku: "MEIA", qty: 1, unit: 5 }], { dinheiro: 25 })
    expect(origem.status).toBe(200)
    const e = await eleg(origem.id)
    const linhas = e.body.vendas[0].lines.filter((l: { produtoId: string }) => l.produtoId === pid)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ quantity: 2, lineTotal: 20, qtyReturned: 0 })
    const a = await devolver({ localId: "DEV-REP-1", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", produtoId: pid, quantidade: 2 }] })
    expect(a.body).toMatchObject({ valorTotal: 20, creditoEmitido: 20 })
    const b = await devolver({ localId: "DEV-REP-2", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(b.body.code).toBe("QUANTIDADE_EXCEDE_DEVOLVIVEL")
    expect(await stockById(pid)).toBe(10)
    expect((await db.venda.findFirst({ where: { pedidoId: origem.id } }))!.status).toBe("parcialmente_devolvida")
  })

  it("troca com várias unidades e devolução PARCIAL + vale parcialmente utilizado", async () => {
    const origem = await vender([{ sku: "CAM-G", qty: 3, unit: 15 }], { cartaoCredito: 45 })
    const dev = await devolver({ localId: "DEV-PARC", vendaLocalId: origem.id, tipo: "troca", itens: [{ inventoryId: "CAM-G", quantidade: 2 }] })
    expect(dev.body).toMatchObject({ valorTotal: 30, creditoEmitido: 30 })
    // Nova compra mais barata (10): usa 10 do vale; sobra 20 em vale.
    const nova = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }], { creditoVale: 10 })
    expect(nova.status).toBe(200)
    expect(await saldoVale()).toBe(20)
    // Outro caixa usa o restante do vale.
    const outra = await vender([{ sku: "MEIA", qty: 4, unit: 5 }], { creditoVale: 20 })
    expect(outra.status).toBe(200)
    expect(await saldoVale()).toBe(0)
    // Vale consumido: uma terceira tentativa é recusada inteira, estoque intacto.
    const meia = await stock("MEIA")
    const sem = await vender([{ sku: "MEIA", qty: 1, unit: 5 }], { creditoVale: 5 })
    expect(sem.status).toBe(409)
    expect(await stock("MEIA")).toBe(meia)
    expect(await stock("CAM-G")).toBe(9) // 10 − 3 vendidos + 2 devolvidos
  })

  it("SERVIÇO / linha virtual: recusa explícita, sem vale e sem estoque; a busca sinaliza o bloqueio", async () => {
    const origem = await vender([{ sku: "__servico__instalacao", qty: 1, unit: 50 }, { sku: "CAM-P", qty: 1, unit: 10 }], { dinheiro: 60 })
    expect(origem.status, JSON.stringify(origem.body)).toBe(200)
    const antes = await efeitos()
    const r = await devolver({ localId: "DEV-SVC", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "__servico__instalacao", quantidade: 1 }] })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("ITEM_SEM_LASTRO_BLOQUEADO")
    const avulso = await vender([{ sku: "__avulso__brinde", qty: 1, unit: 7 }], { dinheiro: 7 })
    const r2 = await devolver({ localId: "DEV-AVU", vendaLocalId: avulso.id, tipo: "somente_estoque", itens: [{ inventoryId: "__avulso__brinde", quantidade: 1 }] })
    expect(r2.body.code).toBe("ITEM_SEM_LASTRO_BLOQUEADO")
    expect(await efeitos()).toEqual(antes)
    const e = await eleg(origem.id)
    const svc = e.body.vendas[0].lines.find((l: { produtoId: string }) => l.produtoId === "__servico__instalacao")
    expect(svc.bloqueioDevolucao).toMatch(/Não devolvível/)
    const cam = e.body.vendas[0].lines.find((l: { inventoryId: string }) => l.inventoryId === "CAM-P")
    expect(cam.bloqueioDevolucao).toBeUndefined()
    // O produto real da mesma venda continua devolvível — e o vale é só do que foi pago por ele.
    const ok = await devolver({ localId: "DEV-SVC-OK", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(ok.body).toMatchObject({ valorTotal: 10, creditoEmitido: 10 })
  })

  it("KG: produto vendido por peso não é devolvido (bloqueado até aprovação do schema R3)", async () => {
    const pid = await produtoId("MEIA")
    const origem = await vender([{ sku: "MEIA", qty: 1, unit: 5 }], { dinheiro: 5 })
    await db.produto.update({ where: { id: pid }, data: { metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } } } })
    const antes = await efeitos()
    const r = await devolver({ localId: "DEV-KG", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "MEIA", quantidade: 1 }] })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("DEVOLUCAO_KG_BLOQUEADA")
    expect(await efeitos()).toEqual(antes)
    expect((await eleg(origem.id)).body.vendas[0].lines[0].bloqueioDevolucao).toMatch(/peso/)
  })

  it("venda de origem AUSENTE: nada é gravado; quando a venda chega, o reenvio com o MESMO localId grava uma vez", async () => {
    const id = `VDA-F8-TARDIA-${randomUUID().slice(0, 8)}`
    const body = { localId: "DEV-TARDIA", vendaLocalId: id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1, valorUnitario: 999 }] }
    for (let i = 0; i < 3; i++) {
      const r = await devolver(body)
      expect(r.body.code).toBe("VENDA_ORIGEM_NAO_ENCONTRADA")
    }
    expect(await db.devolucaoVenda.count({ where: { storeId } })).toBe(0)
    expect(await stock("CAM-P")).toBe(10)
    const sale: SalePayload = { id, at: new Date().toISOString(), total: 10, sessaoId, customerCpf: CPF, customerName: NOME, lines: [{ inventoryId: "CAM-P", name: "CAM-P", quantity: 1, unitPrice: 10, lineTotal: 10 }], paymentBreakdown: { dinheiro: 10 } }
    expect((await postVenda(new Request("http://localhost/api/ops/venda-persist", { method: "POST", headers: headers(), body: JSON.stringify({ sale }) }))).status).toBe(200)
    const [a, b] = await Promise.all([devolver(body), devolver(body)])
    expect([a.body.creditoEmitido, b.body.creditoEmitido]).toEqual([10, 10]) // preço do client ignorado
    expect(await db.devolucaoVenda.count({ where: { storeId } })).toBe(1)
    expect(await saldoVale()).toBe(10)
    expect(await stock("CAM-P")).toBe(10)
  })

  it("isolamento entre lojas: devolução com o header de outra loja não acha a venda e nada grava", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }], { dinheiro: 10 })
    const outraLoja = `${storeId}-b`
    await db.store.create({ data: { id: outraLoja, name: "Loja B sintética", codigoNumeracaoVenda: randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase() } })
    const res = await postDevolucao(new Request("http://localhost/api/ops/devolucao", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-assistec-loja-id": outraLoja },
      body: JSON.stringify({ localId: "DEV-ISO", vendaLocalId: origem.id, tipo: "vale_credito", clienteNome: NOME, clienteDoc: CPF, itens: [{ inventoryId: "CAM-P", quantidade: 1 }] }),
    }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("VENDA_ORIGEM_NAO_ENCONTRADA")
    expect(await db.devolucaoVenda.count({ where: { storeId: { in: [storeId, outraLoja] } } })).toBe(0)
    expect(await stock("CAM-P")).toBe(9)
  })

  async function encaminhar(body: Record<string, unknown>, loja = storeId) {
    const res = await postPendencia(new Request("http://localhost/api/ops/devolucao/pendencias", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-assistec-loja-id": loja },
      body: JSON.stringify({ justificativa: "Cliente levou o vale impresso", itens: [{ inventoryId: "CAM-P", quantidade: 1 }], ...body }),
    }))
    return { status: res.status, body: await res.json() }
  }

  it("fila LEGADA: encaminhamento ao Financeiro é idempotente, auditável e NÃO cria dinheiro, vale nem estoque", async () => {
    const antes = await efeitos()
    const estoqueAntes = await stock("CAM-P")
    const body = { localId: "DEV-2025-0007", vendaLocalId: "VDA-SO-LOCAL-1", categoria: "DINHEIRO_ENTREGUE", estado: "RECUSA_DEFINITIVA", valorDeclarado: 10, motivoRecusa: "REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA" }
    const [a, b] = await Promise.all([encaminhar(body), encaminhar(body)])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(a.body.ref).toBe(b.body.ref)
    expect([a.body.idempotente, b.body.idempotente].sort()).toEqual([false, true])
    expect(a.body).toMatchObject({ categoria: "DINHEIRO_ENTREGUE", valorDeclarado: 10, vendaOrigemNoServidor: false, valorReferenciaServidor: null, operador: "Operador Sintético" })
    const c = await encaminhar({ ...body, valorDeclarado: 999 })
    expect(c.body).toMatchObject({ ref: a.body.ref, idempotente: true, valorDeclarado: 10 })
    expect(await db.auditoriaFinanceira.count({ where: { storeId, entidade: "devolucao_pdv_pendencia" } })).toBe(1)
    expect(await efeitos()).toEqual(antes)
    expect(await stock("CAM-P")).toBe(estoqueAntes)
    expect(await db.movimentacaoFinanceira.count({ where: { storeId } })).toBe(0)
    // Lista do servidor (para a conferência) mostra a pendência; outra loja não vê.
    const lista = await (await getPendencias(new Request("http://localhost/api/ops/devolucao/pendencias", { headers: headers() }))).json()
    expect(lista.pendencias.map((p: { ref: string }) => p.ref)).toEqual([a.body.ref])
    const outra = await (await getPendencias(new Request("http://localhost/api/ops/devolucao/pendencias", { headers: { "x-assistec-loja-id": `${storeId}-x` } }))).json()
    expect(outra.pendencias).toEqual([])
  })

  it("venda de origem PRESENTE: o encaminhamento registra o valor recalculado pelo servidor, ignorando o declarado", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 2, unit: 10 }], { dinheiro: 10 }, CPF, 10) // desconto 50%
    const r = await encaminhar({ localId: "DEV-LEG-VAL", vendaLocalId: origem.id, categoria: "VALE_EMITIDO", estado: "BLOQUEIO_PERSISTENTE", valorDeclarado: 20 })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ vendaOrigemNoServidor: true, valorReferenciaServidor: 5, valorDeclarado: 20 })
    expect(await saldoVale()).toBe(0)
  })

  it("devolução JÁ gravada não vira pendência; sem justificativa, sem sessão ou sem permissão de supervisor: recusa", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }], { dinheiro: 10 })
    await devolver({ localId: "DEV-GRAV", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    const base = { vendaLocalId: origem.id, categoria: "VALE_EMITIDO", estado: "RECUSA_DEFINITIVA", valorDeclarado: 10 }
    expect((await encaminhar({ ...base, localId: "DEV-GRAV" })).body.code).toBe("DEVOLUCAO_JA_GRAVADA")
    expect((await encaminhar({ ...base, localId: "DEV-SEM-J", justificativa: "  " })).body.code).toBe("JUSTIFICATIVA_OBRIGATORIA")
    h.perms = permsCom({ cancelarVenda: false })
    expect((await encaminhar({ ...base, localId: "DEV-SEM-PERM" })).status).toBe(403)
    h.session = null
    expect((await encaminhar({ ...base, localId: "DEV-SEM-SESSAO" })).status).toBe(401)
    expect(await db.auditoriaFinanceira.count({ where: { storeId } })).toBe(0)
  })

  it("permissão de devolução ausente: a gravação é negada antes de qualquer IO", async () => {
    const origem = await vender([{ sku: "CAM-P", qty: 1, unit: 10 }], { dinheiro: 10 })
    h.perms = permsCom({ devolucao: false })
    const r = await devolver({ localId: "DEV-PERM", vendaLocalId: origem.id, tipo: "vale_credito", itens: [{ inventoryId: "CAM-P", quantidade: 1 }] })
    expect(r.status).toBe(403)
    expect(await db.devolucaoVenda.count({ where: { storeId } })).toBe(0)
    expect(await stock("CAM-P")).toBe(9)
  })
})
