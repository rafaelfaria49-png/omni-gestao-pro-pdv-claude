/**
 * CAD-R2-018-B — ClientMergeService: capability server-only de merge de Cliente.
 *
 * server-only: nunca importado por Client Components.
 *
 * Fluxo: preview (plan, read-only) → confirmação humana explícita →
 * execute em UMA transaction (lock → revalidar → fingerprint → reassign →
 * campos via ClientWriteService → audit CLIENT_MERGED → delete loser).
 *
 * CAD-R2-019 — compatibilidade com a unique (storeId, documentKey):
 * - Quando o survivor recebe o documento forte do loser, a chave do loser é
 *   liberada (`documentKey = NULL`) ANTES do update do survivor, na MESMA
 *   transaction — sem estado duplicado após commit (o loser é deletado).
 * - P2002 de terceiro concorrente vira AMBIGUOUS fail-closed, nunca
 *   PERSISTENCE genérico.
 *
 * O QUE ESTE SERVIÇO FAZ
 * - Reutiliza `lib/cadastros/client-identity/**` (classificação do par,
 *   sem segundo motor de dedupe, sem IA, sem auto-merge).
 * - Reutiliza `updateClientTx` do ClientWriteService para os campos finais
 *   do survivor (mesma normalização/validação do CRUD), com identity source
 *   que exclui APENAS o loser (absorvido pelo merge); terceiros continuam
 *   bloqueando (fail-closed).
 * - Reassign das 6 referências vivas (OrdemServico, Venda,
 *   WhatsAppConversation, ClienteCredito, OmniAgentMemory,
 *   FinancialTransaction.clienteId) com escopo {clienteId, storeId}.
 * - Snapshots históricos NUNCA tocados (clienteNome, payloads, snapshots
 *   fiscais, logs existentes).
 *
 * O QUE ESTE SERVIÇO NÃO FAZ
 * - Escolher survivor/loser (escolha humana explícita obrigatória).
 * - Merge cross-store, merge em massa, backfill, unique/migration (019).
 * - Somar totalSpent / concatenar tags silenciosamente.
 * - Nested transaction: UMA transaction por execute; qualquer falha aborta
 *   tudo (rollback total). Relação não inventariada que trave o delete
 *   (P2003) causa rollback + report, nunca contorno.
 */
import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { cadastrosAuditLogFields } from "@/lib/cadastros/cadastros-audit-principal"
import {
  classifyClientIdentity,
  classifyIdentityPair,
  lookupKeysFromSignals,
  normalizeDocumentDigits,
  signalsFromRecord,
  toClientIdentitySignals,
  toStrongDocumentKey,
  type ClientIdentityMatchReason,
  type ClientIdentityPairOutcome,
  type ClientIdentityRecordSource,
} from "@/lib/cadastros/client-identity"
import { createPrismaClientIdentitySource } from "@/lib/cadastros/client-identity/lookup-prisma"
import { CLIENT_WRITE_MESSAGES, type ClientWriteFailure } from "@/lib/cadastros/client-write-contract"
import {
  updateClientTx,
  isClientDocumentUniqueViolation,
  type ClientWriteTx,
} from "@/lib/cadastros/client-write-service"
import {
  CLIENT_MERGE_AUDIT_ACTION,
  CLIENT_MERGE_AUDIT_SOURCE,
  CLIENT_MERGE_MESSAGES,
  clientMergeInvalid,
  clientMergeUntrusted,
  type ClientMergeContext,
  type ClientMergeEligibility,
  type ClientMergeFailure,
  type ClientMergeField,
  type ClientMergeFieldResolution,
  type ClientMergePartySnapshot,
  type ClientMergePlan,
  type ClientMergeReassignedCounts,
  type ClientMergeResolvedFields,
  type ClientMergeResult,
} from "@/lib/cadastros/client-merge-contract"

export type ClientMergeRow = {
  id: string
  storeId: string
  name: string
  kind: string
  document: string
  /** Chave canônica CAD-R2-019 (null = vazio/inválido, fora da unique). */
  documentKey: string | null
  phone: string | null
  email: string | null
  city: string
  tags: Prisma.JsonValue | null
  active: boolean
  totalSpent: number
  lastPurchaseAt: Date | null
  updatedAt: Date
}

type CountDelegate = {
  count(args: { where: { clienteId: string; storeId: string } }): Promise<number>
  updateMany(args: { where: { clienteId: string; storeId: string }; data: { clienteId: string } }): Promise<{ count: number }>
}

export type ClientMergeTx = {
  cliente: {
    findFirst(args: Prisma.ClienteFindFirstArgs): Promise<ClientMergeRow | null>
    /**
     * CAD-R2-019: uso restrito à liberação da chave do loser
     * (`documentKey = NULL`) antes do update do survivor. Campos finais do
     * survivor passam SOMENTE por `updateClientTx`.
     */
    update(args: { where: { id: string }; data: { documentKey: null } }): Promise<unknown>
    delete(args: { where: { id: string } }): Promise<unknown>
  }
  ordemServico: CountDelegate
  venda: CountDelegate
  whatsAppConversation: CountDelegate
  clienteCredito: CountDelegate
  omniAgentMemory: CountDelegate
  financialTransaction: CountDelegate
  logsAuditoria: {
    create(args: Prisma.LogsAuditoriaCreateArgs): Promise<unknown>
  }
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
}

