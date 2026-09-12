/**
 * Lógica pura de Precedência Server-First, Dual-Read e Backfill Idempotente (N3).
 *
 * PRECEDÊNCIA OBRIGATÓRIA:
 * 1. Servidor explícito válido (autoridade máxima)
 * 2. Fallback legado válido com escopo comprovável da mesma loja
 * 3. Default canônico
 *
 * NUNCA: localStorage > servidor explícito.
 */

import type { PdvClassicLayoutKind, PdvMainLayoutKind, StorePdvAtalhoRapido } from "@/lib/store-settings-types"
import { readStoreScopedString, storeScopedKey, STORE_SCOPED_PDV_LAYOUT_KEY, STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY, STORE_SCOPED_PDV_MODO_KEY } from "@/lib/store-scoped-storage"

export type ResolvedSetting<T> = {
  value: T
  source: "server" | "legacy_fallback" | "default"
  isEligibleForBackfill: boolean
}

/**
 * Resolve o layout principal do PDV seguindo estritamente a precedência server-first.
 */
export function resolvePdvMainLayoutServerFirst(
  serverValue: string | null | undefined,
  storeId: string | null | undefined,
): ResolvedSetting<PdvMainLayoutKind> {
  const sid = (storeId || "").trim()

  // 1. Servidor explícito
  if (serverValue === "classic" || serverValue === "supermercado" || serverValue === "next") {
    return { value: serverValue, source: "server", isEligibleForBackfill: false }
  }

  // Se o servidor tiver o espelho v3PdvSectionCard
  if (serverValue === "classico" || serverValue === "assistencia") {
    return { value: "classic", source: "server", isEligibleForBackfill: false }
  }

  // 2. Fallback legado scoped por loja (se existir e loja comprovável)
  if (sid) {
    const rawScoped = readStoreScopedString(STORE_SCOPED_PDV_LAYOUT_KEY, sid)
    if (rawScoped === "classic" || rawScoped === "supermercado" || rawScoped === "next") {
      return { value: rawScoped, source: "legacy_fallback", isEligibleForBackfill: true }
    }
  }

  // 3. Default canônico
  return { value: "classic", source: "default", isEligibleForBackfill: false }
}

/**
 * Resolve o sub-layout clássico do PDV seguindo a precedência server-first.
 */
export function resolvePdvClassicLayoutServerFirst(
  serverValue: string | null | undefined,
  storeId: string | null | undefined,
): ResolvedSetting<PdvClassicLayoutKind> {
  const sid = (storeId || "").trim()

  // 1. Servidor explícito
  if (serverValue === "lovable" || serverValue === "services") {
    return { value: serverValue, source: "server", isEligibleForBackfill: false }
  }

  // 2. Fallback legado scoped por loja
  if (sid) {
    const rawScoped = readStoreScopedString(STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY, sid)
    if (rawScoped === "services") {
      return { value: "services", source: "legacy_fallback", isEligibleForBackfill: true }
    }
    if (rawScoped === "lovable") {
      return { value: "lovable", source: "legacy_fallback", isEligibleForBackfill: true }
    }
  }

  // 3. Default canônico
  return { value: "lovable", source: "default", isEligibleForBackfill: false }
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage
    if (typeof localStorage !== "undefined") return localStorage
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Resolve os atalhos rápidos seguindo a precedência server-first.
 */
export function resolvePdvShortcutsServerFirst(
  serverValue: StorePdvAtalhoRapido[] | null | undefined,
  storeId: string | null | undefined,
): ResolvedSetting<StorePdvAtalhoRapido[]> {
  const sid = (storeId || "").trim()

  // 1. Servidor explícito: se veio um array do servidor com itens, servidor vence!
  if (Array.isArray(serverValue) && serverValue.length > 0) {
    return { value: serverValue, source: "server", isEligibleForBackfill: false }
  }

  // 2. Fallback legado por loja: `omnigestao:pdv-shortcuts:${storeId}`
  if (sid) {
    try {
      const storage = getLocalStorage()
      const raw = storage?.getItem(`omnigestao:pdv-shortcuts:${sid}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Servidor vazio mas legacy tem atalhos para a mesma loja
          return { value: parsed as StorePdvAtalhoRapido[], source: "legacy_fallback", isEligibleForBackfill: true }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 3. Default canônico
  return { value: Array.isArray(serverValue) ? serverValue : [], source: "default", isEligibleForBackfill: false }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

/**
 * Merge profundo de `printerConfig` para salvamento seguro.
 * Preserva campos irmãos pré-existentes e namespaces desconhecidos.
 *
 * Quando `isBackfill === true`, aplica "write only if absent":
 * se o servidor já contiver um valor definido no banco, ele NÃO é sobrescrito.
 */
export function mergePrinterConfigServerSide(
  existingPrinter: Record<string, unknown> | null | undefined,
  incomingPrinter: Record<string, unknown> | null | undefined,
  isBackfill: boolean,
): Record<string, unknown> {
  const existing = isRecord(existingPrinter) ? { ...existingPrinter } : {}
  const incoming = isRecord(incomingPrinter) ? { ...incomingPrinter } : {}

  if (!isBackfill) {
    // Escrita autoritativa de admin: merge preservando campos existentes não enviados
    const merged: Record<string, unknown> = { ...existing }

    for (const [key, val] of Object.entries(incoming)) {
      if (key === "pdvParams" && isRecord(val) && isRecord(existing.pdvParams)) {
        merged.pdvParams = { ...existing.pdvParams, ...val }
      } else if (key === "capabilities" && isRecord(val) && isRecord(existing.capabilities)) {
        const existingOverrides = isRecord(existing.capabilities.overrides) ? existing.capabilities.overrides : {}
        const incomingOverrides = isRecord(val.overrides) ? val.overrides : {}
        merged.capabilities = {
          version: 1,
          overrides: { ...existingOverrides, ...incomingOverrides },
        }
      } else {
        merged[key] = val
      }
    }
    return merged
  }

  // Backfill: WRITE ONLY IF ABSENT (revalidado no servidor no momento da escrita)
  const merged: Record<string, unknown> = { ...existing }

  for (const [key, val] of Object.entries(incoming)) {
    if (key === "pdvParams" && isRecord(val)) {
      const existingPdvParams = isRecord(existing.pdvParams) ? { ...existing.pdvParams } : {}
      for (const [paramKey, paramVal] of Object.entries(val)) {
        // Se já existe no banco, NUNCA sobrescreve com backfill
        if (existingPdvParams[paramKey] === undefined || existingPdvParams[paramKey] === null) {
          existingPdvParams[paramKey] = paramVal
        }
      }
      merged.pdvParams = existingPdvParams
    } else if (key === "capabilities" && isRecord(val)) {
      // Capabilities não são backfilled de localStorage legado
      if (existing.capabilities === undefined || existing.capabilities === null) {
        merged.capabilities = val
      }
    } else {
      // Se a chave já existe no printerConfig do servidor, preserva a existente!
      if (existing[key] === undefined || existing[key] === null) {
        merged[key] = val
      }
    }
  }

  return merged
}
