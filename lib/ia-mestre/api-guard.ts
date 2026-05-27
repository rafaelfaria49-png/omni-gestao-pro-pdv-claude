import { NextResponse } from "next/server"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { resolveActiveStoreId } from "@/lib/operacoes/assert-active-store"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise"

export type IaMestreApiGuardFail = { ok: false; response: NextResponse }
export type IaMestreApiGuardOk = { ok: true; storeId: string }
export type IaMestreApiGuardResult = IaMestreApiGuardFail | IaMestreApiGuardOk

const isLocalDevelopment = process.env.NODE_ENV === "development"

export const IA_MESTRE_FORBIDDEN_MESSAGE =
  "Sem permissão para a IA Mestre. O seu perfil não inclui este módulo — peça acesso ao administrador."

function jsonError(error: string, status: number, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status })
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

async function assertIaMestreEnterpriseAccess(storeId: string): Promise<IaMestreApiGuardFail | null> {
  if (isLocalDevelopment) return null

  const g = await requireEnterpriseWith(
    storeId,
    (p) => p.workspace.iaMestre,
    IA_MESTRE_FORBIDDEN_MESSAGE,
  )

  if (g.ok) return null

  if (g.status === 401) {
    return {
      ok: false,
      response: jsonError(
        "auth_required",
        401,
        "Faça login para usar a IA Mestre.",
      ),
    }
  }

  if (g.error.includes("unidade")) {
    return {
      ok: false,
      response: jsonError(
        "store_forbidden",
        403,
        "Sem permissão para a unidade selecionada. Escolha outra loja no painel.",
      ),
    }
  }

  return {
    ok: false,
    response: jsonError("forbidden_ia_mestre", 403, g.error),
  }
}

export async function guardIaMestreApiRead(req: Request): Promise<IaMestreApiGuardResult> {
  const storeId = storeIdFromIaMestreRead(req)
  if (!storeId) {
    return {
      ok: false,
      response: jsonError(
        "store_required",
        403,
        "Selecione uma unidade ativa no painel ou envie o header x-assistec-loja-id.",
      ),
    }
  }

  const denied = await assertIaMestreEnterpriseAccess(storeId)
  if (denied) return denied

  return { ok: true, storeId }
}

export async function guardIaMestreApiWrite(req: Request): Promise<IaMestreApiGuardResult> {
  const storeId = storeIdFromIaMestreWrite(req)
  if (!storeId) {
    return {
      ok: false,
      response: jsonError(
        "store_required",
        403,
        "Unidade obrigatória: envie o header x-assistec-loja-id (loja ativa no dashboard).",
      ),
    }
  }

  const denied = await assertIaMestreEnterpriseAccess(storeId)
  if (denied) return denied

  return { ok: true, storeId }
}
