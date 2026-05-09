import { NextResponse } from "next/server"
import Stripe from "stripe"
import { stripe, PLAN_CONFIG } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ""

// Mapeia price_id → { plan, interval } usando as variáveis de ambiente
function resolvePlan(priceId: string): { plan: string; interval: string } | null {
  const plans = ["BRONZE", "PRATA", "OURO", "DIAMANTE"] as const
  const intervals = ["MONTHLY", "YEARLY"] as const
  for (const plan of plans) {
    for (const interval of intervals) {
      const key = `STRIPE_PRICE_${plan}_${interval}` as keyof NodeJS.ProcessEnv
      if (process.env[key] === priceId) {
        return { plan, interval: interval.toLowerCase() }
      }
    }
  }
  return null
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId
  const plan = session.metadata?.plan
  const interval = session.metadata?.interval
  if (!userId || !plan || !interval) return

  const subscriptionId = session.subscription as string
  if (!subscriptionId) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const priceId = subscription.items.data[0]?.price.id ?? ""
  const creditsIA = PLAN_CONFIG[plan as keyof typeof PLAN_CONFIG]?.creditsIA ?? 0

  await prisma.adminUser.update({
    where: { id: userId },
    data: {
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      subscriptionStatus: subscription.status,
      planName: plan,
      billingInterval: interval,
      creditsIA,
      creditsUsed: 0,
      currentPeriodEnd: new Date(((subscription as unknown as { current_period_end: number }).current_period_end) * 1000),
    },
  })
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const user = await prisma.adminUser.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  })
  if (!user) return

  const priceId = subscription.items.data[0]?.price.id ?? ""
  const resolved = resolvePlan(priceId)
  const creditsIA = resolved
    ? (PLAN_CONFIG[resolved.plan as keyof typeof PLAN_CONFIG]?.creditsIA ?? user.creditsIA)
    : user.creditsIA

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      subscriptionStatus: subscription.status,
      planName: resolved?.plan ?? user.planName,
      billingInterval: resolved?.interval ?? user.billingInterval,
      creditsIA,
      currentPeriodEnd: new Date(((subscription as unknown as { current_period_end: number }).current_period_end) * 1000),
    },
  })
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const user = await prisma.adminUser.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  })
  if (!user) return

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: "canceled",
      planName: null,
      billingInterval: null,
      stripePriceId: null,
      currentPeriodEnd: null,
    },
  })
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  const user = await prisma.adminUser.findFirst({
    where: { stripeCustomerId: customerId },
  })
  if (!user) return

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: "active",
      creditsUsed: 0, // Zera o consumo a cada renovação
    },
  })
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  const user = await prisma.adminUser.findFirst({
    where: { stripeCustomerId: customerId },
  })
  if (!user) return

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { subscriptionStatus: "past_due" },
  })
}

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET não configurado")
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 })
  }

  const body = await req.text()
  const signature = req.headers.get("stripe-signature") ?? ""

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET)
  } catch (err) {
    console.error("[webhook] Assinatura inválida:", err)
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      default:
        // Ignorar eventos não mapeados
        break
    }
  } catch (err) {
    console.error(`[webhook] Erro ao processar ${event.type}:`, err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
