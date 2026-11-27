/**
 * Regras puras de cálculo de limite de cartão de crédito (centavos exatos via BigInt).
 *
 * Política canônica:
 * - Limite não informado é representado por `null` (nunca `0`).
 * - Limite utilizado = soma do saldo restante em aberto de todos os títulos ativos
 *   (à vista e todas as parcelas futuras) vinculados aos ciclos do cartão.
 * - Pagamentos de fatura (parciais ou totais) reduzem o saldo restante dos títulos
 *   e recompõem o limite disponível na mesma proporção; estornos voltam a comprometer.
 * - Limite de crédito NUNCA compõe saldo financeiro disponível em contas.
 */
import { LIMITE_CENTAVOS } from "./financeiro-scope"

export const POLITICA_COMPROMETIMENTO_LIMITE_CARTAO =
  "COMPROMETIMENTO_INTEGRAL_COMPRA_RECOMPOSICAO_NO_PAGAMENTO" as const

export type ResumoLimiteCartao = Readonly<{
  politicaComprometimento: typeof POLITICA_COMPROMETIMENTO_LIMITE_CARTAO
  /** `null` quando o limite não foi informado; nunca `0` por ausência de dado. */
  limiteCentavos: string | null
  limiteUtilizadoCentavos: string
  /** `null` quando `limiteCentavos === null`. Nunca negativo (excesso vai em `limiteExcedidoCentavos`). */
  limiteDisponivelCentavos: string | null
  /** `null` quando `limiteCentavos === null`; `"0"` quando dentro do limite. */
  limiteExcedidoCentavos: string | null
  /** Percentual utilizado com 2 casas decimais, ou `null` se limite não informado/zero. */
  limiteComprometidoPercentual: number | null
}>

export function calcularResumoLimiteCartao(
  limiteCentavos: bigint | null,
  utilizadoCentavos: bigint,
): ResumoLimiteCartao {
  const utilizado = utilizadoCentavos < BigInt(0) ? BigInt(0) : utilizadoCentavos
  if (limiteCentavos === null) {
    return Object.freeze({
      politicaComprometimento: POLITICA_COMPROMETIMENTO_LIMITE_CARTAO,
      limiteCentavos: null,
      limiteUtilizadoCentavos: utilizado.toString(),
      limiteDisponivelCentavos: null,
      limiteExcedidoCentavos: null,
      limiteComprometidoPercentual: null,
    })
  }
  const limite = limiteCentavos < BigInt(0) ? BigInt(0) : limiteCentavos
  const disponivel = limite >= utilizado ? limite - utilizado : BigInt(0)
  const excedido = utilizado > limite ? utilizado - limite : BigInt(0)
  const percentual = limite > BigInt(0)
    ? Number((utilizado * BigInt(10000)) / limite) / 100
    : null

  return Object.freeze({
    politicaComprometimento: POLITICA_COMPROMETIMENTO_LIMITE_CARTAO,
    limiteCentavos: limite.toString(),
    limiteUtilizadoCentavos: utilizado.toString(),
    limiteDisponivelCentavos: disponivel.toString(),
    limiteExcedidoCentavos: excedido.toString(),
    limiteComprometidoPercentual: percentual,
  })
}

export function normalizarLimiteCentavosInput(valor: string | number | null | undefined): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || !Number.isInteger(valor) || valor < 0 || BigInt(valor) > LIMITE_CENTAVOS) {
      return "INVALIDO"
    }
    return BigInt(valor).toString()
  }
  const trimmed = valor.trim()
  if (!/^\d{1,16}$/.test(trimmed)) return "INVALIDO"
  const n = BigInt(trimmed)
  if (n < BigInt(0) || n > LIMITE_CENTAVOS) return "INVALIDO"
  return n.toString()
}

export function verificarLimiteDisponivelParaCompra(
  limiteCentavos: bigint | null,
  utilizadoAtualCentavos: bigint,
  valorCompraCentavos: bigint,
): Readonly<{
  permitido: boolean
  disponivelAposCentavos: bigint | null
  excedenteCentavos: bigint
}> {
  if (limiteCentavos === null) {
    return Object.freeze({
      permitido: true,
      disponivelAposCentavos: null,
      excedenteCentavos: BigInt(0),
    })
  }
  const novoUtilizado = utilizadoAtualCentavos + valorCompraCentavos
  if (novoUtilizado > limiteCentavos) {
    return Object.freeze({
      permitido: false,
      disponivelAposCentavos: BigInt(0),
      excedenteCentavos: novoUtilizado - limiteCentavos,
    })
  }
  return Object.freeze({
    permitido: true,
    disponivelAposCentavos: limiteCentavos - novoUtilizado,
    excedenteCentavos: BigInt(0),
  })
}
