import { manualKgDiscountCents, ManualKgSaleError } from "./manual-kg-contract"

export type ManualKgTaxSnapshot = { version: 1; enabled: boolean; ratePercent: number; baseCents: number; taxCents: number }
export function manualKgTaxSnapshot(baseCents: number, config: { incluirImpostoEstimadoNoPdv?: unknown; aliquotaImpostoEstimadoPdv?: unknown }): ManualKgTaxSnapshot {
  const enabled = config.incluirImpostoEstimadoNoPdv === true
  const rate = enabled ? config.aliquotaImpostoEstimadoPdv ?? 8 : 0
  const tax = typeof rate === "number" ? manualKgDiscountCents(baseCents, rate, 0) : null
  if (tax === null) throw new ManualKgSaleError("Alíquota estimada inválida. Revise as configurações da loja.")
  return { version: 1, enabled, ratePercent: rate as number, baseCents, taxCents: tax }
}
export function taxParamsFromPrinterConfig(value: unknown): Record<string, unknown> {
  const blob = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return blob.pdvParams && typeof blob.pdvParams === "object" && !Array.isArray(blob.pdvParams) ? blob.pdvParams as Record<string, unknown> : {}
}
