import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * CENÁRIOS I/J do GOAL LOCALHOST-DEV-AUTH-BYPASS-002 (seção 11):
 * o resolver do bypass NUNCA cria usuário — só usa o admin local existente.
 */

const findUniqueMock = vi.fn()
const findManyMock = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: {
      findUnique: (args: unknown) => findUniqueMock(args),
      create: vi.fn(),
    },
    adminUserStore: {
      findMany: (args: unknown) => findManyMock(args),
    },
  },
}))

import { resolveLocalDevBypassUser } from "./local-dev-auth"

beforeEach(() => {
  findUniqueMock.mockReset()
  findManyMock.mockReset()
})

describe("resolveLocalDevBypassUser", () => {
  it("CENÁRIO I: admin local existente (SUPER_ADMIN) → payload de sessão com storeAccess 'all'", async () => {
    findUniqueMock.mockResolvedValue({
      id: "admin-local-1",
      email: "admin@rafacell.com.br",
      name: "Admin Local",
      role: "SUPER_ADMIN",
      lojaId: "loja-1",
      active: true,
    })

    const user = await resolveLocalDevBypassUser()

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { email: "admin@rafacell.com.br" },
    })
    expect(user).toEqual({
      id: "admin-local-1",
      email: "admin@rafacell.com.br",
      name: "Admin Local",
      role: "SUPER_ADMIN",
      lojaId: "loja-1",
      storeAccess: "all",
      allowedStoreIds: undefined,
    })
  })

  it("CENÁRIO J: usuário local ausente → null (erro honesto), NUNCA auto-cria", async () => {
    findUniqueMock.mockResolvedValue(null)

    const user = await resolveLocalDevBypassUser()

    expect(user).toBeNull()
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it("CENÁRIO J2: usuário local inativo → null", async () => {
    findUniqueMock.mockResolvedValue({
      id: "admin-local-1",
      email: "admin@rafacell.com.br",
      name: "Admin Local",
      role: "SUPER_ADMIN",
      lojaId: "loja-1",
      active: false,
    })

    expect(await resolveLocalDevBypassUser()).toBeNull()
  })
})
