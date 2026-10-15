import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
import {
  CLIENT_WRITE_MESSAGES,
  type ClientWriteFailure,
} from "@/lib/cadastros/client-write-contract"

/**
 * CAD-R2-008 — Adapter HTTP fino. Mapeia falha do ClientWriteService
 * para status/body REST sem vazar Prisma, PII ou oráculo cross-store.
 */
export function mapClientWriteFailureToResponse(result: ClientWriteFailure) {
  const body: Record<string, unknown> = { error: result.message, code: result.code }
  if (result.field) body.field = result.field
  if (result.outcome) body.outcome = result.outcome
  if (result.candidateIds) body.candidateIds = result.candidateIds
  if (result.reasons) body.reasons = result.reasons

  switch (result.code) {
    case "VALIDATION":
      return clientPrivateJson(body, { status: 400 })
    case "NOT_FOUND":
      return clientPrivateJson({ error: CLIENT_WRITE_MESSAGES.notFound, code: "NOT_FOUND" }, { status: 404 })
    case "IDENTITY_REVIEW_REQUIRED":
    case "IDENTITY_CONFLICT":
    case "AMBIGUOUS":
      return clientPrivateJson(body, { status: 409 })
    case "UNTRUSTED_SCOPE":
      return clientPrivateJson({ error: result.message, code: result.code }, { status: 401 })
    case "PERSISTENCE":
    default:
      return clientPrivateJson({ error: "Falha ao salvar cliente", code: "PERSISTENCE" }, { status: 503 })
  }
}
