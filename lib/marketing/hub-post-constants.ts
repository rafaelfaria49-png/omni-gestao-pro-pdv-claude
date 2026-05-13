export const MARKETING_HUB_CANAIS = ["instagram", "facebook", "whatsapp", "google", "geral"] as const
export type MarketingHubCanal = (typeof MARKETING_HUB_CANAIS)[number]

export const MARKETING_HUB_STATUS = ["rascunho", "agendado", "publicado", "erro"] as const
export type MarketingHubStatus = (typeof MARKETING_HUB_STATUS)[number]

export function isMarketingHubCanal(v: string): v is MarketingHubCanal {
  return (MARKETING_HUB_CANAIS as readonly string[]).includes(v)
}

export function isMarketingHubStatus(v: string): v is MarketingHubStatus {
  return (MARKETING_HUB_STATUS as readonly string[]).includes(v)
}
