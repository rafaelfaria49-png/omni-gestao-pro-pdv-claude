import { NextResponse } from "next/server"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import { exportMarketplaceProducts } from "@/lib/marketplace/services/marketplace-products-service"
import { prismaEnsureConnected } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request) {
  const gate = await requireMarketplaceApi(req)
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const connectionId = typeof b.connectionId === "string" ? b.connectionId.trim() : ""
  const productIdsRaw = b.productIds
  const productIds = Array.isArray(productIdsRaw)
    ? productIdsRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : typeof b.productId === "string" && b.productId.trim()
      ? [b.productId.trim()]
      : []
  const simulatePublishError = Boolean(b.simulatePublishError)

  if (!connectionId) {
    return NextResponse.json({ error: "connectionId é obrigatório." }, { status: 400 })
  }

  await prismaEnsureConnected()
  try {
    const results = await exportMarketplaceProducts({
      storeId: gate.storeId,
      connectionId,
      productIds,
      simulatePublishError,
    })
    return NextResponse.json({ ok: true, results }, { status: 200 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao exportar"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
