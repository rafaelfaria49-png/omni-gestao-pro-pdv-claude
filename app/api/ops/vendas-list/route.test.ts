import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"

// ============================================================================
// GOAL CONTADOR-HUB-P0-STORE-SCOPE-004 — ACL de loja em GET /api/ops/vendas-list.
// ----------------------------------------------------------------------------
// Fecha o IDOR: query/header/cookie são SELEÇÃO de loja, nunca AUTORIZAÇÃO.
// Assinatura válida NÃO substitui sessão nem ACL. Ordem provada (padrão da rota
// irmã /api/ops/inventory): sessão → resolução da loja → ACL → assinatura → consulta.
//
// `canAccessStore` e a resolução header/query/cookie são REAIS (não mockadas) —
// só `auth()`, a verificação de assinatura e o Prisma são mockados. Assim o teste
// exercita a decisão de ACL de verdade, não um mock.
// ============================================================================

const LOJA_A = "loja-A"
const LOJA_B = "loja-B"
const LOJA_C = "loja-C"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  getSub: vi.fn(
    async (): Promise<
      { ok: true; status: string; vencimento: string; plano: string } | { ok: false }
    > => ({ ok: true, status: "ativa", vencimento: "2099-01-01", plano: "ouro" }),
  ),
  ensureConnected: vi.fn(async (): Promise<void> => undefined),
  findMany: vi.fn(async (): Promise<unknown[]> => []),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { venda: { findMany: h.findMany } },
  prismaEnsureConnected: h.ensureConnected,
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/api-auth", () => ({ getVerifiedSubscriptionFromCookies: h.getSub }))
vi.mock("@/lib/subscription-seal", () => ({ isVencimentoExpired: () => false }))
vi.mock("@/lib/trusted-time", () => ({ getTrustedTimeMs: async () => Date.now() }))

import { GET } from "./route"

function sessionRestrictedTo(ids: string[]) {
  return { user: { id: "user-1", role: "vendedor", storeAccess: "restricted", allowedStoreIds: ids } }
}
function reqQuery(store: string) {
  return new Request(`http://local/api/ops/vendas-list?storeId=${encodeURIComponent(store)}`)
}
function reqHeader(store: string) {
  return new Request("http://local/api/ops/vendas-list", { headers: { [ASSISTEC_LOJA_HEADER]: store } })
}
function reqCookie(store: string) {
  return new Request("http://local/api/ops/vendas-list", {
    headers: { cookie: `${ASSISTEC_ACTIVE_STORE_COOKIE}=${encodeURIComponent(store)}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.auth.mockResolvedValue(null)
  h.getSub.mockResolvedValue({ ok: true, status: "ativa", vencimento: "2099-01-01", plano: "ouro" })
  h.findMany.mockResolvedValue([])
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("GET /api/ops/vendas-list — ACL de loja (GOAL-004)", () => {
  it("sem sessão + assinatura válida → 401 (assinatura não substitui sessão)", async () => {
    h.auth.mockResolvedValue(null)
    const res = await GET(reqQuery(LOJA_A))
    expect(res.status).toBe(401)
    // A assinatura nem é consultada antes da sessão, e nenhuma consulta ocorre.
    expect(h.getSub).not.toHaveBeenCalled()
    expect(h.ensureConnected).not.toHaveBeenCalled()
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("sessão A pedindo loja B por QUERY → 403", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const res = await GET(reqQuery(LOJA_B))
    expect(res.status).toBe(403)
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

  it("erro 403 é genérico — não revela existência/dados da loja B", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const res = await GET(reqQuery(LOJA_B))
    const json = (await res.json()) as Record<string, unknown>
    expect(res.status).toBe(403)
    expect(json).toEqual({ error: "Sem acesso à loja" })
    expect(json.sales).toBeUndefined()
    expect(JSON.stringify(json)).not.toContain(LOJA_B)
  })

  it("sessão A pedindo loja A → 200 e consulta só depois da ACL, escopada em A", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const res = await GET(reqQuery(LOJA_A))
    const json = (await res.json()) as {
      sales: unknown[]
      _lojaIdRecebido: string
      _gateBypassedInDev: boolean
    }
    expect(res.status).toBe(200)
    // Shape de sucesso preservado exatamente.
    expect(json).toEqual({ sales: [], _lojaIdRecebido: LOJA_A, _gateBypassedInDev: false })
    expect(h.findMany).toHaveBeenCalledTimes(1)
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: LOJA_A } }))
  })

  it("sessão multi-loja [A,C] pedindo C (permitida) → 200 escopada em C", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A, LOJA_C]))
    const res = await GET(reqQuery(LOJA_C))
    expect(res.status).toBe(200)
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: LOJA_C } }))
  })

  it("assinatura inválida (já com sessão+ACL válidas) não libera acesso", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    h.getSub.mockResolvedValue({ ok: false })
    const res = await GET(reqQuery(LOJA_A))
    // NODE_ENV=test → sem bypass dev: requireOpsSubscription devolve 401 "Não autorizado".
    expect(res.status).toBe(401)
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("precedência intacta: header vence query/cookie; loja resolvida (header, permitida) passa por ACL → 200", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const req = new Request(`http://local/api/ops/vendas-list?storeId=${LOJA_B}`, {
      headers: {
        [ASSISTEC_LOJA_HEADER]: LOJA_A,
        cookie: `${ASSISTEC_ACTIVE_STORE_COOKIE}=${LOJA_C}`,
      },
    })
    const res = await GET(req)
    const json = (await res.json()) as { _lojaIdRecebido: string }
    expect(res.status).toBe(200)
    expect(json._lojaIdRecebido).toBe(LOJA_A) // header venceu — precedência não mudou
  })

  it("precedência intacta: header (loja B, proibida) vence query (loja A) → ACL nega a loja resolvida → 403", async () => {
    h.auth.mockResolvedValue(sessionRestrictedTo([LOJA_A]))
    const req = new Request(`http://local/api/ops/vendas-list?storeId=${LOJA_A}`, {
      headers: { [ASSISTEC_LOJA_HEADER]: LOJA_B },
    })
    const res = await GET(req)
    expect(res.status).toBe(403) // ACL aplicada à loja RESOLVIDA (header=B), não à query
    expect(h.findMany).not.toHaveBeenCalled()
  })
})
