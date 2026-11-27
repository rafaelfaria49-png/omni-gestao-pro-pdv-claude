import "server-only"
import { vestuarioFeatureFlags } from "../vestuario/feature-flags.server"

export function identificationEnabled(storeId: string, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (!storeId || storeId !== storeId.trim() || env.VESTUARIO_P03_ENABLED !== "1") return false
  const stores = (env.VESTUARIO_P03_STORE_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean)

  if (env.VERCEL_ENV === "production") {
    return env.VESTUARIO_P03_PRODUCTION_ENABLED === "1"
      && stores.length === 1
      && stores[0] === storeId
      && vestuarioFeatureFlags(storeId, env).enabled.catalog
  }

  const qa = env.VERCEL_ENV === "development" || env.VERCEL_ENV === "preview"
  return qa && stores.includes(storeId)
}
