/**
 * Cria os produtos e preços no Stripe e salva os price_ids no .env.local.
 *
 * Uso: npm run stripe:setup
 *
 * É idempotente: verifica se os produtos já existem antes de criar novos.
 * Os price_ids são gravados/atualizados em .env.local automaticamente.
 */

import Stripe from "stripe"
import * as fs from "fs"
import * as path from "path"
import * as dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../.env") })
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const secretKey = process.env.STRIPE_SECRET_KEY
if (!secretKey) throw new Error("STRIPE_SECRET_KEY não encontrada no .env.local")

const stripe = new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia", typescript: true })

const ENV_LOCAL_PATH = path.resolve(__dirname, "../.env.local")

// ─── Configuração dos planos ──────────────────────────────────────────────────

const PLANS = [
  {
    key: "BRONZE",
    name: "OmniGestão Pro — Bronze",
    creditsIA: 250,
    monthlyAmountCents: 5990,    // R$ 59,90
    yearlyAmountCents: 57504,    // R$ 575,04 (R$ 47,92 × 12)
  },
  {
    key: "PRATA",
    name: "OmniGestão Pro — Prata",
    creditsIA: 700,
    monthlyAmountCents: 14990,   // R$ 149,90
    yearlyAmountCents: 143904,   // R$ 1.439,04 (R$ 119,92 × 12)
  },
  {
    key: "OURO",
    name: "OmniGestão Pro — Ouro",
    creditsIA: 2000,
    monthlyAmountCents: 27990,   // R$ 279,90
    yearlyAmountCents: 268704,   // R$ 2.687,04 (R$ 223,92 × 12)
  },
  {
    key: "DIAMANTE",
    name: "OmniGestão Pro — Diamante",
    creditsIA: 7000,
    monthlyAmountCents: 49990,   // R$ 499,90
    yearlyAmountCents: 479904,   // R$ 4.799,04 (R$ 399,92 × 12)
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function updateEnvLocal(key: string, value: string): void {
  let content = fs.existsSync(ENV_LOCAL_PATH) ? fs.readFileSync(ENV_LOCAL_PATH, "utf-8") : ""
  const regex = new RegExp(`^${key}=.*$`, "m")
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`)
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`
  }
  fs.writeFileSync(ENV_LOCAL_PATH, content, "utf-8")
}

async function findOrCreateProduct(name: string, metadata: Record<string, string>): Promise<string> {
  // Busca por produto com o mesmo nome (lookup por metadata.omni_key)
  const existing = await stripe.products.search({
    query: `metadata["omni_key"]:"${metadata.omni_key}"`,
  })

  if (existing.data.length > 0) {
    console.log(`  ↩  Produto existente: ${existing.data[0].id} (${name})`)
    return existing.data[0].id
  }

  const product = await stripe.products.create({ name, metadata })
  console.log(`  ✓  Produto criado: ${product.id} (${name})`)
  return product.id
}

async function findOrCreatePrice(
  productId: string,
  amountCents: number,
  interval: "month" | "year",
  intervalCount: number,
  nickname: string
): Promise<string> {
  // Busca preço ativo com mesmo produto, amount e interval
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: "recurring",
  })

  const match = prices.data.find(
    (p) =>
      p.unit_amount === amountCents &&
      p.recurring?.interval === interval &&
      p.recurring?.interval_count === intervalCount
  )

  if (match) {
    console.log(`  ↩  Preço existente: ${match.id} (${nickname})`)
    return match.id
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "brl",
    recurring: { interval, interval_count: intervalCount },
    nickname,
  })
  console.log(`  ✓  Preço criado: ${price.id} (${nickname})`)
  return price.id
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🎯  Stripe Setup — OmniGestão Pro")
  console.log("══════════════════════════════════\n")

  const results: Record<string, string> = {}

  for (const plan of PLANS) {
    console.log(`📦  ${plan.name}`)

    const productId = await findOrCreateProduct(plan.name, {
      omni_key: plan.key.toLowerCase(),
      credits_ia: String(plan.creditsIA),
    })

    const monthlyPriceId = await findOrCreatePrice(
      productId,
      plan.monthlyAmountCents,
      "month",
      1,
      `${plan.key} Mensal`
    )

    const yearlyPriceId = await findOrCreatePrice(
      productId,
      plan.yearlyAmountCents,
      "year",
      1,
      `${plan.key} Anual`
    )

    results[`STRIPE_PRICE_${plan.key}_MONTHLY`] = monthlyPriceId
    results[`STRIPE_PRICE_${plan.key}_YEARLY`] = yearlyPriceId

    console.log()
  }

  // Salvar no .env.local
  console.log("💾  Salvando price_ids em .env.local...")
  for (const [key, value] of Object.entries(results)) {
    updateEnvLocal(key, value)
    console.log(`  ${key}=${value}`)
  }

  console.log("\n✅  Setup concluído! Price IDs salvos em .env.local")
  console.log("   Configure as mesmas variáveis na Vercel para produção.\n")
}

main().catch((err) => {
  console.error("✗ Erro:", err)
  process.exit(1)
})
