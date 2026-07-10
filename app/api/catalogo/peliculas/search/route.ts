import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { searchDeviceModels } from "@/lib/catalogo-aparelhos/catalogo-aparelhos"
import { getPeliculasPorModelo } from "@/lib/catalogo-aparelhos/peliculas"
import type { CatalogoIndex, DeviceModel } from "@/lib/catalogo-aparelhos/types"

/**
 * CATALOGO-PELICULAS-BUSCADOR-MVP-002 — buscador de películas por modelo/alias.
 *
 * SOMENTE LEITURA. Mesmo padrão de `/api/catalogo/aparelhos/search`: catálogo global
 * (seeds versionados via `catalogo-loader`), sem escopo de loja, exige sessão.
 * Nada aqui cria produto, baixa estoque ou registra venda.
 *
 * Contrato:
 *  - GET ?q=A06           → busca por modelo/alias/marca e anexa grupos de película.
 *  - GET ?modelKey=<key>  → detalhe exato de um modelo canônico.
 *
 * Nota de deploy: os CSVs são lidos via `fs` — a rota tem entrada própria em
 * `outputFileTracingIncludes` no next.config.mjs (sem ela, produção degrada em vazio).
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/** Limite baixo: cada resultado carrega grupos+membros (payload cresce rápido). */
const MAX_LIMIT = 10
const DEFAULT_LIMIT = 6

/** Avisos fixos de domínio — sempre presentes na resposta. */
const AVISOS_FIXOS = [
  "Compatibilidade de película não garante compatibilidade de capinha.",
  "Confirme fisicamente antes de vender quando status for provável ou precisa testar.",
] as const

function principalAliases(index: CatalogoIndex, modelKey: string, max = 6): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of index.aliasesByModelKey.get(modelKey) ?? []) {
    const key = a.alias.trim().toUpperCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(a.alias)
    if (out.length >= max) break
  }
  return out
}

function modelPayload(model: DeviceModel) {
  return {
    modelKey: model.modelKey,
    canonicalName: model.canonicalName,
    brand: model.brand,
    commercialLine: model.commercialLine,
    confidence: model.confidence,
    status: model.status,
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const modelKey = (url.searchParams.get("modelKey") ?? "").trim()
  const brand = (url.searchParams.get("brand") ?? "").trim() || undefined
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : DEFAULT_LIMIT

  try {
    const index = loadCatalogoIndex()

    // Detalhe exato por modelKey (após o operador escolher no autocomplete).
    if (modelKey) {
      const model = index.modelByKey.get(modelKey)
      if (!model) {
        return NextResponse.json({
          ok: true,
          query: modelKey,
          results: [],
          message: "Modelo não encontrado no catálogo. Confirme fisicamente antes de vender.",
          warnings: AVISOS_FIXOS,
        })
      }
      return NextResponse.json({
        ok: true,
        query: modelKey,
        results: [
          {
            model: modelPayload(model),
            aliases: principalAliases(index, model.modelKey),
            ambiguous: false,
            requiresBrandContext: false,
            flags: [],
            peliculaGroups: getPeliculasPorModelo(index, model.modelKey),
          },
        ],
        warnings: AVISOS_FIXOS,
      })
    }

    if (q.length < 2) {
      return NextResponse.json({
        ok: true,
        query: q,
        results: [],
        message: "Digite pelo menos 2 caracteres para buscar.",
        warnings: AVISOS_FIXOS,
      })
    }

    const matches = searchDeviceModels(index, q, { limit, brand })
    const results = matches.map((r) => ({
      model: {
        modelKey: r.modelKey,
        canonicalName: r.canonicalName,
        brand: r.brand,
        commercialLine: r.commercialLine,
        confidence: r.confidence,
        status: r.status,
      },
      aliases: r.aliases,
      ambiguous: r.ambiguous,
      requiresBrandContext: r.requiresBrandContext,
      flags: r.reviewFlags,
      matchType: r.matchType,
      matchedText: r.matchedText,
      peliculaGroups: getPeliculasPorModelo(index, r.modelKey),
    }))

    return NextResponse.json({
      ok: true,
      query: q,
      results,
      ...(results.length === 0
        ? { message: "Nenhum aparelho encontrado. Confira a grafia ou confirme o modelo fisicamente." }
        : {}),
      warnings: AVISOS_FIXOS,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/catalogo/peliculas/search]", msg)
    return NextResponse.json({ ok: false, error: "Falha na busca de películas" }, { status: 500 })
  }
}
