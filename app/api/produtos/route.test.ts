import { describe, it, expect, beforeEach, vi } from "vitest"

// ============================================================================
// CAD-R2-007 — POST /api/produtos delega ao ProductWriteService.
// ----------------------------------------------------------------------------
// A rota é adapter HTTP fino: gate + compat (name/stock/price) + response
// shape. Duplicate/metadata/fiscal/ledger pertencem ao service — a rota não
// faz findFirst pre-check, P2002 próprio, merge próprio nem Prisma direto.
// ============================================================================

const STORE = "loja-2"

const h = vi.hoisted(() => ({
  createProduct: vi.fn(async () => ({ ok: true, id: "prod-1", operacao: "create" })),
  findFirst: vi.fn(async () => null as unknown),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    produto: {
      findMany: vi.fn(async () => []),
      findFirst: (...args: unknown[]) => (h.findFirst as (...a: unknown[]) => unknown)(...args),
    },
  },
  prismaEnsureConnected: vi.fn(async () => undefined),
}))
vi.mock("@/lib/cadastros/hub-api-gate", () => ({
  requireCadastrosHubApi: vi.fn(async () => ({ ok: true as const, storeId: STORE })),
}))
vi.mock("@/lib/cadastros/cadastros-audit-principal", () => ({
  cadastrosAuditPrincipalFromSession: vi.fn(() => null),
  cadastrosAuditLogFields: vi.fn(() => ({ userLabel: "", actorMeta: { actor: null } })),
}))
vi.mock("@/lib/cadastros/product-write-service", () => ({
  PRODUCT_WRITE_AUDIT_SOURCE: "product-write-service",
  createProduct: (...args: unknown[]) => (h.createProduct as (...a: unknown[]) => unknown)(...args),
  updateProduct: vi.fn(),
  updateProductTx: vi.fn(),
}))

import { POST } from "./route"

function postReq(body: Record<string, unknown>) {
  return new Request("http://local/api/produtos", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-assistec-loja-id": STORE },
    body: JSON.stringify(body),
  })
}

type PostJson = {
  ok?: boolean
  type?: string
  field?: string
  message?: string
  error?: string
  produto?: { id?: string; name?: string; sku?: string | null; barcode?: string | null; stock?: number | null }
}

const PRODUTO_ROW = {
  id: "prod-1",
  name: "Cabo USB-C",
  stock: 10,
  price: 25,
  precoCusto: 0,
  sku: "CAB-001",
  barcode: null,
  category: null,
  brand: "",
  supplierName: "",
  warrantyDays: 0,
  active: true,
  status: "Ativo",
  metadata: null,
  storeId: STORE,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

beforeEach(() => {
  h.createProduct.mockReset()
  h.findFirst.mockReset()
  h.createProduct.mockResolvedValue({ ok: true, id: "prod-1", operacao: "create" })
  h.findFirst.mockResolvedValue(PRODUTO_ROW)
})

describe("POST /api/produtos — boundary canônico (CAD-R2-007)", () => {
  it("cadastra produto novo via createProduct com 201 {ok, produto}", async () => {
    const res = await POST(postReq({ name: "Cabo USB-C", stock: 10, price: 25, sku: "CAB-001" }))
    const json = (await res.json()) as PostJson
    expect(res.status).toBe(201)
    expect(json.ok).toBe(true)
    expect(json.produto?.name).toBe("Cabo USB-C")
    expect(h.createProduct).toHaveBeenCalledTimes(1)
    const [ctx] = h.createProduct.mock.calls[0] as unknown as [{ storeId: string }]
    expect(ctx.storeId).toBe(STORE)
  })

  it("mesmo barcode na loja → service DUPLICATE vira 409 DUPLICATE_PRODUCT", async () => {
    h.createProduct.mockResolvedValue({
      ok: false,
      code: "DUPLICATE",
      message: "Produto já cadastrado. Encontramos um item com este mesmo código de barras (EAN) nesta loja.",
      field: "barcode",
      produto: { id: "seed-1", name: "Fone Bluetooth", sku: null, barcode: "7891234567890", stock: 3 },
    } as never)
    const res = await POST(postReq({ name: "Fone BT novo", stock: 5, price: 80, barcode: "7891234567890" }))
    const json = (await res.json()) as PostJson
    expect(res.status).toBe(409)
    expect(json.type).toBe("DUPLICATE_PRODUCT")
    expect(json.field).toBe("barcode")
    expect(json.produto?.name).toBe("Fone Bluetooth")
  })

  it("mesmo SKU na loja → 409 DUPLICATE_PRODUCT (field sku)", async () => {
    h.createProduct.mockResolvedValue({
      ok: false,
      code: "DUPLICATE",
      message: "Produto já cadastrado.",
      field: "sku",
      produto: { id: "seed-2", name: "Carregador Turbo", sku: "CARR-99", barcode: null, stock: 7 },
    } as never)
    const res = await POST(postReq({ name: "Carregador outro", stock: 1, price: 50, codigo: "CARR-99" }))
    const json = (await res.json()) as PostJson
    expect(res.status).toBe(409)
    expect(json.type).toBe("DUPLICATE_PRODUCT")
    expect(json.field).toBe("sku")
  })

  it("POST sem name continua 400 (contrato preservado)", async () => {
    const res = await POST(postReq({ stock: 1, price: 10 }))
    expect(res.status).toBe(400)
    expect(h.createProduct).not.toHaveBeenCalled()
  })

  it("POST sem stock continua 400 (service default não relaxa)", async () => {
    const res = await POST(postReq({ name: "X", price: 10 }))
    expect(res.status).toBe(400)
    expect(h.createProduct).not.toHaveBeenCalled()
  })

  it("POST sem price continua 400", async () => {
    const res = await POST(postReq({ name: "X", stock: 1 }))
    expect(res.status).toBe(400)
    expect(h.createProduct).not.toHaveBeenCalled()
  })

  it("caller storeId vira autoridade (payload storeId ignorado)", async () => {
    await POST(postReq({ name: "Y", stock: 1, price: 5, storeId: "loja-invasora" }))
    const [ctx, input] = h.createProduct.mock.calls[0] as unknown as [{ storeId: string }, Record<string, unknown>]
    expect(ctx.storeId).toBe(STORE)
    expect((input as Record<string, unknown>).storeId ?? null).not.toBe(STORE)
  })
})
