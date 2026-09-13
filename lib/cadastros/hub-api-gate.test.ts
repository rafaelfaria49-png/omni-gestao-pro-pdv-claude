/**
 * CAD-R2-002 — gate REST de Cadastros.
 * Mocka só identidade (auth + AdminUser). canAuthorizeCadastrosStore e a matriz de papéis são reais.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  findUnique: vi.fn(async (): Promise<unknown> => null),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: { adminUser: { findUnique: h.findUnique } },
}))

import {
  CADASTROS_ADMIN_FORBIDDEN_MESSAGE,
  CADASTROS_HUB_FORBIDDEN_MESSAGE,
  CADASTROS_STORE_FORBIDDEN_MESSAGE,
  requireCadastrosApi,
  requireCadastrosHubApi,
  requireCadastrosSession,
} from "@/lib/cadastros/hub-api-gate"

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
      role: opts.role ?? "ADMIN",
      storeAccess: opts.storeAccess ?? "all",
      allowedStoreIds: opts.allowedStoreIds,
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

function req(opts?: { headerStoreId?: string; query?: string; cookie?: string }) {
  const url = `https://app.local/api/cadastros${opts?.query ?? ""}`
  const headers = new Headers()
  if (opts?.headerStoreId !== undefined) headers.set(ASSISTEC_LOJA_HEADER, opts.headerStoreId)
  if (opts?.cookie) headers.set("cookie", opts.cookie)
  return new Request(url, { headers })
}

async function deny(result: Awaited<ReturnType<typeof requireCadastrosApi>>) {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error("expected deny")
  const body = (await result.response.json()) as { error?: string }
  return { status: result.response.status, error: body.error }
}

beforeEach(() => {
  h.auth.mockReset()
  h.findUnique.mockReset()
  h.auth.mockResolvedValue(null)
  h.findUnique.mockResolvedValue(null)
})

function sessionAtiva(session: Session, dbRole?: string) {
  h.auth.mockResolvedValue(session)
  h.findUnique.mockResolvedValue({
    active: true,
    planName: "PRATA",
    role: dbRole ?? session.user.role,
  })
}

describe("requireCadastrosApi — identidade", () => {
  it("sem sessão: 401", async () => {
    const r = await deny(await requireCadastrosApi(req({ headerStoreId: "loja-a" }), { mode: "read", profile: "shared" }))
    expect(r).toEqual({ status: 401, error: "Não autorizado" })
  })

  it("usuário inativo: 401", async () => {
    h.auth.mockResolvedValue(makeSession({ role: "ADMIN" }))
    h.findUnique.mockResolvedValue({ active: false, planName: "PRATA", role: "ADMIN" })
    const r = await deny(await requireCadastrosApi(req({ headerStoreId: "loja-a" }), { mode: "read", profile: "shared" }))
    expect(r).toEqual({ status: 401, error: "Não autorizado" })
  })

  it("write sem store explícito: 400 — cookie sozinho não basta", async () => {
    sessionAtiva(makeSession({ role: "ADMIN" }))
    const r = await deny(
      await requireCadastrosApi(req({ cookie: "assistec-active-store=loja-a" }), { mode: "write", profile: "hub" }),
    )
    expect(r.status).toBe(400)
    expect(r.error).toContain("x-assistec-loja-id")
  })

  it("read sem store: 400 storeId obrigatório", async () => {
    sessionAtiva(makeSession({ role: "ADMIN" }))
    const r = await deny(await requireCadastrosApi(req(), { mode: "read", profile: "shared" }))
    expect(r).toEqual({ status: 400, error: "storeId obrigatório" })
  })
})

describe("profile shared — PDV/OS", () => {
  it("restricted própria loja: ALLOW", async () => {
    sessionAtiva(
      makeSession({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )
    const r = await requireCadastrosApi(req({ headerStoreId: "loja-a" }), { mode: "read", profile: "shared" })
    expect(r).toEqual(expect.objectContaining({ ok: true, storeId: "loja-a" }))
  })

  it("restricted outra loja: 403", async () => {
    sessionAtiva(
      makeSession({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )
    const r = await deny(
      await requireCadastrosApi(req({ headerStoreId: "loja-b" }), { mode: "read", profile: "shared" }),
    )
    expect(r).toEqual({ status: 403, error: CADASTROS_STORE_FORBIDDEN_MESSAGE })
  })

  it("CAIXA pode write shared (quick-create) na própria loja", async () => {
    sessionAtiva(
      makeSession({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )
    const r = await requireCadastrosApi(req({ headerStoreId: "loja-a" }), { mode: "write", profile: "shared" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.storeId).toBe("loja-a")
  })

  it("não-admin storeAccess=all sem membership: 403", async () => {
    sessionAtiva(makeSession({ role: "VENDEDOR", storeAccess: "all" }))
    const r = await deny(
      await requireCadastrosApi(req({ headerStoreId: "loja-a" }), { mode: "read", profile: "shared" }),
    )
    expect(r).toEqual({ status: 403, error: CADASTROS_STORE_FORBIDDEN_MESSAGE })
  })
})

describe("profile hub — Cadastros HUB", () => {
  it("VENDEDOR restricted própria loja: ALLOW", async () => {
    sessionAtiva(
      makeSession({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )
    const r = await requireCadastrosHubApi(req({ headerStoreId: "loja-a" }), "read")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.storeId).toBe("loja-a")
  })

  it("CAIXA própria loja: 403 hubs.cadastros", async () => {
    sessionAtiva(
      makeSession({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )
    const r = await deny(await requireCadastrosHubApi(req({ headerStoreId: "loja-a" }), "write"))
    expect(r).toEqual({ status: 403, error: CADASTROS_HUB_FORBIDDEN_MESSAGE })
  })

  it("VENDEDOR outra loja: 403 unidade (antes do hub)", async () => {
    sessionAtiva(
      makeSession({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )
    const r = await deny(await requireCadastrosHubApi(req({ headerStoreId: "loja-b" }), "read"))
    expect(r).toEqual({ status: 403, error: CADASTROS_STORE_FORBIDDEN_MESSAGE })
  })
})

describe("profile admin — ADMIN global preservado", () => {
  it("ADMIN storeAccess=all + loja explícita: ALLOW", async () => {
    sessionAtiva(makeSession({ role: "ADMIN", storeAccess: "all" }))
    const r = await requireCadastrosApi(req({ headerStoreId: "loja-z" }), { mode: "write", profile: "admin" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.storeId).toBe("loja-z")
  })

  it("VENDEDOR não passa no perfil admin", async () => {
    sessionAtiva(
      makeSession({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }),
    )
    const r = await deny(
      await requireCadastrosApi(req({ headerStoreId: "loja-a" }), { mode: "write", profile: "admin" }),
    )
    expect(r).toEqual({ status: 403, error: CADASTROS_ADMIN_FORBIDDEN_MESSAGE })
  })
})

describe("requireCadastrosSession — sem inventar store", () => {
  it("sem sessão: 401", async () => {
    const r = await requireCadastrosSession({ hub: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(401)
  })

  it("CAIXA com hub: 403", async () => {
    sessionAtiva(makeSession({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }))
    const r = await requireCadastrosSession({ hub: true })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(403)
      const body = (await r.response.json()) as { error?: string }
      expect(body.error).toBe(CADASTROS_HUB_FORBIDDEN_MESSAGE)
    }
  })

  it("VENDEDOR com hub: ALLOW sem storeId", async () => {
    sessionAtiva(makeSession({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] }))
    const r = await requireCadastrosSession({ hub: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r).not.toHaveProperty("storeId")
  })
})

describe("rotas alteradas chamam o gate (source scan)", () => {
  const files: Array<[string, string]> = [
    ["app/api/clientes/route.ts", 'requireCadastrosHubApi(req, "read", "shared")'],
    ["app/api/clientes/route.ts", 'requireCadastrosHubApi(req, "write", "admin")'],
    ["app/api/clientes/[id]/route.ts", 'requireCadastrosHubApi(req, "read", "shared")'],
    ["app/api/clientes/match-by-phone/route.ts", 'requireCadastrosHubApi(req, "read", "shared")'],
    ["app/api/clientes/quick/route.ts", 'requireCadastrosHubApi(req, "write", "shared")'],
    ["app/api/produtos/route.ts", 'requireCadastrosHubApi(req, "read")'],
    ["app/api/produtos/route.ts", 'requireCadastrosHubApi(req, "write")'],
    ["app/api/produtos/[id]/route.ts", 'requireCadastrosHubApi(req, "write")'],
    ["app/api/catalogo/aparelhos/produto/[id]/route.ts", 'requireCadastrosHubApi(req, "read")'],
    ["app/api/product/fiscal-classify/route.ts", "requireCadastrosSession({ hub: true })"],
    ["app/api/product/ncm-suggest/route.ts", "requireCadastrosSession({ hub: true })"],
    ["app/api/clientes/importar/route.ts", 'requireCadastrosHubApi(request, "read", "shared")'],
    ["app/api/ops/import/clientes/route.ts", 'requireCadastrosHubApi(req, "read", "shared")'],
    ["app/api/ops/categorias-produto/route.ts", 'requireCadastrosHubApi(req, "read", "shared")'],
  ]
  it.each(files)("%s contém %s", (file, needle) => {
    const src = readFileSync(resolve(process.cwd(), file), "utf8")
    expect(src).toContain(needle)
  })
})
