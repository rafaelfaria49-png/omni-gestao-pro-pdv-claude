import { describe, it, expect, beforeEach, vi } from "vitest"

// ============================================================================
// CAD-R2-007 — PATCH /api/produtos/[id] via ProductWriteService + StockLedger.
// ----------------------------------------------------------------------------
// Cadastral → updateProduct/updateProductTx; stock → ajuste absoluto via
// ledger; mixed → UMA transaction. Rota sem Prisma Produto direto.
// ============================================================================

const STORE = "loja-2"

const h = vi.hoisted(() => ({
  updateProduct: vi.fn(async () => ({ ok: true, id: "seed-1", operacao: "update" })),
  updateProductTx: vi.fn(async () => ({ ok: true, id: "seed-1", operacao: "update" })),
  applyStockMutation: vi.fn(async () => ({ ok: true, movimentacaoId: "mov-1" })),
  applyStockMutationTx: vi.fn(async () => ({ ok: true, movimentacaoId: "mov-1" })),
  findFirst: vi.fn(async () => null as unknown),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    produto: {
      findFirst: (...args: unknown[]) => (h.findFirst as (...a: unknown[]) => unknown)(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      (h.transaction as (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>)(fn),
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
  createProduct: vi.fn(),
  updateProduct: (...args: unknown[]) => (h.updateProduct as (...a: unknown[]) => unknown)(...args),
  updateProductTx: (...args: unknown[]) => (h.updateProductTx as (...a: unknown[]) => unknown)(...args),
}))
vi.mock("@/lib/estoque/stock-ledger-service", () => ({
  applyStockMutation: (...args: unknown[]) =>
    (h.applyStockMutation as (...a: unknown[]) => unknown)(...args),
  applyStockMutationTx: (...args: unknown[]) =>
    (h.applyStockMutationTx as (...a: unknown[]) => unknown)(...args),
}))

import { PATCH } from "./route"

function patchReq(id: string, body: Record<string, unknown>, headers?: Record<string, string>) {
  return {
    req: new Request(`http://local/api/produtos/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-assistec-loja-id": STORE,
        ...(headers ?? {}),
      },
      body: JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ id }) },
  }
}

type PatchJson = {
  ok?: boolean
  type?: string
  field?: string
  message?: string
  error?: string
  produto?: { id?: string; name?: string; sku?: string | null; barcode?: string | null; stock?: number | null }
}

async function runPatch(id: string, body: Record<string, unknown>, headers?: Record<string, string>) {
  const { req, context } = patchReq(id, body, headers)
  const res = await PATCH(req, context)
  return { res, json: (await res.json()) as PatchJson }
}

const ROW = (over: Record<string, unknown> = {}) => ({
  id: "seed-1",
  name: "Alvo",
  stock: 2,
  price: 10,
  precoCusto: 0,
  sku: "CARR-10",
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
  ...over,
})

beforeEach(() => {
  h.updateProduct.mockReset()
  h.updateProductTx.mockReset()
  h.applyStockMutation.mockReset()
  h.applyStockMutationTx.mockReset()
  h.findFirst.mockReset()
  h.transaction.mockReset()
  h.updateProduct.mockResolvedValue({ ok: true, id: "seed-1", operacao: "update" })
  h.updateProductTx.mockResolvedValue({ ok: true, id: "seed-1", operacao: "update" })
  h.applyStockMutation.mockResolvedValue({ ok: true, movimentacaoId: "mov-1" })
  h.applyStockMutationTx.mockResolvedValue({ ok: true, movimentacaoId: "mov-1" })
  h.findFirst.mockResolvedValue(ROW())
  h.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}))
})

describe("PATCH /api/produtos/[id] — boundary canônico (CAD-R2-007)", () => {
  it("cadastral usa ProductWriteService (sem ledger)", async () => {
    const { res, json } = await runPatch("seed-1", { name: "Novo nome", price: 29.9 })
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(h.updateProduct).toHaveBeenCalledTimes(1)
    expect(h.applyStockMutation).not.toHaveBeenCalled()
    expect(h.applyStockMutationTx).not.toHaveBeenCalled()
  })

  it("duplicate no update vira 409 DUPLICATE_PRODUCT", async () => {
    h.updateProduct.mockResolvedValue({
      ok: false,
      code: "DUPLICATE",
      message: "Produto já cadastrado.",
      field: "sku",
      produto: { id: "other-1", name: "Carregador Turbo", sku: "CARR-99", barcode: null, stock: 7 },
    } as never)
    const { res, json } = await runPatch("seed-1", { codigo: "CARR-99" })
    expect(res.status).toBe(409)
    expect(json.type).toBe("DUPLICATE_PRODUCT")
    expect(json.field).toBe("sku")
  })

  it("stock-only usa StockLedger (sem updateProduct)", async () => {
    const { res, json } = await runPatch("seed-1", { stock: 8 })
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(h.applyStockMutation).toHaveBeenCalledTimes(1)
    expect(h.updateProduct).not.toHaveBeenCalled()
    const [, cmd] = h.applyStockMutation.mock.calls[0] as unknown as [unknown, { kind: string; novoSaldo: number }]
    expect(cmd.kind).toBe("ajuste")
    expect(cmd.novoSaldo).toBe(8)
  })

  it("stock nunca faz Produto.stock direto (ledger ajuste absoluto)", async () => {
    await runPatch("seed-1", { stock: 8 })
    const [, cmd] = h.applyStockMutation.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(cmd).toMatchObject({ kind: "ajuste", novoSaldo: 8 })
    expect(cmd).not.toHaveProperty("quantidade")
  })

  it("mixed é atômico: UMA transaction com updateTx + ledgerTx", async () => {
    const { res } = await runPatch("seed-1", { price: 100, stock: 8 })
    expect(res.status).toBe(200)
    expect(h.transaction).toHaveBeenCalledTimes(1)
    expect(h.updateProductTx).toHaveBeenCalledTimes(1)
    expect(h.applyStockMutationTx).toHaveBeenCalledTimes(1)
    expect(h.updateProduct).not.toHaveBeenCalled()
  })

  it("mixed rollback se stock falha (cadastro NÃO persiste)", async () => {
    h.applyStockMutationTx.mockResolvedValue({
      ok: false,
      code: "INSUFFICIENT_STOCK",
      message: "Estoque insuficiente no depósito.",
    } as never)
    const { res } = await runPatch("seed-1", { price: 100, stock: 50 })
    expect(res.status).toBe(409)
  })

  it("mixed rollback se cadastro falha (stock não executa)", async () => {
    h.updateProductTx.mockResolvedValue({
      ok: false,
      code: "DUPLICATE",
      message: "Produto já cadastrado.",
      field: "sku",
      produto: { id: "other-1", name: "X", sku: "S", barcode: null, stock: 1 },
    } as never)
    const { res, json } = await runPatch("seed-1", { price: 100, stock: 8 })
    expect(res.status).toBe(409)
    expect(json.type).toBe("DUPLICATE_PRODUCT")
    expect(h.applyStockMutationTx).not.toHaveBeenCalled()
  })

  it("Idempotency-Key gera chave namespaceda por produto", async () => {
    await runPatch("seed-1", { stock: 9 }, { "Idempotency-Key": "abc-123" })
    const [, cmd] = h.applyStockMutation.mock.calls[0] as unknown as [unknown, { idempotencyKey: string }]
    expect(cmd.idempotencyKey).toContain("seed-1")
    expect(cmd.idempotencyKey).toContain("abc-123")
  })

  it("metadata:null encaminha CLEAR explícito ao service", async () => {
    await runPatch("seed-1", { metadata: null })
    const [, , , opts] = h.updateProduct.mock.calls[0] as unknown as [unknown, unknown, unknown, { clearMetadata: boolean }]
    expect(opts.clearMetadata).toBe(true)
  })
})
