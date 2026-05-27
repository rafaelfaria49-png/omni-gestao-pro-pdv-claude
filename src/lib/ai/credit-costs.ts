import { IA_MESTRE_CREDIT_COSTS } from "@/lib/ia-mestre/credit-costs"

/** Custos de UI do Marketing Studio — imagem alinhada à IA Mestre. */
export const AI_CREDIT_COSTS = {
  image: IA_MESTRE_CREDIT_COSTS.image,
  voice: 15,
  video: 25,
  avatar: 30,
}

export function getCreditCost(type: keyof typeof AI_CREDIT_COSTS) {
  return AI_CREDIT_COSTS[type] ?? 0
}

