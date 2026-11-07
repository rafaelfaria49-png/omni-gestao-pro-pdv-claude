/**
 * PDV-CADASTROS-SYNC-AUTOMATICO-001 — versão do catálogo por loja e rota `versionOnly`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { formatCatalogVersion, isCatalogVersion, readCatalogVersion } from "./catalog-version"

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  aggregate: vi.fn(),
  connect: vi.fn(),
  allowed: true,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { $connect: h.connect, produto: { findMany: h.findMany, aggregate: h.aggregate } },
}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "synthetic-operator" } }) }))
vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: async () => null }))
vi.mock("@/lib/auth/enterprise-permissions", () => ({ canAccessStore: () => h.allowed }))
vi.mock("@/lib/api-auth", () => ({ getVerifiedSubscriptionFromCookies: async () => ({ ok: true, status: "ativa" }) }))
vi.mock("@/lib/subscription-seal", () => ({ isVencimentoExpired: () => false }))
vi.mock("@/lib/trusted-time", () => ({ getTrustedTimeMs: async () => 0 }))

import { GET } from "@/app/api/ops/inventory/route"

const T0 = new Date("2026-11-01T14:37:35.970Z")

function aggregateOf(count: number, at: Date | null) {
  return { _count: { _all: count }, _max: { updatedAt: at } }
}

function request(store: string, versionOnly = false) {
  return new Request(`http://localhost/api/ops/inventory?lojaId=${store}${versionOnly ? "&versionOnly=1" : ""}`, {
    headers: { "x-assistec-loja-id": store },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.allowed = true
})

describe("formatCatalogVersion / readCatalogVersion", () => {
  it("muda com edição (updatedAt), criação e exclusão (count)", () => {
    const base = formatCatalogVersion(21, T0)
    expect(isCatalogVersion(base)).toBe(true)
    expect(formatCatalogVersion(21, new Date(T0.getTime() + 1))).not.toBe(base)
    expect(formatCatalogVersion(20, T0)).not.toBe(base)
    expect(formatCatalogVersion(22, T0)).not.toBe(base)
  })

  it("loja vazia tem versão estável e válida", () => {
    expect(formatCatalogVersion(0, null)).toBe("v1:0:0")
    expect(isCatalogVersion("v1:0:0")).toBe(true)
    expect(isCatalogVersion("v2:1:1")).toBe(false)
    expect(isCatalogVersion(null)).toBe(false)
  })

  it("agrega SÓ a loja pedida", async () => {
    h.aggregate.mockResolvedValue(aggregateOf(3, T0))
    const v = await readCatalogVersion({ produto: { aggregate: h.aggregate } }, "loja-a")
    expect(v).toBe(formatCatalogVersion(3, T0))
    expect(h.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "loja-a" } }))
  })
})

describe("GET /api/ops/inventory — versão do catálogo", () => {
  it("versionOnly=1 devolve só a versão da loja, sem baixar o catálogo", async () => {
    h.aggregate.mockResolvedValue(aggregateOf(21, T0))
    const res = await GET(request("loja-a", true))
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(await res.json()).toEqual({ storeId: "loja-a", version: formatCatalogVersion(21, T0) })
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("carga completa traz a versão lida ANTES do snapshot", async () => {
    const order: string[] = []
    h.aggregate.mockImplementation(async () => {
      order.push("version")
      return aggregateOf(1, T0)
    })
    h.findMany.mockImplementation(async () => {
      order.push("snapshot")
      return []
    })
    const res = await GET(request("loja-a"))
    const body = (await res.json()) as { version: string; items: unknown[]; _lojaIdRecebido: string }
    expect(body.version).toBe(formatCatalogVersion(1, T0))
    expect(body._lojaIdRecebido).toBe("loja-a")
    expect(order).toEqual(["version", "snapshot"])
  })

  it("falha da versão nunca impede a carga do estoque (versão nula)", async () => {
    h.aggregate.mockRejectedValue(new Error("aggregate indisponível"))
    h.findMany.mockResolvedValue([])
    const res = await GET(request("loja-a"))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { version: unknown }).version).toBeNull()
  })

  it("loja sem acesso não revela a versão", async () => {
    h.allowed = false
    const res = await GET(request("loja-b", true))
    expect(res.status).toBe(403)
    expect(h.aggregate).not.toHaveBeenCalled()
  })
})
