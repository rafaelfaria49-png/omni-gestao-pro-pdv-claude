import { PrintCrypto } from "./codec"
import { D05_TARGET, d05IsolationErrors } from "./homologation.mjs"

/**
 * OMNI-PRINT-004C — candidate gate. Direct print stays OFF unless ALL hold:
 *   1. the owner approved D02 (schema), D03 (limits/retention/keys), D04 (transport) and D05 (hardware)
 *      and that approval is recorded by a reviewed commit setting APPROVED_RELEASE below;
 *   2. the deployment sets OMNI_PRINT_DIRECT_ENABLED=1 and the release id in OMNI_PRINT_DIRECT_RELEASE;
 *   3. content/signing keys are provisioned (OMNI_PRINT_CONTENT_KEY / OMNI_PRINT_SIGNING_KEY).
 * Outside NODE_ENV=production a lab can opt in with OMNI_PRINT_DIRECT_LAB=1 (disposable database only).
 * An environment variable alone can never open production while APPROVED_RELEASE is null.
 */
export const CANDIDATE_RELEASE = "OMNI-PRINT-004C-CANDIDATE-1"
export const APPROVED_RELEASE: string | null = null

/**
 * D03-A approved operating values. Content retention is implemented in retention.ts (7 days after
 * proven completion); ledger metadata/evidence are permanent. Production release gates remain closed.
 */
export type DirectPrintPolicy = {
  requestMs: number; authorizationMs: number; contentMs: number; dispatchLeaseMs: number; sendLeaseMs: number; riskMs: number; initialWindowMs: number
  maxCopies: number; maxItems: number; commandBytes: number; snapshotBytes: number; payloadBytes: number
  maxRequestsPerMinute: number; pairingMs: number; agentOnlineMs: number; maxClaim: number
}
export const CANDIDATE_POLICY: DirectPrintPolicy = Object.freeze({
  requestMs: 60_000,
  authorizationMs: 10 * 60_000,
  contentMs: 15 * 60_000,
  dispatchLeaseMs: 20_000,
  // T3 renews the lease for the whole agent budget (status 10 s + submit 20 s + host shutdown 5 s + report), P2-3.
  sendLeaseMs: 60_000,
  // INITIAL is the print right after the sale; older sales need an explicit second copy (P3-4).
  initialWindowMs: 30 * 60_000,
  riskMs: 5 * 60_000,
  maxCopies: 2,
  maxItems: 200,
  commandBytes: 16 * 1024,
  snapshotBytes: 64 * 1024,
  payloadBytes: 64 * 1024,
  maxRequestsPerMinute: 30,
  pairingMs: 10 * 60_000,
  agentOnlineMs: 15_000,
  maxClaim: 4,
})

export type DirectPrintRuntime =
  | { enabled: true; mode: "APPROVED" | "LAB" | "HOMOLOGATION"; crypto: PrintCrypto; policy: DirectPrintPolicy }
  | { enabled: false; reason: string }

export function directPrintRuntimeFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): DirectPrintRuntime {
  const lab = env.OMNI_PRINT_DIRECT_LAB === "1" && env.NODE_ENV !== "production"
  const approved = APPROVED_RELEASE !== null && env.OMNI_PRINT_DIRECT_ENABLED === "1" && env.OMNI_PRINT_DIRECT_RELEASE === APPROVED_RELEASE
  const homologation = env.OMNI_PRINT_DIRECT_ENABLED === "1" && env.OMNI_PRINT_DIRECT_RELEASE === D05_TARGET.release && d05IsolationErrors(env).length === 0
  if (!lab && !approved && !homologation) return { enabled: false, reason: "OWNER_APPROVAL_REQUIRED" }
  const crypto = PrintCrypto.fromBase64(env.OMNI_PRINT_CONTENT_KEY, env.OMNI_PRINT_SIGNING_KEY)
  if (!crypto) return { enabled: false, reason: "PRINT_KEYS_REQUIRED" }
  return { enabled: true, mode: approved ? "APPROVED" : homologation ? "HOMOLOGATION" : "LAB", crypto, policy: CANDIDATE_POLICY }
}
