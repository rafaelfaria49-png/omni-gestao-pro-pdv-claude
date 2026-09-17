/**
 * Política determinística de dedupe de Cliente.
 *
 * AUTO_MERGE = nunca. IA = nunca. Nome = insuficiente.
 * Dois sinais vazios nunca casam. Documento forte diferente prevalece
 * sobre coincidência de telefone/email/nome.
 */
import type {
  ClientIdentityCandidateRef,
  ClientIdentityMatchReason,
  ClientIdentityOutcome,
  ClientIdentityPairOutcome,
  ClientIdentityRecord,
  ClientIdentityScope,
  ClientIdentitySignals,
  ClientIdentityTelemetry,
  ClientIdentityVerdict,
} from "./types"
import { CLIENT_IDENTITY_AI_DECISION, CLIENT_IDENTITY_AUTO_MERGE } from "./types"
import { hasAnyIdentitySignal, signalsFromRecord } from "./signals"

export type PairClassification = {
  pair: ClientIdentityPairOutcome
  reasons: ClientIdentityMatchReason[]
}

function contactReasons(incoming: ClientIdentitySignals, other: ClientIdentitySignals): ClientIdentityMatchReason[] {
  const phone = incoming.phone.present && other.phone.present && incoming.phone.digits === other.phone.digits
  const email = incoming.email.present && other.email.present && incoming.email.value === other.email.value
  if (phone && email) return ["phone_and_email"]
  if (phone) return ["phone"]
  if (email) return ["email"]
  return []
}

export function classifyIdentityPair(
  incoming: ClientIdentitySignals,
  other: ClientIdentitySignals,
): PairClassification {
  const incomingStrong = incoming.document.present && incoming.document.strong
  const otherStrong = other.document.present && other.document.strong

  if (incomingStrong && otherStrong) {
    if (incoming.document.present && other.document.present && incoming.document.digits === other.document.digits) {
      return { pair: "EXACT_DOCUMENT_MATCH", reasons: ["strong_document"] }
    }
    return { pair: "IDENTITY_CONFLICT", reasons: ["document_conflict"] }
  }

  const contacts = contactReasons(incoming, other)
  if (contacts.length > 0) {
    return { pair: "POSSIBLE_CONTACT_MATCH", reasons: contacts }
  }

  if (incoming.name.present && other.name.present && incoming.name.normalized === other.name.normalized) {
    return { pair: "NO_MATCH", reasons: ["name_insufficient"] }
  }

  return { pair: "NO_MATCH", reasons: [] }
}

function trustedStoreId(scope: ClientIdentityScope | null | undefined): string {
  return typeof scope?.storeId === "string" ? scope.storeId.trim() : ""
}

function telemetryOf(
  outcome: ClientIdentityOutcome,
  signals: ClientIdentitySignals,
  candidateCount: number,
): ClientIdentityTelemetry {
  return {
    storeScoped: true,
    outcome,
    hasStrongDocument: signals.document.present && signals.document.strong,
    hasPhone: signals.phone.present,
    hasEmail: signals.email.present,
    hasName: signals.name.present,
    candidateCount,
    autoMerge: CLIENT_IDENTITY_AUTO_MERGE,
    aiDecision: CLIENT_IDENTITY_AI_DECISION,
  }
}

function verdict(args: {
  storeId: string
  outcome: ClientIdentityOutcome
  signals: ClientIdentitySignals
  candidates: ClientIdentityCandidateRef[]
  reasons: ClientIdentityMatchReason[]
}): ClientIdentityVerdict {
  return {
    outcome: args.outcome,
    autoMerge: CLIENT_IDENTITY_AUTO_MERGE,
    humanReviewRequired: args.outcome !== "NO_MATCH",
    aiDecision: CLIENT_IDENTITY_AI_DECISION,
    storeId: args.storeId,
    candidates: args.candidates,
    reasons: args.reasons,
    telemetry: telemetryOf(args.outcome, args.signals, args.candidates.length),
  }
}

/**
 * Classifica candidatos já carregados. Descarta qualquer registro fora do
 * scope autorizado (sem vazar id/nome/documento de outra unidade).
 */
