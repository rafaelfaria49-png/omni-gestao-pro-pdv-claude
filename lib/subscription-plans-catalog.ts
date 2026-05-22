/**
 * Catálogo visual oficial dos planos SaaS — alinhado à Landing Page (Pricing.tsx).
 * Apenas exibição; cobrança real continua em lib/stripe.ts + /api/billing/*.
 */

export type PlanStripeKey = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE"
export type PlanLocalId = "bronze" | "prata" | "ouro" | "diamante"

export type OfficialPlanDisplay = {
  localId: PlanLocalId
  stripeKey: PlanStripeKey
  name: string
  monthlyPrice: number
  creditsIA: number
  description: string
  features: readonly string[]
  highlighted?: boolean
}

export const OFFICIAL_SUBSCRIPTION_PLANS: readonly OfficialPlanDisplay[] = [
  {
    localId: "bronze",
    stripeKey: "BRONZE",
    name: "Bronze",
    monthlyPrice: 59.9,
    creditsIA: 250,
    description: "Ideal para começar com PDV, estoque e suporte por chat.",
    features: [
      "250 créditos IA / mês",
      "PDV rápido",
      "Estoque básico",
      "1 usuário",
      "Suporte chat",
    ],
  },
  {
    localId: "prata",
    stripeKey: "PRATA",
    name: "Prata",
    monthlyPrice: 149.9,
    creditsIA: 700,
    description: "Para quem precisa de NF-e, relatórios e mais usuários.",
    features: [
      "700 créditos IA / mês",
      "NF-e / NFC-e",
      "Relatórios de vendas",
      "3 usuários",
    ],
  },
  {
    localId: "ouro",
    stripeKey: "OURO",
    name: "Ouro",
    monthlyPrice: 279.9,
    creditsIA: 2000,
    description: "Marketing IA, automação WhatsApp e multi-lojas.",
    features: [
      "2.000 créditos IA / mês",
      "Marketing IA",
      "Automação WhatsApp",
      "Multi-lojas",
      "Master console",
    ],
    highlighted: true,
  },
  {
    localId: "diamante",
    stripeKey: "DIAMANTE",
    name: "Diamante",
    monthlyPrice: 499.9,
    creditsIA: 7000,
    description: "IA avançada, até 25 lojas e integrações enterprise.",
    features: [
      "7.000 créditos IA / mês",
      "IA avançada",
      "Até 25 lojas",
      "API / integrações",
      "IA preditiva de estoque",
    ],
  },
]

export const BILLING_DASHBOARD_PATH = "/dashboard/billing"

/** Preço anual com 20% de desconto (mesma regra da Landing). */
export function planYearlyPricing(monthlyPrice: number) {
  const yearlyMonthly = Math.round(monthlyPrice * 0.8 * 100) / 100
  const yearlyTotal = Math.round(yearlyMonthly * 12 * 100) / 100
  return { yearlyMonthly, yearlyTotal }
}

export function findOfficialPlanByLocalId(id: string): OfficialPlanDisplay | undefined {
  return OFFICIAL_SUBSCRIPTION_PLANS.find((p) => p.localId === id)
}

export function findOfficialPlanByStripeKey(key: string): OfficialPlanDisplay | undefined {
  return OFFICIAL_SUBSCRIPTION_PLANS.find((p) => p.stripeKey === key.toUpperCase())
}
