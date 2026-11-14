import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { readJsonBody, requireCatalogoLojaWrite } from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import { compatResultResponse, compatServerError, requireCompatGestaoRead } from "@/lib/compat/compat-api"
import { resolverModelosCompat } from "@/lib/compat/compat-modelos"
import {
  addLocalizacao,
  listLocalizacoes,
  removeLocalizacao,
  setLocalizacaoPrincipal,
} from "@/lib/compat/compat-store"

/**
 * COMPAT-PROFISSIONAL-001 — onde fica a capinha (endereço físico; nunca quantidade).
 *  - GET    ?modelKey=&produtoId=&painelId=  → localizações (com nomes de modelo/produto)
 *  - POST   { modelKey?, produtoId?, painelId, fileiraId?, posicao?, principal?, notes? }
 *  - PATCH  { id, principal: true }          → torna a localização principal do alvo
 *  - DELETE ?id=                              → remove só o vínculo (produto/estoque intactos)
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireCompatGestaoRead(req)
  if (!gate.ok) return gate.response
  const url = new URL(req.url)
  const modelKey = (url.searchParams.get("modelKey") ?? "").trim()
  const produtoId = (url.searchParams.get("produtoId") ?? "").trim()
  const painelId = (url.searchParams.get("painelId") ?? "").trim()
  try {
    const locs = await listLocalizacoes(prisma, gate.storeId, {
      modelKeys: modelKey ? [modelKey] : [],
      produtoIds: produtoId ? [produtoId] : [],
      painelId: painelId || undefined,
    })
    const index = loadCatalogoIndex()
    const modelos = await resolverModelosCompat(index, gate.storeId, locs.map((l) => l.modelKey).filter(Boolean))
    const produtoIds = [...new Set(locs.map((l) => l.produtoId).filter((v): v is string => !!v))]
    const produtos = produtoIds.length
      ? await prisma.produto.findMany({
          where: { storeId: gate.storeId, id: { in: produtoIds } },
          select: { id: true, name: true, stock: true },
        })
      : []
    const porProduto = new Map(produtos.map((p) => [p.id, p]))
    return NextResponse.json({
      ok: true,
      localizacoes: locs.map((l) => ({
        ...l,
        modeloNome: l.modelKey ? (modelos.get(l.modelKey)?.canonicalName ?? l.modelKey) : null,
        produtoNome: l.produtoId ? (porProduto.get(l.produtoId)?.name ?? "Produto removido") : null,
      })),
    })
  } catch (e) {
    return compatServerError("localizacoes GET", e, "Falha ao carregar localizações")
  }
}

export async function POST(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  if (body === null) return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  try {
    return compatResultResponse(await addLocalizacao(prisma, loadCatalogoIndex(), gate.storeId, gate.actorId, body), 201)
  } catch (e) {
    return compatServerError("localizacoes POST", e, "Falha ao gravar localização")
  }
}

export async function PATCH(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  if (!b || typeof b.id !== "string" || b.principal !== true) {
    return NextResponse.json({ ok: false, error: "Informe { id, principal: true }." }, { status: 400 })
  }
  try {
    return compatResultResponse(await setLocalizacaoPrincipal(prisma, gate.storeId, b.id))
  } catch (e) {
    return compatServerError("localizacoes PATCH", e, "Falha ao gravar localização")
  }
}

export async function DELETE(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "Informe a localização." }, { status: 400 })
  try {
    return compatResultResponse(await removeLocalizacao(prisma, gate.storeId, id))
  } catch (e) {
    return compatServerError("localizacoes DELETE", e, "Falha ao remover localização")
  }
}
