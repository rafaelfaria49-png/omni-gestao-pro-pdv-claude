import "server-only"

/** Preparação privada. Nenhuma variável habilita estoque/venda antes das fases autorizadas. */
const FLAG_KEYS = {
  catalog: "VESTUARIO_CATALOG_ENABLED",
  stock: "VESTUARIO_STOCK_ENABLED",
  sale: "VESTUARIO_SALE_ENABLED",
} as const

export function vestuarioFeatureFlags(
  authorizedStoreId: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const stores = (env.VESTUARIO_STORE_ALLOWLIST ?? "").split(",").map((v) => v.trim()).filter(Boolean)
  const scoped = Boolean(authorizedStoreId.trim()) && authorizedStoreId === authorizedStoreId.trim() && stores.includes(authorizedStoreId)
  const requested = {
    catalog: scoped && env[FLAG_KEYS.catalog] === "1",
    stock: scoped && env[FLAG_KEYS.stock] === "1",
    sale: scoped && env[FLAG_KEYS.sale] === "1",
  }
  return {
    phase: "P01",
    requested,
    enabled: { catalog: false, stock: false, sale: false },
    reason: "PERSISTENCE_AND_STOCK_NOT_RELEASED",
  } as const
}
