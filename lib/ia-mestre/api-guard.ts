import { NextResponse } from "next/server"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { resolveActiveStoreId } from "@/lib/operacoes/assert-active-store"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"
import { requireAdmin } from "@/lib/require-admin"

export type IaMestreApiGuardFail = { ok: false; response: NextResponse }
export type IaMestreApiGuardOk = { ok: true; storeId: string }
export type IaMestreApiGuardResult = IaMestreApiGuardFail | IaMestreApiGuardOk

const isLocalDevelopment = process.env.NODE_ENV === "development"

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status })
}

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

/** Leitura: header → query → cookie (sem fallback loja-1). */
export function storeIdFromIaMestreRead(req: Request): string | null {
  const h = req.headers.get(ASSISTEC_LOJA_HEADER)?.trim()
  const url = new URL(req.url)
  const q = url.searchParams.get("storeId")?.trim() || url.searchParams.get("lojaId")?.trim()
  const c = activeStoreIdFromCookieHeader(req.headers.get("cookie"))
  return resolveActiveStoreId(h || q || c || null)
}

/** Escrita: header ou query apenas. */
export function storeIdFromIaMestreWrite(req: Request): string | null {
  return resolveActiveStoreId(storeIdFromAssistecRequestForWrite(req))
}

export async function guardIaMestreApiRead(req: Request): Promise<IaMestreApiGuardResult> {
  if (!isLocalDevelopment) {
    const adminGate = await requireAdmin()
    if (!adminGate.ok) return { ok: false, response: adminGate.res }
  }

  const storeId = storeIdFromIaMestreRead(req)
  if (!storeId) {
    return {
      ok: false,
      response: jsonError(
        "Selecione uma unidade ativa no painel ou envie o header x-assistec-loja-id.",
        403,
      ),
    }
  }

  return { ok: true, storeId }
}

export async function guardIaMestreApiWrite(req: Request): Promise<IaMestreApiGuardResult> {
  if (!isLocalDevelopment) {
    const adminGate = await requireAdmin()
    if (!adminGate.ok) return { ok: false, response: adminGate.res }
  }

  const storeId = storeIdFromIaMestreWrite(req)
  if (!storeId) {
    return {
      ok: false,
      response: jsonError(
        "Unidade obrigatória: envie o header x-assistec-loja-id (loja ativa no dashboard).",
        403,
      ),
    }
  }

  return { ok: true, storeId }
}
