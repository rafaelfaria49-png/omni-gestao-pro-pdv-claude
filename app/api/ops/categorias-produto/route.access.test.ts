import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  findUnique: vi.fn(async (): Promise<unknown> => null),
  withPrismaSafe: vi.fn(async (_fn: unknown, fallback: unknown) => fallback),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: { adminUser: { findUnique: h.findUnique } },
  withPrismaSafe: h.withPrismaSafe,
}))

import { GET } from "./route"

function sessionAtiva(role: string, stores: string[]) {
  const s = {
    user: {
      id: "user-1",
      email: "u@x.com",
      name: "U",
      role,
      storeAccess: "restricted",
      allowedStoreIds: stores,
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
  h.auth.mockResolvedValue(s)
  h.findUnique.mockResolvedValue({ active: true, planName: "PRATA", role })
}

beforeEach(() => {
  h.auth.mockReset()
  h.findUnique.mockReset()
  h.withPrismaSafe.mockClear()
  h.auth.mockResolvedValue(null)
  h.findUnique.mockResolvedValue(null)
})

describe("GET /api/ops/categorias-produto", () => {
  it("sem sessão → 401", async () => {
    const res = await GET(
      new Request("https://app.local/api/ops/categorias-produto", {
        headers: { [ASSISTEC_LOJA_HEADER]: "loja-a" },
      }),
    )
    expect(res.status).toBe(401)
  })

  it("cross-store → 403", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    const res = await GET(
      new Request("https://app.local/api/ops/categorias-produto", {
        headers: { [ASSISTEC_LOJA_HEADER]: "loja-b" },
      }),
    )
    expect(res.status).toBe(403)
  })

  it("própria loja → 200", async () => {
    sessionAtiva("VENDEDOR", ["loja-a"])
    const res = await GET(
      new Request("https://app.local/api/ops/categorias-produto", {
        headers: { [ASSISTEC_LOJA_HEADER]: "loja-a" },
      }),
    )
    expect(res.status).toBe(200)
  })
})
