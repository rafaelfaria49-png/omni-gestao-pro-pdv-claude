import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_IDS = 200

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  let body: { ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const ids = body.ids
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids deve ser um array" }, { status: 400 })
  }
  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json({ error: "Loja não selecionada" }, { status: 400 })
  }

  const normalizedIds = Array.from(new Set(ids.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean)))
  if (normalizedIds.length === 0) {
    return NextResponse.json({ error: "Nenhum id válido fornecido" }, { status: 400 })
  }
  if (normalizedIds.length > MAX_IDS) {
    return NextResponse.json({ error: `Máximo de ${MAX_IDS} itens por lote` }, { status: 400 })
  }

  // 5 queries totais, independente do número de IDs (elimina N+1)
  const [produtos, osItemLinks, vendaLinks, listingLinks, linkLinks] = await Promise.all([
    prisma.produto.findMany({
      where: { id: { in: normalizedIds }, storeId },
      select: { id: true, name: true, sku: true },
    }),
    prisma.ordemServicoItem.findMany({
      where: { produtoId: { in: normalizedIds } },
      select: { produtoId: true },
    }),
    prisma.itemVenda.findMany({
      where: { inventoryId: { in: normalizedIds } },
      select: { inventoryId: true },
    }),
    prisma.marketplaceListing.findMany({
      where: { productId: { in: normalizedIds } },
      select: { productId: true },
    }),
    prisma.marketplaceProductLink.findMany({
      where: { produtoId: { in: normalizedIds } },
      select: { produtoId: true },
    }),
  ])

  // Contagem em memória — O(M) onde M = total de registros vinculados, nunca O(N × queries)
  const osItemMap = new Map<string, number>()
  for (const l of osItemLinks) {
    if (l.produtoId) osItemMap.set(l.produtoId, (osItemMap.get(l.produtoId) ?? 0) + 1)
  }

  const vendaMap = new Map<string, number>()
  for (const l of vendaLinks) {
    if (l.inventoryId) vendaMap.set(l.inventoryId, (vendaMap.get(l.inventoryId) ?? 0) + 1)
  }

  const listingMap = new Map<string, number>()
  for (const l of listingLinks) {
    if (l.productId) listingMap.set(l.productId, (listingMap.get(l.productId) ?? 0) + 1)
  }

  const linkMap = new Map<string, number>()
  for (const l of linkLinks) {
    if (l.produtoId) linkMap.set(l.produtoId, (linkMap.get(l.produtoId) ?? 0) + 1)
  }

  const produtoMap = new Map(produtos.map((p) => [p.id, p]))

  const results = normalizedIds.map((id) => {
    const prod = produtoMap.get(id)
    if (!prod) {
      return { id, exists: false, name: "", isLinked: false, reasons: ["Não encontrado"] }
    }

    const osItens = osItemMap.get(id) ?? 0
    const vendas = vendaMap.get(id) ?? 0
    const listings = listingMap.get(id) ?? 0
    const links = linkMap.get(id) ?? 0

    const isLinked = osItens + vendas + listings + links > 0
    const reasons: string[] = []
    if (osItens > 0) reasons.push(`${osItens} item(ns) de OS`)
    if (vendas > 0) reasons.push(`${vendas} venda(s)`)
    if (listings > 0) reasons.push(`${listings} anúncio(s) de marketplace`)
    if (links > 0) reasons.push(`${links} link(s) de marketplace`)

    return {
      id,
      exists: true,
      name: prod.name,
      sku: prod.sku,
      isLinked,
      reasons,
    }
  })

  return NextResponse.json({ results })
}
