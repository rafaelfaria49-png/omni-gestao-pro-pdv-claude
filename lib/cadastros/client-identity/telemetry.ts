/**
 * Telemetria sanitizada da identidade de Cliente.
 * Nunca inclui CPF/CNPJ, email, telefone, nome ou id de outra unidade.
 */
import type { ClientIdentityTelemetry, ClientIdentityVerdict } from "./types"

export function sanitizedClientIdentityTelemetry(verdict: ClientIdentityVerdict): ClientIdentityTelemetry {
  return { ...verdict.telemetry }
}

/** Mensagens técnicas sem PII — o valor cru nunca é interpolado. */
export const CLIENT_IDENTITY_ERRORS = {
  untrustedScope: "Unidade autorizada ausente.",
  emptySignals: "Sem sinal de identidade utilizável.",
} as const
