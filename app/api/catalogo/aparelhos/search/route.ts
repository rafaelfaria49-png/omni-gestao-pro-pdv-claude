import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { searchDeviceModels } from "@/lib/catalogo-aparelhos/catalogo-aparelhos"

/**
 * CATALOGO-APARELHOS-METADATA-MVP-001 — busca/autocomplete de modelos de aparelhos.
 *
 * SOMENTE LEITURA. Os dados vêm dos seeds versionados (lidos via `fs` no servidor —
 * por isso é uma API, não um import direto no client). Não é escopado por loja (catálogo
 * é referência global), mas exige sessão autenticada como o resto do dashboard.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_LIMIT = 30

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const brand = (url.searchParams.get("brand") ?? "").trim() || undefined
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : 20

  if (q.length < 2) {
    return NextResponse.json({ query: q, results: [] })
  }

  try {
    const index = loadCatalogoIndex()
    const results = searchDeviceModels(index, q, { limit, brand })
    return NextResponse.json({ query: q, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/catalogo/aparelhos/search]", msg)
    return NextResponse.json({ error: "Falha na busca do catálogo" }, { status: 500 })
  }
}
