/**
 * CAD-R2-018-B — Duplicate discovery read-only de Cliente.
 *
 * server-only: nunca importado por Client Components.
 *
 * Somente leitura, bounded e store-scoped. Usa `client-identity` como fonte
 * de classificação (`classifyIdentityPair` / `classifyClientIdentity`).
 *
 * - Nome sozinho NUNCA gera candidato (sem bucket por nome).
 * - Nenhuma busca cross-store: tudo filtrado pelo scope autorizado.
 * - Bounded: no máximo `MAX_SCAN` linhas varridas e `MAX_GROUPS` grupos.
 * - Não executa merge, não escolhe survivor, não decide nada sozinho:
 *   apenas lista pares com outcome + reasons para revisão humana.
 */
import "server-only"

import { prisma } from "@/lib/prisma"
import {
  classifyClientIdentity,
  classifyIdentityPair,
  lookupKeysFromSignals,
  signalsFromRecord,
  toClientIdentitySignals,
  type ClientIdentityMatchReason,
  type ClientIdentityPairOutcome,
} from "@/lib/cadastros/client-identity"
import { createPrismaClientIdentitySource } from "@/lib/cadastros/client-identity/lookup-prisma"
import type { ClientIdentityRecordSource } from "@/lib/cadastros/client-identity/lookup"

export const DUPLICATE_DISCOVERY_MAX_SCAN = 500
export const DUPLICATE_DISCOVERY_MAX_GROUPS = 50
const DUPLICATE_DISCOVERY_MAX_GROUP_MEMBERS = 10

export type DuplicateScanRow = {
  id: string
  storeId: string
  name: string
  kind: string
  document: string
  phone: string | null
  email: string | null
  city: string
  active: boolean
  updatedAt: Date
}

export type DuplicateScanSource = {
  listClients(storeId: string, take: number): Promise<DuplicateScanRow[]>
  getClient(storeId: string, clientId: string): Promise<DuplicateScanRow | null>
}

const SCAN_SELECT = {
  id: true,
  storeId: true,
  name: true,
  kind: true,
  document: true,
  phone: true,
  email: true,
  city: true,
  active: true,
  updatedAt: true,
} as const

type PrismaScanDelegate = {
  cliente: {
    findMany(args: unknown): Promise<DuplicateScanRow[]>
    findFirst(args: unknown): Promise<DuplicateScanRow | null>
  }
}

export function createPrismaDuplicateScanSource(
  client: PrismaScanDelegate = prisma as unknown as PrismaScanDelegate,
): DuplicateScanSource {
  return {
    async listClients(storeId, take) {
      const sid = storeId.trim()
      if (!sid) return []
      return client.cliente.findMany({
        where: { storeId: sid },
        select: SCAN_SELECT,
        orderBy: { id: "asc" },
        take,
      })
    },
    async getClient(storeId, clientId) {
      const sid = storeId.trim()
      const cid = clientId.trim()
      if (!sid || !cid) return null
      return client.cliente.findFirst({
        where: { id: cid, storeId: sid },
        select: SCAN_SELECT,
      })
    },
  }
}

export type DuplicatePairRef = {
  aId: string
  bId: string
  outcome: ClientIdentityPairOutcome
  reasons: ClientIdentityMatchReason[]
  /** Par pode ser levado à revisão de merge (decisão final é do execute). */
  reviewable: boolean
}

export type DuplicateGroup = {
  key: string
  kind: "EXACT_DOCUMENT" | "CONTACT"
  outcome: ClientIdentityPairOutcome | "AMBIGUOUS"
  reasons: ClientIdentityMatchReason[]
  reviewable: boolean
  truncated: boolean
  memberIds: string[]
  members: DuplicateGroupMember[]
  pairs: DuplicatePairRef[]
}

export type DuplicateGroupMember = {
  id: string
  name: string
  kind: string
  document: string
  phone: string | null
  email: string | null
  city: string
  active: boolean
  updatedAt: string
}

