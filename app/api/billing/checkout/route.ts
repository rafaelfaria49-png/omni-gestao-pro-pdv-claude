import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { stripe, getPriceId, PLAN_CONFIG } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import type { PlanName, BillingInterval } from "@/lib/stripe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const APP_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  let body: { plan?: string; interval?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const plan = (body.plan ?? "").toUpperCase() as PlanName
  const interval = (body.interval ?? "monthly") as BillingInterval

  if (!PLAN_CONFIG[plan]) {
    return NextResponse.json({ error: "Plano inválido" }, { status: 400 })
  }
  if (interval !== "monthly" && interval !== "yearly") {
    return NextResponse.json({ error: "Intervalo inválido" }, { status: 400 })
  }

  const priceId = getPriceId(plan, interval)

  // Buscar ou criar Stripe Customer
  const user = await prisma.adminUser.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, stripeCustomerId: true },
  })
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    })
  }

  // Criar Checkout Session
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: {
        userId: user.id,
        plan,
        interval,
      },
    },
    metadata: { userId: user.id, plan, interval },
    success_url: `${APP_URL}/dashboard/billing?success=1`,
    cancel_url: `${APP_URL}/dashboard/billing?canceled=1`,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    locale: "pt-BR",
  })

  return NextResponse.json({ url: checkoutSession.url })
}
