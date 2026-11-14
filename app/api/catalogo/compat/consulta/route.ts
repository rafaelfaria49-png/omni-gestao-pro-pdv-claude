import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import {
  AVISO_CATEGORIAS_INDEPENDENTES,
  buildCapinhaGrupos,
  isManualModelKey,
} from "@/lib/catalogo-aparelhos/loja-catalogo"
import { listLojaCompatOverrides } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import { resolveCatalogoLojaRead } from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import { compatServerError } from "@/lib/compat/compat-api"
import { filtrarOverridesValidos, memberFrom, resolverModelosCompat } from "@/lib/compat/compat-modelos"
import { listLocalizacoes, listProdutosCapinha } from "@/lib/compat/compat-store"

/**
 * COMPAT-PROFISSIONAL-001 — consulta rápida de CAPINHA por modelo (Compat e PDV).
 *
 * GET ?modelKey=<key> → {
 *   modelo, capinhaGroups (relações da loja, por status, não transitivas),
 *   localizacoes (do modelo, de modelos compatíveis e de produtos detalhados),
 *   produtos: { detalhados (estoque próprio), gerais (estoque GERAL — não garante este modelo) }
 * }
 * SOMENTE LEITURA. Estoque geral nunca é apresentado como disponibilidade do modelo.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const AVISO_ESTOQUE_GERAL =
  "Estoque geral: soma de todas as capinhas desse tipo. Não confirma que existe uma para este modelo — confira no painel."

export async function GET(req: Request) {
  const gate = await resolveCatalogoLojaRead(req)
  if (!gate.ok) return gate.response
  const storeId = gate.storeId
  const modelKey = (new URL(req.url).searchParams.get("modelKey") ?? "").trim().slice(0, 160)
  if (!modelKey) return NextResponse.json({ ok: false, error: "Informe o modelo." }, { status: 400 })
  try {
    const index = loadCatalogoIndex()
    const overridesBrutos = storeId ? await listLojaCompatOverrides(prisma, storeId, "capinha", [modelKey]) : []
    const keys = [modelKey, ...overridesBrutos.flatMap((o) => [o.modelKeyA, o.modelKeyB])]
    const resolvidos = await resolverModelosCompat(index, storeId, keys)
    const modelo = resolvidos.get(modelKey)
    if (!modelo || (isManualModelKey(modelKey) && !modelo.active)) {
      return NextResponse.json({ ok: false, error: "Modelo não encontrado no catálogo desta loja." }, { status: 404 })
    }
    const overrides = filtrarOverridesValidos(index, overridesBrutos, resolvidos)
    const capinhaGroups = buildCapinhaGrupos(modelKey, overrides, memberFrom(resolvidos))
    // "Não recomendado" não serve de atalho para achar capinha de outro modelo.
    const compativeis = capinhaGroups
      .filter((g) => g.status !== "nao_recomendado")
      .flatMap((g) => g.members.map((m) => ({ ...m, status: g.status })))
    const statusPorModelo = new Map(compativeis.map((c) => [c.modelKey, c.status]))

    if (!storeId) {
      return NextResponse.json({
        ok: true,
        modelo,
        capinhaGroups,
        localizacoes: [],
        produtos: { detalhados: [], gerais: [] },
        avisos: [AVISO_CATEGORIAS_INDEPENDENTES],
      })
    }

    const produtos = await listProdutosCapinha(prisma, storeId)
    const chavesRelevantes = new Set([modelKey, ...compativeis.map((c) => c.modelKey)])
    const detalhados = produtos
      .filter((p) => p.controle === "detalhado" && p.deviceModelKeys.some((k) => chavesRelevantes.has(k)))
      .map((p) => {
        const direto = p.deviceModelKeys.includes(modelKey)
        const via = direto ? null : p.deviceModelKeys.find((k) => chavesRelevantes.has(k)) ?? null
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          stock: p.stock,
          vinculo: direto ? "modelo" : "compativel",
          viaModelo: via ? (resolvidos.get(via)?.canonicalName ?? via) : null,
          viaStatus: via ? (statusPorModelo.get(via) ?? null) : null,
        }
      })
      .sort((a, b) => (a.vinculo === b.vinculo ? a.name.localeCompare(b.name, "pt-BR") : a.vinculo === "modelo" ? -1 : 1))

    const gerais = produtos
      .filter((p) => p.controle === "geral")
      .map((p) => ({ id: p.id, name: p.name, sku: p.sku, stockGeral: p.stock, pedeModeloNaVenda: p.pedeModeloNaVenda }))

    const locs = await listLocalizacoes(prisma, storeId, {
      modelKeys: [...chavesRelevantes],
      produtoIds: detalhados.map((d) => d.id),
    })
    const localizacoes = locs
      .filter((l) => l.painelAtivo && l.fileiraAtiva)
      .map((l) => ({
        ...l,
        alvo: l.produtoId ? "produto" : l.modelKey === modelKey ? "modelo" : "compativel",
        produtoNome: l.produtoId
          ? (detalhados.find((d) => d.id === l.produtoId)?.name ?? gerais.find((g) => g.id === l.produtoId)?.name ?? null)
          : null,
        viaModelo: !l.produtoId && l.modelKey !== modelKey ? (resolvidos.get(l.modelKey)?.canonicalName ?? l.modelKey) : null,
        viaStatus: !l.produtoId && l.modelKey !== modelKey ? (statusPorModelo.get(l.modelKey) ?? null) : null,
      }))
      .sort((a, b) => {
        const rank = (x: typeof a) => (x.alvo === "modelo" ? 0 : x.alvo === "produto" ? 1 : 2)
        return rank(a) - rank(b) || Number(b.principal) - Number(a.principal)
      })

    return NextResponse.json({
      ok: true,
      modelo,
      capinhaGroups,
      localizacoes,
      produtos: { detalhados, gerais },
      avisos: [AVISO_CATEGORIAS_INDEPENDENTES, ...(gerais.length ? [AVISO_ESTOQUE_GERAL] : [])],
    })
  } catch (e) {
    return compatServerError("consulta GET", e, "Falha na consulta de capinhas")
  }
}
