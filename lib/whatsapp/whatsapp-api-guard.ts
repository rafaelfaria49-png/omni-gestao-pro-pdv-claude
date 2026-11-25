import { NextResponse } from "next/server"
import { requireEnterpriseSession, type AuthenticatedSession } from "@/lib/auth/guard-enterprise"
import { canAccessStore, getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { prisma } from "@/lib/prisma"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { resolveActiveStoreId } from "@/lib/operacoes/assert-active-store"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"

export type WhatsAppApiGuardFail = { ok: false; response: NextResponse }
export type WhatsAppApiGuardOk = { ok: true; storeId: string; userId: string }
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
  | { ok: true; userId: string; session: AuthenticatedSession; globalAdmin: boolean }
  | WhatsAppApiGuardFail
> {
  try {
    const base = await requireEnterpriseSession()
    if (!base.ok) return { ok: false, response: jsonError(base.error, base.status) }
    const userId = base.session.user.id.trim()
    if (!userId) return { ok: false, response: jsonError("Autenticação obrigatória.", 401) }
    const user = await prisma.adminUser.findUnique({
      where: { id: userId }, select: { active: true, role: true },
    })
    if (!user?.active || !getEnterprisePermissions(user.role).hubs.whatsapp) {
      return { ok: false, response: jsonError("Sem permissão para o WhatsApp HUB.", 403) }
    }
    return {
      ok: true, userId, session: base.session,
      globalAdmin: user.role === "ADMIN" || user.role === "SUPER_ADMIN",
    }
  } catch {
    return { ok: false, response: jsonError("Não foi possível validar o acesso ao WhatsApp HUB.", 503) }
  }
}

async function authorizeStore(
  storeId: string,
  session: Extract<Awaited<ReturnType<typeof requireWhatsAppApiSession>>, { ok: true }>,
): Promise<WhatsAppApiGuardResult> {
  if (!canAccessStore(session.session, storeId)) {
    return { ok: false, response: jsonError("Sem permissão para esta unidade.", 403) }
  }
  try {
    // ADMIN global preserva a política enterprise; demais papéis exigem vínculo atual.
    // Não usar lojaId primária como fallback após revogar AdminUserStore.
    const authorized = session.globalAdmin
      ? await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } })
      : await prisma.adminUserStore.findUnique({
          where: { adminUserId_storeId: { adminUserId: session.userId, storeId } },
          select: { id: true },
        })
    if (!authorized) return { ok: false, response: jsonError("Sem permissão para esta unidade.", 403) }
    return { ok: true, storeId, userId: session.userId }
  } catch {
    return { ok: false, response: jsonError("Não foi possível validar a unidade.", 503) }
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

  return authorizeStore(storeId, session)
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

  return authorizeStore(storeId, session)
}
