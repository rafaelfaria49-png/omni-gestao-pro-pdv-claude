import type { MarketplaceProvider } from "@/generated/prisma"

export const MARKETPLACE_PROVIDER_IDS: readonly MarketplaceProvider[] = [
  "MERCADO_LIVRE",
  "SHOPEE",
  "AMAZON",
  "MAGALU",
] as const

export type MarketplaceProviderId = (typeof MARKETPLACE_PROVIDER_IDS)[number]

export function isMarketplaceProviderId(v: string): v is MarketplaceProviderId {
  return (MARKETPLACE_PROVIDER_IDS as readonly string[]).includes(v)
}

export const MARKETPLACE_PROVIDER_META: Record<
  MarketplaceProviderId,
  { label: string; initials: string; badgeClass: string }
> = {
  MERCADO_LIVRE: {
    label: "Mercado Livre",
    initials: "ML",
    badgeClass: "bg-yellow-400 text-zinc-900",
  },
  SHOPEE: {
    label: "Shopee",
    initials: "SH",
    badgeClass: "bg-orange-500 text-white",
  },
  AMAZON: {
    label: "Amazon",
    initials: "AZ",
    badgeClass: "bg-zinc-900 text-white",
  },
  MAGALU: {
    label: "Magalu",
    initials: "MG",
    badgeClass: "bg-primary text-primary-foreground",
  },
}
