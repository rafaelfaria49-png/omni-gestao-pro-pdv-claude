export const AI_CREDIT_COSTS = {
  image: 10,
  voice: 15,
  video: 25,
  avatar: 30,
}

export function getCreditCost(type: keyof typeof AI_CREDIT_COSTS) {
  return AI_CREDIT_COSTS[type] ?? 0
}

