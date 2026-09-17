/**
 * CAD-R2-008 — ClientWriteService: boundary canônico server-side de escrita
 * de Cliente (CREATE / UPDATE do cadastro).
 *
 * server-only: nunca importado por Client Components.
 *
 * Fluxo: adapter → contexto autorizado → normalização/validação →
 * client-identity/dedupe (na MESMA TransactionClient) → revisão quando
 * necessária → persistência + auditoria atômicas.
 *
 * O QUE ESTE SERVIÇO FAZ
 * - Recebe `ClientWriteContext` JÁ PROVADO. `storeId`/`actor`/`principal`
 *   no payload são ignorados.
 * - Reusa `lib/cadastros/client-identity/**` (sem segundo motor de dedupe).
 * - UPDATE parcial: campo ausente ≠ clear explícito.
 * - Create/update + audit na mesma transação.
 * - Erros estruturados sem PII (documento/telefone/email bruto).
 *
 * O QUE ESTE SERVIÇO NÃO FAZ
 * - Hard delete, cleanup destrutivo, merge (018-B).
 * - Unique DB por documento (019) — a proteção aqui é lookup+write na
 *   mesma transação; corrida concorrente sem unique permanece um gap.
 * - Validação global de DV de CPF/CNPJ na persistência (compat. histórica).
 *   Documento só é identidade FORTE com DV válido (018-A).
 * - Auto-merge. `force=true` é ignorado.
 */
import "server-only"

import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { cadastrosAuditLogFields } from "@/lib/cadastros/cadastros-audit-principal"
import {
  classifyClientIdentity,
  lookupKeysFromSignals,
  toClientIdentitySignals,
  type ClientIdentityOutcome,
  type ClientIdentityRecordSource,
  type ClientIdentitySignals,
  type ClientIdentityVerdict,
} from "@/lib/cadastros/client-identity"
import { createPrismaClientIdentitySource } from "@/lib/cadastros/client-identity/lookup-prisma"
import {
  CLIENT_WRITE_MESSAGES,
  clientWriteInvalid,
  clientWriteUntrusted,
  type ClientIdentityReviewDecision,
  type ClientWriteContext,
  type ClientWriteFailure,
  type ClientWriteField,
  type ClientWriteInput,
  type ClientWriteOptions,
  type ClientWriteResult,
} from "@/lib/cadastros/client-write-contract"

export const CLIENT_WRITE_AUDIT_SOURCE = "client-write-service"

/** Gap explícito até CAD-R2-019 (unique store-scoped por documento forte). */
export const CLIENT_WRITE_CONCURRENCY_GAP =
  "CAD-R2-019: sem unique (storeId, document) no schema. Lookup+write na mesma transação reduz a janela, mas não elimina corrida concorrente." as const

export type ClientWriteFoundRow = {
  id: string
  storeId: string
  name: string
  kind: string
  document: string
  phone: string | null
  email: string | null
  city: string
  tags: Prisma.JsonValue | null
  active: boolean
  totalSpent: number
  lastPurchaseAt: Date | null
}

export type ClientWriteTx = {
  cliente: {
    findMany(args: Prisma.ClienteFindManyArgs): Promise<unknown>
    findFirst(args: Prisma.ClienteFindFirstArgs): Promise<ClientWriteFoundRow | null>
    create(args: Prisma.ClienteCreateArgs): Promise<{ id: string }>
    update(args: Prisma.ClienteUpdateArgs): Promise<{ id: string }>
  }
  logsAuditoria: {
    create(args: Prisma.LogsAuditoriaCreateArgs): Promise<unknown>
  }
}

export type ClientWriteDb = {
  cliente: {
    findFirst(args: Prisma.ClienteFindFirstArgs): Promise<ClientWriteFoundRow | null>
  }
  $transaction<T>(fn: (tx: ClientWriteTx) => Promise<T>): Promise<T>
}

export type ClientWriteDeps = {
  db?: ClientWriteDb
  identitySource?: ClientIdentityRecordSource
}

type TrustedContext = { storeId: string; principal: ClientWriteContext["principal"] }

