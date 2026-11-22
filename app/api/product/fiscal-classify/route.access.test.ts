import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  findUnique: vi.fn(async (): Promise<unknown> => null),
  classify: vi.fn(async () => ({ ncm: "1234" })),
  suggest: vi.fn(async () => ({ ncm: "1234" })),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: { adminUser: { findUnique: h.findUnique } },
}))
vi.mock("@/lib/product-ncm-fiscal-ai", () => ({
  classifyProductFiscal: h.classify,
  suggestNcmFromProductName: h.suggest,
}))

import { POST as classify } from "./route"
import { POST as suggest } from "../ncm-suggest/route"

function sessionAtiva(role: string) {
  const s = {
    user: {
      id: "user-1",
      email: "u@x.com",
      name: "U",
      role,
      storeAccess: "restricted",
      allowedStoreIds: ["loja-a"],
      // Módulos liberados por loja (contrato desde 52c01c3).
      storeModules: Object.fromEntries(["loja-a"].map((sid) => [sid, ["ai", "catalog"]])),
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
  h.auth.mockResolvedValue(s)
  h.findUnique.mockResolvedValue({ active: true, planName: "PRATA", role })
}

function post(path: string, body: Record<string, unknown>) {
  return new Request(`https://app.local${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  h.auth.mockReset()
  h.findUnique.mockReset()
  h.classify.mockClear()
  h.suggest.mockClear()
  h.auth.mockResolvedValue(null)
  h.findUnique.mockResolvedValue(null)
})

describe("POST /api/product/fiscal-classify", () => {
  it("anônimo → 401 e não chama o provider", async () => {
    const res = await classify(post("/api/product/fiscal-classify", { nome: "Cabo", categoria: "peca" }))
    expect(res.status).toBe(401)
    expect(h.classify).not.toHaveBeenCalled()
  })

  it("CAIXA → 403", async () => {
    sessionAtiva("CAIXA")
    const res = await classify(post("/api/product/fiscal-classify", { nome: "Cabo", categoria: "peca" }))
    expect(res.status).toBe(403)
    expect(h.classify).not.toHaveBeenCalled()
  })

  // Desde 52c01c3 a rota exige requireModuleApi(req, "ai"): módulo ai liberado E papel com
  // workspace.iaMestre. VENDEDOR não tem IA (mesmo contrato reconhecido na #308 para produto-ia).
  it("VENDEDOR com módulo ai liberado → 403 (papel sem IA) e não chama o provider", async () => {
    sessionAtiva("VENDEDOR")
    const res = await classify(post("/api/product/fiscal-classify", { nome: "Cabo", categoria: "peca" }))
    expect(res.status).toBe(403)
    expect(h.classify).not.toHaveBeenCalled()
  })

  it("ADMIN da loja com módulo ai → chama classificador", async () => {
    sessionAtiva("ADMIN")
    const res = await classify(post("/api/product/fiscal-classify", { nome: "Cabo", categoria: "peca" }))
    expect(res.status).toBe(200)
    expect(h.classify).toHaveBeenCalled()
  })
})

describe("POST /api/product/ncm-suggest", () => {
  it("anônimo → 401", async () => {
    const res = await suggest(post("/api/product/ncm-suggest", { nome: "Cabo" }))
    expect(res.status).toBe(401)
    expect(h.suggest).not.toHaveBeenCalled()
  })
})