export type ClientMergeDb = {
  cliente: {
    findFirst(args: Prisma.ClienteFindFirstArgs): Promise<ClientMergeRow | null>
  }
  ordemServico: Pick<CountDelegate, "count">
  venda: Pick<CountDelegate, "count">
  whatsAppConversation: Pick<CountDelegate, "count">
  clienteCredito: Pick<CountDelegate, "count">
  omniAgentMemory: Pick<CountDelegate, "count">
  financialTransaction: Pick<CountDelegate, "count">
  $transaction<T>(fn: (tx: ClientMergeTx) => Promise<T>): Promise<T>
}

export type ClientMergeDeps = {
  db?: ClientMergeDb
  identitySource?: ClientIdentityRecordSource
}

type TrustedMergeContext = {
  storeId: string
  principal: ClientMergeContext["principal"]
}

const MERGE_SELECT = {
  id: true,
  storeId: true,
  name: true,
  kind: true,
  document: true,
  documentKey: true,
  phone: true,
  email: true,
  city: true,
  tags: true,
  active: true,
  totalSpent: true,
  lastPurchaseAt: true,
  updatedAt: true,
} as const

const REASSIGN_ORDER: ReadonlyArray<{ key: keyof ClientMergeReassignedCounts; delegate: keyof Omit<ClientMergeTx, "cliente" | "logsAuditoria" | "$queryRaw"> }> = [
  { key: "ordensServico", delegate: "ordemServico" },
  { key: "vendas", delegate: "venda" },
  { key: "whatsappConversations", delegate: "whatsAppConversation" },
  { key: "clienteCreditos", delegate: "clienteCredito" },
  { key: "omniAgentMemories", delegate: "omniAgentMemory" },
  { key: "financialTransactions", delegate: "financialTransaction" },
]

/** Erro interno codificado: dentro da transaction, falhar = lançar (rollback). */
class MergeHalt {
  readonly failure: ClientMergeFailure
  constructor(failure: ClientMergeFailure) {
    this.failure = failure
  }
}

function trustedMergeContext(context: ClientMergeContext | null | undefined): { error: ClientMergeFailure } | { ctx: TrustedMergeContext } {
  if (!context) return { error: clientMergeUntrusted() }
  const storeId = (context.storeId ?? "").trim()
  if (!storeId) return { error: clientMergeUntrusted() }
  const principal = context.principal ?? null
  if (principal && !(principal.userId ?? "").trim()) {
    return { error: clientMergeUntrusted() }
  }
  return { ctx: { storeId, principal } }
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function asTrimmedText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim()
  if (typeof value !== "string") return null
  return value.trim()
}

function firstDefined(input: ClientMergeFieldResolution, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
      return input[key]
    }
  }
  return undefined
}

function isPrismaKnownError(e: unknown, code: "P2002" | "P2003" | "P2025"): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === code
  const record = e as { code?: unknown; name?: unknown } | null
  return record?.code === code && String(record?.name ?? "").includes("PrismaClientKnown")
}

/** Dígitos do documento ("" quando ausente). */
function docDigits(value: string | null | undefined): string {
  return normalizeDocumentDigits(value ?? "")
}

function strongDocDigits(row: Pick<ClientMergeRow, "document">): string | null {
  // DV válido = identidade forte (mesma regra do client-identity/document.ts,
  // via a chave canônica CAD-R2-019 — sem validador duplicado).
  return toStrongDocumentKey(row.document)
}

/** Chave armazenada do registro (fonte da verdade para a constraint). */
function storedDocKey(row: Pick<ClientMergeRow, "document" | "documentKey">): string | null {
  if (row.documentKey !== undefined && row.documentKey !== null) return row.documentKey
  return toStrongDocumentKey(row.document)
}

function decideEligibility(args: {
  storeId: string
  survivor: ClientMergeRow
  loser: ClientMergeRow
}): { eligibility: ClientMergeEligibility; pairOutcome: ClientIdentityPairOutcome; pairReasons: ClientIdentityMatchReason[] } {
  if (args.survivor.id === args.loser.id) {
    return { eligibility: "BLOCKED_SELF", pairOutcome: "NO_MATCH", pairReasons: [] }
  }
  if (args.survivor.storeId !== args.storeId || args.loser.storeId !== args.storeId) {
    return { eligibility: "BLOCKED_CROSS_STORE", pairOutcome: "NO_MATCH", pairReasons: ["cross_store_ignored"] }
  }
  // Documento forte válido diferente entre os dois: bloqueio explícito.
  const survivorStrong = strongDocDigits(args.survivor)
  const loserStrong = strongDocDigits(args.loser)
  if (survivorStrong && loserStrong && survivorStrong !== loserStrong) {
    return { eligibility: "BLOCKED_CONFLICT", pairOutcome: "IDENTITY_CONFLICT", pairReasons: ["document_conflict"] }
  }
  const { pair, reasons } = classifyIdentityPair(signalsFromRecord(args.survivor), signalsFromRecord(args.loser))
  if (pair === "EXACT_DOCUMENT_MATCH") {
    return { eligibility: "REVIEWABLE_EXACT_DOCUMENT", pairOutcome: pair, pairReasons: reasons }
  }
  if (pair === "POSSIBLE_CONTACT_MATCH") {
    return { eligibility: "REVIEWABLE_CONTACT", pairOutcome: pair, pairReasons: reasons }
  }
  if (pair === "IDENTITY_CONFLICT") {
    return { eligibility: "BLOCKED_CONFLICT", pairOutcome: pair, pairReasons: reasons }
  }
  return { eligibility: "BLOCKED_NO_MATCH", pairOutcome: pair, pairReasons: reasons }
}