const FOUND_SELECT = {
  id: true,
  storeId: true,
  name: true,
  kind: true,
  document: true,
  phone: true,
  email: true,
  city: true,
  tags: true,
  active: true,
  totalSpent: true,
  lastPurchaseAt: true,
} as const

function trustedContext(
  context: ClientWriteContext | null | undefined,
): { error: ClientWriteFailure } | { ctx: TrustedContext } {
  if (!context) return { error: clientWriteUntrusted() }
  const storeId = (context.storeId ?? "").trim()
  if (!storeId) return { error: clientWriteUntrusted() }
  const principal = context.principal ?? null
  if (principal && !(principal.userId ?? "").trim()) {
    return { error: clientWriteUntrusted() }
  }
  return { ctx: { storeId, principal } }
}

function firstDefined(input: ClientWriteInput, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
      return input[key]
    }
  }
  return undefined
}

function asTrimmedText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim()
  if (typeof value !== "string") return null
  return value.trim()
}

function isPrismaKnownError(e: unknown, code: "P2002" | "P2025"): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === code
  const record = e as { code?: unknown; name?: unknown } | null
  return record?.code === code && String(record?.name ?? "").includes("PrismaClientKnown")
}

type NormalizedPatch = {
  name?: string
  kind?: "PF" | "PJ"
  document?: string
  documentTouched: boolean
  phone?: string | null
  phoneTouched: boolean
  email?: string | null
  emailTouched: boolean
  city?: string
  tags?: Prisma.InputJsonValue | typeof Prisma.DbNull
  tagsTouched: boolean
  tagsClear: boolean
  active?: boolean
  totalSpent?: number
  lastPurchaseAt?: Date | null
  lastPurchaseTouched: boolean
  changedFields: ClientWriteField[]
  identityTouched: boolean
}

function parseLastPurchaseAt(
  value: unknown,
): { ok: true; value: Date | null } | { ok: false; error: ClientWriteFailure } {
  if (value === null) return { ok: true, value: null }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return { ok: false, error: clientWriteInvalid('Campo "lastPurchaseAt" inválido.', "lastPurchaseAt") }
    }
    return { ok: true, value }
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: clientWriteInvalid('Campo "lastPurchaseAt" inválido.', "lastPurchaseAt") }
    }
    return { ok: true, value: d }
  }
  return { ok: false, error: clientWriteInvalid('Campo "lastPurchaseAt" inválido.', "lastPurchaseAt") }
}

function parseNonNegativeMoney(
  value: unknown,
  field: ClientWriteField,
): { ok: true; value: number } | { ok: false; error: ClientWriteFailure } {
  const num = typeof value === "number" ? value : typeof value === "string" && value.trim() !== ""
    ? Number(value.trim())
    : NaN
  if (!Number.isFinite(num) || num < 0) {
    return { ok: false, error: clientWriteInvalid(`Campo "${field}" inválido.`, field) }
  }
  return { ok: true, value: num }
}

function normalizeKind(value: unknown): { ok: true; value: "PF" | "PJ" } | { ok: false; error: ClientWriteFailure } {
  if (value === undefined || value === null || value === "") return { ok: true, value: "PF" }
  if (typeof value !== "string") {
    return { ok: false, error: clientWriteInvalid('Campo "kind" inválido.', "kind") }
  }
  const raw = value.trim().toUpperCase()
  if (raw === "PJ") return { ok: true, value: "PJ" }
  if (raw === "PF") return { ok: true, value: "PF" }
  return { ok: false, error: clientWriteInvalid('Campo "kind" inválido.', "kind") }
}

