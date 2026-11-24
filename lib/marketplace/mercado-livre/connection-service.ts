import "server-only"
import { z } from "zod"
import type { MarketplaceConnection, Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import type { MarketplaceGrant, MarketplaceReadOnlyAdapter } from "../read-only-adapter"
import type { MarketplaceReadConnection, MarketplaceReadPage } from "../read-only-types"
import { MELI_CONNECTION_PREFIX, MELI_STATE_TTL_MS, type MercadoLivreConfig } from "./config"
import { opaqueId, openMeli, sealMeli, sha256 } from "./crypto"
import { MeliFailure, meliFailure } from "./errors"

const provider = "MERCADO_LIVRE" as const
const opaqueIdSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const intentSchema = z.object({
  storeId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  state: opaqueIdSchema,
  verifier: opaqueIdSchema,
  expiresAt: z.number(),
})
const metadataSchema = z.object({
  state: z.enum(["not_configured", "validated", "reconnect_required", "insufficient_permissions", "disconnected", "communication_error"]),
  seller: z.object({ id: z.string(), nickname: z.string().nullable(), siteStatus: z.string().nullable(), testAccount: z.boolean() }).optional(),
  grant: z.object({ id: opaqueIdSchema, appId: z.string(), expiresAt: z.number(), scopes: z.array(z.string()) }).optional(),
  pending: z.object({ digest: opaqueIdSchema, expiresAt: z.number(), used: z.boolean() }).optional(),
  renewal: z.object({ id: opaqueIdSchema, expiresAt: z.number() }).optional(),
  retryAt: z.number().optional(),
})
const cursorSchema = z.object({ scrollId: z.string().min(1).max(2048), expiresAt: z.number() })
const REFRESH_AHEAD_MS = 60_000
const RENEWAL_LEASE_MS = 30_000
const CURSOR_TTL_MS = 4 * 60_000

type Actor = Pick<z.infer<typeof intentSchema>, "storeId" | "userId">
type Intent = z.infer<typeof intentSchema>
type Metadata = z.infer<typeof metadataSchema>
type Credentials = Pick<MarketplaceConnection, "accessToken" | "refreshToken">
type Scope = { storeId: string; sellerId: string; grantId: string }
type ReadAuthorization = Scope & {
  accessToken: string
  accessCiphertext: string
  scrollId?: string
}

const emptyCredentials: Credentials = { accessToken: "", refreshToken: "" }

function whereStore(storeId: string) {
  return { id: MELI_CONNECTION_PREFIX + sha256(storeId), storeId, provider }
}

function metadataOf(row: MarketplaceConnection | null): Metadata {
  if (!row) return { state: "not_configured" }
  const parsed = metadataSchema.safeParse(row.metadata)
  if (!parsed.success || (parsed.data.grant && !parsed.data.seller)) throw new MeliFailure("communication_error")
  return parsed.data
}

async function lock(tx: Prisma.TransactionClient, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS lock`
}

// Nenhuma chamada ao provedor acontece com uma transação aberta.
function forStore<T>(
  storeId: string,
  action: (tx: Prisma.TransactionClient, row: MarketplaceConnection | null, metadata: Metadata) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await lock(tx, `marketplace:mercado-livre:store:${storeId}`)
    const row = await tx.marketplaceConnection.findFirst({ where: whereStore(storeId) })
    return action(tx, row, metadataOf(row))
  }, { isolationLevel: "ReadCommitted" })
}

function writeState(
  tx: Prisma.TransactionClient, storeId: string, metadata: Metadata,
  extra?: Partial<Credentials> & { accountName?: string },
) {
  const status = metadata.state === "validated" ? "CONNECTED" :
    metadata.state === "disconnected" || metadata.state === "not_configured" ? "DISCONNECTED" : "ERROR"
  return tx.marketplaceConnection.update({
    where: whereStore(storeId),
    data: { metadata, status, ...extra },
  })
}

async function audit(tx: Prisma.TransactionClient, actor: Actor, action: "authorized" | "disconnected") {
  await tx.logsAuditoria.create({
    data: {
      action: `marketplace.mercado_livre.${action}`,
      userLabel: actor.userId,
      detail: action === "authorized" ? "Autorização de leitura do Mercado Livre confirmada." : "Conexão Mercado Livre desconectada nesta unidade.",
      metadata: JSON.stringify({ storeId: actor.storeId }),
      source: "marketplace",
    },
  })
}

function vaultContext(kind: string, scope: Scope) {
  return [kind, scope.storeId, scope.sellerId, scope.grantId]
}

function encryptGrant(config: MercadoLivreConfig, scope: Scope, grant: MarketplaceGrant): Credentials {
  return {
    accessToken: sealMeli(config, vaultContext("access-token", scope), grant.accessToken),
    refreshToken: sealMeli(config, vaultContext("refresh-token", scope), grant.refreshToken),
  }
}

function pendingIsActive(metadata: Metadata) {
  return !!metadata.pending && metadata.pending.expiresAt > Date.now()
}

function activeRenewal(metadata: Metadata) {
  return metadata.renewal && metadata.renewal.expiresAt > Date.now()
}

export async function describeMercadoLivre(storeId: string, config: MercadoLivreConfig | null): Promise<MarketplaceReadConnection> {
  const enabled = config?.storeIds.has(storeId) ?? false
  const initial: MarketplaceReadConnection = {
    enabled, state: "not_configured", seller: null, scopes: [], canRead: false, canDisconnect: false,
  }
  if (!enabled || !config) return initial
  const row = await prisma.marketplaceConnection.findFirst({ where: whereStore(storeId) })
  if (!row) return initial
  const metadata = metadataOf(row)
  const grant = metadata.grant
  const scope = grant && metadata.seller ? { storeId, sellerId: metadata.seller.id, grantId: grant.id } : null
  const hasGrant = !!(scope && grant?.appId === config.clientId &&
    openMeli(config, vaultContext("access-token", scope), row.accessToken) &&
    openMeli(config, vaultContext("refresh-token", scope), row.refreshToken))
  let state: MarketplaceReadConnection["state"] = metadata.state
  if (pendingIsActive(metadata)) state = "awaiting_authorization"
  else if (grant && (!hasGrant || (metadata.renewal && !activeRenewal(metadata)))) state = "reconnect_required"
  else if (grant && state === "validated" && grant.expiresAt <= Date.now()) state = "token_expired"
  return {
    enabled,
    state,
    seller: metadata.seller ?? null,
    scopes: hasGrant ? grant?.scopes ?? [] : [],
    canRead: hasGrant && ["validated", "token_expired", "communication_error"].includes(state),
    canDisconnect: pendingIsActive(metadata) || hasGrant || (!!metadata.seller && state !== "disconnected"),
  }
}

export async function startMercadoLivre(config: MercadoLivreConfig, adapter: MarketplaceReadOnlyAdapter, actor: Actor) {
  const intent = {
    ...actor,
    state: opaqueId(),
    verifier: opaqueId(),
    expiresAt: Date.now() + MELI_STATE_TTL_MS,
  }
  await forStore(actor.storeId, async (tx, row, metadata) => {
    if (activeRenewal(metadata) || (pendingIsActive(metadata) && metadata.pending?.used)) throw new MeliFailure("operation_in_progress")
    const pending = { digest: sha256(intent.state), expiresAt: intent.expiresAt, used: false }
    if (row) await writeState(tx, actor.storeId, { ...metadata, pending })
    else await tx.marketplaceConnection.create({
      data: { ...whereStore(actor.storeId), accountName: "Mercado Livre", metadata: { ...metadata, pending } },
    })
  })
  return {
    authorizationUrl: adapter.authorizationUrl(intent.state, sha256(intent.verifier)),
    cookie: sealMeli(config, ["callback", config.redirectUri], JSON.stringify(intent)),
  }
}

export function parseMercadoLivreIntent(config: MercadoLivreConfig, cookie: string, state: string): Intent | null {
  const opened = openMeli(config, ["callback", config.redirectUri], cookie)
  if (!opened) return null
  const intent = intentSchema.safeParse(JSON.parse(opened))
  if (!intent.success || intent.data.state !== state || intent.data.expiresAt <= Date.now() ||
      !config.storeIds.has(intent.data.storeId)) return null
  return intent.data
}

export async function finishMercadoLivre(
  config: MercadoLivreConfig, adapter: MarketplaceReadOnlyAdapter, intent: Intent, code: string | null,
) {
  const digest = sha256(intent.state)
  await forStore(intent.storeId, async (tx, _row, metadata) => {
    const pending = metadata.pending
    if (!pending || pending.used || pending.digest !== digest || !pendingIsActive(metadata)) throw new MeliFailure("invalid_state")
    // A tentativa é consumida antes da chamada externa, inclusive se o provedor falhar.
    await writeState(tx, intent.storeId, { ...metadata, pending: { ...pending, used: true } })
  })
  try {
    if (!code) throw new MeliFailure("denied")
    const grant = await adapter.exchangeCode(code, intent.verifier)
    const seller = await adapter.identifySeller(grant.accessToken)
    if (grant.sellerId !== seller.id) throw new MeliFailure("account_mismatch")
    await forStore(intent.storeId, async (tx, _row, metadata) => {
      if (metadata.pending?.digest !== digest) throw new MeliFailure("invalid_state")
      if (metadata.seller && metadata.seller.id !== seller.id) throw new MeliFailure("account_mismatch")
      // Uma conta externa fica reservada à loja que a verificou primeiro, inclusive após desconexão.
      await lock(tx, `marketplace:mercado-livre:seller:${seller.id}`)
      const existing = await tx.marketplaceConnection.findFirst({
        where: {
          id: { startsWith: MELI_CONNECTION_PREFIX }, provider, storeId: { not: intent.storeId },
          metadata: { path: ["seller", "id"], equals: seller.id },
        },
        select: { id: true },
      })
      if (existing) throw new MeliFailure("account_mismatch")
      const grantId = opaqueId()
      await writeState(tx, intent.storeId, {
        state: "validated",
        seller,
        grant: { id: grantId, appId: config.clientId, expiresAt: grant.expiresAt, scopes: grant.scopes },
      }, {
        ...encryptGrant(config, { storeId: intent.storeId, sellerId: seller.id, grantId }, grant),
        accountName: seller.nickname || "Mercado Livre",
      })
      await audit(tx, intent, "authorized")
    })
  } catch (error) {
    const failure = meliFailure(error)
    await forStore(intent.storeId, async (tx, _row, metadata) => {
      if (metadata.pending?.digest !== digest) return
      const state = metadata.grant || failure.code === "denied" || failure.code === "account_mismatch" ? metadata.state :
        failure.code === "insufficient_permissions" || failure.code === "reconnect_required" ? failure.code : "communication_error"
      await writeState(tx, intent.storeId, { ...metadata, pending: undefined, state })
    })
    throw failure
  }
}

export async function disconnectMercadoLivre(actor: Actor) {
  await forStore(actor.storeId, async (tx, row, metadata) => {
    if (!row || (metadata.state === "disconnected" && !metadata.pending)) return
    if (activeRenewal(metadata) || (pendingIsActive(metadata) && metadata.pending?.used)) throw new MeliFailure("operation_in_progress")
    await writeState(tx, actor.storeId, { state: "disconnected", seller: metadata.seller }, emptyCredentials)
    await audit(tx, actor, "disconnected")
  })
}

function readCursor(config: MercadoLivreConfig, scope: Scope, cursor: string | undefined) {
  if (cursor === undefined) return undefined
  const opened = openMeli(config, vaultContext("listings-page", scope), cursor)
  const parsed = opened && cursorSchema.safeParse(JSON.parse(opened))
  if (!parsed || !parsed.success || parsed.data.expiresAt <= Date.now()) throw new MeliFailure("invalid_cursor")
  return parsed.data.scrollId
}

async function prepareRead(config: MercadoLivreConfig, storeId: string, cursor: string | undefined) {
  return forStore(storeId, async (tx, row, metadata) => {
    const grant = metadata.grant
    if (pendingIsActive(metadata) || activeRenewal(metadata)) throw new MeliFailure("operation_in_progress")
    if (metadata.state === "insufficient_permissions" || metadata.state === "disconnected") throw new MeliFailure(metadata.state)
    if (!row || !metadata.seller || !grant || grant.appId !== config.clientId) throw new MeliFailure("reconnect_required")
    const scope = { storeId, sellerId: metadata.seller.id, grantId: grant.id }
    const scrollId = readCursor(config, scope, cursor)
    if (metadata.retryAt && metadata.retryAt > Date.now()) {
      throw new MeliFailure("rate_limited", Math.ceil((metadata.retryAt - Date.now()) / 1000))
    }
    const accessToken = openMeli(config, vaultContext("access-token", scope), row.accessToken)
    const refreshToken = openMeli(config, vaultContext("refresh-token", scope), row.refreshToken)
    if (metadata.renewal || !accessToken || !refreshToken) {
      await writeState(tx, storeId, { state: "reconnect_required", seller: metadata.seller }, emptyCredentials)
      return { kind: "reconnect" as const }
    }
    if (grant.expiresAt > Date.now() + REFRESH_AHEAD_MS) {
      return { kind: "ready" as const, ...scope, accessToken, accessCiphertext: row.accessToken, scrollId }
    }
    // O marcador é durável: se o worker morrer depois de o provedor rotacionar o token, outra
    // instância pede nova autorização em vez de reenviar o refresh token de uso único.
    const renewal = { id: opaqueId(), expiresAt: Date.now() + RENEWAL_LEASE_MS }
    await writeState(tx, storeId, { ...metadata, renewal })
    return { kind: "renew" as const, ...scope, renewalId: renewal.id, refreshToken, scrollId }
  })
}

async function recordFailure(
  tx: Prisma.TransactionClient, storeId: string, metadata: Metadata, failure: MeliFailure, refreshing: boolean,
) {
  if (failure.code === "invalid_cursor") return
  if (failure.code === "rate_limited") {
    await writeState(tx, storeId, {
      ...metadata, state: "communication_error", renewal: undefined, retryAt: Date.now() + (failure.retryAfter ?? 30) * 1000,
    })
    return
  }
  const state = failure.code === "account_mismatch" ? "reconnect_required" :
    failure.code === "insufficient_permissions" || failure.code === "reconnect_required" ? failure.code : "communication_error"
  if (refreshing || state !== "communication_error") {
    await writeState(tx, storeId, { state, seller: metadata.seller }, emptyCredentials)
  } else {
    await writeState(tx, storeId, { ...metadata, state, retryAt: undefined })
  }
}

async function authorizeRead(
  config: MercadoLivreConfig, adapter: MarketplaceReadOnlyAdapter, storeId: string, cursor: string | undefined,
): Promise<ReadAuthorization> {
  const prepared = await prepareRead(config, storeId, cursor)
  if (prepared.kind === "reconnect") throw new MeliFailure("reconnect_required")
  if (prepared.kind === "ready") return prepared
  let grant: MarketplaceGrant
  try {
    grant = await adapter.refresh(prepared.refreshToken)
    if (grant.sellerId !== prepared.sellerId) throw new MeliFailure("account_mismatch")
  } catch (error) {
    const failure = meliFailure(error)
    await forStore(storeId, async (tx, _row, metadata) => {
      if (metadata.renewal?.id === prepared.renewalId) await recordFailure(tx, storeId, metadata, failure, true)
    })
    throw failure
  }
  const credentials = encryptGrant(config, prepared, grant)
  await forStore(storeId, async (tx, _row, metadata) => {
    if (metadata.renewal?.id !== prepared.renewalId || metadata.grant?.id !== prepared.grantId) throw new MeliFailure("reconnect_required")
    await writeState(tx, storeId, {
      ...metadata,
      state: "validated",
      renewal: undefined,
      retryAt: undefined,
      grant: { ...metadata.grant, expiresAt: grant.expiresAt, scopes: grant.scopes },
    }, credentials)
  })
  return {
    storeId, sellerId: prepared.sellerId, grantId: prepared.grantId, scrollId: prepared.scrollId,
    accessToken: grant.accessToken, accessCiphertext: credentials.accessToken,
  }
}

export async function readMercadoLivreAds(
  config: MercadoLivreConfig, adapter: MarketplaceReadOnlyAdapter, storeId: string, cursor?: string,
): Promise<MarketplaceReadPage> {
  const authorization = await authorizeRead(config, adapter, storeId, cursor)
  const startedAt = Date.now()
  let page: MarketplaceReadPage
  try {
    page = await adapter.listAds(authorization.accessToken, authorization.sellerId, authorization.scrollId)
  } catch (error) {
    const failure = meliFailure(error)
    await forStore(storeId, async (tx, row, metadata) => {
      if (metadata.grant?.id === authorization.grantId && row?.accessToken === authorization.accessCiphertext &&
          !metadata.renewal && !pendingIsActive(metadata)) {
        await recordFailure(tx, storeId, metadata, failure, false)
      }
    })
    throw failure
  }
  await forStore(storeId, async (tx, _row, metadata) => {
    if (metadata.grant?.id !== authorization.grantId || pendingIsActive(metadata)) throw new MeliFailure("reconnect_required")
    if (metadata.state === "communication_error" && !metadata.retryAt && !metadata.renewal) {
      await writeState(tx, storeId, { ...metadata, state: "validated" })
    }
  })
  return {
    ...page,
    nextCursor: page.nextCursor && sealMeli(config, vaultContext("listings-page", authorization), JSON.stringify({
      scrollId: page.nextCursor, expiresAt: startedAt + CURSOR_TTL_MS,
    })),
  }
}
