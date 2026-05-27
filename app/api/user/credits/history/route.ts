import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCreditsUserIdForApi } from "@/lib/credits/api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const authUser = await requireCreditsUserIdForApi()
  if (!authUser.ok) return authUser.response
  const userId = authUser.userId

  const rows = await prisma.usage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, action: true, cost: true, createdAt: true },
  })

  return NextResponse.json({
    history: rows.map((r) => ({
      id: r.id,
      action: r.action,
      cost: r.cost,
      createdAt: r.createdAt,
    })),
  })
}

