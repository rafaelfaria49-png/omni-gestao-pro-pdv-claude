import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { getPeliculasPorModelo, type PeliculaGrupoMember } from "@/lib/catalogo-aparelhos/peliculas"
import {
  applyPeliculaOverrides,
  buildLojaCatalogoIndex,
  isManualModelKey,
  lojaModeloCanonicalName,
  overridesUtilizaveis,
  searchDeviceModelsComLoja,
  type LojaModelo,
} from "@/lib/catalogo-aparelhos/loja-catalogo"
import {
  getLojaModelosByKeys,
  listLojaCompatOverrides,
  listLojaModelos,
} from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import { resolveCatalogoLojaRead } from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import type { CatalogoIndex, DeviceModel } from "@/lib/catalogo-aparelhos/types"

/**
 * CATALOGO-PELICULAS-BUSCADOR-MVP-002 — buscador de películas por modelo/alias.
 *
 * SOMENTE LEITURA. Mesmo padrão de `/api/catalogo/aparelhos/search`: catálogo global
 * (seeds versionados via `catalogo-loader`), exige sessão.
 * Nada aqui cria produto, baixa estoque ou registra venda.
 *
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001: na loja ativa, soma os modelos manuais
 * e aplica as decisões da loja (relação manual / supressão de relação global). O seed
 * global nunca é alterado; outra loja nunca vê essas decisões.
 *
 * Contrato:
 *  - GET ?q=A06           → busca por modelo/alias/marca e anexa grupos de película.
 *  - GET ?modelKey=<key>  → detalhe exato de um modelo canônico (ou manual da loja).
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

function modelPayload(model: DeviceModel, source: "global" | "loja") {
  return {
    modelKey: model.modelKey,
    canonicalName: model.canonicalName,
    brand: model.brand,
    commercialLine: model.commercialLine,
    confidence: model.confidence,
    status: model.status,
    source,
  }
}

type BaseResult = {
  model: ReturnType<typeof modelPayload>
  aliases: string[]
  ambiguous: boolean
  requiresBrandContext: boolean
  flags: string[]
  matchType?: string
  matchedText?: string
}

/** Anexa grupos globais + decisões da loja a cada resultado. */
async function withPeliculaGroups(
  index: CatalogoIndex,
  storeId: string | null,
  lojaModelos: readonly LojaModelo[],
  base: BaseResult[],
) {
  const keys = base.map((r) => r.model.modelKey)
  const allOverrides = storeId ? await listLojaCompatOverrides(prisma, storeId, "pelicula_tela", keys) : []

  const manualByKey = new Map(lojaModelos.map((m) => [m.modelKey, m]))
  const faltantes = allOverrides
    .flatMap((o) => [o.modelKeyA, o.modelKeyB])
    .filter((k) => isManualModelKey(k) && !manualByKey.has(k))
  if (storeId && faltantes.length > 0) {
    for (const m of await getLojaModelosByKeys(prisma, storeId, faltantes)) manualByKey.set(m.modelKey, m)
  }

  // Modelo manual desativado (ou de outra loja) e chave global que saiu do CSV não aparecem como equivalente.
  const overrides = overridesUtilizaveis(
    allOverrides,
    (k) => index.modelByKey.has(k),
    (k) => manualByKey.get(k)?.active === true,
  )

  const resolveMember = (modelKey: string): PeliculaGrupoMember => {
    const g = index.modelByKey.get(modelKey)
    if (g) return { modelKey, canonicalName: g.canonicalName || modelKey, brand: g.brand }
    const m = manualByKey.get(modelKey)
    if (m) return { modelKey, canonicalName: lojaModeloCanonicalName(m), brand: m.brand }
    return { modelKey, canonicalName: modelKey, brand: "" }
  }

  return base.map((r) => {
    const { grupos, suprimidos } = applyPeliculaOverrides(
      r.model.modelKey,
      getPeliculasPorModelo(index, r.model.modelKey),
      overrides,
      resolveMember,
    )
    return { ...r, peliculaGroups: grupos, suprimidosPelaLoja: suprimidos }
  })
}

export async function GET(req: Request) {
  const gate = await resolveCatalogoLojaRead(req)
  if (!gate.ok) return gate.response
  const storeId = gate.storeId

  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const modelKey = (url.searchParams.get("modelKey") ?? "").trim()
  const brand = (url.searchParams.get("brand") ?? "").trim() || undefined
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : DEFAULT_LIMIT

  try {
    const index = loadCatalogoIndex()
    const lojaModelos = storeId ? await listLojaModelos(prisma, storeId) : []
    const lojaIndex = buildLojaCatalogoIndex(lojaModelos)

    // Detalhe exato por modelKey (após o operador escolher no autocomplete).
    if (modelKey) {
      const globalModel = index.modelByKey.get(modelKey)
      const model = globalModel ?? lojaIndex.modelByKey.get(modelKey)
      if (!model) {
        return NextResponse.json({
          ok: true,
          query: modelKey,
          results: [],
          message: "Modelo não encontrado no catálogo. Confirme fisicamente antes de vender.",
          warnings: AVISOS_FIXOS,
        })
      }
      const source = globalModel ? "global" : "loja"
      const results = await withPeliculaGroups(index, storeId, lojaModelos, [
        {
          model: modelPayload(model, source),
          aliases: principalAliases(globalModel ? index : lojaIndex, model.modelKey),
          ambiguous: false,
          requiresBrandContext: false,
          flags: source === "loja" ? ["cadastro_manual_loja"] : [],
        },
      ])
      return NextResponse.json({ ok: true, query: modelKey, results, warnings: AVISOS_FIXOS })
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

    const matches = searchDeviceModelsComLoja(index, lojaIndex, q, { limit, brand })
    const results = await withPeliculaGroups(
      index,
      storeId,
      lojaModelos,
      matches.map((r) => ({
        model: {
          modelKey: r.modelKey,
          canonicalName: r.canonicalName,
          brand: r.brand,
          commercialLine: r.commercialLine,
          confidence: r.confidence,
          status: r.status,
          source: r.source ?? "global",
        },
        aliases: r.aliases,
        ambiguous: r.ambiguous,
        requiresBrandContext: r.requiresBrandContext,
        flags: r.reviewFlags,
        matchType: r.matchType,
        matchedText: r.matchedText,
      })),
    )

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
