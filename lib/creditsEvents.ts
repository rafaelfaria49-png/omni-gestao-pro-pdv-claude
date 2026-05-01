export const CREDIT_BALANCE_UPDATED_EVENT = "credit-balance-updated"

export function notifyCreditBalanceUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CREDIT_BALANCE_UPDATED_EVENT))
  }
}

