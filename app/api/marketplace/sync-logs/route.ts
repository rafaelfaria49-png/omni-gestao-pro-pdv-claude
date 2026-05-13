import { NextResponse } from "next/server"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { listMarketplaceSyncLogs } from "@/lib/marketplace/services/marketplace-products-service"
import { prismaEnsureConnected } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireMarketplaceApi(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const connectionId = url.searchParams.get("connectionId")?.trim() || undefined
  const produtoId = url.searchParams.get("produtoId")?.trim() || undefined
  const linkId = url.searchParams.get("linkId")?.trim() || undefined
  const limitRaw = url.searchParams.get("limit")
  const take = limitRaw ? Number.parseInt(limitRaw, 10) : undefined

  await prismaEnsureConnected()
  try {
    const logs = await listMarketplaceSyncLogs({
      storeId: gate.storeId,
      connectionId,
      produtoId,
      productLinkId: linkId,
      take: Number.isFinite(take) ? take : undefined,
    })
    return NextResponse.json({ logs })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível carregar os logs."
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
