import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MercadoLivreAdapter } from "./adapter"
import { MELI_CALLBACK_PATH, mercadoLivreConfig, type MercadoLivreConfig } from "./config"
import { sha256 } from "./crypto"

const storeCreatedAt = new Map<string, Date>([
  ["store-a", new Date("2026-01-01T00:00:00.000Z")],
  ["store-b", new Date("2026-01-02T00:00:00.000Z")],
])
const connections = new Map<string, Record<string, unknown>>()
const auditLogs = new Map<string, { id: string; action: string; metadata: string }>()

const mockTx = {
  $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join(" ")
    if (sql.includes("FROM stores")) {
      const storeId = String(values[0])
      const createdAt = storeCreatedAt.get(storeId)
      return createdAt ? [{ createdAt }] : []
    }
    return [{ lock: "" }]
  }),
  marketplaceConnection: {
    findFirst: vi.fn(async ({ where }: { where: { id?: string | { startsWith?: string }; storeId?: string | { not?: string }; metadata?: { path?: string[]; equals?: unknown } } }) => {
      if (typeof where.id === "string") {
        return connections.get(where.id) ?? null
      }
      for (const row of connections.values()) {
        if (typeof where.storeId === "object" && where.storeId?.not === row.storeId) continue
        if (where.metadata?.path?.[0] === "seller" && where.metadata?.path?.[1] === "id") {
          const sellerId = (row.metadata as { seller?: { id?: string } } | undefined)?.seller?.id
          if (sellerId === where.metadata.equals) return { id: row.id }
        }
      }
      return null
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = connections.get(where.id) ?? { id: where.id }
      const updated = { ...existing, ...data }
      connections.set(where.id, updated)
      return updated
    }),
  },
  logsAuditoria: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => auditLogs.get(where.id) ?? null),
    create: vi.fn(async ({ data }: { data: { id?: string; action: string; metadata: string } }) => {
      const id = data.id ?? `audit-${auditLogs.size + 1}`
      const record = { id, action: data.action, metadata: data.metadata }
      auditLogs.set(id, record)
      return record
    }),
  },
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async <T>(fn: (tx: typeof mockTx) => Promise<T>) => fn(mockTx),
  },
}))

import { finishMercadoLivre } from "./connection-service"

const origin = "https://omni.example.invalid"
const sellerA = "9223372036854775806"
const sellerB = "9223372036854775807"
const config = mercadoLivreConfig({
  MELI_OAUTH_ENABLED: "1",
  MELI_OAUTH_STORE_ALLOWLIST: "store-a, store-b",
  MELI_OAUTH_CLIENT_ID: "9999",
  MELI_OAUTH_CLIENT_SECRET: "synthetic-client-secret",
  MELI_OAUTH_REDIRECT_URI: origin + MELI_CALLBACK_PATH,
  MELI_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
}) as MercadoLivreConfig
const adapter = new MercadoLivreAdapter(config)
const fetchMock = vi.fn<typeof fetch>()

function seedPending(storeId: string, state: string, sellerId?: string) {
  const id = "meli-oauth-v1-" + sha256(storeId)
  connections.set(id, {
    id,
    storeId,
    provider: "MERCADO_LIVRE",
    accessToken: "",
    refreshToken: "",
    metadata: {
      state: "not_configured",
      pending: { digest: sha256(state), expiresAt: Date.now() + 60_000, used: false, sellerId },
    },
  })
}

function makeIntent(storeId: string, state: string, sellerId?: string) {
  return {
    storeId,
    userId: `user-${storeId}`,
    state,
    verifier: "b".repeat(43),
    expiresAt: Date.now() + 60_000,
    sellerId,
  }
}

beforeEach(() => {
  connections.clear()
  auditLogs.clear()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("finishMercadoLivre — comparação exata grant vs /users/me e isolamento Int64 entre lojas", () => {
  it("recusa com account_mismatch quando /oauth/token e /users/me divergem em Int64 consecutivo", async () => {
    const state = "a".repeat(43)
    seedPending("store-a", state)

    fetchMock
      .mockResolvedValueOnce(new Response(`{"access_token":"tok","refresh_token":"ref","user_id":${sellerA},"expires_in":21600,"token_type":"Bearer","scope":"read offline_access"}`))
      .mockResolvedValueOnce(new Response(`{"id":${sellerB},"site_id":"MLB","nickname":"DIVERGENTE","tags":["test_user"]}`))

    await expect(finishMercadoLivre(config, adapter, makeIntent("store-a", state), "auth-code"))
      .rejects.toMatchObject({ code: "account_mismatch" })
    expect(auditLogs.size).toBe(0)
  })

  it("reserva Int64 por loja sem colisão entre IDs consecutivos e bloqueia a mesma conta em outra loja", async () => {
    const stateA = "c".repeat(43)
    seedPending("store-a", stateA)
    fetchMock
      .mockResolvedValueOnce(new Response(`{"access_token":"tok-a","refresh_token":"ref-a","user_id":${sellerB},"expires_in":21600,"token_type":"Bearer","scope":"read offline_access"}`))
      .mockResolvedValueOnce(new Response(`{"id":${sellerB},"site_id":"MLB","nickname":"LOJA-A","tags":["test_user"]}`))

    await finishMercadoLivre(config, adapter, makeIntent("store-a", stateA), "code-a")

    // store-b tentando vincular exatamente o mesmo Int64 (sellerB) -> bloqueado com account_mismatch
    const stateBSame = "d".repeat(43)
    seedPending("store-b", stateBSame)
    fetchMock
      .mockResolvedValueOnce(new Response(`{"access_token":"tok-dup","refresh_token":"ref-dup","user_id":${sellerB},"expires_in":21600,"token_type":"Bearer","scope":"read offline_access"}`))
      .mockResolvedValueOnce(new Response(`{"id":${sellerB},"site_id":"MLB","nickname":"LOJA-A","tags":["test_user"]}`))

    await expect(finishMercadoLivre(config, adapter, makeIntent("store-b", stateBSame), "code-dup"))
      .rejects.toMatchObject({ code: "account_mismatch" })

    // store-b vinculando o Int64 consecutivo distinto (sellerA = ...5806) -> permitido com reserva própria
    const stateBOwn = "e".repeat(43)
    seedPending("store-b", stateBOwn)
    fetchMock
      .mockResolvedValueOnce(new Response(`{"access_token":"tok-b","refresh_token":"ref-b","user_id":${sellerA},"expires_in":21600,"token_type":"Bearer","scope":"read offline_access"}`))
      .mockResolvedValueOnce(new Response(`{"id":${sellerA},"site_id":"MLB","nickname":"LOJA-B","tags":["test_user"]}`))

    await finishMercadoLivre(config, adapter, makeIntent("store-b", stateBOwn), "code-b")

    const connA = connections.get("meli-oauth-v1-" + sha256("store-a")) as { metadata: { seller: { id: string } } }
    const connB = connections.get("meli-oauth-v1-" + sha256("store-b")) as { metadata: { seller: { id: string } } }
    expect(connA.metadata.seller.id).toBe(sellerB)
    expect(connB.metadata.seller.id).toBe(sellerA)
  })
})
