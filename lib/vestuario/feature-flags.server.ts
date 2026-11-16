import "server-only"

/**
 * Flags privadas do vestuário. P02: somente o CATÁLOGO (cadastro de grades/cores/variantes) pode ser
 * habilitado com flag privada literal "1" e loja na allowlist explícita. Em Production, exige
 * opt-in adicional VESTUARIO_CATALOG_PRODUCTION_ENABLED="1". Estoque e venda continuam forçados
 * a false até as fases P04/P06 autorizadas. Sem flag/allowlist: fail-closed, sem consultas ao banco.
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
  // Production exige liberação EXTRA explícita, sem herdar acidentalmente flags de QA/Preview.
  // Independente do ambiente, estoque e venda de variantes permanecem não operacionais.
  const production = env.VERCEL_ENV === "production"
  const productionReleased = env.VESTUARIO_CATALOG_PRODUCTION_ENABLED === "1"
  const catalog = requested.catalog && (!production || productionReleased)
  return {
    phase: "P02",
    requested,
    enabled: { catalog, stock: false, sale: false },
    reason: production && requested.catalog && !productionReleased
      ? "CATALOG_PRODUCTION_RELEASE_REQUIRED"
      : catalog ? "CATALOG_ENABLED_STOCK_AND_SALE_NOT_RELEASED" : "PERSISTENCE_AND_STOCK_NOT_RELEASED",
  } as const
}
