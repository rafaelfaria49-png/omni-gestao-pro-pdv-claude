import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  getSessionEntitlement: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: false })),
  findFirst: vi.fn(async (_args?: unknown): Promise<{ metadata: unknown } | null> => null),
  update: vi.fn(async (_args: { data: { metadata: Record<string, unknown> } }) => ({})),
}))

vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/auth/session-entitlement", () => ({ getSessionEntitlement: h.getSessionEntitlement }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    produto: { findFirst: h.findFirst, update: h.update },
  },
}))

import { salvarProdutoIAMetadata } from "@/app/actions/produto-ia"

function sessionAtiva(role: string, stores: string[]) {
  h.getSessionEntitlement.mockResolvedValue({ ok: true })
  h.auth.mockResolvedValue({
    user: {
      id: "user-1",
      email: "u@x.com",
      name: "U",
      role,
      storeAccess: "restricted",
      allowedStoreIds: stores,
    },
    expires: new Date().toISOString(),
  } as unknown as Session)
}

beforeEach(() => {
  h.auth.mockReset()
  h.getSessionEntitlement.mockReset()
  h.findFirst.mockReset()
  h.update.mockReset()
  h.auth.mockResolvedValue(null)
  h.getSessionEntitlement.mockResolvedValue({ ok: false })
  h.findFirst.mockResolvedValue(null)
})

describe("salvarProdutoIAMetadata", () => {
  it("sem sessão → rejeita", async () => {
    await expect(salvarProdutoIAMetadata("loja-a", "p1", { titulo: "x" } as never)).rejects.toThrow(
      "Não autenticado",
    )
  })

  it("IDOR: loja-A + produto da loja-B → não atualiza", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    h.findFirst.mockResolvedValue(null)
    await expect(salvarProdutoIAMetadata("loja-a", "p-b", { foo: 1 } as never)).rejects.toThrow(
      "Produto não encontrado nesta unidade.",
    )
    expect(h.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p-b", storeId: "loja-a" } }))
    expect(h.update).not.toHaveBeenCalled()
  })

  it("iaRevisadoPor vem da sessão, não do fallback estático operador", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    h.findFirst.mockResolvedValue({ metadata: {} })
    await salvarProdutoIAMetadata("loja-a", "p1", { titulo: "x" } as never)
    expect(h.update).toHaveBeenCalled()
    const data = h.update.mock.calls.at(0)?.[0].data
    expect(data?.metadata.iaRevisadoPor).toBe("U")
    expect(data?.metadata.iaRevisadoPor).not.toBe("operador")
    expect(data?.metadata.titulo).toBe("x")
  })
})
