/** Contrato NOVO: BRL em centavos, custo em milionésimos de real; legado Float não é convertido. */
export const PRICE_SCALE = 2 as const
export const COST_SCALE = 6 as const
export const ROUNDING_MODE = "HALF_UP" as const

function natural(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} deve ser inteiro seguro não negativo.`)
}

function safeNumber(value: bigint): number {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Valor fora da precisão segura do contrato.")
  return Number(value)
}

/** Entrada decimal canônica, sem vírgula, expoente, sinal, Number ou arredondamento binário. */
export function decimalToUnits(value: string, scale: typeof PRICE_SCALE | typeof COST_SCALE): number {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,18})?$/.test(value)) {
    throw new TypeError("Informe decimal canônico não negativo como string.")
  }
  if (scale !== PRICE_SCALE && scale !== COST_SCALE) throw new RangeError("Escala não suportada.")
  const [whole, fraction = ""] = value.split(".")
  const factor = BigInt(scale === PRICE_SCALE ? 100 : 1_000_000)
  const padded = fraction.padEnd(scale, "0")
  let result = BigInt(whole) * factor + BigInt(padded.slice(0, scale))
  if (fraction.length > scale && fraction[scale] >= "5") result += BigInt(1)
  return safeNumber(result)
}

export function lineTotalCents(quantity: number, unitPriceCents: number, discountCents = 0): number {
  natural(quantity, "Quantidade")
  natural(unitPriceCents, "Preço")
  natural(discountCents, "Desconto")
  if (quantity === 0 || quantity > 2_000_000_000) throw new RangeError("Quantidade fora do contrato de unidades.")
  const total = BigInt(quantity) * BigInt(unitPriceCents) - BigInt(discountCents)
  return safeNumber(total)
}

/** Média ponderada de uma entrada futura, sem executar movimentação ou recalcular o histórico. */
export function weightedAverageCostMicros(
  stockQuantity: number, currentCostMicros: number, entryQuantity: number, entryCostMicros: number,
): number {
  for (const [value, label] of [[stockQuantity, "Saldo"], [currentCostMicros, "Custo"], [entryQuantity, "Entrada"], [entryCostMicros, "Custo da entrada"]] as const) natural(value, label)
  if (entryQuantity === 0 || stockQuantity + entryQuantity > 2_000_000_000) throw new RangeError("Quantidade inválida para a média de custo.")
  const divisor = BigInt(stockQuantity) + BigInt(entryQuantity)
  const numerator = BigInt(stockQuantity) * BigInt(currentCostMicros) + BigInt(entryQuantity) * BigInt(entryCostMicros)
  const quotient = numerator / divisor
  return safeNumber(quotient + (numerator % divisor * BigInt(2) >= divisor ? BigInt(1) : BigInt(0)))
}
