import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const APP_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

export async function POST(accessRequest: Request) {
  const moduleDenied = await requireModuleApi(accessRequest, "billing")
  if (moduleDenied) return moduleDenied

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  })

  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: "Nenhuma assinatura encontrada. Assine um plano primeiro." },
      { status: 400 }
    )
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${APP_URL}/dashboard/billing`,
  })

  return NextResponse.json({ url: portalSession.url })
}
