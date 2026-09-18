/**
 * CAD-R2-018-B — Contrato da capability de merge/consolidação de Cliente.
 *
 * Módulo PURO (sem `server-only`, sem Prisma, sem I/O): só tipos e helpers.
 * Pode ser importado por adapters (REST, UI) para tipar plan/execute.
 * A implementação vive em `lib/cadastros/client-merge-service.ts` (server-only).
 *
 * Regras de autoridade (R2):
 * - `ClientMergeContext` representa dados JÁ PROVADOS pelo servidor
 *   (gate REST `requireCadastrosHubApi`). Nunca vem do payload do caller.
 * - `survivorId`/`loserId` são ESCOLHA HUMANA EXPLÍCITA vinda da UI, mas
 *   NUNCA autoridade de identidade: o servidor recarrega ambos, revalida
 *   store, reclassifica o par e só executa com fingerprint válido.
 * - Outcome/candidateIds enviados pelo navegador nunca decidem elegibilidade.
 * - IA nunca escolhe survivor, nunca resolve campos, nunca decide identidade.
 * - Sem `force=true`. Sem auto-merge. Sem merge cross-store. Sem merge em massa.
 */
import type { CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"
import type {
  ClientIdentityMatchReason,
  ClientIdentityPairOutcome,
} from "@/lib/cadastros/client-identity"

/**
 * Contexto confiável de merge. `storeId` é a loja JÁ AUTORIZADA pelo
 * servidor; `principal` é o ator canônico JÁ DERIVADO da sessão.
 */
export type ClientMergeContext = {
  storeId: string
  principal: CadastrosAuditPrincipal | null
}

/**
 * Resolução explícita dos campos finais do survivor.
 * Ausente = mantém o valor atual do survivor. `null` (phone/email) = limpar.
 *
 * Aceita aliases PT/EN com a mesma precedência do ClientWriteService
 * (`nome` > `name`, `telefone` > `phone`, …).
 *
 * FORA DO CONTRATO (ignorado quando presente):
 * - autoridade: `storeId`, `userId`, `actor`, `principal`, `force`, `clientId`, …
 * - `totalSpent` / `lastPurchaseAt`: fonte operacional são os vínculos
 *   (vendas/OS) reassociados — nunca somados nem editados no merge.
 */
export type ClientMergeFieldResolution = {
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
  /** Chaves extras. Nunca autoridade. */
  [key: string]: unknown
}

/** Campos finais resolvidos (nomes canônicos, após normalização do servidor). */
export type ClientMergeResolvedFields = {
  name?: string
  kind?: "PF" | "PJ"
  document?: string
  phone?: string | null
  email?: string | null
  city?: string
  tags?: unknown
  tagsClear?: boolean
  active?: boolean
  changedFields: ClientMergeField[]
}

export type ClientMergeField =
  | "nome"
  | "kind"
  | "document"
  | "phone"
  | "email"
  | "city"
  | "tags"
  | "active"

/** Relações vivas reassociadas loser → survivor (inventário CAD-R2-018-B). */
export type ClientMergeReassignedCounts = {
  ordensServico: number
  vendas: number
  whatsappConversations: number
  clienteCreditos: number
  omniAgentMemories: number
  financialTransactions: number
}

/** Elegibilidade do par (decidida pelo SERVIDOR a cada leitura). */
export type ClientMergeEligibility =
  | "REVIEWABLE_EXACT_DOCUMENT"
  | "REVIEWABLE_CONTACT"
  | "BLOCKED_CONFLICT"
  | "BLOCKED_AMBIGUOUS_GROUP"
  | "BLOCKED_NO_MATCH"
  | "BLOCKED_CROSS_STORE"
  | "BLOCKED_SELF"

/** Plano de merge (preview). Não executa nada. */
export type ClientMergePlan = {
  storeId: string
  survivorId: string
  loserId: string
  pairOutcome: ClientIdentityPairOutcome
  pairReasons: ClientIdentityMatchReason[]
  eligibility: ClientMergeEligibility
  reviewable: boolean
  survivor: ClientMergePartySnapshot
  loser: ClientMergePartySnapshot
  resolvedFields: ClientMergeResolvedFields
  reassigned: ClientMergeReassignedCounts
  fingerprint: string
}

/** Snapshot mínimo das partes para comparação lado a lado (mesma loja). */
export type ClientMergePartySnapshot = {
  id: string
  name: string
  kind: string
  document: string
  phone: string | null
  email: string | null
  city: string
  tags: unknown
  active: boolean
  updatedAt: string
  links: ClientMergeReassignedCounts
}

export type ClientMergeErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "IDENTITY_CONFLICT"
  | "AMBIGUOUS"
  | "STALE_PLAN"
  | "UNTRUSTED_SCOPE"
  | "PERSISTENCE"

export type ClientMergeSuccess = {
  ok: true
  survivorId: string
  loserId: string
  fingerprint: string
  reassigned: ClientMergeReassignedCounts
  fieldsUpdated: ClientMergeField[]
}

export type ClientMergeFailure = {
  ok: false
  code: ClientMergeErrorCode
  message: string
  field?: ClientMergeField
  pairOutcome?: ClientIdentityPairOutcome
  pairReasons?: ClientIdentityMatchReason[]
  candidateIds?: string[]
}

export type ClientMergeResult = ClientMergeSuccess | ClientMergeFailure

/** Ação de auditoria própria do merge (mesma transaction). Sem PII bruta. */
export const CLIENT_MERGE_AUDIT_ACTION = "cliente.merged" as const
export const CLIENT_MERGE_AUDIT_SOURCE = "client-merge-service" as const

export const CLIENT_MERGE_MESSAGES = {
  untrusted: "Contexto de merge não confiável: loja precisa ser provada pelo servidor.",
  survivorRequired: "Escolha explícita do sobrevivente é obrigatória.",
  loserRequired: "Escolha explícita do duplicado a remover é obrigatória.",
  selfMerge: "Sobrevivente e duplicado não podem ser o mesmo cliente.",
  notFound: "Cliente não encontrado nesta loja.",
  crossStore: "Merge entre lojas diferentes é proibido.",
  noMatch: "Os dois clientes não possuem vínculo de identidade revisável.",
  conflict: "Conflito de identidade: documentos fortes diferentes. Merge proibido.",
  ambiguous: "Grupo ambíguo: há mais de um candidato compatível. Resolva explicitamente antes de consolidar.",
  documentDiverged: "Documento forte divergente entre os dois clientes. Merge bloqueado.",
  documentIntroduced: "O merge não pode introduzir um documento novo: use o documento atual do sobrevivente ou do duplicado.",
  stale: "O plano expirou: os clientes ou vínculos mudaram após a revisão. Gere um novo plano.",
  confirmationRequired: "Confirmação destrutiva explícita é obrigatória (survivorId + loserId).",
  persist: "Não foi possível concluir o merge. Nenhuma alteração foi aplicada.",
} as const

export function clientMergeInvalid(
  message: string,
  field?: ClientMergeField,
): ClientMergeFailure {
  return { ok: false, code: "VALIDATION", message, ...(field ? { field } : {}) }
}

export function clientMergeUntrusted(): ClientMergeFailure {
  return { ok: false, code: "UNTRUSTED_SCOPE", message: CLIENT_MERGE_MESSAGES.untrusted }
}