function toMember(row: DuplicateScanRow): DuplicateGroupMember {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    document: row.document,
    phone: row.phone,
    email: row.email,
    city: row.city ?? "",
    active: row.active,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

function isReviewablePair(outcome: ClientIdentityPairOutcome): boolean {
  return outcome === "EXACT_DOCUMENT_MATCH" || outcome === "POSSIBLE_CONTACT_MATCH"
}

function pairRef(aId: string, bId: string, outcome: ClientIdentityPairOutcome, reasons: ClientIdentityMatchReason[]): DuplicatePairRef {
  const [first, second] = aId < bId ? [aId, bId] : [bId, aId]
  return { aId: first, bId: second, outcome, reasons, reviewable: isReviewablePair(outcome) }
}

function buildGroup(args: {
  key: string
  kind: DuplicateGroup["kind"]
  rows: DuplicateScanRow[]
}): DuplicateGroup | null {
  const sorted = [...args.rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (sorted.length < 2) return null
  const truncated = sorted.length > DUPLICATE_DISCOVERY_MAX_GROUP_MEMBERS
  const slice = truncated ? sorted.slice(0, DUPLICATE_DISCOVERY_MAX_GROUP_MEMBERS) : sorted

  const pairs: DuplicatePairRef[] = []
  for (let i = 0; i < slice.length; i++) {
    for (let j = i + 1; j < slice.length; j++) {
      const a = slice[i]
      const b = slice[j]
      const { pair, reasons } = classifyIdentityPair(signalsFromRecord(a), signalsFromRecord(b))
      if (pair === "NO_MATCH") continue
      pairs.push(pairRef(a.id, b.id, pair, reasons))
    }
  }
  if (pairs.length === 0) return null

  // Agregação do grupo: par único e limpo => outcome do par; com 3+ membros
  // ou mistura de outcomes => AMBIGUOUS (mesma semântica agregada do
  // classifyClientIdentity: múltiplos candidatos fortes = fail-closed no
  // nível do grupo; pares individuais seguem selecionáveis explicitamente
  // e o execute revalida o par escolhido).
  let outcome: DuplicateGroup["outcome"]
  let reasons: ClientIdentityMatchReason[]
  let reviewable: boolean
  if (slice.length === 2 && pairs.length === 1) {
    outcome = pairs[0].outcome
    reasons = pairs[0].reasons
    reviewable = pairs[0].reviewable
  } else if (slice.length > 2 && pairs.every((p) => p.outcome === "EXACT_DOCUMENT_MATCH")) {
    outcome = "AMBIGUOUS"
    reasons = ["multiple_strong_candidates"]
    reviewable = false
  } else {
    outcome = "AMBIGUOUS"
    reasons = ["multiple_candidates"]
    reviewable = false
  }

  return {
    key: args.key,
    kind: args.kind,
    outcome,
    reasons,
    reviewable,
    truncated,
    memberIds: slice.map((r) => r.id),
    members: slice.map(toMember),
    pairs,
  }
}

/**
 * Varredura bounded da loja: agrupa por documento forte e por contato
 * (telefone/email normalizados). Nome nunca agrupa.
 */
export async function discoverDuplicateGroups(args: {
  storeId: string
  source?: DuplicateScanSource
  maxScan?: number
  maxGroups?: number
}): Promise<{ groups: DuplicateGroup[]; scanned: number; truncated: boolean }> {
  const storeId = (args.storeId ?? "").trim()
  if (!storeId) return { groups: [], scanned: 0, truncated: false }
  const maxScan = Math.min(Math.max(args.maxScan ?? DUPLICATE_DISCOVERY_MAX_SCAN, 1), DUPLICATE_DISCOVERY_MAX_SCAN)
  const maxGroups = Math.min(Math.max(args.maxGroups ?? DUPLICATE_DISCOVERY_MAX_GROUPS, 1), DUPLICATE_DISCOVERY_MAX_GROUPS)
  const source = args.source ?? createPrismaDuplicateScanSource()

  const rows = (await source.listClients(storeId, maxScan)).filter((r) => (r.storeId ?? "").trim() === storeId)
  const scanned = rows.length
  const truncated = scanned >= maxScan

  const docBuckets = new Map<string, DuplicateScanRow[]>()
  const contactBuckets = new Map<string, DuplicateScanRow[]>()
  for (const row of rows) {
    const signals = signalsFromRecord(row)
    if (signals.document.present && signals.document.strong) {
      const key = `doc:${signals.document.digits}`
      const list = docBuckets.get(key) ?? []
      list.push(row)
      docBuckets.set(key, list)
    }
    if (signals.phone.present) {
      const key = `phone:${signals.phone.digits}`
      const list = contactBuckets.get(key) ?? []
      list.push(row)
      contactBuckets.set(key, list)
    }
    if (signals.email.present) {
      const key = `email:${signals.email.value}`
      const list = contactBuckets.get(key) ?? []
      list.push(row)
      contactBuckets.set(key, list)
    }
  }

  const groups: DuplicateGroup[] = []
  const seenPairs = new Set<string>()
  const pushGroup = (group: DuplicateGroup | null) => {
    if (!group) return
    if (groups.length >= maxGroups) return
    groups.push(group)
    for (const p of group.pairs) seenPairs.add(`${p.aId}|${p.bId}`)
  }

  for (const [key, bucket] of [...docBuckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (bucket.length < 2) continue
    pushGroup(buildGroup({ key, kind: "EXACT_DOCUMENT", rows: bucket }))
    if (groups.length >= maxGroups) break
  }
  if (groups.length < maxGroups) {
    for (const [key, bucket] of [...contactBuckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (bucket.length < 2) continue
      const group = buildGroup({ key, kind: "CONTACT", rows: bucket })
      if (!group) continue
      // Evita repetir o mesmo par já coberto pelo grupo de documento.
      const fresh = group.pairs.filter((p) => !seenPairs.has(`${p.aId}|${p.bId}`))
      if (fresh.length === 0) continue
      pushGroup({ ...group, pairs: fresh })
      if (groups.length >= maxGroups) break
    }
  }

  return { groups, scanned, truncated }
}

export type DuplicateSeedResult = {
  clientId: string
  outcome: "EXACT_DOCUMENT_MATCH" | "POSSIBLE_CONTACT_MATCH" | "AMBIGUOUS" | "IDENTITY_CONFLICT" | "NO_MATCH"
  reasons: ClientIdentityMatchReason[]
  reviewable: boolean
  candidates: Array<{ id: string; pair: ClientIdentityPairOutcome; reasons: ClientIdentityMatchReason[] }>
  seed: DuplicateGroupMember | null
}

/**
 * Descoberta a partir de um cliente semente: classifica o seed contra os
 * candidatos da MESMA loja via `classifyClientIdentity` (semântica agregada
 * canônica, incluindo AMBIGUOUS). O próprio seed é excluído dos candidatos.
 */
export async function discoverForClient(args: {
  storeId: string
  clientId: string
  scanSource?: DuplicateScanSource
  identitySource?: ClientIdentityRecordSource
}): Promise<DuplicateSeedResult> {
  const storeId = (args.storeId ?? "").trim()
  const clientId = (args.clientId ?? "").trim()
  const empty: DuplicateSeedResult = {
    clientId,
    outcome: "NO_MATCH",
    reasons: [],
    reviewable: false,
    candidates: [],
    seed: null,
  }
  if (!storeId || !clientId) return empty

  const scan = args.scanSource ?? createPrismaDuplicateScanSource()
  const seed = await scan.getClient(storeId, clientId)
  if (!seed || (seed.storeId ?? "").trim() !== storeId) return empty

  const signals = toClientIdentitySignals({
    document: seed.document,
    phone: seed.phone,
    email: seed.email,
    name: seed.name,
  })
  const keys = lookupKeysFromSignals(signals)
  const source = args.identitySource ?? createPrismaClientIdentitySource()
  const loaded = await source.findByIdentityKeys(storeId, keys)
  const records = loaded
    .filter((row) => (row.storeId ?? "").trim() === storeId && row.id !== seed.id)
    .map((row) => ({
      id: row.id,
      storeId: row.storeId,
      document: row.document,
      phone: row.phone,
      email: row.email,
      name: row.name,
    }))

  const verdict = classifyClientIdentity({ scope: { storeId }, incoming: signals, records })
  const reviewable =
    (verdict.outcome === "EXACT_DOCUMENT_MATCH" || verdict.outcome === "POSSIBLE_CONTACT_MATCH") &&
    verdict.candidates.length === 1

  return {
    clientId: seed.id,
    outcome: verdict.outcome,
    reasons: verdict.reasons,
    reviewable,
    candidates: verdict.candidates.map((c) => ({ id: c.id, pair: c.pair, reasons: c.reasons })),
    seed: toMember({ ...seed, updatedAt: seed.updatedAt instanceof Date ? seed.updatedAt : new Date(seed.updatedAt) }),
  }
}