export function classifyClientIdentity(args: {
  scope: ClientIdentityScope
  incoming: ClientIdentitySignals
  records: readonly ClientIdentityRecord[]
}): ClientIdentityVerdict {
  const storeId = trustedStoreId(args.scope)
  if (!storeId) {
    return verdict({
      storeId: "",
      outcome: "NO_MATCH",
      signals: args.incoming,
      candidates: [],
      reasons: ["untrusted_scope"],
    })
  }

  if (!hasAnyIdentitySignal(args.incoming) && !args.incoming.name.present) {
    return verdict({
      storeId,
      outcome: "NO_MATCH",
      signals: args.incoming,
      candidates: [],
      reasons: ["empty_signals"],
    })
  }

  if (!hasAnyIdentitySignal(args.incoming)) {
    return verdict({
      storeId,
      outcome: "NO_MATCH",
      signals: args.incoming,
      candidates: [],
      reasons: args.incoming.name.present ? ["name_insufficient"] : ["empty_signals"],
    })
  }

  const matched: ClientIdentityCandidateRef[] = []
  let sawCrossStore = false

  for (const record of args.records) {
    const recordStore = typeof record.storeId === "string" ? record.storeId.trim() : ""
    if (!recordStore || recordStore !== storeId) {
      sawCrossStore = true
      continue
    }
    const other = signalsFromRecord(record)
    const { pair, reasons } = classifyIdentityPair(args.incoming, other)
    if (pair === "NO_MATCH") continue
    matched.push({ id: record.id, pair, reasons })
  }

  matched.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const extras: ClientIdentityMatchReason[] = []
  if (sawCrossStore) extras.push("cross_store_ignored")

  if (matched.length === 0) {
    return verdict({
      storeId,
      outcome: "NO_MATCH",
      signals: args.incoming,
      candidates: [],
      reasons: extras,
    })
  }

  const exact = matched.filter((m) => m.pair === "EXACT_DOCUMENT_MATCH")
  const conflicts = matched.filter((m) => m.pair === "IDENTITY_CONFLICT")
  const contacts = matched.filter((m) => m.pair === "POSSIBLE_CONTACT_MATCH")

  if (exact.length > 1) {
    return verdict({
      storeId,
      outcome: "AMBIGUOUS",
      signals: args.incoming,
      candidates: matched,
      reasons: ["multiple_strong_candidates", ...extras],
    })
  }

  if (matched.length > 1 && (exact.length + conflicts.length + contacts.length > 1)) {
    const mixed = exact.length > 0 && conflicts.length > 0
    const manyContacts = contacts.length > 1 && exact.length === 0 && conflicts.length === 0
    const manyConflicts = conflicts.length > 1 && exact.length === 0
    if (mixed || manyContacts || (exact.length === 1 && (contacts.length > 0 || conflicts.length > 0)) || manyConflicts) {
      return verdict({
        storeId,
        outcome: "AMBIGUOUS",
        signals: args.incoming,
        candidates: matched,
        reasons: ["multiple_candidates", ...extras],
      })
    }
  }

  if (conflicts.length === 1 && exact.length === 0 && contacts.length === 0) {
    return verdict({
      storeId,
      outcome: "IDENTITY_CONFLICT",
      signals: args.incoming,
      candidates: matched,
      reasons: ["document_conflict", ...extras],
    })
  }

  if (conflicts.length > 0 && exact.length === 0) {
    return verdict({
      storeId,
      outcome: conflicts.length === 1 && contacts.length === 0 ? "IDENTITY_CONFLICT" : "AMBIGUOUS",
      signals: args.incoming,
      candidates: matched,
      reasons: [conflicts.length === 1 && contacts.length === 0 ? "document_conflict" : "multiple_candidates", ...extras],
    })
  }

  if (exact.length === 1 && contacts.length === 0 && conflicts.length === 0) {
    return verdict({
      storeId,
      outcome: "EXACT_DOCUMENT_MATCH",
      signals: args.incoming,
      candidates: matched,
      reasons: ["strong_document", ...extras],
    })
  }

  if (contacts.length === 1 && exact.length === 0 && conflicts.length === 0) {
    return verdict({
      storeId,
      outcome: "POSSIBLE_CONTACT_MATCH",
      signals: args.incoming,
      candidates: matched,
      reasons: [...contacts[0].reasons, ...extras],
    })
  }

  return verdict({
    storeId,
    outcome: "AMBIGUOUS",
    signals: args.incoming,
    candidates: matched,
    reasons: ["multiple_candidates", ...extras],
  })
}
