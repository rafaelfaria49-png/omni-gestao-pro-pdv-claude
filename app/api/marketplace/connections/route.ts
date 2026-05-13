import { NextResponse } from "next/server"
import { requireMarketplaceApi } from "@/lib/marketplace/api-gate"
import {
  createMarketplaceConnection,
  defaultAccountName,
  listMarketplaceConnections,
  parseProvider,
} from "@/lib/marketplace/services/marketplace-connections-service"
import { prismaEnsureConnected } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function serializeConnection(row: Awaited<ReturnType<typeof listMarketplaceConnections>>[number]) {
  return {
    id: row.id,
    storeId: row.storeId,
    provider: row.provider,
    accountName: row.accountName,
    status: row.status,
    metadata: row.metadata ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncMessage: row.lastSyncMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    recentSyncLogs: row.syncLogs.map((l) => ({
      id: l.id,
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    })),
  }
}

export async function GET(req: Request) {
  const gate = await requireMarketplaceApi(req)
  if (!gate.ok) return gate.response
  await prismaEnsureConnected()
  const rows = await listMarketplaceConnections(gate.storeId)
  return NextResponse.json({
    connections: rows.map(serializeConnection),
  })
}

export async function POST(req: Request) {
  const gate = await requireMarketplaceApi(req)
  if (!gate.ok) return gate.response
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const provider = parseProvider(body)
  if (!provider) {
    return NextResponse.json(
      { error: "provider inválido. Use: MERCADO_LIVRE | SHOPEE | AMAZON | MAGALU." },
      { status: 400 }
    )
  }
  const accountRaw =
    body && typeof body === "object" && "accountName" in body ? (body as { accountName?: unknown }).accountName : ""
  const accountName =
    typeof accountRaw === "string" && accountRaw.trim().length > 0 ? accountRaw.trim() : defaultAccountName(provider)

  await prismaEnsureConnected()
  const row = await createMarketplaceConnection({
    storeId: gate.storeId,
    provider,
    accountName,
    metadata:
      body && typeof body === "object" && "metadata" in body && (body as { metadata?: unknown }).metadata
        ? ((body as { metadata?: Record<string, unknown> }).metadata ?? null)
        : null,
  })
  return NextResponse.json({ connection: serializeConnection(row) }, { status: 201 })
}