function eligibilityFailure(
  eligibility: ClientMergeEligibility,
  pairOutcome?: ClientIdentityPairOutcome,
  pairReasons?: ClientIdentityMatchReason[],
): ClientMergeFailure {
  const base = {
    ...(pairOutcome ? { pairOutcome } : {}),
    ...(pairReasons ? { pairReasons } : {}),
  }
  switch (eligibility) {
    case "BLOCKED_SELF":
      return { ok: false, code: "VALIDATION", message: CLIENT_MERGE_MESSAGES.selfMerge, ...base }
    case "BLOCKED_CROSS_STORE":
      return { ok: false, code: "NOT_ELIGIBLE", message: CLIENT_MERGE_MESSAGES.crossStore, ...base }
    case "BLOCKED_CONFLICT":
      return { ok: false, code: "IDENTITY_CONFLICT", message: CLIENT_MERGE_MESSAGES.conflict, ...base }
    case "BLOCKED_AMBIGUOUS_GROUP":
      return { ok: false, code: "AMBIGUOUS", message: CLIENT_MERGE_MESSAGES.ambiguous, ...base }
    case "BLOCKED_NO_MATCH":
    default:
      return { ok: false, code: "NOT_ELIGIBLE", message: CLIENT_MERGE_MESSAGES.noMatch, ...base }
  }
}

/**
 * Normaliza a resolução de campos (servidor). Ausente = mantém survivor.
 * `totalSpent`/`lastPurchaseAt`/autoridade são ignorados (nunca via merge).
 */
function normalizeResolution(
  input: ClientMergeFieldResolution | null | undefined,
): { ok: true; resolved: ClientMergeResolvedFields } | { ok: false; error: ClientMergeFailure } {
  const src = input ?? {}
  const resolved: ClientMergeResolvedFields = { changedFields: [] }

  const rawName = firstDefined(src, "nome", "name")
  if (rawName !== undefined) {
    const name = asTrimmedText(rawName)
    if (name === null || name === "") {
      return { ok: false, error: clientMergeInvalid(CLIENT_WRITE_MESSAGES.nameRequired, "nome") }
    }
    resolved.name = name
    resolved.changedFields.push("nome")
  }

  const rawKind = firstDefined(src, "tipo", "kind")
  if (rawKind !== undefined) {
    if (typeof rawKind !== "string") {
      return { ok: false, error: clientMergeInvalid('Campo "kind" inválido.', "kind") }
    }
    const upper = rawKind.trim().toUpperCase()
    if (upper !== "PF" && upper !== "PJ") {
      return { ok: false, error: clientMergeInvalid('Campo "kind" inválido.', "kind") }
    }
    resolved.kind = upper
    resolved.changedFields.push("kind")
  }

  const rawDocument = firstDefined(src, "documento", "document")
  if (rawDocument !== undefined) {
    const document = asTrimmedText(rawDocument)
    if (document === null) {
      return { ok: false, error: clientMergeInvalid('Campo "document" inválido.', "document") }
    }
    resolved.document = document ?? ""
    resolved.changedFields.push("document")
  }

  const rawPhone = firstDefined(src, "telefone", "phone")
  if (rawPhone !== undefined) {
    if (rawPhone === null) {
      resolved.phone = null
    } else {
      const phone = asTrimmedText(rawPhone)
      if (phone === null) {
        return { ok: false, error: clientMergeInvalid('Campo "phone" inválido.', "phone") }
      }
      resolved.phone = phone || null
    }
    resolved.changedFields.push("phone")
  }

  const rawEmail = firstDefined(src, "email")
  if (rawEmail !== undefined) {
    if (rawEmail === null) {
      resolved.email = null
    } else {
      const email = asTrimmedText(rawEmail)
      if (email === null) {
        return { ok: false, error: clientMergeInvalid('Campo "email" inválido.', "email") }
      }
      resolved.email = email || null
    }
    resolved.changedFields.push("email")
  }

  const rawCity = firstDefined(src, "cidade", "city")
  if (rawCity !== undefined) {
    const city = asTrimmedText(rawCity)
    if (city === null) {
      return { ok: false, error: clientMergeInvalid('Campo "city" inválido.', "city") }
    }
    resolved.city = city ?? ""
    resolved.changedFields.push("city")
  }

  if (Object.prototype.hasOwnProperty.call(src, "tags")) {
    resolved.tags = (src.tags ?? null) as unknown
    resolved.tagsClear = src.tags === null
    resolved.changedFields.push("tags")
  }

  if (src.active !== undefined) {
    if (typeof src.active !== "boolean") {
      return { ok: false, error: clientMergeInvalid('Campo "active" inválido.', "active") }
    }
    resolved.active = src.active
    resolved.changedFields.push("active")
  }

  return { ok: true, resolved }
}

