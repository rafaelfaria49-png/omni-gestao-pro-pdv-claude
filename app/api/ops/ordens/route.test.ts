import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"

// ============================================================================
// GOAL CONTADOR-HUB-P0-STORE-SCOPE-004 — ACL de loja em GET /api/ops/ordens.
// ----------------------------------------------------------------------------
// Fecha o caminho legado em que assinatura/cookie sozinhos autorizavam loja
// arbitrária: agora exige sessão NextAuth (401 sem sessão) e ACL da loja (403
// cross-store) ANTES do guard compartilhado. O guard `apiGuardOperacoesHubOrLegacy`
// segue garantindo a permissão de módulo (`hubs.operacoes`) para a sessão.
//
// `canAccessStore` e a resolução header/query/cookie são REAIS; só `auth()`, o
// guard e o Prisma são mockados.
// ============================================================================

const LOJA_A = "loja-A"
const LOJA_B = "loja-B"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  guard: vi.fn(async (): Promise<NextResponse | null> => null),
  findMany: vi.fn(async (): Promise<unknown[]> => []),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ordemServico: {
      findMany: h.findMany,
      count: vi.fn(async () => 0),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({
  apiGuardOperacoesHubOrLegacy: h.guard,
  apiGuardOperacoesEditEnterpriseOrLegacySubAdmin: vi.fn(async () => null),
}))
vi.mock("@/lib/operacoes/services/hydration-service", () => ({
  hydrateOSRows: (rows: unknown[]) => rows,
}))

import { GET } from "./route"

function sessionRestrictedTo(ids: string[]) {
  return { user: { id: "user-1", role: "tecnico", storeAccess: "restricted", allowedStoreIds: ids } }
}
function sessionFullAccess() {
  return { user: { id: "admin-1", role: "admin" } }
}
function reqQuery(store: string) {
  return new Request(`http://local/api/ops/ordens?storeId=${encodeURIComponent(store)}`)
}
function reqHeader(store: string) {
  return new Request("http://local/api/ops/ordens", { headers: { [ASSISTEC_LOJA_HEADER]: store } })
}
function reqCookie(store: string) {
  return new Request("http://local/api/ops/ordens", {
    headers: { cookie: `${ASSISTEC_ACTIVE_STORE_COOKIE}=${encodeURIComponent(store)}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.auth.mockResolvedValue(null)
  h.guard.mockResolvedValue(null)
  h.findMany.mockResolvedValue([])
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("GET /api/ops/ordens — ACL de loja (GOAL-004)", () => {
  it("sem sessão → 401; o guard legado (assinatura) nunca é alcançado", async () => {
    h.auth.mockResolvedValue(null)
    const res = await GET(reqQuery(LOJA_A))
    expect(res.status).toBe(401)
    // Prova que assinatura/cookie sozinhos não autorizam: o guard nem é chamado.
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("sessão A pedindo loja B por QUERY → 403 (antes do guard)", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const res = await GET(reqQuery(LOJA_B))
    expect(res.status).toBe(403)
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("sessão A pedindo loja B por HEADER → 403", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const res = await GET(reqHeader(LOJA_B))
    expect(res.status).toBe(403)
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("sessão A pedindo loja B por COOKIE → 403", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const res = await GET(reqCookie(LOJA_B))
    expect(res.status).toBe(403)
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("sessão A pedindo loja A → 200 { ordens: [] }, escopada em A", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const res = await GET(reqQuery(LOJA_A))
    const json = (await res.json()) as { ordens: unknown[] }
    expect(res.status).toBe(200)
    expect(json).toEqual({ ordens: [] })
    expect(h.guard).toHaveBeenCalledTimes(1)
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: LOJA_A } }))
  })

  it("consumidor interno autenticado (acesso pleno) na própria loja continua funcionando → 200", async () => {
    h.auth.mockResolvedValue(sessionFullAccess())
    const res = await GET(reqHeader(LOJA_A))
    expect(res.status).toBe(200)
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: LOJA_A } }))
  })

  it("permissão de módulo preservada: guard nega (ex.: papel sem operações) → 403 propagado, sem consulta", async () => {
    h.auth.mockResolvedValue(sessionFullAccess())
    h.guard.mockResolvedValue(
      NextResponse.json({ error: "Sem permissão para o módulo de operações." }, { status: 403 }),
    )
    const res = await GET(reqQuery(LOJA_A))
    expect(res.status).toBe(403)
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("precedência intacta: header (loja B, proibida) vence query (loja A) → 403 na loja resolvida", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const req = new Request(`http://local/api/ops/ordens?storeId=${LOJA_A}`, {
      headers: { [ASSISTEC_LOJA_HEADER]: LOJA_B },
    })
    const res = await GET(req)
    expect(res.status).toBe(403)
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.findMany).not.toHaveBeenCalled()
  })
})
