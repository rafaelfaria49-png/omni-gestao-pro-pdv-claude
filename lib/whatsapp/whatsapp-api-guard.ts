import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { resolveActiveStoreId } from "@/lib/operacoes/assert-active-store"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"

export type WhatsAppApiGuardFail = { ok: false; response: NextResponse }
export type WhatsAppApiGuardOk = { ok: true; storeId: string; userId: string | null }
export type WhatsAppApiGuardResult = WhatsAppApiGuardFail | WhatsAppApiGuardOk

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

/** Leitura WhatsApp HUB — header → query → cookie; sem fallback loja-1. */
export function storeIdFromWhatsAppApiRead(req: Request): string | null {
  const h = req.headers.get(ASSISTEC_LOJA_HEADER)?.trim()
  const url = new URL(req.url)
  const q = url.searchParams.get("storeId")?.trim() || url.searchParams.get("lojaId")?.trim()
  const c = activeStoreIdFromCookieHeader(req.headers.get("cookie"))
  return resolveActiveStoreId(h || q || c || null)
}

export async function requireWhatsAppApiSession(): Promise<
  { ok: true; userId: string | null } | { ok: false; response: NextResponse }
> {
  try {
    const session = await auth()
    if (session?.user) {
      const userId =
        typeof session.user.id === "string" && session.user.id.trim()
          ? session.user.id.trim()
          : null
      return { ok: true, userId }
    }
  } catch {
    /* fall through */
  }
  return {
    ok: false,
    response: jsonError(
      "Autenticação obrigatória. Faça login para usar o WhatsApp HUB.",
      401
    ),
  }
}

export async function guardWhatsAppApiRead(req: Request): Promise<WhatsAppApiGuardResult> {
  const session = await requireWhatsAppApiSession()
  if (!session.ok) return session

  const storeId = storeIdFromWhatsAppApiRead(req)
  if (!storeId) {
    return {
      ok: false,
      response: jsonError(
        "Unidade obrigatória: selecione uma loja ativa ou envie o header x-assistec-loja-id.",
        403
      ),
    }
  }

  return { ok: true, storeId, userId: session.userId }
}

export async function guardWhatsAppApiWrite(req: Request): Promise<WhatsAppApiGuardResult> {
  const session = await requireWhatsAppApiSession()
  if (!session.ok) return session

  const storeId = resolveActiveStoreId(storeIdFromAssistecRequestForWrite(req))
  if (!storeId) {
    return {
      ok: false,
      response: jsonError(
        "Unidade obrigatória: header x-assistec-loja-id ou query storeId.",
        403
      ),
    }
  }

  return { ok: true, storeId, userId: session.userId }
}
