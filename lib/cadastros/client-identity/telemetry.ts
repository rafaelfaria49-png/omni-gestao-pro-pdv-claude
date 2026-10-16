/**
 * Telemetria sanitizada da identidade de Cliente.
 * Nunca inclui CPF/CNPJ, email, telefone, nome ou id de outra unidade.
 */
import type { ClientIdentityTelemetry, ClientIdentityVerdict } from "./types"

export function sanitizedClientIdentityTelemetry(verdict: ClientIdentityVerdict): ClientIdentityTelemetry {
  const t = verdict.telemetry
  return {
    storeScoped: true, outcome: t.outcome, hasStrongDocument: t.hasStrongDocument === true,
    hasPhone: t.hasPhone === true, hasEmail: t.hasEmail === true, hasName: t.hasName === true,
    candidateCount: Number.isFinite(t.candidateCount) ? Math.max(0, Math.trunc(t.candidateCount)) : 0,
    autoMerge: false, aiDecision: false,
  }
}

/** Mensagens técnicas sem PII — o valor cru nunca é interpolado. */
export const CLIENT_IDENTITY_ERRORS = {
  untrustedScope: "Unidade autorizada ausente.",
  emptySignals: "Sem sinal de identidade utilizável.",
} as const
