/**
 * Arredondamento determinístico do Motor Tributário (Tax Engine).
 *
 * Puro e sem estado. NF-e/NFC-e usam, por padrão, 2 casas para valores monetários e 4 para
 * alíquotas. O modo padrão é "half away from zero" (arredondamento comercial), que é o
 * comportamento esperado pela maioria dos validadores fiscais. Os modos "half_even" (bancário)
 * e "truncate" existem para expansão/configuração.
 */
import type { RoundingConfig, RoundingMode } from "./types"

export const DEFAULT_ROUNDING: RoundingConfig = {
  money: 2,
  rate: 4,
  mode: "half_away_from_zero",
}

/** Normaliza/satura a config de arredondamento (defaults + limites sãos). */
export function resolveRounding(cfg?: Partial<RoundingConfig> | null): RoundingConfig {
  if (!cfg) return { ...DEFAULT_ROUNDING }
  const money = clampDecimals(cfg.money, DEFAULT_ROUNDING.money)
  const rate = clampDecimals(cfg.rate, DEFAULT_ROUNDING.rate)
  const mode: RoundingMode =
    cfg.mode === "half_even" || cfg.mode === "truncate" || cfg.mode === "half_away_from_zero"
      ? cfg.mode
      : DEFAULT_ROUNDING.mode
  return { money, rate, mode }
}

function clampDecimals(v: unknown, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback
  return Math.max(0, Math.min(10, n))
}

/**
 * Arredonda `value` para `decimals` casas no modo informado. Determinístico.
 * O epsilon (1e-8) corrige erros de ponto flutuante (ex.: 2.675 → 2.68) sem introduzir
 * não-determinismo (é função pura do valor).
 */
export function roundTo(value: number, decimals: number, mode: RoundingMode = "half_away_from_zero"): number {
  if (!Number.isFinite(value)) return 0
  const f = Math.pow(10, Math.max(0, Math.min(10, Math.trunc(decimals))))
  const scaled = value * f

  let r: number
  switch (mode) {
    case "truncate":
      r = Math.trunc(scaled + Math.sign(scaled) * 1e-8)
      break
    case "half_even": {
      const floor = Math.floor(scaled)
      const diff = scaled - floor
      if (Math.abs(diff - 0.5) < 1e-8) {
        // Empate: arredonda para o par.
        r = floor % 2 === 0 ? floor : floor + 1
      } else {
        r = Math.round(scaled)
      }
      break
    }
    case "half_away_from_zero":
    default:
      r = Math.sign(scaled) * Math.round(Math.abs(scaled) + 1e-8)
      break
  }
  // Evita "-0" no resultado.
  const out = r / f
  return out === 0 ? 0 : out
}

/** Atalho monetário (2 casas por padrão). */
export function roundMoney(value: number, cfg: RoundingConfig): number {
  return roundTo(value, cfg.money, cfg.mode)
}

/** Atalho de alíquota/percentual (4 casas por padrão). */
export function roundRate(value: number, cfg: RoundingConfig): number {
  return roundTo(value, cfg.rate, cfg.mode)
}
