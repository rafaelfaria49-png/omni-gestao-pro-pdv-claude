import "server-only"
import { NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/auth/module-access"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
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
