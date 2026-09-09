/**
 * Decisão de entrada do ambiente LOCAL de desenvolvimento
 * (LOCALHOST-DEV-DIRECT-DASHBOARD-002B — complemento do 002).
 *
 * Funções PURAS para serem reutilizadas pela rota `/`, pela rota `/login` e pela
 * rota interna `/local-dev-entry`. A fonte autoritativa de "é local seguro?" é
 * sempre `evaluateLocalDevAuthBypass` (lib/local-dev-auth-guard.ts) — nada aqui
 * reinterpreta ambiente.
 */

export type LocalDevEntryDecision = "landing" | "dashboard" | "auto-login"

/**
 * Normaliza o callbackUrl local: apenas caminhos relativos da própria origem.
 * Absolutos, protocol-relative ("//host") ou inválidos → "/dashboard" (sem open redirect).
 */
export function normalizeLocalCallbackPath(raw: string | null | undefined): string {
  const value = (raw ?? "").trim()
  if (!value.startsWith("/")) return "/dashboard"
  if (value.startsWith("//")) return "/dashboard"
  if (value.startsWith("/\\")) return "/dashboard"
  return value
}

/**
 * Decide o destino da entrada local. Só é chamada quando convém — a renderização
 * da landing em produção/não-local é o caminho padrão, fora desta função.
 */
export function decideLocalDevEntry(params: {
  guardAllowed: boolean
  hasSession: boolean
}): LocalDevEntryDecision {
  if (!params.guardAllowed) return "landing"
  if (params.hasSession) return "dashboard"
  return "auto-login"
}
