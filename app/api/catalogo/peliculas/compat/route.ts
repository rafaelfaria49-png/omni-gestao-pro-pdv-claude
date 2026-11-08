import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { setLojaCompatDecisao } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import {
  catalogoLojaFailureResponse,
  readJsonBody,
  requireCatalogoLojaWrite,
} from "@/lib/catalogo-aparelhos/loja-catalogo-api"

/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — decisão da LOJA sobre um par de modelos
 * equivalentes de película.
 * POST { modelKey, otherModelKey, decisao: "adicionar" | "suprimir" | "restaurar", status?, notes? }
 *  - adicionar: relação manual (não transitiva, nunca "confirmada pelo fabricante");
 *  - suprimir: esconde uma relação do catálogo global SÓ nesta loja (seed intacto);
 *  - restaurar: remove a decisão da loja (volta ao catálogo global).
 * Idempotente. Não toca estoque, preço, produto ou fiscal.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  try {
    const result = await setLojaCompatDecisao(prisma, loadCatalogoIndex(), gate.storeId, gate.actorId, {
      ...(body as Record<string, unknown>),
      categoria: "pelicula_tela",
    })
    if (!result.ok) return catalogoLojaFailureResponse(result)
    return NextResponse.json({ ok: true, ...result.value })
  } catch (e) {
    console.error("[api/catalogo/peliculas/compat POST]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ ok: false, error: "Falha ao gravar compatibilidade" }, { status: 500 })
  }
}
