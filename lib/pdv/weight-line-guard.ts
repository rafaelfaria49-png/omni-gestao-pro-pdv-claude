/**
 * Guard de preço efetivo de produto por peso — N5-B1 R2 (P2-05).
 *
 * Fonte: audit GAP-P2-05 — `confirmWeightDialog` (Classic e Supermercado)
 * aceitava `precoPorKg ?? price` sem validar, criando linha vendável R$0 ou
 * inválida (total divergente). Regra R2: preço efetivo `<= 0`, `NaN`,
 * `undefined`, não-finito ou ausente REJEITA a linha — sem inferir preço, sem
 * editar cadastro, sem enfraquecer o hard-block de fracionado (quantidade
 * segue intocada aqui; o motor N1 mantém o block geral).
 *
 * Mesma regra semântica para ambos os fluxos oficiais que vendem por peso —
 * o diálogo permanece aberto para correção ou cancelamento consciente.
 */

export type WeightUnitPriceInput = {
  /** Preço por kg cadastrado (opcional). */
  precoPorKg?: number | null
  /** Preço base do produto (fallback do efetivo, mesma precedência atual). */
  price?: number | null
}

export type WeightUnitPriceResult =
  | { ok: true; unitPrice: number }
  | { ok: false; reason: "missing" | "invalid" | "nonpositive" }

/** Tolerância em centavos: 0,009 alinhado aos demais guards monetários do PDV. */
const PRICE_EPSILON = 0.009

export function resolveWeightUnitPrice(
  input: WeightUnitPriceInput,
): WeightUnitPriceResult {
  const raw = input.precoPorKg ?? input.price
  if (raw === undefined || raw === null) return { ok: false, reason: "missing" }
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { ok: false, reason: "invalid" }
  if (raw <= PRICE_EPSILON) return { ok: false, reason: "nonpositive" }
  return { ok: true, unitPrice: raw }
}

/** Copy operacional do bloqueio (toast destructive nas duas superfícies). */
export const WEIGHT_PRICE_INVALID_FEEDBACK = {
  title: "Preço por kg inválido",
  description:
    "Este produto por peso está com preço R$ 0 ou inválido no cadastro. Informe o peso somente após corrigir o preço, ou cancele.",
} as const
