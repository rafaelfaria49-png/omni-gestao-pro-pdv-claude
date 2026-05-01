import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getUserId } from "@/src/lib/auth/getUserId"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const userId = await getUserId()

  const rows = await prisma.creditPurchase.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      package: true,
      credits: true,
      amount: true,
      status: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      package: r.package,
      credits: r.credits,
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}