function normalizePatch(
  input: ClientWriteInput,
  opts: { requireName: boolean },
): { ok: true; patch: NormalizedPatch } | { ok: false; error: ClientWriteFailure } {
  const patch: NormalizedPatch = {
    documentTouched: false,
    phoneTouched: false,
    emailTouched: false,
    tagsTouched: false,
    tagsClear: false,
    lastPurchaseTouched: false,
    changedFields: [],
    identityTouched: false,
  }

  const rawName = firstDefined(input, "nome", "name")
  if (rawName !== undefined) {
    const name = asTrimmedText(rawName)
    if (name === null || name === "") {
      return { ok: false, error: clientWriteInvalid(CLIENT_WRITE_MESSAGES.nameRequired, "nome") }
    }
    patch.name = name
    patch.changedFields.push("nome")
  } else if (opts.requireName) {
    return { ok: false, error: clientWriteInvalid(CLIENT_WRITE_MESSAGES.nameRequired, "nome") }
  }

  const rawKind = firstDefined(input, "tipo", "kind")
  if (rawKind !== undefined) {
    const kind = normalizeKind(rawKind)
    if (!kind.ok) return { ok: false, error: kind.error }
    patch.kind = kind.value
    patch.changedFields.push("kind")
  }

  const rawDocument = firstDefined(input, "documento", "document")
  if (rawDocument !== undefined) {
    const document = asTrimmedText(rawDocument)
    if (document === null) {
      return { ok: false, error: clientWriteInvalid('Campo "document" inválido.', "document") }
    }
    patch.document = document ?? ""
    patch.documentTouched = true
    patch.identityTouched = true
    patch.changedFields.push("document")
  }

  const rawPhone = firstDefined(input, "telefone", "phone")
  if (rawPhone !== undefined) {
    if (rawPhone === null) {
      patch.phone = null
    } else {
      const phone = asTrimmedText(rawPhone)
      if (phone === null) {
        return { ok: false, error: clientWriteInvalid('Campo "phone" inválido.', "phone") }
      }
      patch.phone = phone || null
    }
    patch.phoneTouched = true
    patch.identityTouched = true
    patch.changedFields.push("phone")
  }

  const rawEmail = firstDefined(input, "email")
  if (rawEmail !== undefined) {
    if (rawEmail === null) {
      patch.email = null
    } else {
      const email = asTrimmedText(rawEmail)
      if (email === null) {
        return { ok: false, error: clientWriteInvalid('Campo "email" inválido.', "email") }
      }
      patch.email = email || null
    }
    patch.emailTouched = true
    patch.identityTouched = true
    patch.changedFields.push("email")
  }

  const rawCity = firstDefined(input, "cidade", "city")
  if (rawCity !== undefined) {
    const city = asTrimmedText(rawCity)
    if (city === null) {
      return { ok: false, error: clientWriteInvalid('Campo "city" inválido.', "city") }
    }
    patch.city = city ?? ""
    patch.changedFields.push("city")
  }

  if (Object.prototype.hasOwnProperty.call(input, "tags")) {
    const tags = input.tags
    patch.tagsTouched = true
    patch.changedFields.push("tags")
    if (tags === null) {
      patch.tagsClear = true
      patch.tags = Prisma.DbNull
    } else {
      patch.tags = tags as Prisma.InputJsonValue
    }
  }

  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") {
      return { ok: false, error: clientWriteInvalid('Campo "active" inválido.', "active") }
    }
    patch.active = input.active
    patch.changedFields.push("active")
  }

  if (input.totalSpent !== undefined && input.totalSpent !== null) {
    const total = parseNonNegativeMoney(input.totalSpent, "totalSpent")
    if (!total.ok) return { ok: false, error: total.error }
    patch.totalSpent = total.value
    patch.changedFields.push("totalSpent")
  }

  if (input.lastPurchaseAt !== undefined) {
    const parsed = parseLastPurchaseAt(input.lastPurchaseAt)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    patch.lastPurchaseAt = parsed.value
    patch.lastPurchaseTouched = true
    patch.changedFields.push("lastPurchaseAt")
  }

  return { ok: true, patch }
}

function signalsFromPatchAndExisting(
  patch: NormalizedPatch,
  existing?: Pick<ClientWriteFoundRow, "document" | "phone" | "email" | "name">,
): ClientIdentitySignals {
  return toClientIdentitySignals({
    document: patch.documentTouched ? patch.document : existing?.document,
    phone: patch.phoneTouched ? patch.phone : existing?.phone,
    email: patch.emailTouched ? patch.email : existing?.email,
    name: patch.name !== undefined ? patch.name : existing?.name,
  })
}

function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((id, i) => id === sb[i])
}

