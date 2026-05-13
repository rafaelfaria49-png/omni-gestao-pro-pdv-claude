import { NextResponse } from "next/server"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { patchMarketplaceProductLink } from "@/lib/marketplace/services/marketplace-products-service"
import { prismaEnsureConnected } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: RouteCtx) {
  const gate = await requireMarketplaceApi(req)
  if (!gate.ok) return gate.response

  const { id: produtoId } = await ctx.params
  if (!produtoId?.trim()) {
    return NextResponse.json({ error: "id do produto inválido" }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const connectionId = typeof b.connectionId === "string" ? b.connectionId.trim() : ""
  const action = b.action === "sync" || b.action === "update_stock" ? b.action : null
  const simulateError = Boolean(b.simulateError)

  if (!connectionId) {
    return NextResponse.json({ error: "connectionId é obrigatório." }, { status: 400 })
  }
  if (!action) {
    return NextResponse.json({ error: "action inválida. Use: sync | update_stock." }, { status: 400 })
  }

  await prismaEnsureConnected()
  try {
    const link = await patchMarketplaceProductLink({
      storeId: gate.storeId,
      produtoId: produtoId.trim(),
      connectionId,
      action,
      simulateError,
    })
    return NextResponse.json({ ok: true, link })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar"
    const status = msg.includes("não encontrado") ? 404 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
