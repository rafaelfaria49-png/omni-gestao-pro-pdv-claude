import { beforeEach, describe, expect, it, vi } from "vitest"

const { authMock, cookiesMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  cookiesMock: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("next/headers", () => ({ cookies: cookiesMock }))

import { requireContadorScope } from "./scope"

describe("requireContadorScope", () => {
  beforeEach(() => {
    authMock.mockReset()
    cookiesMock.mockReset()
    cookiesMock.mockResolvedValue({ get: () => ({ value: "loja-ativa" }) })
  })

  it("o gate server-side produz scope nominal com usuario, loja e permissao Financeiro", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-7", role: "ADMIN", storeAccess: "all" },
      expires: "2999-01-01",
    })

    await expect(requireContadorScope()).resolves.toEqual({
      ok: true,
      storeId: "loja-ativa",
      userId: "user-7",
      permissaoFinanceiro: true,
    })
  })

  it("nao cria scope sem sessao autenticada", async () => {
    authMock.mockResolvedValue(null)
    await expect(requireContadorScope()).resolves.toEqual({ ok: false, motivo: "nao_autenticado" })
  })
})
