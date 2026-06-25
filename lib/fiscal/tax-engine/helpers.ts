/**
 * Utilitários puros do Motor Tributário (Tax Engine). Sem I/O, sem estado, determinísticos.
 */
import type { RoundingConfig } from "./types"
import { roundMoney } from "./rounding"

/** Coerção numérica segura: não-finito/ausente → 0. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Número finito e >= 0? (ausente conta como 0 → válido). */
export function isNonNegativeFinite(v: unknown): boolean {
  if (v == null) return true
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) && n >= 0
}

/** Apenas dígitos (para normalizar CFOP/CSOSN/CST). */
export function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "")
}

/** Aplica uma alíquota percentual sobre uma base: base × (aliq/100). */
export function applyAliquota(base: number, aliquotaPercent: number): number {
  return num(base) * (num(aliquotaPercent) / 100)
}

/** Soma uma propriedade numérica de uma lista. */
export function sumBy<T>(list: T[], pick: (item: T) => number): number {
  let acc = 0
  for (const it of list) acc += num(pick(it))
  return acc
}

/**
 * Rateio proporcional determinístico de um total por pesos, com correção de centavos no
 * ÚLTIMO elemento de maior peso para que a soma das partes seja EXATAMENTE igual ao total
 * arredondado. Se todos os pesos forem 0, distribui igualmente. Puro.
 */
export function rateioProporcional(
  total: number,
  pesos: number[],
  cfg: RoundingConfig,
): number[] {
  const n = pesos.length
  if (n === 0) return []
  const totalArredondado = roundMoney(num(total), cfg)
  if (totalArredondado === 0) return pesos.map(() => 0)

  const somaPesos = pesos.reduce((a, p) => a + Math.max(0, num(p)), 0)
  const usarIguais = somaPesos <= 0
  const pesoEfetivo = (p: number) => (usarIguais ? 1 : Math.max(0, num(p)))
  const denom = usarIguais ? n : somaPesos

  const partes: number[] = pesos.map((p) => roundMoney((totalArredondado * pesoEfetivo(p)) / denom, cfg))

  // Correção de resíduo (drift de arredondamento) no item de maior peso.
  const somaPartes = partes.reduce((a, p) => a + p, 0)
  const residuo = roundMoney(totalArredondado - somaPartes, cfg)
  if (residuo !== 0) {
    let idxMaior = 0
    for (let i = 1; i < n; i++) {
      if (pesoEfetivo(pesos[i]) > pesoEfetivo(pesos[idxMaior])) idxMaior = i
    }
    partes[idxMaior] = roundMoney(partes[idxMaior] + residuo, cfg)
  }
  return partes
}

/**
 * Resolve o valor efetivo de um acessório por item: usa o valor do ITEM quando informado
 * (não-undefined); senão usa a parte do rateio do total da NOTA. Determinístico.
 */
export function resolverAcessorioPorItem(
  itemValores: Array<number | undefined>,
  totalNota: number | undefined,
  pesos: number[],
  cfg: RoundingConfig,
): number[] {
  const algumNoItem = itemValores.some((v) => v !== undefined)
  if (algumNoItem) {
    // Item-level tem precedência; undefined vira 0 (não mistura com rateio para evitar dupla contagem).
    return itemValores.map((v) => roundMoney(num(v), cfg))
  }
  if (totalNota === undefined || num(totalNota) === 0) {
    return pesos.map(() => 0)
  }
  return rateioProporcional(num(totalNota), pesos, cfg)
}
