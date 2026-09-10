/**
 * Contrato fail-closed de quantidade inteira em vendas
 * (FRACTIONAL-SALE-HARD-BLOCK-005).
 *
 * Contexto: `SaleLine.quantity` é `number`, mas `ItemVenda.quantidade` e
 * `Produto.stock` são inteiros. Aceitar quantidade decimal e aplicar
 * `Math.round` silencioso permitia vender 0.350 (virava 0 no estoque) com o
 * total monetário refletindo o valor decimal — venda financeira sem baixa de
 * estoque. Suporte real a peso/fracionado NÃO existe neste GOAL.
 *
 * Regra: toda linha persistível de venda precisa ter quantidade inteira.
 * Ruído insignificante de floating point ao redor de um inteiro (ex.:
 * 1.0000000001) é normalizado para o inteiro. Quantidade comercial
 * significativamente fracionária (0.350, 0.5, 1.5, 2.25) é REJEITADA —
 * nunca arredondada silenciosamente.
 *
 * Módulo puro: zero imports, seguro para server (`ops-upsert-venda`,
 * `correcao-itens-plan`, rotas) e client (`finalizeSaleTransaction`).
 * Não toca `pdv.scale.*`; balança continua detectável, mas venda com peso
 * fracionário é bloqueada honestamente por este contrato.
 */

/** Código de erro de negócio para quantidade fracionada (HTTP 409 nas rotas). */
export const FRACTIONAL_QUANTITY_CODE = "FRACTIONAL_QUANTITY_UNSUPPORTED" as const

/** Mensagem operacional (sem detalhes internos de banco/Prisma). */
export const FRACTIONAL_QUANTITY_MESSAGE =
  "Venda por quantidade fracionada ainda não está disponível. Informe uma quantidade inteira." as const

/**
 * Tolerância explícita para ruído de floating point ao redor de um inteiro.
 * 1e-9 aceita 1.0000000001 / 0.9999999999 e continua ordens de grandeza abaixo
 * de qualquer fração comercial real (0.01, 0.001, 0.350) — nenhuma quantidade
 * fracionária legítima é normalizada para inteira por engano.
 */
export const SALE_QUANTITY_EPSILON = 1e-9 as const

/** Erro de negócio lançado quando a quantidade é significativamente fracionária. */
export class FractionalQuantityError extends Error {
  readonly code: typeof FRACTIONAL_QUANTITY_CODE = FRACTIONAL_QUANTITY_CODE
  /** Quantidade original rejeitada (para log estruturado — nunca exposta além da mensagem operacional). */
  readonly quantity: number
  readonly lineIndex?: number
  constructor(quantity: number, lineIndex?: number) {
    super(FRACTIONAL_QUANTITY_MESSAGE)
    this.name = "FractionalQuantityError"
    this.quantity = quantity
    if (lineIndex !== undefined) this.lineIndex = lineIndex
  }
}

/**
 * Valida uma quantidade JÁ garantida finita e devolve o inteiro correspondente.
 * Normaliza apenas ruído insignificante (`|q − round(q)| <= 1e-9`); qualquer
 * fração comercial significativa lança `FractionalQuantityError`.
 *
 * Não valida sinal/limites — o caller mantém o clamping existente
 * (`Math.max(0, …)`). Não aceita não-finito: o caller preserva o fallback
 * anterior (`typeof === "number" && finito ? … : 0`) antes de chamar.
 */
export function normalizeSaleQuantity(quantity: number, lineIndex?: number): number {
  const rounded = Math.round(quantity)
  if (Math.abs(quantity - rounded) <= SALE_QUANTITY_EPSILON) return rounded
  throw new FractionalQuantityError(quantity, lineIndex)
}

/**
 * Retorna `true` quando o valor é inteiro ou tem apenas ruído insignificante
 * de floating point. Predicado para preflight client (sem throw).
 */
export function isIntegerSaleQuantity(quantity: unknown): boolean {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) return false
  return Math.abs(quantity - Math.round(quantity)) <= SALE_QUANTITY_EPSILON
}
