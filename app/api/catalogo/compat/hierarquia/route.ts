import { NextResponse } from "next/server"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { FABRICANTES_SUGERIDOS, sugestoesHierarquia } from "@/lib/catalogo-aparelhos/hierarquia"
import { resolveCatalogoLojaRead } from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import { compatServerError } from "@/lib/compat/compat-api"

/**
 * COMPAT-PROFISSIONAL-001 — sugestões Fabricante › Marca › Linha para o cadastro de modelos,
 * derivadas do catálogo global (CSV, somente leitura). Evita digitação inconsistente.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await resolveCatalogoLojaRead(req)
  if (!gate.ok) return gate.response
  try {
    const arvore = sugestoesHierarquia(loadCatalogoIndex().models)
    const fabricantes = [...new Set([...FABRICANTES_SUGERIDOS, ...arvore.map((f) => f.fabricante)])]
    return NextResponse.json({ ok: true, fabricantes, arvore })
  } catch (e) {
    return compatServerError("hierarquia GET", e, "Falha ao carregar sugestões")
  }
}
