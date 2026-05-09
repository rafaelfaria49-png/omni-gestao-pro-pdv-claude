import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY não definida.")
}

/** Instância server-side (Node.js / Server Actions / API routes). */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
  typescript: true,
})

/** Chave pública para uso no cliente (checkout, Elements). */
export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""

// ─── Mapeamento de planos ────────────────────────────────────────────────────

export const PLAN_NAMES = ["BRONZE", "PRATA", "OURO", "DIAMANTE"] as const
export type PlanName = (typeof PLAN_NAMES)[number]
export type BillingInterval = "monthly" | "yearly"

export const PLAN_CONFIG: Record<
  PlanName,
  {
    label: string
    creditsIA: number
    monthlyPrice: number   // centavos BRL
    yearlyPrice: number    // centavos BRL (total anual)
  }
> = {
  BRONZE: {
    label: "Bronze",
    creditsIA: 250,
    monthlyPrice: 5990,
    yearlyPrice: 57504,   // 47,92 × 12
  },
  PRATA: {
    label: "Prata",
    creditsIA: 700,
    monthlyPrice: 14990,
    yearlyPrice: 143904,  // 119,92 × 12
  },
  OURO: {
    label: "Ouro",
    creditsIA: 2000,
    monthlyPrice: 27990,
    yearlyPrice: 268704,  // 223,92 × 12
  },
  DIAMANTE: {
    label: "Diamante",
    creditsIA: 7000,
    monthlyPrice: 49990,
    yearlyPrice: 479904,  // 399,92 × 12
  },
}

/** Retorna o price_id configurado no ambiente para o plano + intervalo. */
export function getPriceId(plan: PlanName, interval: BillingInterval): string {
  const key = `STRIPE_PRICE_${plan}_${interval.toUpperCase()}` as keyof NodeJS.ProcessEnv
  const id = process.env[key]
  if (!id) throw new Error(`Env var ${key} não definida. Rode: npm run stripe:setup`)
  return id
}
