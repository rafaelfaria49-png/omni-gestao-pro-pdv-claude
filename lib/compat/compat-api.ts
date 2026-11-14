import "server-only"
import { NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/auth/module-access"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import type { CompatFailure, CompatResult } from "./compat-store"

/**
 * COMPAT-PROFISSIONAL-001 — gates HTTP do Compat. Reaproveita as políticas existentes:
 *  - leitura de GESTÃO (organização, vínculos, cores da tela de gestão): módulo `deviceCatalog`
 *    + Cadastros em modo `read` (loja autorizada da sessão);
 *  - leitura do PDV (cores/localização na venda): `resolveCatalogoLojaRead` (catálogo);
 *  - escrita: `requireCatalogoLojaWrite` (loja EXPLÍCITA + Cadastros `write` + `deviceCatalog`).
 */
export async function requireCompatGestaoRead(
  req: Request,
): Promise<{ ok: true; storeId: string } | { ok: false; response: NextResponse }> {
  const denied = await requireModuleApi(req, "deviceCatalog")
  if (denied) return { ok: false, response: denied }
  const gate = await requireCadastrosHubApi(req, "read")
  if (!gate.ok) return { ok: false, response: gate.response }
  return { ok: true, storeId: gate.storeId }
}

/**
 * Leitura usada pelo PDV (cores da loja): quem opera PDV, catálogo ou serviço na loja — inclusive
 * CAIXA, que não tem o módulo `deviceCatalog`. Sem isso o caixa veria cores desativadas que o
 * servidor da venda recusa. Loja só é usada se a sessão puder acessá-la; sem loja, paleta padrão.
 */
export async function resolveCompatPdvRead(
  req: Request,
): Promise<{ ok: true; storeId: string | null } | { ok: false; response: NextResponse }> {
  const denied = await requireModuleApi(req, "sharedCatalog")
  if (denied) return { ok: false, response: denied }
  const session = await auth()
  if (!session?.user) return { ok: false, response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
  const storeId = storeIdFromAssistecRequestForRead(req)
  return { ok: true, storeId: storeId && canAccessStore(session, storeId) ? storeId : null }
}

export function compatFailureResponse(f: CompatFailure): NextResponse {
  const { ok: _ok, status, ...rest } = f
  return NextResponse.json({ ok: false, error: f.message, ...rest }, { status })
}

export function compatResultResponse<T extends object>(r: CompatResult<T>, status = 200): NextResponse {
  if (!r.ok) return compatFailureResponse(r)
  return NextResponse.json({ ok: true, ...r.value }, { status })
}

export function compatServerError(scope: string, e: unknown, message: string): NextResponse {
  console.error(`[api/catalogo/compat/${scope}]`, e instanceof Error ? e.message : String(e))
  return NextResponse.json({ ok: false, error: message }, { status: 500 })
}
