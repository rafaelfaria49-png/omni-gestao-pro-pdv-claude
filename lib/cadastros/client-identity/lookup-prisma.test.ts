/**
 * CAD-R2-018-A — adapter Prisma: scope autorizado, sem PII no WHERE do caller.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type ClienteLite = {
  id: string
  storeId: string
  document: string
  phone: string | null
  email: string | null
  name: string
}

type FindManyArg = { where: { storeId: string } }

const h = vi.hoisted(() => ({
  findMany: vi.fn(async (_args: FindManyArg): Promise<ClienteLite[]> => []),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cliente: { findMany: h.findMany },
  },
}))

import { createPrismaClientIdentitySource } from "./lookup-prisma"

describe("lookup Prisma store-scoped", () => {
  beforeEach(() => {
    h.findMany.mockReset()
    h.findMany.mockResolvedValue([])
  })

  it("22. WHERE usa somente o storeId autorizado", async () => {
    const source = createPrismaClientIdentitySource()
    await source.findByIdentityKeys("loja-a", {
      documentDigits: "52998224725",
      phoneDigits: "11988887777",
      email: "a@x.com",
    })
    expect(h.findMany).toHaveBeenCalledTimes(1)
    const arg = h.findMany.mock.calls[0]?.[0]
    expect(arg).toBeDefined()
    expect(arg?.where.storeId).toBe("loja-a")
    expect(JSON.stringify(arg?.where)).not.toContain("loja-b")
  })

  it("scope vazio não consulta o banco", async () => {
    const source = createPrismaClientIdentitySource()
    const rows = await source.findByIdentityKeys("  ", {
      documentDigits: "52998224725",
      phoneDigits: null,
      email: null,
    })
    expect(rows).toEqual([])
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("descarta linhas de outra store mesmo se o driver devolver", async () => {
    h.findMany.mockResolvedValue([
      { id: "a", storeId: "loja-a", document: "52998224725", phone: null, email: null, name: "A" },
      { id: "b", storeId: "loja-b", document: "52998224725", phone: null, email: null, name: "B" },
    ])
    const source = createPrismaClientIdentitySource()
    const rows = await source.findByIdentityKeys("loja-a", {
      documentDigits: "52998224725",
      phoneDigits: null,
      email: null,
    })
    expect(rows.map((r) => r.id)).toEqual(["a"])
    expect(rows.some((r) => r.storeId === "loja-b")).toBe(false)
  })

  it("sem chaves de identidade → zero query", async () => {
    const source = createPrismaClientIdentitySource()
    const rows = await source.findByIdentityKeys("loja-a", {
      documentDigits: null,
      phoneDigits: null,
      email: null,
    })
    expect(rows).toEqual([])
    expect(h.findMany).not.toHaveBeenCalled()
  })
})
