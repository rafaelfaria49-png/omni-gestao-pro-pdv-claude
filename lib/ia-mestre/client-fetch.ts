"use client"

import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

export function iaMestreStoreHeaders(storeId: string | null | undefined): Record<string, string> | null {
  const id = typeof storeId === "string" ? storeId.trim() : ""
  if (!id) return null
  return {
    [ASSISTEC_LOJA_HEADER]: id,
    "Content-Type": "application/json",
  }
}

export const IA_MESTRE_CONVERSATIONS_REFRESH_EVENT = "ia-mestre-conversations-refresh"

export function notifyIaMestreConversationsRefresh() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(IA_MESTRE_CONVERSATIONS_REFRESH_EVENT))
}
