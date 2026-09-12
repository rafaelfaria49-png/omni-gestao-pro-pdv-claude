import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  getSessionEntitlement: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: false })),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/auth/session-entitlement", () => ({ getSessionEntitlement: h.getSessionEntitlement }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    produto: { findFirst: vi.fn() },
    movimentacaoEstoque: { create: vi.fn(), findMany: vi.fn(async () => []) },
  },
}))

import { registrarAjusteEstoque, registrarEntradaEstoque } from "@/app/actions/estoque"

function sessionAtiva(role: string, stores: string[] | "all") {
  h.getSessionEntitlement.mockResolvedValue({ ok: true })
  h.auth.mockResolvedValue({
    user: {
      id: "user-1",
      email: "u@x.com",
      name: "U",
      role,
      storeAccess: stores === "all" ? "all" : "restricted",
      allowedStoreIds: stores === "all" ? undefined : stores,
    },
    expires: new Date().toISOString(),
  } as unknown as Session)
}

beforeEach(() => {
  h.auth.mockReset()
  h.getSessionEntitlement.mockReset()
  h.auth.mockResolvedValue(null)
  h.getSessionEntitlement.mockResolvedValue({ ok: false })
})

describe("estoque actions — só boundary", () => {
  it("entrada sem sessão → ok:false", async () => {
    const r = await registrarEntradaEstoque("loja-a", { produtoId: "p1", quantidade: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("Não autenticado")
  })

  it("ajuste outra loja → ok:false", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    const r = await registrarAjusteEstoque("loja-b", { produtoId: "p1", novoSaldo: 1, motivo: "contagem" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("Sem permissão para esta unidade")
  })
})
