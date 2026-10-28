import { beforeEach, describe, expect, it, vi } from "vitest"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

// RELATORIOS-PRODUTOS-VENDIDOS-REAL-001 — autorização e escopo de loja.
// `requireModuleApi`/`canAccessStore` são REAIS; só `auth()` e o Prisma são mockados.

const LOJA_A = "loja-A"
const LOJA_B = "loja-B"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  groupBy: vi.fn(async (): Promise<unknown[]> => []),
  aggregate: vi.fn(async () => ({ _sum: { total: 0 }, _count: { id: 0 } })),
  vendaFindMany: vi.fn(async (): Promise<unknown[]> => []),
  devolucaoFindMany: vi.fn(async (): Promise<unknown[]> => []),
  categoriaFindMany: vi.fn(async (): Promise<unknown[]> => []),
  produtoFindMany: vi.fn(async (): Promise<unknown[]> => []),
  produtoFindFirst: vi.fn(async (): Promise<unknown> => null),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    itemVenda: { groupBy: h.groupBy },
    venda: { aggregate: h.aggregate, findMany: h.vendaFindMany },
    devolucaoVenda: { findMany: h.devolucaoFindMany },
    categoriaProduto: { findMany: h.categoriaFindMany },
    produto: { findMany: h.produtoFindMany, findFirst: h.produtoFindFirst },
    adminUser: { findUnique: vi.fn() },
  },
  prismaEnsureConnected: vi.fn(async () => undefined),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))

import { GET } from "./route"
import { GET as GET_VARIANTES } from "./variantes/route"

const PERIODO = "from=2026-10-01T03:00:00.000Z&to=2026-10-31T02:59:59.999Z"

function sessao(stores: string[], modules: string[] = ["reports", "sales"]) {
  return {
    user: {
      id: "u1",
      role: "vendedor",
      allowedStoreIds: stores,
      storeModules: Object.fromEntries(stores.map((s) => [s, modules])),
    },
  }
}
function req(store: string, query = PERIODO, path = "/api/vendas/produtos-vendidos") {
  return new Request(`http://local${path}?${query}`, { headers: { [ASSISTEC_LOJA_HEADER]: store } })
}

const nenhumaConsulta = () => {
  expect(h.groupBy).not.toHaveBeenCalled()
  expect(h.aggregate).not.toHaveBeenCalled()
  expect(h.vendaFindMany).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  h.auth.mockResolvedValue(null)
})

describe("GET /api/vendas/produtos-vendidos — acesso", () => {
  it("sem sessão → 401 sem consultar o banco", async () => {
    expect((await GET(req(LOJA_A))).status).toBe(401)
    nenhumaConsulta()
  })

  it("loja de outro cliente → 403", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A]))
    expect((await GET(req(LOJA_B))).status).toBe(403)
    nenhumaConsulta()
  })

  it("sem módulo de relatórios → 403", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A], ["sales"]))
    expect((await GET(req(LOJA_A))).status).toBe(403)
    nenhumaConsulta()
  })

  it("sem módulo de vendas → 403", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A], ["reports"]))
    expect((await GET(req(LOJA_A))).status).toBe(403)
    nenhumaConsulta()
  })

  it("período ausente ou inválido → 400", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A]))
    expect((await GET(req(LOJA_A, ""))).status).toBe(400)
    expect((await GET(req(LOJA_A, "from=2026-10-31T00:00:00Z&to=2026-10-01T00:00:00Z"))).status).toBe(400)
    nenhumaConsulta()
  })

  it("autorizado → 200, no-store e TODA consulta escopada pela loja da sessão", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A, LOJA_B]))
    const res = await GET(req(LOJA_A))
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toContain("no-store")
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, produtos: [], totalProdutos: 0 })

    const wheres = [
      ...h.groupBy.mock.calls.map((c) => (c as unknown as [{ where: { venda: { storeId: string } } }])[0].where.venda),
      ...h.aggregate.mock.calls.map((c) => (c as unknown as [{ where: { storeId: string } }])[0].where),
      ...h.devolucaoFindMany.mock.calls.map((c) => (c as unknown as [{ where: { storeId: string } }])[0].where),
      ...h.categoriaFindMany.mock.calls.map((c) => (c as unknown as [{ where: { storeId: string } }])[0].where),
    ]
    expect(wheres.length).toBeGreaterThanOrEqual(5)
    for (const w of wheres) expect(w.storeId).toBe(LOJA_A)
    // Canceladas fora do bruto.
    const g = (h.groupBy.mock.calls[0] as unknown as [{ where: { venda: { status: unknown } } }])[0]
    expect(g.where.venda.status).toEqual({ not: "cancelada" })
  })

  it("falha do banco → 503 sem vazar detalhe fora de dev", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A]))
    h.groupBy.mockRejectedValueOnce(new Error("conexão caiu: senha=xyz"))
    const res = await GET(req(LOJA_A))
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toContain("senha")
  })
})

describe("GET /api/vendas/produtos-vendidos/variantes — acesso", () => {
  const path = "/api/vendas/produtos-vendidos/variantes"

  it("loja de outro cliente → 403", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A]))
    expect((await GET_VARIANTES(req(LOJA_B, `produtoId=p1&${PERIODO}`, path))).status).toBe(403)
    expect(h.produtoFindFirst).not.toHaveBeenCalled()
  })

  it("produto de outra loja → 404 (busca sempre com storeId)", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A]))
    const res = await GET_VARIANTES(req(LOJA_A, `produtoId=p-da-loja-b&${PERIODO}`, path))
    expect(res.status).toBe(404)
    expect(h.produtoFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p-da-loja-b", storeId: LOJA_A } }))
    expect(h.vendaFindMany).not.toHaveBeenCalled()
  })

  it("produto da loja → 200 com consulta de vendas escopada e sem canceladas", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A]))
    h.produtoFindFirst.mockResolvedValueOnce({ id: "p1", sku: "SKU1", barcode: null })
    h.produtoFindMany.mockResolvedValueOnce([{ id: "p1", name: "P1", sku: "SKU1", barcode: null, category: null, brand: null, active: true }])
    const res = await GET_VARIANTES(req(LOJA_A, `produtoId=p1&${PERIODO}`, path))
    expect(res.status).toBe(200)
    const where = (h.vendaFindMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where
    expect(where).toMatchObject({ storeId: LOJA_A, status: { not: "cancelada" }, itens: { some: { inventoryId: { in: ["p1", "SKU1"] } } } })
  })

  it("barcode igual ao SKU de OUTRO produto não entra nas variantes deste (ranking atribui ao outro)", async () => {
    h.auth.mockResolvedValue(sessao([LOJA_A]))
    h.produtoFindFirst.mockResolvedValueOnce({ id: "y", sku: null, barcode: "COD1" })
    h.produtoFindMany.mockResolvedValueOnce([
      { id: "y", name: "Y", sku: null, barcode: "COD1", category: null, brand: null, active: true },
      { id: "x", name: "X", sku: "COD1", barcode: null, category: null, brand: null, active: true },
    ])
    await GET_VARIANTES(req(LOJA_A, `produtoId=y&${PERIODO}`, path))
    const where = (h.vendaFindMany.mock.calls[0] as unknown as [{ where: { itens: unknown } }])[0].where
    expect(where.itens).toEqual({ some: { inventoryId: { in: ["y"] } } })
  })
})
