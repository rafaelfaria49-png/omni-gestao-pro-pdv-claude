/**
 * Decisão pura de semente da loja ativa (F-11 / DT-16). Sem I/O nem React —
 * testável isoladamente (precedente: `evaluateStoreProtection` em `store-defaults`).
 *
 * Regras:
 * - `"loja-antiga"` (sentinela de sessão legada) → primeira loja real conhecida, ou `null`.
 * - id salvo não-vazio → mantém o id salvo.
 * - sem id salvo → primeira loja real conhecida, ou `null`.
 *
 * Retorna `null` quando NENHUMA loja é determinável (ex.: primeira carga antes de
 * `/api/stores` responder). O chamador NÃO deve semear nada nesse caso — sem fallback
 * silencioso para a loja principal (DT-03 / ADR-0003). O effect re-roda quando `lojas`
 * carrega e a semente correta é então gravada.
 */

/** Id de sessão legado que precisa ser migrado para a primeira loja real. */
export const LEGACY_SESSION_SENTINEL = "loja-antiga"

export function resolveSeedStoreId(
  rawSaved: string | null | undefined,
  lojas: ReadonlyArray<{ id?: string | null }>
): string | null {
  const firstReal = lojas.find((l) => (l?.id ?? "").trim())?.id?.trim() ?? null
  const raw = (rawSaved ?? "").trim()
  if (raw === LEGACY_SESSION_SENTINEL) return firstReal
  if (raw) return raw
  return firstReal
}
