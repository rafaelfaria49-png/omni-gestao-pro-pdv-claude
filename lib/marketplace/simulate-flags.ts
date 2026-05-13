/**
 * Erros simulados no marketplace só em desenvolvimento ou com override explícito
 * (evita abuso em produção).
 */
export function allowMarketplaceSimulateErrors(): boolean {
  if (process.env.NODE_ENV === "development") return true
  return process.env.MARKETPLACE_ALLOW_SIMULATE_ERRORS === "1"
}
