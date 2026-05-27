import { AI_MODELS_MOSAIC } from "@/lib/ai-models-list"

/** Ações cobradas pela IA Mestre via `/api/ai/orchestrate` (User.credits + Usage). */
export type IaMestreBillableAction = "text" | "image"

/**
 * Tabela central de custos — fonte única para IA Mestre (chat + imagem).
 * Marketing Studio / vídeo continuam em `lib/credits.ts` e `src/lib/ai/credit-costs.ts`.
 */
export const IA_MESTRE_CREDIT_COSTS = {
  /** Mensagem de chat (LLM texto). */
  text: 1,
  /** Geração de imagem (DALL-E / rota Marketing). */
  image: 10,
  /** Acréscimo quando o modelo efetivo não é da família “básica” (barato). */
  premiumModelSurcharge: 2,
} as const

export type IaMestreCostBreakdown = {
  action: IaMestreBillableAction
  base: number
  premiumSurcharge: number
  cost: number
  model: string
  isPremiumModel: boolean
}

function isBasicOkModel(model: string): boolean {
  const id = model.trim()
  if (!id) return true
  const entry = AI_MODELS_MOSAIC.find((m) => m.id === id)
  if (entry) return entry.basicOk
  // Modelos legados / fora do mosaico: tratar como básico (sem surcharge).
  if (id === "google/gemini-flash-1.5") return true
  return false
}

export function isPremiumMestreModel(model: string): boolean {
  return !isBasicOkModel(model)
}

export function resolveIaMestreCreditCost(params: {
  action: IaMestreBillableAction
  model: string
}): IaMestreCostBreakdown {
  const base = IA_MESTRE_CREDIT_COSTS[params.action]
  const isPremiumModel = isPremiumMestreModel(params.model)
  const premiumSurcharge =
    params.action === "text" && isPremiumModel ? IA_MESTRE_CREDIT_COSTS.premiumModelSurcharge : 0
  const cost = Math.max(0, base + premiumSurcharge)
  return {
    action: params.action,
    base,
    premiumSurcharge,
    cost,
    model: params.model.trim(),
    isPremiumModel,
  }
}

export function formatIaMestreCostLabel(breakdown: IaMestreCostBreakdown): string {
  if (breakdown.cost <= 0) return "0 créditos"
  if (breakdown.premiumSurcharge > 0) {
    return `${breakdown.cost} créditos (${breakdown.base} + ${breakdown.premiumSurcharge} modelo premium)`
  }
  return `${breakdown.cost} ${breakdown.cost === 1 ? "crédito" : "créditos"}`
}
