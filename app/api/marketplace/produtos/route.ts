import { NextResponse } from "next/server"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { listMarketplaceCatalog } from "@/lib/marketplace/services/marketplace-products-service"
import { prismaEnsureConnected } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireMarketplaceApi(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const connectionId = url.searchParams.get("connectionId")?.trim() || undefined

  await prismaEnsureConnected()
  const products = await listMarketplaceCatalog(gate.storeId, { connectionId })
  return NextResponse.json({ products })
}
