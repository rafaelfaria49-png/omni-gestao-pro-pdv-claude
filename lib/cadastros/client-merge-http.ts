import { clientPrivateJson } from "@/lib/cadastros/client-private-response"
import {
  CLIENT_MERGE_MESSAGES,
  type ClientMergeFailure,
} from "@/lib/cadastros/client-merge-contract"

/**
 * CAD-R2-018-B — Adapter HTTP fino. Mapeia falha do ClientMergeService
 * para status/body REST sem vazar Prisma, PII ou oráculo cross-store.
 */
export function mapClientMergeFailureToResponse(result: ClientMergeFailure) {
  const body: Record<string, unknown> = { error: result.message, code: result.code }
  if (result.field) body.field = result.field
  if (result.pairOutcome) body.pairOutcome = result.pairOutcome
  if (result.pairReasons) body.pairReasons = result.pairReasons
  if (result.candidateIds) body.candidateIds = result.candidateIds

  switch (result.code) {
    case "VALIDATION":
      return clientPrivateJson(body, { status: 400 })
    case "NOT_FOUND":
      return clientPrivateJson({ error: CLIENT_MERGE_MESSAGES.notFound, code: "NOT_FOUND" }, { status: 404 })
    case "NOT_ELIGIBLE":
    case "IDENTITY_CONFLICT":
    case "AMBIGUOUS":
      return clientPrivateJson(body, { status: 409 })
    case "STALE_PLAN":
      return clientPrivateJson(body, { status: 410 })
    case "UNTRUSTED_SCOPE":
      return clientPrivateJson({ error: result.message, code: result.code }, { status: 401 })
    case "PERSISTENCE":
    default:
      return clientPrivateJson({ error: CLIENT_MERGE_MESSAGES.persist, code: "PERSISTENCE" }, { status: 503 })
  }
}