/** Valor final do documento após a resolução (default = atual do survivor). */
function finalDocument(survivor: ClientMergeRow, resolved: ClientMergeResolvedFields): string {
  return resolved.document !== undefined ? resolved.document : (survivor.document ?? "")
}

/**
 * O merge nunca introduz documento novo: o final precisa pertencer ao par.
 * Com documento forte no par, o final precisa ser exatamente ele.
 */
function checkDocumentMembership(
  survivor: ClientMergeRow,
  loser: ClientMergeRow,
  resolved: ClientMergeResolvedFields,
): ClientMergeFailure | null {
  if (resolved.document === undefined) return null
  const survivorStrong = strongDocDigits(survivor)
  const loserStrong = strongDocDigits(loser)
  const required = survivorStrong ?? loserStrong
  const finalDigits = docDigits(finalDocument(survivor, resolved))
  if (required) {
    if (finalDigits !== required) {
      return {
        ok: false,
        code: "NOT_ELIGIBLE",
        message: CLIENT_MERGE_MESSAGES.documentDiverged,
        pairOutcome: "IDENTITY_CONFLICT",
        pairReasons: ["document_conflict"],
      }
    }
    return null
  }
  const allowed = new Set([docDigits(survivor.document), docDigits(loser.document)])
  if (!allowed.has(finalDigits)) {
    return { ok: false, code: "VALIDATION", message: CLIENT_MERGE_MESSAGES.documentIntroduced, field: "document" }
  }
  return null
}

/** Sinais finais do survivor (resolução aplicada) para checagem de terceiros. */
function finalSignals(survivor: ClientMergeRow, resolved: ClientMergeResolvedFields) {
  return {
    document: finalDocument(survivor, resolved),
    phone: resolved.phone !== undefined ? resolved.phone : survivor.phone,
    email: resolved.email !== undefined ? resolved.email : survivor.email,
    name: resolved.name !== undefined ? resolved.name : survivor.name,
  }
}

function toSnapshot(row: ClientMergeRow, links: ClientMergeReassignedCounts): ClientMergePartySnapshot {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    document: row.document,
    phone: row.phone,
    email: row.email,
    city: row.city,
    tags: row.tags,
    active: row.active,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    links,
  }
}

function zeroCounts(): ClientMergeReassignedCounts {
  return {
    ordensServico: 0,
    vendas: 0,
    whatsappConversations: 0,
    clienteCreditos: 0,
    omniAgentMemories: 0,
    financialTransactions: 0,
  }
}

async function countLinks(
  client: {
    [K in (typeof REASSIGN_ORDER)[number]["delegate"]]: Pick<CountDelegate, "count">
  },
  storeId: string,
  clientId: string,
): Promise<ClientMergeReassignedCounts> {
  const counts = zeroCounts()
  await Promise.all(
    REASSIGN_ORDER.map(async ({ key, delegate }) => {
      counts[key] = await client[delegate].count({ where: { clienteId: clientId, storeId } })
    }),
  )
  return counts
}

/** Canonicalização da resolução para o fingerprint (tags via hash). */
function canonicalResolution(resolved: ClientMergeResolvedFields): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (resolved.name !== undefined) out.name = resolved.name
  if (resolved.kind !== undefined) out.kind = resolved.kind
  if (resolved.document !== undefined) out.document = resolved.document
  if (resolved.phone !== undefined) out.phone = resolved.phone
  if (resolved.email !== undefined) out.email = resolved.email
  if (resolved.city !== undefined) out.city = resolved.city
  if (resolved.tags !== undefined || resolved.tagsClear) {
    out.tagsHash = createHash("sha256").update(JSON.stringify(resolved.tags ?? null)).digest("hex")
    if (resolved.tagsClear) out.tagsClear = true
  }
  if (resolved.active !== undefined) out.active = resolved.active
  return out
}

