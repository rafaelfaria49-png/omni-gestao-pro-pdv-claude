/** Política prospectiva compartilhável. Não muda a política de venda simples ou a fila atual. */
export function vestuarioSalePolicy(mode: "SIMPLES" | "COM_GRADE") {
  if (mode === "SIMPLES") return { policy: "LEGACY_UNCHANGED" } as const
  return {
    policy: "SERVER_CONFIRMATION_REQUIRED",
    surfaces: ["classic", "venda-completa"],
    operational: false,
    requireVariant: true,
    requireServerConfirmation: true,
    allowOfflineConfirmedSale: false,
    allowOfflineDraft: true,
    localStockIsAuthoritative: false,
  } as const
}
