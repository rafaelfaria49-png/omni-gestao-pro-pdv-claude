import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import type { PlanName } from "@/lib/stripe"

const PLAN_HIERARCHY: Record<string, number> = {
  BRONZE: 1,
  PRATA: 2,
  OURO: 3,
  DIAMANTE: 4,
}

export type PlanAccessResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "inactive" | "insufficient_plan"; requiredPlan?: PlanName }

/**
 * Verifica se o usuário autenticado tem acesso ao plano requerido.
 * Pode ser chamado em Server Components, Server Actions ou API routes.
 */
export async function checkPlanAccess(requiredPlan?: PlanName): Promise<PlanAccessResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, reason: "unauthenticated" }

  const user = await prisma.adminUser.findUnique({
    where: { id: session.user.id },
    select: { planName: true, subscriptionStatus: true, currentPeriodEnd: true },
  })

  const isActive =
    user?.subscriptionStatus === "active" || user?.subscriptionStatus === "trialing"

  if (!isActive) return { ok: false, reason: "inactive" }

  if (requiredPlan) {
    const userLevel = PLAN_HIERARCHY[user?.planName ?? ""] ?? 0
    const needed = PLAN_HIERARCHY[requiredPlan] ?? 0
    if (userLevel < needed) {
      return { ok: false, reason: "insufficient_plan", requiredPlan }
    }
  }

  return { ok: true }
}

/** Retorna true se o usuário pode usar o plano (sem lançar exceções). */
export async function hasPlanAccess(requiredPlan?: PlanName): Promise<boolean> {
  const result = await checkPlanAccess(requiredPlan)
  return result.ok
}