function identityFailure(verdict: ClientIdentityVerdict): ClientWriteFailure {
  const candidateIds = verdict.candidates.map((c) => c.id)
  const base = {
    outcome: verdict.outcome,
    candidateIds,
    reasons: verdict.reasons,
  }
  if (verdict.outcome === "EXACT_DOCUMENT_MATCH") {
    return { ok: false, code: "IDENTITY_REVIEW_REQUIRED", message: CLIENT_WRITE_MESSAGES.exactDocument, ...base }
  }
  if (verdict.outcome === "POSSIBLE_CONTACT_MATCH") {
    return { ok: false, code: "IDENTITY_REVIEW_REQUIRED", message: CLIENT_WRITE_MESSAGES.review, ...base }
  }
  if (verdict.outcome === "IDENTITY_CONFLICT") {
    return { ok: false, code: "IDENTITY_CONFLICT", message: CLIENT_WRITE_MESSAGES.conflict, ...base }
  }
  return { ok: false, code: "AMBIGUOUS", message: CLIENT_WRITE_MESSAGES.ambiguous, ...base }
}

function applyReviewDecision(
  verdict: ClientIdentityVerdict,
  operation: "create" | "update",
  decision: ClientIdentityReviewDecision | undefined,
  principal: TrustedContext["principal"],
): { ok: true; reviewed: boolean } | { ok: false; error: ClientWriteFailure } {
  if (verdict.outcome === "NO_MATCH") return { ok: true, reviewed: false }

  const expectedAction = operation === "create" ? "PROCEED_CREATE" : "PROCEED_UPDATE"
  const canProceed =
    verdict.outcome === "POSSIBLE_CONTACT_MATCH" &&
    decision !== undefined &&
    decision.expectedOutcome === verdict.outcome &&
    decision.action === expectedAction &&
    sameIdSet(decision.expectedCandidateIds, verdict.candidates.map((c) => c.id))

  if (canProceed) {
    if (!principal?.userId) {
      return { ok: false, error: clientWriteInvalid(CLIENT_WRITE_MESSAGES.reviewNeedsPrincipal) }
    }
    return { ok: true, reviewed: true }
  }

  if (decision) {
    if (verdict.outcome !== "POSSIBLE_CONTACT_MATCH") {
      return { ok: false, error: identityFailure(verdict) }
    }
    return {
      ok: false,
      error: {
        ...identityFailure(verdict),
        message: CLIENT_WRITE_MESSAGES.reviewStale,
      },
    }
  }

  return { ok: false, error: identityFailure(verdict) }
}

async function classifyIncoming(args: {
  storeId: string
  signals: ClientIdentitySignals
  source: ClientIdentityRecordSource
  excludeId?: string
}): Promise<ClientIdentityVerdict> {
  const keys = lookupKeysFromSignals(args.signals)
  const loaded = await args.source.findByIdentityKeys(args.storeId, keys)
  const records = loaded.filter((row) => {
    if ((row.storeId ?? "").trim() !== args.storeId) return false
    if (args.excludeId && row.id === args.excludeId) return false
    return true
  })
  return classifyClientIdentity({
    scope: { storeId: args.storeId },
    incoming: args.signals,
    records,
  })
}

function auditFields(ctx: TrustedContext) {
  return cadastrosAuditLogFields(ctx.principal)
}

function auditMetadata(args: {
  ctx: TrustedContext
  operacao: "create" | "update"
  clientId: string
  changedFields: ClientWriteField[]
  outcome: ClientIdentityOutcome
  reviewed: boolean
}): string {
  const audit = auditFields(args.ctx)
  return JSON.stringify({
    entidade: "Cliente",
    operacao: args.operacao,
    clientId: args.clientId,
    storeId: args.ctx.storeId,
    campos: args.changedFields,
    identity: {
      outcome: args.outcome,
      reviewed: args.reviewed,
      autoMerge: false,
      aiDecision: false,
    },
    concurrencyGap: CLIENT_WRITE_CONCURRENCY_GAP,
    ...audit.actorMeta,
  })
}

function identitySourceFor(
  tx: ClientWriteTx,
  deps?: ClientWriteDeps,
): ClientIdentityRecordSource {
  return deps?.identitySource ?? createPrismaClientIdentitySource(tx as never)
}

