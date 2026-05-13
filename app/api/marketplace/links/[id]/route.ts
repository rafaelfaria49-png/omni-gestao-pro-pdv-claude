import { NextResponse } from "next/server"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { allowMarketplaceSimulateErrors } from "@/lib/marketplace/simulate-flags"
import { patchMarketplaceLinkById } from "@/lib/marketplace/services/marketplace-products-service"
import { prismaEnsureConnected } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: RouteCtx) {
  const gate = await requireMarketplaceApi(req)
  if (!gate.ok) return gate.response

  const { id: linkId } = await ctx.params
  if (!linkId?.trim()) {
    return NextResponse.json({ error: "id do vínculo inválido" }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const action =
    b.action === "sync" || b.action === "update_stock" || b.action === "republicate" ? b.action : null
  const simulateError = allowMarketplaceSimulateErrors() && Boolean(b.simulateError)

  if (!action) {
    return NextResponse.json(
      { error: "action inválida. Use: sync | update_stock | republicate." },
      { status: 400 },
    )
  }

  await prismaEnsureConnected()
  try {
    const link = await patchMarketplaceLinkById({
      storeId: gate.storeId,
      linkId: linkId.trim(),
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
