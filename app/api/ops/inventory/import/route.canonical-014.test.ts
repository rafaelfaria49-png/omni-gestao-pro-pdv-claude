/**
 * CAD-R2-014 — PUT /api/ops/inventory/import via boundaries canônicos.
 *
 * - existente: updateProduct cadastral SEM estoque (saldo preservado)
 * - novo: createProduct com estoque inicial (ledger `cadastro` na mesma tx)
 * - cross-store / sem sessão: fail-closed
 * - race DUPLICATE no create: reconcilia como update (sem duplicar ledger)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  requireAdmin: vi.fn(async (): Promise<unknown> => ({ ok: false as const, res: new Response("x", { status: 401 }) })),
  findFirst: vi.fn(async (): Promise<unknown> => null),
  createProduct: vi.fn(async () => ({ ok: true, id: "novo-1", operacao: "create" })),
  updateProduct: vi.fn(async () => ({ ok: true, id: "exist-1", operacao: "update" })),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }))
vi.mock("@/lib/prisma", () => ({
  prisma: { produto: { findFirst: h.findFirst } },
}))
vi.mock("@/lib/cadastros/product-write-service", () => ({
  createProduct: h.createProduct,
  updateProduct: h.updateProduct,
}))

import { PUT } from "./route"

function adminSession(over: Record<string, unknown> = {}): Session {
  return {
    user: {
      id: "admin-1",
      email: "a@x.com",
      name: "Admin",
      role: "ADMIN",
      storeAccess: "all",
      allowedStoreIds: [],
      lojaId: "loja-a",
      ...over,
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

function req(storeId: string | null, items: unknown[]) {
  const headers = new Headers()
  if (storeId) headers.set(ASSISTEC_LOJA_HEADER, storeId)
  return new Request("https://app.local/api/ops/inventory/import", {
    method: "PUT",
    headers,
    body: JSON.stringify({ items }),
  })
}

function gateAdmin(session: Session) {
  h.auth.mockResolvedValue(session)
  h.requireAdmin.mockResolvedValue({ ok: true as const, admin: { id: "admin-1", name: "Admin", role: "ADMIN" }, session })
}

beforeEach(() => {
  h.auth.mockReset()
  h.requireAdmin.mockReset()
  h.findFirst.mockReset()
  h.createProduct.mockReset()
  h.updateProduct.mockReset()
  h.findFirst.mockResolvedValue(null)
  h.createProduct.mockResolvedValue({ ok: true, id: "novo-1", operacao: "create" } as never)
  h.updateProduct.mockResolvedValue({ ok: true, id: "exist-1", operacao: "update" } as never)
  gateAdmin(adminSession())
})

describe("PUT /api/ops/inventory/import — canonical", () => {
  it("existente: atualiza cadastral sem tocar no estoque", async () => {
    h.findFirst.mockResolvedValue({ id: "exist-1" })
    const res = await PUT(req("loja-a", [{ id: "SKU-1", name: "P1", stock: 99, cost: 5, price: 10, category: "Cat" }]))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { created: number; updated: number }
    expect(body.updated).toBe(1)
    expect(body.created).toBe(0)
    expect(h.updateProduct).toHaveBeenCalledTimes(1)
    expect(h.createProduct).not.toHaveBeenCalled()
    const [, , input] = h.updateProduct.mock.calls[0] as unknown as [unknown, string, Record<string, unknown>]
    expect("estoque" in input).toBe(false)
    expect("stock" in input).toBe(false)
    expect(input.nome).toBe("P1")
  })

  it("novo: cria com estoque inicial via service", async () => {
    h.findFirst.mockResolvedValue(null)
    const res = await PUT(req("loja-a", [{ id: "SKU-9", name: "Novo", stock: 7, cost: 3, price: 9, category: "" }]))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { created: number; updated: number }
    expect(body.created).toBe(1)
    expect(h.createProduct).toHaveBeenCalledTimes(1)
    const [ctx, input] = h.createProduct.mock.calls[0] as unknown as [
      { storeId: string },
      Record<string, unknown>,
    ]
    expect(ctx.storeId).toBe("loja-a")
    expect(input.sku).toBe("SKU-9")
    expect(input.estoque).toBe(7)
    expect("categoria" in input).toBe(false)
  })

  it("sem unidade → 400", async () => {
    const res = await PUT(req(null, [{ id: "SKU-1", name: "P1" }]))
    expect(res.status).toBe(400)
    expect(h.createProduct).not.toHaveBeenCalled()
    expect(h.updateProduct).not.toHaveBeenCalled()
  })

  it("restrito sem acesso à loja → 403 fail-closed", async () => {
    const session = adminSession({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    h.auth.mockResolvedValue(session)
    // requireAdmin bloqueia não-admin antes do store check
    h.requireAdmin.mockResolvedValue({ ok: false as const, res: new Response("x", { status: 403 }) })
    const res = await PUT(req("loja-b", [{ id: "SKU-1", name: "P1" }]))
    expect(res.status).toBe(403)
    expect(h.createProduct).not.toHaveBeenCalled()
    expect(h.updateProduct).not.toHaveBeenCalled()
  })

  it("race DUPLICATE no create reconcilia como update sem duplicar", async () => {
    h.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "exist-race" })
    h.createProduct.mockResolvedValue({
      ok: false,
      code: "DUPLICATE",
      message: "Produto já cadastrado nesta loja.",
    } as never)
    const res = await PUT(req("loja-a", [{ id: "SKU-1", name: "P1", stock: 4, cost: 1, price: 2, category: "" }]))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { created: number; updated: number }
    expect(body.updated).toBe(1)
    expect(h.updateProduct).toHaveBeenCalledTimes(1)
  })
})
