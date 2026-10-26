import { beforeEach, describe, expect, it, vi } from "vitest"
import { mergePdvCatalogWithInventory } from "@/lib/pdv-catalog"
import { findPdvProductByScan } from "@/lib/pdv-scan-product"
import { filterPdvCatalogBySearch } from "@/lib/pdv-product-search"
import type { InventoryItem } from "@/lib/operations-store"

const h = vi.hoisted(() => ({
  findMany: vi.fn(), connect: vi.fn(), allowed: true,
}))
vi.mock("@/lib/prisma", () => ({ prisma: { $connect: h.connect, produto: { findMany: h.findMany } } }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "synthetic-operator" } }) }))
vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: async () => null }))
vi.mock("@/lib/auth/enterprise-permissions", () => ({ canAccessStore: () => h.allowed }))
vi.mock("@/lib/api-auth", () => ({ getVerifiedSubscriptionFromCookies: async () => ({ ok: true, status: "ativa" }) }))
vi.mock("@/lib/subscription-seal", () => ({ isVencimentoExpired: () => false }))
vi.mock("@/lib/trusted-time", () => ({ getTrustedTimeMs: async () => 0 }))

import { GET } from "@/app/api/ops/inventory/route"

function row(unit: "UN" | "KG" | "G", stock = 0, storeId = "synthetic-store-a") {
  return {
    id: "synthetic-db-id", storeId, name: "PAO SINTETICO", sku: "PAD-TEST-001",
    barcode: "7890000000001", stock, price: 20, precoCusto: 5, category: "Padaria",
    metadata: { comercial: { version: 1, modoVenda: unit === "UN" ? "unidade" : "peso", unidade: unit, basePreco: unit } },
  }
}
function request(store = "synthetic-store-a") {
  return new Request(`http://localhost/api/ops/inventory?lojaId=${store}`, { headers: { "x-assistec-loja-id": store } })
}
beforeEach(() => { vi.clearAllMocks(); h.allowed = true })

describe("Inventário → catálogo → busca: classificação comercial canônica", () => {
  it.each(["UN", "KG", "G"] as const)("preserva %s por nome, SKU e EAN sem alterar saldo ou preço", async (unit) => {
    h.findMany.mockResolvedValue([row(unit, 8)])
    const response = await GET(request())
    expect(response.status).toBe(200)
    const data = await response.json() as { items: InventoryItem[] }
    expect(data.items[0]).toMatchObject({ vendaPorPeso: unit !== "UN", stock: 8, price: 20, dbId: "synthetic-db-id" })
    if (unit === "KG") expect(data.items[0].precoPorKg).toBe(20)
    else expect(data.items[0].precoPorKg).toBeUndefined()
    expect(data.items[0]).not.toHaveProperty("metadata")
    const catalog = mergePdvCatalogWithInventory([], data.items)
    for (const code of ["PAD-TEST-001", "7890000000001", "synthetic-db-id"]) {
      expect(findPdvProductByScan(code, catalog)?.vendaPorPeso).toBe(unit !== "UN")
    }
    expect(filterPdvCatalogBySearch(catalog, "pao sintetico")[0]?.vendaPorPeso).toBe(unit !== "UN")
  })

  it.each([{ vendaPorPeso: true }, { atributos: { vendaPorPeso: true } }, { comercial: { modoVenda: "peso" } }])(
    "preserva o bloqueio de declarações legadas: %j", async (metadata) => {
      h.findMany.mockResolvedValue([{ ...row("UN"), metadata }])
      const data = await (await GET(request())).json()
      expect(data.items[0].vendaPorPeso).toBe(true)
    },
  )

  it("consulta apenas a loja solicitada e não reaproveita classificação de outra loja", async () => {
    const rows = [row("KG"), row("UN", 2, "synthetic-store-b")]
    h.findMany.mockImplementation(async ({ where }: { where: { storeId: string } }) => rows.filter((item) => item.storeId === where.storeId))
    const a = await (await GET(request())).json()
    const b = await (await GET(request("synthetic-store-b"))).json()
    expect(a.items[0].vendaPorPeso).toBe(true)
    expect(b.items[0].vendaPorPeso).toBe(false)
    expect(h.findMany.mock.calls.map(([query]) => query.where.storeId)).toEqual(["synthetic-store-a", "synthetic-store-b"])
  })

  it("recusa loja sem permissão antes de consultar produtos", async () => {
    h.allowed = false
    expect((await GET(request())).status).toBe(403)
    expect(h.findMany).not.toHaveBeenCalled()
    expect(h.connect).not.toHaveBeenCalled()
  })
})
