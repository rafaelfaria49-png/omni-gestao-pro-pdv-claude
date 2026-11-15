import "server-only"

/**
 * Flags privadas do vestuário. P02: somente o CATÁLOGO (cadastro de grades/cores/variantes) pode ser
 * habilitado, e só em QA: flag literal "1" + loja na allowlist explícita + ambiente que não seja
 * Production. Estoque e venda continuam forçados a false até as fases P04/P06 autorizadas.
 */
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
  // P02 não é liberada em Production: nem a flag nem a allowlist abrem o catálogo lá.
  const production = env.VERCEL_ENV === "production"
  const catalog = requested.catalog && !production
  return {
    phase: "P02",
    requested,
    enabled: { catalog, stock: false, sale: false },
    reason: production && requested.catalog
      ? "CATALOG_NOT_RELEASED_IN_PRODUCTION"
      : catalog ? "CATALOG_QA_ONLY_STOCK_AND_SALE_NOT_RELEASED" : "PERSISTENCE_AND_STOCK_NOT_RELEASED",
  } as const
}
