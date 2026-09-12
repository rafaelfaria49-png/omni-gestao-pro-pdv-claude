import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { storeIdFromAssistecRequestForRead, storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import {
  canAuthorizeCadastrosStore,
  hasCadastrosHub,
  isCadastrosAdminPrincipal,
} from "@/lib/cadastros/cadastros-api-access"

export const CADASTROS_HUB_FORBIDDEN_MESSAGE = "Sem permissão para Cadastros."
export const CADASTROS_STORE_FORBIDDEN_MESSAGE = "Sem permissão para esta unidade"
export const CADASTROS_ADMIN_FORBIDDEN_MESSAGE =
  "Apenas administradores (ADMIN ou SUPER_ADMIN) podem executar esta ação."

export type CadastrosApiMode = "read" | "write"
/**
 * hub — Cadastros HUB (produtos REST, metadata de produto).
 * shared — PDV/OS/WhatsApp autenticado (cliente.read / cliente.quick).
 * admin — CRUD administrativo de cliente (ADMIN/SUPER_ADMIN + loja explícita).
 */
export type CadastrosApiProfile = "hub" | "shared" | "admin"

const WRITE_STORE_REQUIRED =
  "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId."

async function requireCadastrosIdentity() {
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) {
    return { ok: false as const, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return { ok: false as const, response: NextResponse.json({ error: "Assinatura inválida" }, { status: 403 }) }
  }
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false as const, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  }
  return { ok: true as const, session }
}

function resolveStoreId(req: Request, mode: CadastrosApiMode): string | null {
  return mode === "write" ? storeIdFromAssistecRequestForWrite(req) : storeIdFromAssistecRequestForRead(req)
}

function missingStoreResponse(mode: CadastrosApiMode) {
  if (mode === "write") {
    return NextResponse.json({ error: WRITE_STORE_REQUIRED }, { status: 400 })
  }
  return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
}

/**
 * Cadastros REST: identidade + loja autorizada + perfil de operação.
 * Escrita exige header/query explícitos (sem cookie, sem fallback loja-1).
 */
export async function requireCadastrosApi(
  req: Request,
  opts: { mode: CadastrosApiMode; profile: CadastrosApiProfile },
) {
  const identity = await requireCadastrosIdentity()
  if (!identity.ok) return identity
  const { session } = identity

  if (opts.profile === "admin" && !isCadastrosAdminPrincipal(session)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: CADASTROS_ADMIN_FORBIDDEN_MESSAGE }, { status: 403 }),
    }
  }

  const storeId = resolveStoreId(req, opts.mode)
  if (!storeId) {
    return { ok: false as const, response: missingStoreResponse(opts.mode) }
  }

  if (!canAuthorizeCadastrosStore(session, storeId)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: CADASTROS_STORE_FORBIDDEN_MESSAGE }, { status: 403 }),
    }
  }

  if (opts.profile === "hub" && !hasCadastrosHub(session)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: CADASTROS_HUB_FORBIDDEN_MESSAGE }, { status: 403 }),
    }
  }

  return { ok: true as const, storeId, session }
}

/** Compatível com callers existentes. Default: perfil HUB. */
export async function requireCadastrosHubApi(
  req: Request,
  mode: CadastrosApiMode,
  profile: CadastrosApiProfile = "hub",
) {
  return requireCadastrosApi(req, { mode, profile })
}

/**
 * Endpoints de Cadastros sem store no request (classificação fiscal / NCM).
 * Não inventa loja. `hub: true` exige hubs.cadastros.
 */
export async function requireCadastrosSession(opts?: { hub?: boolean }) {
  const identity = await requireCadastrosIdentity()
  if (!identity.ok) return identity
  if (opts?.hub && !hasCadastrosHub(identity.session)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: CADASTROS_HUB_FORBIDDEN_MESSAGE }, { status: 403 }),
    }
  }
  return { ok: true as const, session: identity.session }
}
