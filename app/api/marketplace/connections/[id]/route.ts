import { NextResponse } from "next/server"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import {
  deleteMarketplaceConnection,
  patchMarketplaceConnection,
  serializeMarketplaceConnection,
} from "@/lib/marketplace/services/marketplace-connections-service"
import { prismaEnsureConnected } from "@/lib/prisma"
import type { MarketplaceConnectionStatus } from "@/generated/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const ALLOWED_STATUS: MarketplaceConnectionStatus[] = ["DISCONNECTED", "CONNECTED", "ERROR", "SYNCING"]

function parseStatus(v: unknown): MarketplaceConnectionStatus | undefined {
  if (typeof v !== "string") return undefined
  return ALLOWED_STATUS.includes(v as MarketplaceConnectionStatus) ? (v as MarketplaceConnectionStatus) : undefined
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireMarketplaceApi(req)
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const simulateSync = o.simulateSync === true
  const accountName = typeof o.accountName === "string" ? o.accountName : undefined
  const status = parseStatus(o.status)
  const metadata =
    "metadata" in o ? (o.metadata === null || o.metadata === undefined ? null : (o.metadata as Record<string, unknown>)) : undefined

  if (!simulateSync && accountName === undefined && status === undefined && metadata === undefined) {
    return NextResponse.json({ error: "Nada para atualizar. Envie accountName, status, metadata ou simulateSync." }, { status: 400 })
  }

  await prismaEnsureConnected()
  const row = await patchMarketplaceConnection({
    storeId: gate.storeId,
    id,
    accountName,
    status,
    metadata: metadata === undefined ? undefined : metadata,
    simulateSync,
  })
  if (!row) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 })
  return NextResponse.json({ connection: serializeMarketplaceConnection(row) })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireMarketplaceApi(_req)
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  await prismaEnsureConnected()
  const ok = await deleteMarketplaceConnection(gate.storeId, id)
  if (!ok) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
