import { beforeEach, describe, expect, it, vi } from "vitest"

const { authMock, cookiesMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  cookiesMock: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("next/headers", () => ({ cookies: cookiesMock }))

import { requireContadorScope } from "./scope"
import { storeSession } from "@/test/fixtures/store-session"

describe("requireContadorScope", () => {
  beforeEach(() => {
    authMock.mockReset()
    cookiesMock.mockReset()
    cookiesMock.mockResolvedValue({ get: () => ({ value: "loja-ativa" }) })
  })

  it("o gate server-side produz scope nominal com usuario, loja e permissao Contador", async () => {
    authMock.mockResolvedValue(storeSession({ id: "user-7", stores: ["loja-ativa"], modules: ["accountant"] }))

    await expect(requireContadorScope()).resolves.toEqual({
      ok: true,
      storeId: "loja-ativa",
      userId: "user-7",
      permissaoContador: true,
    })
  })

  it("loja ativa fora da membership não produz scope (sem_acesso_loja)", async () => {
    authMock.mockResolvedValue(storeSession({ id: "user-7", stores: ["outra-loja"], modules: ["accountant"] }))
    await expect(requireContadorScope()).resolves.toEqual({ ok: false, motivo: "sem_acesso_loja" })
  })

  it("nao cria scope sem sessao autenticada", async () => {
    authMock.mockResolvedValue(null)
    await expect(requireContadorScope()).resolves.toEqual({ ok: false, motivo: "nao_autenticado" })
  })
})
