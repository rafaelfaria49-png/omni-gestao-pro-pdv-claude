/**
 * N5-B1 (GAP-P2-05) — Preço efetivo da linha de produto por peso.
 *
 * O fluxo de confirmação de peso do Supermercado calcula
 * `precoPorKg ?? price` sem validar. Preço zerado, negativo, NaN ou
 * ausente geraria linha vendável de R$0 (total divergente).
 *
 * Retorna o preço unitário válido ou `null` quando a linha não pode ser
 * adicionada/finalizada. Null nunca vira preço: o caller bloqueia com
 * feedback operacional, mantém o diálogo aberto para correção/cancelamento
 * e NÃO infere preço nem altera o cadastro.
 */
export function effectiveWeightUnitPrice(
  precoPorKg: number | null | undefined,
  price: number | null | undefined,
): number | null {
  const candidate = precoPorKg ?? price
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) return null
  if (candidate <= 0) return null
  return candidate
}
