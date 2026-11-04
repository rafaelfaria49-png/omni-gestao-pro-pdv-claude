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

const h = vi.hoisted(() => ({ db: undefined as unknown }))
vi.mock("@/lib/prisma", () => ({ get prisma() { return h.db }, prismaEnsureConnected: async () => {} }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "fixture-op", role: "ADMIN", name: "Operador Sintético", platformAuthority: true } }) }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({ apiGuardEnterpriseOrOps: async () => null }))
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

const CPF = "52998224725" // CPF sintético válido de documentação
const NOME = "Cliente Sintético"

describe.skipIf(!url)("F8 troca imediata — integração real (PG descartável)", () => {
  let db: PrismaClient
  let storeId: string
  let sessaoId: string

  beforeAll(() => { db = new PrismaClient({ datasourceUrl: url }); h.db = db })
  afterAll(async () => { await db?.$disconnect() })

  beforeEach(async () => {
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

  async function vender(lines: Array<{ sku: string; qty: number; unit: number }>, pb: SalePayload["paymentBreakdown"], cpf = CPF) {
    const total = lines.reduce((s, l) => s + l.qty * l.unit, 0)
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
})
