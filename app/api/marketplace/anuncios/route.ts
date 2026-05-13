import { NextResponse } from "next/server"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { listMarketplaceAnnouncements } from "@/lib/marketplace/services/marketplace-products-service"
import { prismaEnsureConnected } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireMarketplaceApi(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const connectionId = url.searchParams.get("connectionId")?.trim() || undefined
  const status = url.searchParams.get("status")?.trim() || undefined
  const syncStatus = url.searchParams.get("syncStatus")?.trim() || undefined
  const q = url.searchParams.get("q")?.trim() || undefined

  await prismaEnsureConnected()
  try {
    const announcements = await listMarketplaceAnnouncements(gate.storeId, {
      connectionId,
      status,
      syncStatus,
      q,
    })
    return NextResponse.json({ announcements })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Não foi possível carregar os anúncios."
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
