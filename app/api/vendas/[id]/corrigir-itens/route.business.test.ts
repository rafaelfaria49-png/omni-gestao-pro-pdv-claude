// Domain persistence contracts run under an explicitly authorized synthetic principal.
vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: async () => null }))
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  metadata: {} as unknown,
  stockMutation: vi.fn(async () => ({ ok: true, idempotente: false })),
  itemCreate: vi.fn(async () => ({})), itemDelete: vi.fn(async () => ({})),
  financialCreate: vi.fn(async () => ({})), saleUpdate: vi.fn(async () => ({})),
}))
vi.mock("@/auth", () => ({ auth: async () => null }))
vi.mock("@/lib/vendas/guard-correcao-venda", () => ({ requireCorrecaoVendaAuth: async () => ({ ok: true, session: null }) }))
vi.mock("@/lib/auth/verify-supervisor-pin", () => ({ authenticateSupervisorPin: async () => ({ name: "Supervisor" }) }))
vi.mock("@/lib/financeiro/services/fechamento-service", () => ({ verificarPeriodoFechado: async () => ({ fechado: false }) }))
vi.mock("@/lib/estoque/stock-ledger-service", () => ({ applyStockMutationTx: h.stockMutation }))
vi.mock("@/lib/prisma", () => {
  const db = {
    produto: {
      findFirst: vi.fn(async () => ({ id: "p-peso", name: "Pesável", sku: "PESO", stock: 10, metadata: h.metadata })),
      findUnique: async () => ({ stock: 10, name: "Pesável" }),
    },
    venda: { findFirst: async () => ({ id: "v1", pedidoId: "VDA-1", storeId: "loja-a", status: "finalizada", at: new Date(), total: 10,
      payload: { paymentBreakdown: { dinheiro: 10 } }, itens: [{ inventoryId: "__avulso__1", nome: "Anterior", quantidade: 1, precoUnitario: 10 }] }), update: h.saleUpdate },
    itemVenda: { deleteMany: h.itemDelete, create: h.itemCreate },
    movimentacaoFinanceira: { findFirst: async () => null, create: h.financialCreate },
  }
  return { prismaEnsureConnected: async () => {}, prisma: { ...db, $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => fn(db) } }
})
import { POST } from "./route"

beforeEach(() => { vi.clearAllMocks() })
describe("correção de itens — contrato comercial", () => {
  it.each([
    [{ comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }, "PRODUTO_POR_PESO_NAO_OPERACIONAL"],
    [{ atributos: { vendaPorPeso: true } }, "PRODUTO_POR_PESO_NAO_OPERACIONAL"],
    [{ comercial: null }, "PRODUTO_COMERCIAL_INVALIDO"],
  ])("bloqueia nova baixa unitária sem escrever itens ou financeiro: %j", async (metadata, code) => {
    h.metadata = metadata
    const req = new Request("http://localhost/api/vendas/VDA-1/corrigir-itens", { method: "POST", headers: { "Content-Type": "application/json", "x-assistec-loja-id": "loja-a" }, body: JSON.stringify({
      motivo: "Correção", supervisorPin: "fixture", expectedTotal: 10,
      itens: [{ inventoryId: "__avulso__1", nome: "Anterior", quantidade: 1, precoUnitario: 10 }, { inventoryId: "PESO", nome: "Pesável", quantidade: 1, precoUnitario: 20 }],
    }) })
    const res = await POST(req, { params: Promise.resolve({ id: "VDA-1" }) })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code })
    expect(h.stockMutation).not.toHaveBeenCalled()
    expect(h.itemCreate).not.toHaveBeenCalled()
    expect(h.itemDelete).not.toHaveBeenCalled()
    expect(h.financialCreate).not.toHaveBeenCalled()
    expect(h.saleUpdate).not.toHaveBeenCalled()
  })
})
