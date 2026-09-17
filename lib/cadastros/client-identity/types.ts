/**
 * CAD-R2-018-A — Contrato canônico de identidade e dedupe de Cliente.
 *
 * Módulo PURO (sem Prisma, sem I/O, sem `server-only`): só tipos e constantes.
 * Não persiste Cliente. Não faz merge. Não é o ClientWriteService (CAD-R2-008).
 *
 * Autoridade (R2):
 * - `ClientIdentityScope.storeId` é a unidade JÁ PROVADA pelo servidor
 *   (gate REST `requireCadastrosHubApi` ou Server Action
 *   `requireCadastrosActionAccess`). Nunca vem do payload do caller.
 * - `storeId` / `actor` / `userId` no input do caller são IGNORADOS.
 * - IA nunca participa da decisão de identidade.
 *
 * Fluxo: captura → normalização determinística → identidade → detecção
 * de duplicidade/conflito → revisão humana → ClientWriteService
 * (CAD-R2-008) → persistência/auditoria.
 */

/** Unidade autorizada — única fronteira da dedupe. */
export type ClientIdentityScope = {
  storeId: string
}

/**
 * Campos reais do model `Cliente` (schema atual) aceitos como *sinais*.
 * Endereço vive em `tags` e NÃO participa da identidade neste GOAL.
 * `storeId` aqui, se presente, NÃO é autoridade — o scope é.
 */
export type ClientIdentityInput = {
  document?: unknown
  phone?: unknown
  email?: unknown
  name?: unknown
  kind?: unknown
  /** Ignorado como autoridade. Nunca amplia o scope. */
  storeId?: unknown
  actor?: unknown
  userId?: unknown
  [key: string]: unknown
}

export type ClientDocumentKind = "CPF" | "CNPJ" | "UNKNOWN"

export type ClientDocumentSignal =
  | { present: false }
  | {
      present: true
      digits: string
      kind: ClientDocumentKind
      /** Identidade forte só com CPF/CNPJ de dígitos verificadores válidos. */
      strong: boolean
    }

export type ClientPhoneSignal =
  | { present: false }
  | { present: true; digits: string }

export type ClientEmailSignal =
  | { present: false }
  | { present: true; value: string }

export type ClientNameSignal =
  | { present: false }
  | { present: true; normalized: string }

export type ClientIdentitySignals = {
  document: ClientDocumentSignal
  phone: ClientPhoneSignal
  email: ClientEmailSignal
  name: ClientNameSignal
}

export type ClientIdentityOutcome =
  | "NO_MATCH"
  | "EXACT_DOCUMENT_MATCH"
  | "POSSIBLE_CONTACT_MATCH"
  | "AMBIGUOUS"
  | "IDENTITY_CONFLICT"

export type ClientIdentityMatchReason =
  | "strong_document"
  | "phone"
  | "email"
  | "phone_and_email"
  | "document_conflict"
  | "multiple_candidates"
  | "multiple_strong_candidates"
  | "name_insufficient"
  | "empty_signals"
  | "cross_store_ignored"
  | "untrusted_scope"

export type ClientIdentityPairOutcome =
  | "NO_MATCH"
  | "EXACT_DOCUMENT_MATCH"
  | "POSSIBLE_CONTACT_MATCH"
  | "IDENTITY_CONFLICT"

/** Registro já persistido — só o necessário para classificar. Sem endereço. */
export type ClientIdentityRecord = {
  id: string
  storeId: string
  document?: string | null
  phone?: string | null
  email?: string | null
  name?: string | null
}

/**
 * Candidato devolvido ao caller. Só `id` (da unidade autorizada) + classificação.
 * Sem nome/documento/telefone/email — evita vazamento e PII em logs de veredito.
 */
export type ClientIdentityCandidateRef = {
  id: string
  pair: ClientIdentityPairOutcome
  reasons: ClientIdentityMatchReason[]
}

export type ClientIdentityTelemetry = {
  storeScoped: true
  outcome: ClientIdentityOutcome
  hasStrongDocument: boolean
  hasPhone: boolean
  hasEmail: boolean
  hasName: boolean
  candidateCount: number
  autoMerge: false
  aiDecision: false
}

export type ClientIdentityVerdict = {
  outcome: ClientIdentityOutcome
  autoMerge: false
  humanReviewRequired: boolean
  aiDecision: false
  storeId: string
  candidates: ClientIdentityCandidateRef[]
  reasons: ClientIdentityMatchReason[]
  telemetry: ClientIdentityTelemetry
}

/**
 * Handoff puro para o ClientWriteService (CAD-R2-008).
 * Este módulo não persiste Cliente.
 */
export type ClientWriteIdentityHandoff = {
  scope: ClientIdentityScope
  signals: ClientIdentitySignals
  verdict: ClientIdentityVerdict
}

export const CLIENT_IDENTITY_AUTO_MERGE = false as const
export const CLIENT_IDENTITY_AI_DECISION = false as const
/** CAD-R2-008: ClientWriteService implementado. Merge (018-B) continua fora. */
export const CLIENT_WRITE_SERVICE_IMPLEMENTED = true as const
export const CLIENT_MERGE_IMPLEMENTED = false as const
