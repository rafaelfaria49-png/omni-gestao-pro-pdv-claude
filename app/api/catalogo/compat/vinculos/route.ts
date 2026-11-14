import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { getPeliculasPorModelo } from "@/lib/catalogo-aparelhos/peliculas"
import { otherKeyOf, type LojaCompatCategoria } from "@/lib/catalogo-aparelhos/loja-catalogo"
import { listLojaCompatOverrides, setLojaCompatDecisao } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import {
  catalogoLojaFailureResponse,
  readJsonBody,
  requireCatalogoLojaWrite,
} from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import { compatServerError, requireCompatGestaoRead } from "@/lib/compat/compat-api"
import { resolverModelosCompat } from "@/lib/compat/compat-modelos"

/**
 * COMPAT-PROFISSIONAL-001 — vínculos de compatibilidade de UM modelo principal.
 *
 *  - GET  ?categoria=pelicula_tela|capinha&modelKey=<key>
 *      → vínculos da loja (status, origem, quem confirmou) + (película) membros do catálogo global.
 *  - POST { categoria, modelKey, otherModelKeys: string[], decisao, status?, notes?, origem?, confirmacaoFisica? }
 *      → aplica a mesma decisão a vários modelos (até 30). Cada par é independente e idempotente.
 *
 * Película e capinha NUNCA se misturam: cada chamada opera em UMA categoria.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_LOTE = 30

function categoriaDe(v: unknown): LojaCompatCategoria | null {
  return v === "pelicula_tela" || v === "capinha" ? v : null
}

export async function GET(req: Request) {
  const gate = await requireCompatGestaoRead(req)
  if (!gate.ok) return gate.response
  const url = new URL(req.url)
  const categoria = categoriaDe(url.searchParams.get("categoria"))
  const modelKey = (url.searchParams.get("modelKey") ?? "").trim().slice(0, 160)
  if (!categoria || !modelKey) {
    return NextResponse.json({ ok: false, error: "Informe categoria e modelKey." }, { status: 400 })
  }
  try {
    const index = loadCatalogoIndex()
    const overrides = await listLojaCompatOverrides(prisma, gate.storeId, categoria, [modelKey])
    const globais =
      categoria === "pelicula_tela"
        ? getPeliculasPorModelo(index, modelKey).flatMap((g) =>
            g.members.map((m) => ({ ...m, groupName: g.groupName, status: g.status })),
          )
        : []
    const keys = [modelKey, ...overrides.flatMap((o) => [o.modelKeyA, o.modelKeyB]), ...globais.map((g) => g.modelKey)]
    const resolvidos = await resolverModelosCompat(index, gate.storeId, keys)
    const principal = resolvidos.get(modelKey)
    if (!principal) return NextResponse.json({ ok: false, error: "Modelo não encontrado nesta loja." }, { status: 404 })

    const vinculos = overrides.map((o) => {
      const other = otherKeyOf(o, modelKey) as string
      const r = resolvidos.get(other)
      return {
        modelKey: other,
        canonicalName: r?.canonicalName ?? other,
        brand: r?.brand ?? "",
        source: r?.source ?? null,
        ativo: r ? r.active : false,
        acao: o.acao,
        status: o.status,
        notes: o.notes,
        origem: o.origem ?? "",
        confirmedBy: o.confirmedBy ?? "",
        confirmedAt: o.confirmedAt ?? null,
      }
    })
    return NextResponse.json({ ok: true, categoria, modelo: principal, vinculos, globais })
  } catch (e) {
    return compatServerError("vinculos GET", e, "Falha ao carregar vínculos")
  }
}

export async function POST(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const b = body as Record<string, unknown>
  const categoria = categoriaDe(b.categoria)
  if (!categoria) return NextResponse.json({ ok: false, error: "Categoria inválida." }, { status: 400 })
  const outros = Array.isArray(b.otherModelKeys)
    ? [...new Set(b.otherModelKeys.filter((k): k is string => typeof k === "string" && !!k.trim()))]
    : typeof b.otherModelKey === "string"
      ? [b.otherModelKey]
      : []
  if (outros.length === 0) return NextResponse.json({ ok: false, error: "Escolha ao menos um modelo." }, { status: 400 })
  if (outros.length > MAX_LOTE) {
    return NextResponse.json({ ok: false, error: `No máximo ${MAX_LOTE} modelos por vez.` }, { status: 400 })
  }
  try {
    const index = loadCatalogoIndex()
    const resultados: { modelKey: string; ok: boolean; error?: string }[] = []
    for (const other of outros) {
      const r = await setLojaCompatDecisao(prisma, index, gate.storeId, gate.actorId, {
        categoria,
        modelKey: b.modelKey,
        otherModelKey: other,
        decisao: b.decisao,
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.notes !== undefined ? { notes: b.notes } : {}),
        ...(b.origem !== undefined ? { origem: b.origem } : {}),
        ...(b.confirmacaoFisica !== undefined ? { confirmacaoFisica: b.confirmacaoFisica } : {}),
      })
      // Lote de 1, ou falha já no 1º item (validação comum: decisão/status/confirmação/indisponível):
      // responde o erro direto, sem gravação parcial.
      if (!r.ok && (outros.length === 1 || resultados.length === 0)) return catalogoLojaFailureResponse(r)
      resultados.push(r.ok ? { modelKey: other, ok: true } : { modelKey: other, ok: false, error: r.message })
    }
    const falhas = resultados.filter((r) => !r.ok).length
    return NextResponse.json({ ok: true, resultados, gravados: resultados.length - falhas, falhas })
  } catch (e) {
    return compatServerError("vinculos POST", e, "Falha ao gravar vínculos")
  }
}
