/**
 * Epoch/generation para descarte de respostas stale do StoreSettingsProvider.
 *
 * Comparar apenas storeId NÃO distingue GET A1 de GET A2 na sequência A→B→A.
 * A geração monotônica invalida qualquer in-flight ao trocar de loja ou ao
 * iniciar um refresh novo da loja ativa.
 */

export type StoreSettingsEpoch = {
  storeId: string
  generation: number
}

export type StoreSettingsEpochGate = {
  readonly active: StoreSettingsEpoch
  onStoreChange: (nextStoreId: string) => StoreSettingsEpoch
  begin: (requestedStoreId: string) => StoreSettingsEpoch | null
  isLive: (request: StoreSettingsEpoch) => boolean
}

export function createStoreSettingsEpochGate(
  initialStoreId = "",
): StoreSettingsEpochGate {
  let storeId = initialStoreId
  let generation = 0

  return {
    get active(): StoreSettingsEpoch {
      return { storeId, generation }
    },
    onStoreChange(nextStoreId: string): StoreSettingsEpoch {
      storeId = nextStoreId
      generation += 1
      return { storeId, generation }
    },
    begin(requestedStoreId: string): StoreSettingsEpoch | null {
      if (requestedStoreId !== storeId) return null
      generation += 1
      return { storeId: requestedStoreId, generation }
    },
    isLive(request: StoreSettingsEpoch): boolean {
      return request.storeId === storeId && request.generation === generation
    },
  }
}

export function applyIfLiveStoreSettingsEpoch(
  gate: StoreSettingsEpochGate,
  request: StoreSettingsEpoch,
  apply: () => void,
): boolean {
  if (!gate.isLive(request)) return false
  apply()
  return true
}
