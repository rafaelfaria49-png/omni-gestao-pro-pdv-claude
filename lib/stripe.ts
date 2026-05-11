import Stripe from "stripe"

let _stripe: Stripe | undefined

function lazyStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY não definida. Configure essa variável no Vercel Production."
      )
    }
    _stripe = new Stripe(key, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    })
  }
  return _stripe
}

/**
 * Instância server-side do Stripe — lazy (inicializada na primeira chamada de request,
 * nunca no import). Garante que builds sem STRIPE_SECRET_KEY não falhem na Vercel.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(lazyStripe(), prop, receiver)
  },
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
