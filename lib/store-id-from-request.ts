import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"

function activeStoreIdFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(";")
  for (const p of parts) {
    const s = p.trim()
    if (!s.toLowerCase().startsWith(`${ASSISTEC_ACTIVE_STORE_COOKIE}=`)) continue
    const raw = s.slice(ASSISTEC_ACTIVE_STORE_COOKIE.length + 1).trim()
    try {
      const v = decodeURIComponent(raw).trim()
      return v.length > 0 ? v : null
    } catch {
      return raw.length > 0 ? raw : null
    }
  }
  return null
}

/**
 * Leituras: header `x-assistec-loja-id` → query `storeId` / `lojaId` → cookie {@link ASSISTEC_ACTIVE_STORE_COOKIE}
 * → `null` se nenhuma fonte resolver (F-01 · SPRINT_MULTI_LOJA-S-001).
 */
export function storeIdFromAssistecRequestForRead(req: Request): string | null {
  const h = req.headers.get(ASSISTEC_LOJA_HEADER)?.trim()
  const url = new URL(req.url)
  const q = url.searchParams.get("storeId")?.trim() || url.searchParams.get("lojaId")?.trim()
  const c = activeStoreIdFromCookieHeader(req.headers.get("cookie"))
  const v = (h || q || c || "").trim()
  return v.length > 0 ? v : null
}

/**
 * Mutações: exige unidade explícita (header ou query). Cookie não é aceito sozinho em escrita
 * para evitar CSRF cross-context; o cliente deve enviar `x-assistec-loja-id`.
 */
export function storeIdFromAssistecRequestForWrite(req: Request): string | null {
  const h = req.headers.get(ASSISTEC_LOJA_HEADER)?.trim()
  const url = new URL(req.url)
  const q = url.searchParams.get("storeId")?.trim() || url.searchParams.get("lojaId")?.trim()
  const v = (h || q || "").trim()
  return v.length > 0 ? v : null
}
