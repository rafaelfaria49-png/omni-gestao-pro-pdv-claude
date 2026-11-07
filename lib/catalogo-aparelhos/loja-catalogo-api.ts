import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { requireModuleApi } from "@/lib/auth/module-access"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import type { LojaCatalogoFailure } from "./loja-catalogo-store"

/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — gates HTTP do catálogo por loja.
 *
 * - Leitura (busca PDV/cadastro): módulo `deviceCatalog` + sessão. A loja vem do header/
 *   query/cookie (mesma regra das leituras existentes) e só é usada se a sessão puder
 *   acessá-la; sem loja resolvida, a busca segue apenas com o catálogo global.
 * - Escrita (cadastrar/editar modelo, decidir compatibilidade): módulo `deviceCatalog` +
 *   gate de Cadastros em modo `write` (loja EXPLÍCITA no header, membership e hub de
 *   Cadastros). Quem não tem Cadastros na loja recebe 403 — nunca privilégio implícito.
 */

export const CATALOGO_LOJA_WRITE_FORBIDDEN =
  "Sem permissão para cadastrar modelos ou alterar compatibilidades nesta loja. Peça a um gerente ou administrador."

export async function resolveCatalogoLojaRead(
  req: Request,
): Promise<{ ok: true; storeId: string | null } | { ok: false; response: NextResponse }> {
  const denied = await requireModuleApi(req, "deviceCatalog")
  if (denied) return { ok: false, response: denied }
  const session = await auth()
  if (!session?.user) return { ok: false, response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
  const storeId = storeIdFromAssistecRequestForRead(req)
  return { ok: true, storeId: storeId && canAccessStore(session, storeId) ? storeId : null }
}

export async function requireCatalogoLojaWrite(
  req: Request,
): Promise<{ ok: true; storeId: string; actorId: string } | { ok: false; response: NextResponse }> {
  const denied = await requireModuleApi(req, "deviceCatalog")
  if (denied) {
    if (denied.status === 403) {
      return { ok: false, response: NextResponse.json({ ok: false, error: CATALOGO_LOJA_WRITE_FORBIDDEN }, { status: 403 }) }
    }
    return { ok: false, response: denied }
  }
  const gate = await requireCadastrosHubApi(req, "write")
  if (!gate.ok) {
    if (gate.response.status === 403) {
      return { ok: false, response: NextResponse.json({ ok: false, error: CATALOGO_LOJA_WRITE_FORBIDDEN }, { status: 403 }) }
    }
    return gate
  }
  return { ok: true, storeId: gate.storeId, actorId: String(gate.session.user.id) }
}

export function catalogoLojaFailureResponse(f: LojaCatalogoFailure): NextResponse {
  const { ok: _ok, status, ...rest } = f
  return NextResponse.json({ ok: false, error: f.message, ...rest }, { status })
}

export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text().catch(() => "")
  if (text.length > 16_000) return null
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return null
  }
}
