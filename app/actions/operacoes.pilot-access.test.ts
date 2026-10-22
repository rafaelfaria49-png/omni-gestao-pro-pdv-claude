import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ client: vi.fn(), write: vi.fn(), count: vi.fn() }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: {
  id: "synthetic-admin-a", role: "ADMIN", accessScope: "STORE", platformAuthority: false,
  allowedStoreIds: ["loja-a"], storeAccess: "restricted",
  storeModules: { "loja-a": ["service", "sales", "pdv", "catalog"] },
} }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => {
  const db = { cliente: { findFirst: h.client }, ordemServico: { count: h.count, create: h.write },
    venda: { count: h.count, create: h.write }, $transaction: h.write }
  return { prisma: db, withPrismaSafe: async (fn: (p: typeof db) => unknown) => fn(db) }
})
import { createOS, criarVendaDeOSAction } from "./operacoes"

beforeEach(() => { vi.clearAllMocks(); h.client.mockResolvedValue(null) })
describe("cliente externo à loja é recusado antes dos writers de assistência", () => {
  it("não cria OS nem calcula numeração para FK desconhecida ou de outra loja", async () => {
    await expect(createOS("loja-a", { clienteId: "client-b" } as Parameters<typeof createOS>[1]))
      .rejects.toThrow("Cliente não encontrado nesta unidade.")
    expect(h.client).toHaveBeenCalledWith({ where: { id: "client-b", storeId: "loja-a" }, select: { id: true } })
    expect(h.count).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled()
  })
  it("objeto OS adulterado não grava vínculo estrangeiro na venda", async () => {
    const os = { id: "synthetic-os", storeId: "loja-a", clienteId: "client-b", orcamento: { total: 1, pecas: [], servicos: [] } }
    await expect(criarVendaDeOSAction(os as unknown as Parameters<typeof criarVendaDeOSAction>[0]))
      .rejects.toThrow("Cliente não encontrado nesta unidade.")
    expect(h.client).toHaveBeenCalledWith({ where: { id: "client-b", storeId: "loja-a" }, select: { name: true } })
    expect(h.count).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled()
  })
})
