/**
 * Layouts de PDV que NÃO vendem aparelho por IMEI (Supermercado, Assistência, Black, PDV da
 * Venda Completa antiga): bloqueio explícito no cliente. O servidor recusa do mesmo jeito
 * (`APARELHO_IMEI_OBRIGATORIO`) — esta mensagem só evita o carrinho chegar até lá.
 */
export const APARELHO_FORA_DO_FLUXO = {
  title: "Aparelho por IMEI",
  description: "Este layout não vende aparelho individualizado. Use o PDV Clássico ou a Venda Completa para escolher a unidade pelo IMEI e emitir a garantia.",
} as const

export function isAparelhoSerializado(product: unknown): boolean {
  return !!product && typeof product === "object" && (product as { serializedDevice?: unknown }).serializedDevice === true
}