function fingerprintOf(args: {
  storeId: string
  survivor: ClientMergeRow
  loser: ClientMergeRow
  pairOutcome: ClientIdentityPairOutcome
  pairReasons: ClientIdentityMatchReason[]
  resolved: ClientMergeResolvedFields
  reassigned: ClientMergeReassignedCounts
}): string {
  const canonical = JSON.stringify({
    v: 1,
    store: args.storeId,
    survivor: args.survivor.id,
    loser: args.loser.id,
    survivorUpdatedAt: args.survivor.updatedAt instanceof Date ? args.survivor.updatedAt.toISOString() : String(args.survivor.updatedAt),
    loserUpdatedAt: args.loser.updatedAt instanceof Date ? args.loser.updatedAt.toISOString() : String(args.loser.updatedAt),
    pairOutcome: args.pairOutcome,
    pairReasons: [...args.pairReasons].sort(),
    resolution: canonicalResolution(args.resolved),
    deps: {
      clienteCreditos: args.reassigned.clienteCreditos,
      financialTransactions: args.reassigned.financialTransactions,
      omniAgentMemories: args.reassigned.omniAgentMemories,
      ordensServico: args.reassigned.ordensServico,
      vendas: args.reassigned.vendas,
      whatsappConversations: args.reassigned.whatsappConversations,
    },
  })
  return createHash("sha256").update(canonical).digest("hex")
}

