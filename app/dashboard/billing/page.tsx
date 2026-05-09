import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { BillingPageClient } from "./BillingPageClient"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function BillingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const user = await prisma.adminUser.findUnique({
    where: { id: session.user.id },
    select: {
      planName: true,
      subscriptionStatus: true,
      billingInterval: true,
      creditsIA: true,
      creditsUsed: true,
      currentPeriodEnd: true,
      stripeCustomerId: true,
    },
  })

  return (
    <BillingPageClient
      currentPlan={user?.planName ?? null}
      subscriptionStatus={user?.subscriptionStatus ?? null}
      billingInterval={(user?.billingInterval as "monthly" | "yearly") ?? "monthly"}
      creditsIA={user?.creditsIA ?? 0}
      creditsUsed={user?.creditsUsed ?? 0}
      currentPeriodEnd={user?.currentPeriodEnd?.toISOString() ?? null}
      hasCustomer={!!user?.stripeCustomerId}
    />
  )
}
