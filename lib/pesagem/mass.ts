/** Medição física SI. Não representa Produto.stock nem quantidade de ItemVenda. */
export type MassUnit = "g" | "kg"
export type Mass = Readonly<{
  value: string
  unit: MassUnit
  decimalPlaces: number
  kilograms: string
}>

export type MassResult =
  | { ok: true; mass: Mass }
  | { ok: false; code: "unknown_unit" | "invalid_number" | "precision_exceeded" }

/** Até 24 dígitos e 9 casas na unidade recebida; excesso é rejeitado, nunca arredondado. */
export function parseMass(value: string, unit: string): MassResult {
  if (unit !== "g" && unit !== "kg") return { ok: false, code: "unknown_unit" }
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(value)) return { ok: false, code: "invalid_number" }
  const canonical = value.replace(",", ".")
  const [whole, fraction = ""] = canonical.replace(/^[+-]/, "").split(".")
  if (whole.length + fraction.length > 24 || fraction.length > 9) {
    return { ok: false, code: "precision_exceeded" }
  }
  const negative = canonical.startsWith("-") && /[1-9]/.test(whole + fraction)
  const sign = negative ? "-" : ""
  const integer = whole.replace(/^0+(?=\d)/, "")
  const normalized = sign + integer + (fraction ? "." + fraction : "")
  const placesKg = fraction.length + (unit === "g" ? 3 : 0)
  const digits = (integer + fraction).padStart(placesKg + 1, "0")
  const kilograms = sign + (placesKg
    ? digits.slice(0, -placesKg) + "." + digits.slice(-placesKg)
    : digits)
  return { ok: true, mass: Object.freeze({ value: normalized, unit, decimalPlaces: fraction.length, kilograms }) }
}

function places(value: string): number {
  return value.split(".")[1]?.length ?? 0
}

function coefficient(value: string, scale: number): bigint {
  return BigInt(value.replace(".", "") + "0".repeat(scale - places(value)))
}

/** Entradas canônicas produzidas por parseMass; cálculo inteiro, sem ponto flutuante. */
export function compareDecimal(left: string, right: string): number {
  const scale = Math.max(places(left), places(right))
  const a = coefficient(left, scale)
  const b = coefficient(right, scale)
  return a < b ? -1 : a > b ? 1 : 0
}

export function withinTolerance(valuesKg: readonly string[], toleranceKg: string): boolean {
  if (!valuesKg.length) return false
  const scale = Math.max(places(toleranceKg), ...valuesKg.map(places))
  const values = valuesKg.map((value) => coefficient(value, scale))
  let low = values[0]
  let high = values[0]
  for (const value of values) {
    if (value < low) low = value
    if (value > high) high = value
  }
  return high - low <= coefficient(toleranceKg, scale)
}
