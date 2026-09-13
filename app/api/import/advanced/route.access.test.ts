/**
 * CAD-R2-004B — POST /api/import/advanced com o gate REAL (002/003).
 * Não exercita parser/persistência: o gate corre antes do FormData.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { NextRequest } from "next/server"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  findUnique: vi.fn(async (): Promise<unknown> => null),
  persistirImportacao: vi.fn(async () => {
    throw new Error("persistirImportacao não deve ser chamado neste teste")
  }),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: h.findUnique },
    logsAuditoria: { create: vi.fn() },
  },
}))
vi.mock("@/lib/importador-avancado/persistidor", () => ({
  persistirImportacao: h.persistirImportacao,
  planejarProdutosDoLote: vi.fn(),
}))

import { POST } from "./route"

function makeSession(opts: {
  role?: string
  storeAccess?: "all" | "restricted"
  allowedStoreIds?: string[]
  id?: string
}): Session {
  return {
    user: {
      id: opts.id ?? "user-1",
      email: "u@x.com",
      name: "U",
      role: opts.role ?? "VENDEDOR",
      storeAccess: opts.storeAccess ?? "restricted",
      allowedStoreIds: opts.allowedStoreIds ?? ["loja-a"],
      lojaId: "loja-a",
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

function sessionAtiva(opts?: Parameters<typeof makeSession>[0]) {
  const s = makeSession(opts ?? {})
  h.auth.mockResolvedValue(s)
  h.findUnique.mockResolvedValue({ active: true, planName: "PRATA", role: s.user.role })
}

function req(storeId?: string) {
  const headers = new Headers()
  if (storeId) headers.set(ASSISTEC_LOJA_HEADER, storeId)
  return new NextRequest("https://app.local/api/import/advanced", {
    method: "POST",
    headers,
  })
}

beforeEach(() => {
  h.auth.mockReset()
  h.findUnique.mockReset()
  h.persistirImportacao.mockClear()
  h.auth.mockResolvedValue(null)
  h.findUnique.mockResolvedValue(null)
})

describe("POST /api/import/advanced — ownership", () => {
  it("sem sessão → 401 e não persiste", async () => {
    const res = await POST(req("loja-a"))
    expect(res.status).toBe(401)
    expect(h.persistirImportacao).not.toHaveBeenCalled()
  })

  it("user.id vazio → 401", async () => {
    sessionAtiva({ id: "" })
    const res = await POST(req("loja-a"))
    expect(res.status).toBe(401)
    expect(h.persistirImportacao).not.toHaveBeenCalled()
  })

  it("VENDEDOR loja-A + store B → 403", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await POST(req("loja-b"))
    expect(res.status).toBe(403)
    expect(h.persistirImportacao).not.toHaveBeenCalled()
  })

  it("CAIXA própria loja → 403", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await POST(req("loja-a"))
    expect(res.status).toBe(403)
  })

  it("autorizado sem arquivo → 400 (passou o gate, não persistiu)", async () => {
    sessionAtiva({ role: "ADMIN", storeAccess: "all" })
    const res = await POST(req("loja-z"))
    expect(res.status).toBe(400)
    expect(h.persistirImportacao).not.toHaveBeenCalled()
  })
})