/**
 * CREATE DENTRO de uma transação já aberta. Sem nested `$transaction`.
 * Callers sem transação DEVEM usar `createClient`.
 */
export async function createClientTx(
  tx: ClientWriteTx,
  context: ClientWriteContext,
  input: ClientWriteInput,
  opts?: ClientWriteOptions,
  deps?: ClientWriteDeps,
): Promise<ClientWriteResult> {
  const trusted = trustedContext(context)
  if ("error" in trusted) return trusted.error
  const { ctx } = trusted

  const normalized = normalizePatch(input ?? {}, { requireName: true })
  if (!normalized.ok) return normalized.error
  const patch = normalized.patch
  if (!patch.name) return clientWriteInvalid(CLIENT_WRITE_MESSAGES.nameRequired, "nome")

  const signals = signalsFromPatchAndExisting(patch)
  const verdict = await classifyIncoming({
    storeId: ctx.storeId,
    signals,
    source: identitySourceFor(tx, deps),
  })
  const review = applyReviewDecision(verdict, "create", opts?.reviewDecision, ctx.principal)
  if (!review.ok) return review.error

  const data: Prisma.ClienteUncheckedCreateInput = {
    storeId: ctx.storeId,
    name: patch.name,
    kind: patch.kind ?? "PF",
    document: patch.documentTouched ? (patch.document ?? "") : "",
    phone: patch.phoneTouched ? patch.phone ?? null : null,
    email: patch.emailTouched ? patch.email ?? null : null,
    city: patch.city ?? "",
    active: patch.active ?? true,
    totalSpent: patch.totalSpent ?? 0,
    lastPurchaseAt: patch.lastPurchaseTouched ? patch.lastPurchaseAt ?? null : null,
    ...(patch.tagsTouched && !patch.tagsClear ? { tags: patch.tags as Prisma.InputJsonValue } : {}),
  }

  const audit = auditFields(ctx)
  const row = await tx.cliente.create({ data, select: { id: true } })
  await tx.logsAuditoria.create({
    data: {
      action: "cliente.create",
      userLabel: audit.userLabel,
      detail: `${audit.userLabel} criou o cliente na loja ${ctx.storeId}.`,
      metadata: auditMetadata({
        ctx,
        operacao: "create",
        clientId: row.id,
        changedFields: patch.changedFields,
        outcome: verdict.outcome,
        reviewed: review.reviewed,
      }),
      source: CLIENT_WRITE_AUDIT_SOURCE,
    },
  })
  return { ok: true, id: row.id, operacao: "create" }
}

export async function createClient(
  context: ClientWriteContext,
  input: ClientWriteInput,
  opts?: ClientWriteOptions,
  deps?: ClientWriteDeps,
): Promise<ClientWriteResult> {
  const trusted = trustedContext(context)
  if ("error" in trusted) return trusted.error
  const db = deps?.db ?? (prisma as unknown as ClientWriteDb)
  const pre = normalizePatch(input ?? {}, { requireName: true })
  if (!pre.ok) return pre.error
  try {
    return await db.$transaction((tx) => createClientTx(tx, context, input, opts, deps))
  } catch (e) {
    if (isPrismaKnownError(e, "P2002")) {
      return {
        ok: false,
        code: "IDENTITY_REVIEW_REQUIRED",
        message: CLIENT_WRITE_MESSAGES.review,
        outcome: "AMBIGUOUS",
      }
    }
    console.error("[client-write-service] create falhou:", e instanceof Error ? e.message : String(e))
    return { ok: false, code: "PERSISTENCE", message: CLIENT_WRITE_MESSAGES.persist }
  }
}

/**
 * UPDATE parcial DENTRO de uma transação já aberta. Sem nested `$transaction`.
 * Cross-store resolve como NOT_FOUND (fail-closed, sem oráculo entre lojas).
 */
