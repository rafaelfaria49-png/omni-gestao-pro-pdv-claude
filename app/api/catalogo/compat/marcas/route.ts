import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readJsonBody, requireCatalogoLojaWrite } from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import { compatResultResponse, compatServerError, requireCompatGestaoRead } from "@/lib/compat/compat-api"
import { marcasComVisibilidade } from "@/lib/compat/compat-marcas"
import { setPreferencias } from "@/lib/compat/compat-store"

/**
 * COMPAT-CATALOGO-BRASIL-2023-2026-002 — marcas do catálogo e visibilidade NA LOJA.
 *  - GET   → { version, marcas: [{ key, nome, nivel, padraoVisivel, modelos, visivel }] }
 *  - PATCH { version, marcas: { [key]: boolean } } → mostra/oculta marcas só nesta loja.
 * Ocultar tira a marca das buscas; não apaga modelos nem afeta produtos e vendas.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireCompatGestaoRead(req)
  if (!gate.ok) return gate.response
  try {
    return NextResponse.json({ ok: true, ...(await marcasComVisibilidade(gate.storeId)) })
  } catch (e) {
    return compatServerError("marcas GET", e, "Falha ao carregar marcas")
  }
}

export async function PATCH(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  if (!b || !b.marcas || typeof b.marcas !== "object") {
    return NextResponse.json({ ok: false, error: "Informe { version, marcas }." }, { status: 400 })
  }
  try {
    // Só o mapa de marcas: as demais preferências da loja não são tocadas por esta rota.
    const r = await setPreferencias(prisma, gate.storeId, gate.actorId, { version: b.version, marcas: b.marcas })
    if (!r.ok) return compatResultResponse(r)
    return NextResponse.json({ ok: true, ...(await marcasComVisibilidade(gate.storeId)) })
  } catch (e) {
    return compatServerError("marcas PATCH", e, "Falha ao gravar marcas")
  }
}
