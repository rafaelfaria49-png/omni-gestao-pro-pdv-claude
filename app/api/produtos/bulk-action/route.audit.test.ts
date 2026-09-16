import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  produtoFindMany: vi.fn(async () => [] as Array<{ id: string; name: string }>),
  produtoUpdateMany: vi.fn(async () => ({ count: 1 })),
  logsCreate: vi.fn(async (_args: { data: { userLabel: string; metadata: string } }) => ({
    id: "log-1",
  })),
  updateProductTx: vi.fn(async () => ({ ok: true, id: "p1", operacao: "update" })),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/cadastros/cadastros-audit-principal", () => ({
  cadastrosAuditPrincipalFromSession: vi.fn((session: unknown) => {
    const user = (session as { user?: { id?: string; email?: string; name?: string; role?: string } })?.user
    if (!user?.id) return null
    return { userId: user.id, email: user.email, role: user.role, displayLabel: user.name || user.email || user.id }
  }),
  cadastrosAuditLogFields: vi.fn((principal: { displayLabel?: string; userId?: string } | null, opts?: { operatorNote?: string | null }) => ({
    userLabel: principal?.displayLabel ?? "",
    actorMeta: {
      actor: principal ? { userId: principal.userId as string } : null,
      ...(opts?.operatorNote ? { operatorNote: opts.operatorNote } : {}),
    },
  })),
}))
vi.mock("@/lib/cadastros/product-write-service", () => ({
  PRODUCT_WRITE_AUDIT_SOURCE: "product-write-service",
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  updateProductTx: (...args: unknown[]) => (h.updateProductTx as (...a: unknown[]) => unknown)(...args),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    produto: {
      findMany: h.produtoFindMany,
      updateMany: h.produtoUpdateMany,
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    ordemServicoItem: { findMany: vi.fn(async () => []) },
    itemVenda: { findMany: vi.fn(async () => []) },
    marketplaceListing: { findMany: vi.fn(async () => []) },
    marketplaceProductLink: { findMany: vi.fn(async () => []) },
    $transaction: async (fn: (tx: {
      produto: { updateMany: typeof h.produtoUpdateMany; deleteMany: ReturnType<typeof vi.fn> }
      logsAuditoria: { create: typeof h.logsCreate }
    }) => Promise<unknown>) =>
      fn({
        produto: {
          updateMany: h.produtoUpdateMany,
          deleteMany: vi.fn(async () => ({ count: 0 })),
        },
        logsAuditoria: { create: h.logsCreate },
      }),
  },
}))

import { POST } from "./route"

function adminSession(): Session {
  return {
    user: {
      id: "admin-1",
      email: "admin@loja.com",
      name: "Admin Sessão",
      role: "ADMIN",
      storeAccess: "all",
      lojaId: null,
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

function req(body: Record<string, unknown>) {
  const headers = new Headers({ "Content-Type": "application/json" })
  headers.set(ASSISTEC_LOJA_HEADER, "loja-a")
  return new Request("https://app.local/api/produtos/bulk-action", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  h.auth.mockReset()
  h.produtoFindMany.mockReset()
  h.produtoUpdateMany.mockReset()
  h.logsCreate.mockReset()
  h.updateProductTx.mockReset()
  h.auth.mockResolvedValue(adminSession())
  h.produtoFindMany.mockResolvedValue([{ id: "p1", name: "Cabo" }])
  h.produtoUpdateMany.mockResolvedValue({ count: 1 })
  h.updateProductTx.mockResolvedValue({ ok: true, id: "p1", operacao: "update" })
})

describe("POST /api/produtos/bulk-action — ator oficial", () => {
  it("ignora body.userLabel e não cai em Operador", async () => {
    const res = await POST(req({ ids: ["p1"], action: "inactivate", userLabel: "Rafael" }))
    expect(res.status).toBe(200)
    expect(h.updateProductTx).toHaveBeenCalled()
    expect(h.logsCreate).toHaveBeenCalled()
    const row = h.logsCreate.mock.calls.at(0)?.[0].data
    expect(row).toBeDefined()
    expect(row?.userLabel).toBe("Admin Sessão")
    expect(row?.userLabel).not.toBe("Rafael")
    expect(row?.userLabel).not.toBe("Operador")
    const meta = JSON.parse(row?.metadata ?? "{}") as {
      entidade: string
      ids: string[]
      actor: { userId: string }
      operatorNote?: string
    }
    expect(meta.entidade).toBe("Produto")
    expect(meta.ids).toEqual(["p1"])
    expect(meta.actor.userId).toBe("admin-1")
    expect(meta.operatorNote).toBe("Rafael")
  })

  it("inactivate em lote usa boundary canônica (sem updateMany direto de cadastro)", async () => {
    await POST(req({ ids: ["p1"], action: "inactivate" }))
    expect(h.updateProductTx).toHaveBeenCalledTimes(1)
    const [, , , input] = h.updateProductTx.mock.calls[0] as unknown as [unknown, unknown, unknown, { active: boolean }]
    expect(input).toMatchObject({ active: false })
    expect(h.produtoUpdateMany).not.toHaveBeenCalled()
  })
})
