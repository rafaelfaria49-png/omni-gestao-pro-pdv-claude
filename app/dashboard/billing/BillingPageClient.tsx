"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Zap, Star, Sparkles, Diamond, CreditCard, CalendarDays, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  OFFICIAL_SUBSCRIPTION_PLANS,
  planYearlyPricing,
  type PlanStripeKey,
} from "@/lib/subscription-plans-catalog"

// ─── Configuração dos planos (catálogo oficial = Landing Page) ───────────────

const PLAN_ICONS: Record<PlanStripeKey, typeof Zap> = {
  BRONZE: Zap,
  PRATA: Star,
  OURO: Sparkles,
  DIAMANTE: Diamond,
}

const PLANS = OFFICIAL_SUBSCRIPTION_PLANS.map((plan) => {
  const { yearlyMonthly, yearlyTotal } = planYearlyPricing(plan.monthlyPrice)
  return {
    key: plan.stripeKey,
    label: plan.name,
    icon: PLAN_ICONS[plan.stripeKey],
    description: plan.description,
    monthlyPrice: plan.monthlyPrice,
    yearlyMonthly,
    yearlyTotal,
    creditsIA: plan.creditsIA,
    featured: plan.highlighted ?? false,
    features: [...plan.features],
  }
})

type PlanKey = (typeof PLANS)[number]["key"]

// ─── Props ───────────────────────────────────────────────────────────────────

interface BillingPageClientProps {
  currentPlan: string | null
  subscriptionStatus: string | null
  billingInterval: "monthly" | "yearly"
  creditsIA: number
  creditsUsed: number
  currentPeriodEnd: string | null
  hasCustomer: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BillingPageClient({
  currentPlan,
  subscriptionStatus,
  billingInterval: initialInterval,
  creditsIA,
  creditsUsed,
  currentPeriodEnd,
  hasCustomer,
}: BillingPageClientProps) {
  const router = useRouter()
  const [interval, setInterval] = useState<"monthly" | "yearly">(initialInterval)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [portalPending, startPortalTransition] = useTransition()

  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trialing"
  const isTrial = subscriptionStatus === "trialing"

  async function handleSubscribe(planKey: string) {
    setLoadingPlan(planKey)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey, interval }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? "Erro ao iniciar checkout")
      }
    } catch {
      alert("Erro ao conectar com o servidor")
    } finally {
      setLoadingPlan(null)
    }
  }

  function handleManage() {
    startPortalTransition(async () => {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? "Erro ao abrir portal")
      }
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      {/* Header */}
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
          Assinatura
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          Planos OmniGestão Pro
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          14 dias grátis em qualquer plano. Cancele a qualquer momento.
        </p>
      </div>

      {/* Card "Meu plano atual" */}
      {isActive && currentPlan && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-foreground">
                  Plano {currentPlan.charAt(0) + currentPlan.slice(1).toLowerCase()}
                  {isTrial && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Trial
                    </Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {creditsUsed} / {creditsIA} créditos IA usados este mês
                </p>
                {currentPeriodEnd && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    {isTrial ? "Trial termina em" : "Renova em"}: {formatDate(currentPeriodEnd)}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManage}
              disabled={portalPending}
            >
              {portalPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Abrindo…</>
              ) : (
                "Gerenciar assinatura"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Toggle Mensal / Anual */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setInterval("monthly")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            interval === "monthly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Mensal
        </button>
        <button
          onClick={() => setInterval("yearly")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            interval === "yearly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Anual
          <Badge
            variant={interval === "yearly" ? "secondary" : "outline"}
            className="text-[10px] font-semibold"
          >
            20% off
          </Badge>
        </button>
      </div>

      {/* Cards dos planos */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const Icon = plan.icon
          const isCurrentPlan = currentPlan === plan.key && isActive
          const price = interval === "monthly" ? plan.monthlyPrice : plan.yearlyMonthly
          const isLoading = loadingPlan === plan.key

          return (
            <Card
              key={plan.key}
              className={cn(
                "relative flex flex-col transition-shadow hover:shadow-md",
                plan.featured && "border-primary ring-1 ring-primary/30",
                isCurrentPlan && "border-green-500/50 ring-1 ring-green-500/20"
              )}
            >
              {plan.featured && !isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary px-3 text-xs text-primary-foreground">
                    Mais Escolhido
                  </Badge>
                </div>
              )}
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-green-600 px-3 text-xs text-white">
                    Plano Atual
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-3 pt-6">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{plan.label}</CardTitle>
                </div>
                <CardDescription className="text-xs">{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-5">
                {/* Preço */}
                <div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold text-foreground">
                      {formatBRL(price)}
                    </span>
                    <span className="mb-1 text-xs text-muted-foreground">/mês</span>
                  </div>
                  {interval === "yearly" && (
                    <p className="text-xs text-muted-foreground">
                      {formatBRL(plan.yearlyTotal)} cobrado anualmente
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  className="w-full"
                  variant={plan.featured && !isCurrentPlan ? "default" : "outline"}
                  disabled={isCurrentPlan || isLoading || !!loadingPlan}
                  onClick={() => handleSubscribe(plan.key)}
                >
                  {isLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aguarde…</>
                  ) : isCurrentPlan ? (
                    "Plano ativo"
                  ) : (
                    "Assinar — 14 dias grátis"
                  )}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Pagamento seguro via Stripe. Sem taxas de cancelamento. Preços em BRL.
      </p>
    </div>
  )
}