export async function updateClientTx(
  tx: ClientWriteTx,
  context: ClientWriteContext,
  clientId: string,
  input: ClientWriteInput,
  opts?: ClientWriteOptions,
  deps?: ClientWriteDeps,
): Promise<ClientWriteResult> {
  const trusted = trustedContext(context)
  if ("error" in trusted) return trusted.error
  const { ctx } = trusted

  const cid = (clientId ?? "").trim()
  if (!cid) return clientWriteInvalid("ID do cliente inválido.", "clientId")

  const normalized = normalizePatch(input ?? {}, { requireName: false })
  if (!normalized.ok) return normalized.error
  const patch = normalized.patch
  if (patch.changedFields.length === 0) {
    return clientWriteInvalid(CLIENT_WRITE_MESSAGES.nothingToUpdate)
  }

  const existing = await tx.cliente.findFirst({
    where: { id: cid, storeId: ctx.storeId },
    select: FOUND_SELECT,
  })
  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: CLIENT_WRITE_MESSAGES.notFound }
  }

  if (patch.identityTouched) {
    const signals = signalsFromPatchAndExisting(patch, existing)
    const verdict = await classifyIncoming({
      storeId: ctx.storeId,
      signals,
      source: identitySourceFor(tx, deps),
      excludeId: cid,
    })
    const review = applyReviewDecision(verdict, "update", opts?.reviewDecision, ctx.principal)
    if (!review.ok) return review.error
    return persistUpdate(tx, ctx, existing, patch, verdict.outcome, review.reviewed)
  }

  return persistUpdate(tx, ctx, existing, patch, "NO_MATCH", false)
}

async function persistUpdate(
  tx: ClientWriteTx,
  ctx: TrustedContext,
  existing: ClientWriteFoundRow,
  patch: NormalizedPatch,
  outcome: ClientIdentityVerdict["outcome"],
  reviewed: boolean,
): Promise<ClientWriteResult> {
  const data: Prisma.ClienteUpdateInput = {}
  if (patch.name !== undefined) data.name = patch.name
  if (patch.kind !== undefined) data.kind = patch.kind
  if (patch.documentTouched) data.document = patch.document ?? ""
  if (patch.phoneTouched) data.phone = patch.phone ?? null
  if (patch.emailTouched) data.email = patch.email ?? null
  if (patch.city !== undefined) data.city = patch.city
  if (patch.tagsTouched) data.tags = patch.tagsClear ? Prisma.DbNull : (patch.tags as Prisma.InputJsonValue)
  if (patch.active !== undefined) data.active = patch.active
  if (patch.totalSpent !== undefined) data.totalSpent = patch.totalSpent
  if (patch.lastPurchaseTouched) data.lastPurchaseAt = patch.lastPurchaseAt ?? null

  const audit = auditFields(ctx)
  try {
    const row = await tx.cliente.update({ where: { id: existing.id }, data, select: { id: true } })
    await tx.logsAuditoria.create({
      data: {
        action: "cliente.update",
        userLabel: audit.userLabel,
        detail: `${audit.userLabel} atualizou o cliente na loja ${ctx.storeId} (campos: ${patch.changedFields.join(", ")}).`,
        metadata: auditMetadata({
          ctx,
          operacao: "update",
          clientId: existing.id,
          changedFields: patch.changedFields,
          outcome,
          reviewed,
        }),
        source: CLIENT_WRITE_AUDIT_SOURCE,
      },
    })
    return { ok: true, id: row.id, operacao: "update" }
  } catch (e) {
    if (isPrismaKnownError(e, "P2025")) {
      return { ok: false, code: "NOT_FOUND", message: CLIENT_WRITE_MESSAGES.notFound }
    }
    // Relança para a TransactionClient abortar: update + audit são atômicos.
    throw e
  }
}

export async function updateClient(
  context: ClientWriteContext,
  clientId: string,
  input: ClientWriteInput,
  opts?: ClientWriteOptions,
  deps?: ClientWriteDeps,
): Promise<ClientWriteResult> {
  const trusted = trustedContext(context)
  if ("error" in trusted) return trusted.error
  const db = deps?.db ?? (prisma as unknown as ClientWriteDb)
  try {
    return await db.$transaction((tx) => updateClientTx(tx, context, clientId, input, opts, deps))
  } catch (e) {
    console.error("[client-write-service] update transacional falhou:", e instanceof Error ? e.message : String(e))
    return { ok: false, code: "PERSISTENCE", message: CLIENT_WRITE_MESSAGES.persist }
  }
}
