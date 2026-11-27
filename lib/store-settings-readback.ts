import type { StoreSettingsApi } from "@/lib/store-settings-types"

export type StoreSettingsReadbackResult = {
  ok: boolean
  stale?: boolean
  settings: StoreSettingsApi | null
  reason?: string
}

/**
 * Erro tipado disparado quando o PUT `/api/stores/:id/settings` é aceito pelo servidor,
 * mas a releitura posterior falha ou não consegue confirmar o estado gravado para a unidade.
 * Mantido em módulo puro (sem dependências de sessão/NextAuth) para reutilização segura em
 * componentes de UI e harnesses isolados (ex.: smoke-ramos).
 */
export class StoreSettingsReadbackError extends Error {
  readonly code = "STORE_SETTINGS_READBACK_UNCONFIRMED" as const
  readonly acceptedByServer = true as const
  readonly storeId: string
  readonly reason: string

  constructor(storeId: string, reason: string, message?: string) {
    super(
      message ??
        "O servidor aceitou o envio, mas não foi possível confirmar a releitura das configurações desta unidade.",
    )
    this.name = "StoreSettingsReadbackError"
    this.storeId = storeId
    this.reason = reason
  }
}

export function isStoreSettingsReadbackError(error: unknown): error is StoreSettingsReadbackError {
  return (
    error instanceof StoreSettingsReadbackError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "STORE_SETTINGS_READBACK_UNCONFIRMED")
  )
}
