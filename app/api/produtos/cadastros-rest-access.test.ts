/**
 * CAD-R2-002 — GET/POST /api/produtos com o gate REAL (não mockado).
 * CAD-R2-007 — POST/PATCH delegam ao boundary canônico (service mockado).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  findUnique: vi.fn(async (): Promise<unknown> => null),
  produtoFindMany: vi.fn(async () => []),
  produtoFindFirst: vi.fn(async () => null),
  produtoCreate: vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: "p-1",
    ...args.data,
  })),
  produtoUpdateMany: vi.fn(async () => ({ count: 1 })),
  produtoDeleteMany: vi.fn(async () => ({ count: 1 })),
  createProduct: vi.fn(async () => ({ ok: true, id: "p-1", operacao: "create" })),
  updateProduct: vi.fn(async () => ({ ok: true, id: "p-1", operacao: "update" })),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: h.findUnique },
    produto: {
      findMany: h.produtoFindMany,
      findFirst: h.produtoFindFirst,
      create: h.produtoCreate,
      updateMany: h.produtoUpdateMany,
      deleteMany: h.produtoDeleteMany,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
  prismaEnsureConnected: vi.fn(async () => undefined),
}))
vi.mock("@/lib/cadastros/cadastros-audit-principal", () => ({
  cadastrosAuditPrincipalFromSession: vi.fn(() => null),
  cadastrosAuditLogFields: vi.fn(() => ({ userLabel: "", actorMeta: { actor: null } })),
}))
vi.mock("@/lib/cadastros/product-write-service", () => ({
  PRODUCT_WRITE_AUDIT_SOURCE: "product-write-service",
  createProduct: (...args: unknown[]) => (h.createProduct as (...a: unknown[]) => unknown)(...args),
  updateProduct: (...args: unknown[]) => (h.updateProduct as (...a: unknown[]) => unknown)(...args),
  updateProductTx: vi.fn(async () => ({ ok: true, id: "p-1", operacao: "update" })),
}))
vi.mock("@/lib/estoque/stock-ledger-service", () => ({
  applyStockMutation: vi.fn(async () => ({ ok: true, movimentacaoId: "mov-1" })),
  applyStockMutationTx: vi.fn(async () => ({ ok: true, movimentacaoId: "mov-1" })),
}))

import { GET, POST } from "./route"
import { PATCH, DELETE } from "./[id]/route"

function makeSession(opts: {
  role?: string
  storeAccess?: "all" | "restricted"
  allowedStoreIds?: string[]
}): Session {
  return {
    user: {
      id: "user-1",
      email: "u@x.com",
      name: "U",
      role: opts.role ?? "VENDEDOR",
      storeAccess: opts.storeAccess ?? "restricted",
      allowedStoreIds: opts.allowedStoreIds ?? ["loja-a"],
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

function sessionAtiva(opts?: Parameters<typeof makeSession>[0]) {
  const s = makeSession(opts ?? {})
  h.auth.mockResolvedValue(s)
  h.findUnique.mockResolvedValue({ active: true, planName: "PRATA", role: s.user.role })
}

function req(method: string, storeId?: string, body?: Record<string, unknown>, path = "/api/produtos") {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (storeId) headers.set(ASSISTEC_LOJA_HEADER, storeId)
  return new Request(`https://app.local${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  h.auth.mockReset()
  h.findUnique.mockReset()
  h.produtoFindMany.mockClear()
  h.produtoCreate.mockClear()
  h.produtoUpdateMany.mockClear()
  h.produtoDeleteMany.mockClear()
  h.createProduct.mockClear()
  h.updateProduct.mockClear()
  h.createProduct.mockResolvedValue({ ok: true, id: "p-1", operacao: "create" })
  h.updateProduct.mockResolvedValue({ ok: true, id: "p-1", operacao: "update" })
  h.produtoFindFirst.mockResolvedValue({
    id: "p-1",
    name: "Cabo",
    stock: 1,
    price: 10,
    precoCusto: 0,
    sku: null,
    barcode: null,
    category: null,
    brand: "",
    supplierName: "",
    warrantyDays: 0,
    active: true,
    status: "Ativo",
    metadata: null,
    storeId: "loja-a",
  } as never)
  h.auth.mockResolvedValue(null)
  h.findUnique.mockResolvedValue(null)
})

describe("GET /api/produtos", () => {
  it("sem sessão → 401", async () => {
    const res = await GET(req("GET", "loja-a"))
    expect(res.status).toBe(401)
    expect(h.produtoFindMany).not.toHaveBeenCalled()
  })

  it("cross-store → 403", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await GET(req("GET", "loja-b"))
    expect(res.status).toBe(403)
  })

  it("VENDEDOR própria loja → 200", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await GET(req("GET", "loja-a"))
    expect(res.status).toBe(200)
  })

  it("CAIXA própria loja → 403 (hubs.cadastros=false)", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await GET(req("GET", "loja-a"))
    expect(res.status).toBe(403)
  })
})

describe("POST /api/produtos", () => {
  const body = { name: "Cabo", stock: 1, price: 10 }

  it("CAIXA não cria produto no HUB", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await POST(req("POST", "loja-a", body))
    expect(res.status).toBe(403)
    expect(h.createProduct).not.toHaveBeenCalled()
  })

  it("VENDEDOR outra loja → 403", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await POST(req("POST", "loja-b", body))
    expect(res.status).toBe(403)
  })

  it("VENDEDOR própria loja → 201", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await POST(req("POST", "loja-a", body))
    expect(res.status).toBe(201)
  })

  it("ADMIN global + loja explícita → 201", async () => {
    sessionAtiva({ role: "ADMIN", storeAccess: "all" })
    const res = await POST(req("POST", "loja-z", body))
    expect(res.status).toBe(201)
  })

  it("write sem store → 400", async () => {
    sessionAtiva({ role: "ADMIN", storeAccess: "all" })
    const res = await POST(req("POST", undefined, body))
    expect(res.status).toBe(400)
  })
})

describe("PATCH/DELETE /api/produtos/[id]", () => {
  it("CAIXA não PATCH", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await PATCH(req("PATCH", "loja-a", { name: "X" }, "/api/produtos/p-1"), {
      params: Promise.resolve({ id: "p-1" }),
    })
    expect(res.status).toBe(403)
  })

  it("CAIXA não DELETE", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await DELETE(req("DELETE", "loja-a", undefined, "/api/produtos/p-1"), {
      params: Promise.resolve({ id: "p-1" }),
    })
    expect(res.status).toBe(403)
    expect(h.produtoDeleteMany).not.toHaveBeenCalled()
  })
})
