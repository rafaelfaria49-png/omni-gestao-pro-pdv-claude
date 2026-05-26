import type { StorePdvParams } from "@/lib/store-settings-types"

export type PdvEstimatedTaxConfig = Pick<
  StorePdvParams,
  "incluirImpostoEstimadoNoPdv" | "aliquotaImpostoEstimadoPdv"
>

export type PdvCartTotals = {
  subtotal: number
  discount: number
  impostoEstimado: number
  total: number
}

/** Total do PDV conforme Configurações → Vendas: subtotal + imposto estimado − descontos. */
export function computePdvCartTotals(
  subtotal: number,
  discount: number,
  taxConfig: PdvEstimatedTaxConfig,
): PdvCartTotals {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0)
  const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), safeSubtotal)
  const aliquota = Math.max(0, Math.min(100, Number(taxConfig.aliquotaImpostoEstimadoPdv) || 0))
  const impostoEstimado =
    taxConfig.incluirImpostoEstimadoNoPdv && aliquota > 0
      ? Math.round(((safeSubtotal * aliquota) / 100) * 100) / 100
      : 0
  const total = Math.max(0, Math.round((safeSubtotal + impostoEstimado - safeDiscount) * 100) / 100)
  return { subtotal: safeSubtotal, discount: safeDiscount, impostoEstimado, total }
}
