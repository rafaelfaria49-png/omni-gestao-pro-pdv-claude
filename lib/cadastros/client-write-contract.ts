/**
 * CAD-R2-008 — Contrato do boundary canônico de escrita de Cliente.
 *
 * Módulo PURO (sem `server-only`, sem Prisma, sem I/O): só tipos e helpers.
 * Pode ser importado por adapters (REST, Action, import) para tipar o resultado.
 * A implementação vive em `lib/cadastros/client-write-service.ts`.
 *
 * Regras de autoridade (R2):
 * - `ClientWriteContext` representa dados JÁ PROVADOS pelo servidor
 *   (gate REST `requireCadastrosHubApi` ou Server Action
 *   `requireCadastrosActionAccess`). Nunca vem do payload do caller.
 * - Campos de identidade/autoria no payload (`storeId`, `userId`, `email`,
 *   `role`, `actor`, `principal`, `owner`, `force`, …) são IGNORADOS —
 *   nunca autoridade.
 * - IA nunca escreve nem decide identidade.
 * - Revisão humana, quando aceita, é um contrato explícito (`reviewDecision`),
 *   nunca `force=true`. Revisão NÃO é auto-merge.
 */
import type { CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"
import type {
  ClientIdentityMatchReason,
  ClientIdentityOutcome,
} from "@/lib/cadastros/client-identity"

/**
 * Contexto confiável de escrita. `storeId` é a loja JÁ AUTORIZADA pelo
 * servidor; `principal` é o ator canônico JÁ DERIVADO da sessão.
 * `principal: null` = sem humano identificado (auditoria registra
 * `userLabel: ""`, sem inventar rótulo).
 */
export type ClientWriteContext = {
  storeId: string
  principal: CadastrosAuditPrincipal | null
}

/**
 * Payload de cadastro de Cliente. União dos contratos já praticados
 * (Action PT, REST EN, import, quick create). Precedência na implementação:
 * chave PT-canônica primeiro (`nome` > `name`, `telefone` > `phone`, …).
 *
 * FORA DO CONTRATO (ignorado quando presente):
 * - autoridade: `storeId`, `userId`, `actor`, `principal`, `force`, …
 * - hard delete / merge.
 */
export type ClientWriteInput = {
  nome?: unknown
  name?: unknown
  tipo?: unknown
  kind?: unknown
  documento?: unknown
  document?: unknown
  telefone?: unknown
  phone?: unknown
  email?: unknown
  cidade?: unknown
  city?: unknown
  tags?: unknown
  active?: unknown
  totalSpent?: unknown
  lastPurchaseAt?: unknown
  /** Chaves extras (aliases, lixo de import). Nunca autoridade. */
  [key: string]: unknown
}

export type ClientWriteOperation = "create" | "update"

export type ClientWriteErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "IDENTITY_REVIEW_REQUIRED"
  | "IDENTITY_CONFLICT"
  | "AMBIGUOUS"
  | "UNTRUSTED_SCOPE"
  | "PERSISTENCE"

export type ClientWriteField =
  | "nome"
  | "kind"
  | "document"
  | "phone"
  | "email"
  | "city"
  | "tags"
  | "active"
  | "totalSpent"
  | "lastPurchaseAt"
  | "clientId"

/**
 * Continuação após revisão humana. Tipada, auditável, vinculada ao
 * veredito ATUAL (não ao que o caller declara).
 *
 * Só `POSSIBLE_CONTACT_MATCH` pode seguir (`PROCEED_CREATE` / `PROCEED_UPDATE`):
 * o humano afirma que NÃO é a mesma pessoa. Nunca vira merge.
 *
 * `EXACT_DOCUMENT_MATCH`, `AMBIGUOUS` e `IDENTITY_CONFLICT` permanecem
 * fail-closed mesmo com decisão.
 */
export type ClientIdentityReviewAction = "PROCEED_CREATE" | "PROCEED_UPDATE"

export type ClientIdentityReviewDecision = {
  expectedOutcome: ClientIdentityOutcome
  expectedCandidateIds: string[]
  action: ClientIdentityReviewAction
}

export type ClientWriteOptions = {
  reviewDecision?: ClientIdentityReviewDecision
}

export type ClientWriteSuccess = {
  ok: true
  id: string
  operacao: ClientWriteOperation
}

export type ClientWriteFailure = {
  ok: false
  code: ClientWriteErrorCode
  message: string
  field?: ClientWriteField
  outcome?: ClientIdentityOutcome
  candidateIds?: string[]
  reasons?: ClientIdentityMatchReason[]
}

export type ClientWriteResult = ClientWriteSuccess | ClientWriteFailure

export const CLIENT_WRITE_MESSAGES = {
  untrusted: "Contexto de escrita não confiável: loja precisa ser provada pelo servidor.",
  notFound: "Cliente não encontrado.",
  nameRequired: 'Campo "nome" é obrigatório.',
  nothingToUpdate: "Nada para atualizar.",
  review:
    "Há um cliente compatível nesta loja. Revisão humana obrigatória — a operação não cria nem mescla automaticamente.",
  exactDocument:
    "Já existe um cliente com o mesmo documento nesta loja. Não é permitido criar outro silenciosamente.",
  conflict: "Conflito de identidade nesta loja. Operação bloqueada.",
  ambiguous: "Identidade ambígua nesta loja. Operação bloqueada.",
  persist: "Não foi possível salvar o cliente. Tente novamente.",
  reviewStale: "A decisão de revisão não corresponde ao veredito atual.",
  reviewNeedsPrincipal: "Revisão humana exige um principal autenticado.",
  reviewNotAllowed: "Este veredito de identidade não admite continuação por revisão.",
} as const

export function clientWriteInvalid(
  message: string,
  field?: ClientWriteField,
): ClientWriteFailure {
  return { ok: false, code: "VALIDATION", message, ...(field ? { field } : {}) }
}

export function clientWriteUntrusted(): ClientWriteFailure {
  return { ok: false, code: "UNTRUSTED_SCOPE", message: CLIENT_WRITE_MESSAGES.untrusted }
}

/** Mensagem segura para import (sem PII). */
export function clientWriteImportMessage(result: ClientWriteFailure): string {
  switch (result.code) {
    case "VALIDATION":
      return result.message
    case "NOT_FOUND":
      return CLIENT_WRITE_MESSAGES.notFound
    case "IDENTITY_REVIEW_REQUIRED":
      return result.outcome === "EXACT_DOCUMENT_MATCH"
        ? CLIENT_WRITE_MESSAGES.exactDocument
        : CLIENT_WRITE_MESSAGES.review
    case "IDENTITY_CONFLICT":
      return CLIENT_WRITE_MESSAGES.conflict
    case "AMBIGUOUS":
      return CLIENT_WRITE_MESSAGES.ambiguous
    case "UNTRUSTED_SCOPE":
      return CLIENT_WRITE_MESSAGES.untrusted
    case "PERSISTENCE":
    default:
      return CLIENT_WRITE_MESSAGES.persist
  }
}
