import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { requireModuleApi } from "@/lib/auth/module-access"
import { canAccessStore, hasModule } from "@/lib/auth/enterprise-permissions"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { storeIdFromAssistecRequestForRead, storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { resolveBusinessResource } from "@/lib/store-business-capabilities"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"
import { aparelhoPermissionsForRole } from "./permissions"
import type { AparelhoCtx, Fail } from "./service"

/**
 * Gate HTTP de aparelhos (OMNI-APARELHOS-ENDTOEND-001).
 * - `hub`: Cadastros HUB → Aparelhos (módulo `deviceCatalog` + hub de Cadastros pelo papel).
 * - `venda`: PDV / Venda Completa (módulo `pdv` + a loja contratou `deviceCatalog`).
 * Loja SEMPRE provada pelo servidor (header/query autorizado pela sessão; escrita exige
 * header/query explícito). Recurso precisa estar ligado na loja (`catalog.serializedDevices`).
 */
export async function resolveAparelhoApi(
  req: Request,
  mode: "hub" | "venda",
  write: boolean,
): Promise<{ ok: true; ctx: AparelhoCtx } | { ok: false; response: NextResponse }> {
  const denied = await requireModuleApi(req, mode === "hub" ? "deviceCatalog" : "pdv")
  if (denied) return { ok: false, response: denied }
  const session = await auth()
  if (!session?.user?.id) return { ok: false, response: NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 }) }
  const storeId = (write ? storeIdFromAssistecRequestForWrite(req) : storeIdFromAssistecRequestForRead(req))?.trim()
  if (!storeId) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Unidade obrigatória: envie o header x-assistec-loja-id." }, { status: 400 }) }
  }
  if (!canAccessStore(session, storeId)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Sem permissão para esta unidade" }, { status: 403 }) }
  }
  if (mode === "venda" && !hasModule(session, "deviceCatalog", storeId)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Venda de aparelhos não contratada nesta unidade." }, { status: 403 }) }
  }
  const settings = await prisma.storeSettings.findUnique({ where: { storeId }, select: { printerConfig: true } })
  const blob = settings?.printerConfig as { capabilities?: StoreCapabilitiesV1 } | null
  if (!resolveBusinessResource(blob?.capabilities ?? null, "catalog.serializedDevices").requested) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "RECURSO_DESATIVADO", error: "Aparelhos por IMEI está desligado nesta unidade. Ative em Configurações → Ramo e recursos." },
        { status: 403 },
      ),
    }
  }
  const perms = aparelhoPermissionsForRole(session.user.role, { platform: isPlatformSession(session) })
  return { ok: true, ctx: { storeId, actorId: String(session.user.id), actorLabel: getOperatorLabelFromSession(session), perms } }
}

export function failResponse(f: Fail): NextResponse {
  return NextResponse.json({ ok: false, code: f.code, error: f.message, ...(f.field ? { field: f.field } : {}) }, { status: f.status })
}

export function jsonResult<T extends { ok: boolean }>(r: T | Fail): NextResponse {
  if (r.ok === false) return failResponse(r as Fail)
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store, private" } })
}

/** Corpo JSON com teto (fotos reduzidas no cliente ≤ 6 × 400 KB). */
export async function readJson(req: Request, maxChars = 4_000_000): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > maxChars) return null
  const text = await req.text().catch(() => "")
  if (text.length > maxChars) return null
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return null
  }
}

export function badJson(): NextResponse {
  return NextResponse.json({ ok: false, error: "JSON inválido ou grande demais." }, { status: 400 })
}
