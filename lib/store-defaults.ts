/**
 * Identificador da unidade matriz padrão (multi-loja). Demais unidades vêm do banco / header / cookie.
 */
export const LEGACY_PRIMARY_STORE_ID = "loja-1" as const

/** Cookie HTTP (Path=/) espelhando a unidade ativa do Header — leitura em rotas API sem header explícito. */
export const ASSISTEC_ACTIVE_STORE_COOKIE = "assistec-active-store"

/**
 * Unidades reais protegidas (Fase 1 — Proteção de Lojas): nunca podem ser excluídas
 * nem ter os dados limpos. Mantido aqui (módulo sem dependências de servidor) para
 * poder ser importado com segurança tanto no servidor quanto no cliente.
 * - loja-1 = RAFACELL ASSISTEC (matriz real)
 * - loja-2 = RAFA BRINQUEDOS E VARIEDADES (loja real escolhida para reimportação)
 */
export const PROTECTED_STORE_IDS = ["loja-1", "loja-2"] as const

export function isWhitelistedProtectedStore(storeId: string | null | undefined): boolean {
  const id = String(storeId ?? "").trim()
  if (!id) return false
  return (PROTECTED_STORE_IDS as readonly string[]).includes(id)
}

export type StoreProtectionInput = {
  storeId: string
  /** Loja "principal" da conta (primeira por id asc). */
  primaryStoreId: string
  /** Loja ativa resolvida do request (header/query/cookie), se houver. */
  activeStoreId?: string | null
}

export type StoreProtectionResult =
  | { blocked: false }
  | { blocked: true; status: number; error: string }

/**
 * Decisão pura de proteção (Fase 1): bloqueia exclusão/limpeza de loja real protegida,
 * loja principal e loja ativa. Sem I/O — testável isoladamente. As fontes (primary/active)
 * são resolvidas pelo chamador (ver assertStoreDeletable em stores-api-access.ts).
 */
export function evaluateStoreProtection(input: StoreProtectionInput): StoreProtectionResult {
  const id = String(input.storeId ?? "").trim()
  if (!id) {
    return { blocked: true, status: 400, error: "storeId ausente." }
  }
  if (isWhitelistedProtectedStore(id)) {
    return {
      blocked: true,
      status: 403,
      error: "Unidade real protegida. Não pode ser excluída nem ter os dados limpos.",
    }
  }
  if (id === String(input.primaryStoreId ?? "").trim()) {
    return { blocked: true, status: 403, error: "A loja principal não pode ser excluída." }
  }
  const active = String(input.activeStoreId ?? "").trim()
  if (active && active === id) {
    return {
      blocked: true,
      status: 409,
      error: "Esta é a unidade ativa no momento. Troque de unidade antes de excluí-la.",
    }
  }
  return { blocked: false }
}