function sameFingerprint(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8")
  const bBuf = Buffer.from(b, "utf8")
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

function excludingSource(source: ClientIdentityRecordSource, excludeId: string): ClientIdentityRecordSource {
  return {
    findByIdentityKeys: async (storeId, keys) => {
      const rows = await source.findByIdentityKeys(storeId, keys)
      return rows.filter((row) => row.id !== excludeId)
    },
  }
}

/**
 * Checagem de terceiros: o survivor final não pode colidir com nenhum outro
 * cliente da loja além do loser (que será absorvido). Qualquer outcome
 * diferente de NO_MATCH bloqueia o par como grupo ambíguo.
 */
async function checkThirdParties(args: {
  storeId: string
  survivor: ClientMergeRow
  loserId: string
  resolved: ClientMergeResolvedFields
  source: ClientIdentityRecordSource
}): Promise<{ blocked: false } | { blocked: true; outcome: string; candidateIds: string[] }> {
  const signals = toClientIdentitySignals(finalSignals(args.survivor, args.resolved))
  const keys = lookupKeysFromSignals(signals)
  const loaded = await args.source.findByIdentityKeys(args.storeId, keys)
  const records = loaded.filter((row) => {
    if ((row.storeId ?? "").trim() !== args.storeId) return false
    if (row.id === args.survivor.id) return false
    if (row.id === args.loserId) return false
    return true
  })
  if (records.length === 0) return { blocked: false }
  const verdict = classifyClientIdentity({ scope: { storeId: args.storeId }, incoming: signals, records })
  if (verdict.outcome === "NO_MATCH") return { blocked: false }
  return { blocked: true, outcome: verdict.outcome, candidateIds: verdict.candidates.map((c) => c.id) }
}

export type ClientMergePlanInput = {
  survivorId: string
  loserId: string
  resolution?: ClientMergeFieldResolution
}

function validatePairInput(
  input: ClientMergePlanInput | null | undefined,
): { error: ClientMergeFailure } | { survivorId: string; loserId: string } {
  const survivorId = cleanId(input?.survivorId)
  const loserId = cleanId(input?.loserId)
  if (!survivorId) {
    return { error: clientMergeInvalid(CLIENT_MERGE_MESSAGES.survivorRequired) }
  }
  if (!loserId) {
    return { error: clientMergeInvalid(CLIENT_MERGE_MESSAGES.loserRequired) }
  }
  if (survivorId === loserId) {
    return { error: { ok: false, code: "VALIDATION", message: CLIENT_MERGE_MESSAGES.selfMerge } }
  }
  return { survivorId, loserId }
}

function defaultSource(deps?: ClientMergeDeps): ClientIdentityRecordSource {
  return deps?.identitySource ?? createPrismaClientIdentitySource()
}

async function findParty(
  reader: {
    cliente: {
      findFirst(args: Prisma.ClienteFindFirstArgs): Promise<ClientMergeRow | null>
    }
  },
  storeId: string,
  clientId: string,
): Promise<ClientMergeRow | null> {
  const row = await reader.cliente.findFirst({ where: { id: clientId, storeId }, select: MERGE_SELECT })
  if (!row || row.storeId !== storeId) return null
  return row
}

/**
 * Preview read-only: valida o par, a resolução e terceiros, conta vínculos
 * e devolve o plano com fingerprint. Não escreve nada.
 */
export async function buildMergePlan(
  context: ClientMergeContext,
  input: ClientMergePlanInput,
  deps?: ClientMergeDeps,
): Promise<ClientMergePlan | ClientMergeFailure> {
  const trusted = trustedMergeContext(context)
  if ("error" in trusted) return trusted.error
  const { ctx } = trusted

  const ids = validatePairInput(input)
  if ("error" in ids) return ids.error

  const normalized = normalizeResolution(input?.resolution)
  if (!normalized.ok) return normalized.error
  const resolved = normalized.resolved

  const reader: ClientMergeDb = deps?.db ?? (prisma as unknown as ClientMergeDb)

  const survivor = await findParty(reader, ctx.storeId, ids.survivorId)
  if (!survivor) {
    return { ok: false, code: "NOT_FOUND", message: CLIENT_MERGE_MESSAGES.notFound }
  }
  const loser = await findParty(reader, ctx.storeId, ids.loserId)
  if (!loser) {
    return { ok: false, code: "NOT_FOUND", message: CLIENT_MERGE_MESSAGES.notFound }
  }

  const decided = decideEligibility({ storeId: ctx.storeId, survivor, loser })
  if (decided.eligibility !== "REVIEWABLE_EXACT_DOCUMENT" && decided.eligibility !== "REVIEWABLE_CONTACT") {
    return eligibilityFailure(decided.eligibility, decided.pairOutcome, decided.pairReasons)
  }

  const membership = checkDocumentMembership(survivor, loser, resolved)
  if (membership) return membership

  const third = await checkThirdParties({
    storeId: ctx.storeId,
    survivor,
    loserId: loser.id,
    resolved,
    source: defaultSource(deps),
  })
  if (third.blocked) {
    return {
      ok: false,
      code: "AMBIGUOUS",
      message: CLIENT_MERGE_MESSAGES.ambiguous,
      pairOutcome: decided.pairOutcome,
      pairReasons: decided.pairReasons,
      candidateIds: third.candidateIds,
    }
  }

  const [survivorLinks, loserLinks] = await Promise.all([
    countLinks(reader, ctx.storeId, survivor.id),
    countLinks(reader, ctx.storeId, loser.id),
  ])

  const fingerprint = fingerprintOf({
    storeId: ctx.storeId,
    survivor,
    loser,
    pairOutcome: decided.pairOutcome,
    pairReasons: decided.pairReasons,
    resolved,
    reassigned: loserLinks,
  })

  return {
    storeId: ctx.storeId,
    survivorId: survivor.id,
    loserId: loser.id,
    pairOutcome: decided.pairOutcome,
    pairReasons: decided.pairReasons,
    eligibility: decided.eligibility,
    reviewable: true,
    survivor: toSnapshot(survivor, survivorLinks),
    loser: toSnapshot(loser, loserLinks),
    resolvedFields: resolved,
    reassigned: loserLinks,
    fingerprint,
  }
}

function pairOutcomeOf(outcome: ClientWriteFailure["outcome"]): ClientIdentityPairOutcome | undefined {
  return outcome === "NO_MATCH" ||
    outcome === "EXACT_DOCUMENT_MATCH" ||
    outcome === "POSSIBLE_CONTACT_MATCH" ||
    outcome === "IDENTITY_CONFLICT"
    ? outcome
    : undefined
}

function mapWriteFailureToHalt(failure: ClientWriteFailure): MergeHalt {
  switch (failure.code) {
    case "NOT_FOUND":
      return new MergeHalt({ ok: false, code: "STALE_PLAN", message: CLIENT_MERGE_MESSAGES.stale })
    case "IDENTITY_REVIEW_REQUIRED":
    case "AMBIGUOUS":
      return new MergeHalt({
        ok: false,
        code: "AMBIGUOUS",
        message: CLIENT_MERGE_MESSAGES.ambiguous,
        pairOutcome: pairOutcomeOf(failure.outcome),
        pairReasons: failure.reasons,
        candidateIds: failure.candidateIds,
      })
    case "IDENTITY_CONFLICT":
      return new MergeHalt({
        ok: false,
        code: "IDENTITY_CONFLICT",
        message: CLIENT_MERGE_MESSAGES.conflict,
        pairOutcome: pairOutcomeOf(failure.outcome),
        pairReasons: failure.reasons,
        candidateIds: failure.candidateIds,
      })
    case "UNTRUSTED_SCOPE":
      return new MergeHalt({ ok: false, code: "UNTRUSTED_SCOPE", message: failure.message })
    case "PERSISTENCE":
      return new MergeHalt({ ok: false, code: "PERSISTENCE", message: CLIENT_MERGE_MESSAGES.persist })
    case "VALIDATION":
    default: {
      const field = failure.field
      const mergeField: ClientMergeField | undefined =
        field === "nome" ||
        field === "kind" ||
        field === "document" ||
        field === "phone" ||
        field === "email" ||
        field === "city" ||
        field === "tags" ||
        field === "active"
          ? field
          : undefined
      return new MergeHalt({
        ok: false,
        code: "VALIDATION",
        message: failure.message,
        ...(mergeField ? { field: mergeField } : {}),
      })
    }
  }
}

export type ClientMergeExecuteInput = ClientMergePlanInput & {
  fingerprint: string
  confirmation: { survivorId: unknown; loserId: unknown }
}

/**
 * Execução em UMA transaction: lock consultivo → recarrega → revalida store,
 * identidade e fingerprint → reassign → campos via ClientWriteService →
 * audit CLIENT_MERGED → delete loser → commit. Qualquer falha lança
 * (rollback total). Sem nested transaction.
 */
export async function executeMerge(
  context: ClientMergeContext,
  input: ClientMergeExecuteInput,
  deps?: ClientMergeDeps,
): Promise<ClientMergeResult> {
  const trusted = trustedMergeContext(context)
  if ("error" in trusted) return trusted.error
  const { ctx } = trusted

  const ids = validatePairInput(input)
  if ("error" in ids) return ids.error

  const fingerprint = typeof input?.fingerprint === "string" ? input.fingerprint.trim() : ""
  if (!fingerprint) {
    return { ok: false, code: "STALE_PLAN", message: CLIENT_MERGE_MESSAGES.stale }
  }
  const confirmation = input?.confirmation
  if (
    !confirmation ||
    cleanId(confirmation.survivorId) !== ids.survivorId ||
    cleanId(confirmation.loserId) !== ids.loserId
  ) {
    return { ok: false, code: "VALIDATION", message: CLIENT_MERGE_MESSAGES.confirmationRequired }
  }

  const normalized = normalizeResolution(input?.resolution)
  if (!normalized.ok) return normalized.error
  const resolved = normalized.resolved

  const db: ClientMergeDb = deps?.db ?? (prisma as unknown as ClientMergeDb)

  try {
    return await db.$transaction(async (tx) => {
      // Lock consultivo transacional: serializa merges concorrentes do mesmo
      // par na mesma loja. O segundo espera o commit e revalida (fail-closed).
      const lockKey = `client-merge:${ctx.storeId}:${[ids.survivorId, ids.loserId].sort().join(":")}`
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS lock`

      const survivor = await findParty(tx, ctx.storeId, ids.survivorId)
      if (!survivor) {
        throw new MergeHalt({ ok: false, code: "STALE_PLAN", message: CLIENT_MERGE_MESSAGES.stale })
      }
      const loser = await findParty(tx, ctx.storeId, ids.loserId)
      if (!loser) {
        throw new MergeHalt({ ok: false, code: "STALE_PLAN", message: CLIENT_MERGE_MESSAGES.stale })
      }

      const decided = decideEligibility({ storeId: ctx.storeId, survivor, loser })
      if (decided.eligibility !== "REVIEWABLE_EXACT_DOCUMENT" && decided.eligibility !== "REVIEWABLE_CONTACT") {
        throw new MergeHalt(eligibilityFailure(decided.eligibility, decided.pairOutcome, decided.pairReasons))
      }

      const membership = checkDocumentMembership(survivor, loser, resolved)
      if (membership) throw new MergeHalt(membership)

      const txSource = createPrismaClientIdentitySource(
        tx as unknown as Parameters<typeof createPrismaClientIdentitySource>[0],
      )
      const baseSource = deps?.identitySource ?? txSource
      const third = await checkThirdParties({
        storeId: ctx.storeId,
        survivor,
        loserId: loser.id,
        resolved,
        source: baseSource,
      })
      if (third.blocked) {
        throw new MergeHalt({
          ok: false,
          code: "AMBIGUOUS",
          message: CLIENT_MERGE_MESSAGES.ambiguous,
          pairOutcome: decided.pairOutcome,
          pairReasons: decided.pairReasons,
          candidateIds: third.candidateIds,
        })
      }

      const reassigned = await countLinks(tx, ctx.storeId, loser.id)
      const expected = fingerprintOf({
        storeId: ctx.storeId,
        survivor,
        loser,
        pairOutcome: decided.pairOutcome,
        pairReasons: decided.pairReasons,
        resolved,
        reassigned,
      })
      if (!sameFingerprint(fingerprint, expected)) {
        throw new MergeHalt({ ok: false, code: "STALE_PLAN", message: CLIENT_MERGE_MESSAGES.stale })
      }

      // 4. Reassign de todas as referências vivas (escopo loja + loser).
      const moved = zeroCounts()
      for (const { key, delegate } of REASSIGN_ORDER) {
        const res = await tx[delegate].updateMany({
          where: { clienteId: loser.id, storeId: ctx.storeId },
          data: { clienteId: survivor.id },
        })
        moved[key] = res.count
      }

      // 5. Campos finais do survivor via ClientWriteService (mesma validação
      // do CRUD). O loser é excluído do gate de identidade porque está sendo
      // absorvido; terceiros continuam bloqueando.
      if (resolved.changedFields.length > 0) {
        // CAD-R2-019-LOSER-KEY-RELEASE: se o survivor vai persistir a mesma
        // chave forte que o loser ainda detém, libera a chave do loser ANTES
        // (mesma tx). Sem isso a unique (storeId, documentKey) bloquearia a
        // transferência. O loser é deletado nesta mesma transaction: nenhum
        // estado duplicado existe após commit. Escopo restrito a
        // documentKey=NULL no loser — campos finais seguem via updateClientTx.
        const finalKey = resolved.document !== undefined ? toStrongDocumentKey(finalDocument(survivor, resolved)) : null
        if (finalKey !== null && storedDocKey(loser) === finalKey) {
          try {
            await tx.cliente.update({ where: { id: loser.id }, data: { documentKey: null } })
          } catch {
            throw new MergeHalt({ ok: false, code: "PERSISTENCE", message: CLIENT_MERGE_MESSAGES.persist })
          }
        }
        const writeInput = {
          ...(resolved.name !== undefined ? { name: resolved.name } : {}),
          ...(resolved.kind !== undefined ? { kind: resolved.kind } : {}),
          ...(resolved.document !== undefined ? { document: resolved.document } : {}),
          ...(resolved.phone !== undefined ? { phone: resolved.phone } : {}),
          ...(resolved.email !== undefined ? { email: resolved.email } : {}),
          ...(resolved.city !== undefined ? { city: resolved.city } : {}),
          ...(resolved.tags !== undefined || resolved.tagsClear ? { tags: resolved.tagsClear ? null : resolved.tags } : {}),
          ...(resolved.active !== undefined ? { active: resolved.active } : {}),
        }
        let written: Awaited<ReturnType<typeof updateClientTx>>
        try {
          written = await updateClientTx(
            tx as unknown as ClientWriteTx,
            { storeId: ctx.storeId, principal: ctx.principal },
            survivor.id,
            writeInput,
            undefined,
            { identitySource: excludingSource(baseSource, loser.id) },
          )
        } catch (e) {
          // CAD-R2-019: terceiro concorrente com o mesmo documento forte
          // trava no banco → AMBIGUOUS fail-closed (revisão humana), nunca
          // PERSISTENCE genérico.
          if (isClientDocumentUniqueViolation(e)) {
            throw new MergeHalt({
              ok: false,
              code: "AMBIGUOUS",
              message: CLIENT_MERGE_MESSAGES.ambiguous,
              pairOutcome: "EXACT_DOCUMENT_MATCH",
              pairReasons: ["strong_document"],
            })
          }
          throw new MergeHalt({ ok: false, code: "PERSISTENCE", message: CLIENT_MERGE_MESSAGES.persist })
        }
        if (!written.ok) {
          if (written.code === "VALIDATION" && written.message === CLIENT_WRITE_MESSAGES.nothingToUpdate) {
            // Resolução sem mudança efetiva: segue o merge (consolidação pura).
          } else {
            throw mapWriteFailureToHalt(written)
          }
        }
      }

      // 6. Auditoria própria na mesma transaction (sem PII bruta).
      const audit = cadastrosAuditLogFields(ctx.principal)
      const totalMoved =
        moved.ordensServico + moved.vendas + moved.whatsappConversations +
        moved.clienteCreditos + moved.omniAgentMemories + moved.financialTransactions
      try {
        await tx.logsAuditoria.create({
          data: {
            action: CLIENT_MERGE_AUDIT_ACTION,
            userLabel: audit.userLabel,
            detail: `${audit.userLabel} consolidou 2 cadastros de cliente na loja ${ctx.storeId} (${totalMoved} vínculos transferidos).`,
            metadata: JSON.stringify({
              entidade: "Cliente",
              operacao: "merge",
              storeId: ctx.storeId,
              survivorId: survivor.id,
              loserId: loser.id,
              pairOutcome: decided.pairOutcome,
              pairReasons: decided.pairReasons,
              campos: resolved.changedFields,
              reassigned: moved,
              fingerprint: expected.slice(0, 16),
              identity: { autoMerge: false, aiDecision: false },
              ...audit.actorMeta,
            }),
            source: CLIENT_MERGE_AUDIT_SOURCE,
          },
        })
      } catch {
        throw new MergeHalt({ ok: false, code: "PERSISTENCE", message: CLIENT_MERGE_MESSAGES.persist })
      }

      // 7. Remove o loser somente após reassign + auditoria. Relação não
      // inventariada que trave o delete causa rollback + report, nunca contorno.
      try {
        await tx.cliente.delete({ where: { id: loser.id } })
      } catch (e) {
        if (isPrismaKnownError(e, "P2025")) {
          throw new MergeHalt({ ok: false, code: "STALE_PLAN", message: CLIENT_MERGE_MESSAGES.stale })
        }
        throw new MergeHalt({ ok: false, code: "PERSISTENCE", message: CLIENT_MERGE_MESSAGES.persist })
      }

      return {
        ok: true,
        survivorId: survivor.id,
        loserId: loser.id,
        fingerprint: expected,
        reassigned: moved,
        fieldsUpdated: resolved.changedFields,
      }
    })
  } catch (e) {
    if (e instanceof MergeHalt) return e.failure
    // CAD-R2-019: P2002 escapando de outro ponto da transaction (terceiro
    // concorrente) também é colisão de documento forte → fail-closed.
    if (isClientDocumentUniqueViolation(e)) {
      return {
        ok: false,
        code: "AMBIGUOUS",
        message: CLIENT_MERGE_MESSAGES.ambiguous,
        pairOutcome: "EXACT_DOCUMENT_MATCH",
        pairReasons: ["strong_document"],
      }
    }
    if (isPrismaKnownError(e, "P2003") || isPrismaKnownError(e, "P2025")) {
      return { ok: false, code: "PERSISTENCE", message: CLIENT_MERGE_MESSAGES.persist }
    }
    // Log de servidor sem PII: só o estágio.
    console.error("[client-merge-service] merge transacional falhou")
    return { ok: false, code: "PERSISTENCE", message: CLIENT_MERGE_MESSAGES.persist }
  }
}
