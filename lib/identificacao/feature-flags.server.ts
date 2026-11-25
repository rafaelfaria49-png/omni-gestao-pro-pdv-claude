import "server-only"

/** Gate exclusivo P03 QA. Não altera o opt-in de catálogo Production da #360. */
export function identificationEnabled(storeId: string, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const qa = env.VERCEL_ENV === "development" || env.VERCEL_ENV === "preview"
  const stores = (env.VESTUARIO_P03_STORE_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  return qa && env.VESTUARIO_P03_ENABLED === "1" && Boolean(storeId) && storeId === storeId.trim() && stores.includes(storeId)
}
