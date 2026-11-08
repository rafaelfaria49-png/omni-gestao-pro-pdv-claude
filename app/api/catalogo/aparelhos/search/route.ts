import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { buildLojaCatalogoIndex, searchDeviceModelsComLoja } from "@/lib/catalogo-aparelhos/loja-catalogo"
import { listLojaModelos } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import { resolveCatalogoLojaRead } from "@/lib/catalogo-aparelhos/loja-catalogo-api"

/**
 * CATALOGO-APARELHOS-METADATA-MVP-001 — busca/autocomplete de modelos de aparelhos.
 *
 * SOMENTE LEITURA. Os dados vêm dos seeds versionados (lidos via `fs` no servidor —
 * por isso é uma API, não um import direto no client). Não é escopado por loja (catálogo
 * é referência global), mas exige sessão autenticada como o resto do dashboard.
 *
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001: soma os modelos cadastrados manualmente
 * pela LOJA ATIVA (lidos do banco a cada busca — sem cache, sem redeploy). Sem loja
 * resolvida/autorizada, ou com a tabela indisponível, segue só com o catálogo global.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_LIMIT = 30

export async function GET(req: Request) {
  const gate = await resolveCatalogoLojaRead(req)
  if (!gate.ok) return gate.response

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
    const lojaIndex = gate.storeId ? buildLojaCatalogoIndex(await listLojaModelos(prisma, gate.storeId)) : null
    const results = searchDeviceModelsComLoja(index, lojaIndex, q, { limit, brand })
    return NextResponse.json({ query: q, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/catalogo/aparelhos/search]", msg)
    return NextResponse.json({ error: "Falha na busca do catálogo" }, { status: 500 })
  }
}
