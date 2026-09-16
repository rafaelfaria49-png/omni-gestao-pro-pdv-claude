/**
 * Segredos de providers externos (CAD-R2-015) — guardas server-side.
 *
 * Regra: API key NUNCA entra em response, trace, metadata, log ou bundle.
 * Este módulo oferece os guardas usados por código e testes. Ele próprio nunca
 * recebe valores de segredo como parâmetro tipado — apenas via listas opacas
 * em tempo de verificação.
 */

/** Superfícies onde segredo é proibido (espelha PoliticaTelemetria.segredoNuncaEm). */
export const SUPERFICIES_PROIBIDAS_SEGREDO = [
  "response",
  "trace",
  "metadata",
  "log",
  "bundle",
] as const

/**
 * Varre um valor serializável procurando qualquer um dos segredos.
 * Retorna true ao primeiro match. Segredos vazios são ignorados.
 * Uso: testes de leakage (response/trace/metadata) e validação de proveniência.
 */
export function contemSegredo(valor: unknown, segredos: string[]): boolean {
  const alvos = segredos.filter((s) => typeof s === "string" && s.length >= 4)
  if (alvos.length === 0) return false
  let serializado: string
  try {
    serializado = JSON.stringify(valor) ?? ""
  } catch {
    return false
  }
  return alvos.some((segredo) => serializado.includes(segredo))
}

/**
 * Lança erro (mensagem segura, sem ecoar segredo) se o valor contiver segredo.
 * Mensagem nunca inclui o valor do segredo — apenas a superfície (contexto).
 */
export function afirmarSemSegredo(valor: unknown, segredos: string[], contexto: string): void {
  if (contemSegredo(valor, segredos)) {
    throw new Error(`[provider-governance] segredo detectado em superfície proibida: ${contexto}`)
  }
}
