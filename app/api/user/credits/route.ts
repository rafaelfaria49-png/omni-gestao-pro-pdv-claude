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

  // Se o usuário ainda não existir (ambiente novo/mocks), cria um registro mínimo.
  const user = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      name: "Administrador",
      pin: `mock-${userId}`,
      role: "ADMIN",
    },
    select: { credits: true },
  })

  return NextResponse.json({ credits: user.credits })
}

