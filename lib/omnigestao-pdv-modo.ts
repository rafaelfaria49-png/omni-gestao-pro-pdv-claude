/** Preferência de fluxo do PDV (persistência local). */
export const OMNIGESTAO_PDV_MODO_KEY = "omnigestao-pdv-modo" as const

export type OmnigestaoPdvModoPreferencia = "rapido" | "normal"

/** Flag futura: bip ao adicionar item no modo rápido (`"1"` = ativo). */
export const OMNIGESTAO_PDV_RAPIDO_BEEP_KEY = "omnigestao-pdv-rapido-beep" as const

export function readOmnigestaoPdvModoPreferencia(): OmnigestaoPdvModoPreferencia | null {
  if (typeof window === "undefined") return null
  try {
    const v = String(window.localStorage.getItem(OMNIGESTAO_PDV_MODO_KEY) ?? "").trim()
    if (v === "rapido" || v === "normal") return v
    return null
  } catch {
    return null
  }
}

export function writeOmnigestaoPdvModoPreferencia(m: OmnigestaoPdvModoPreferencia): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(OMNIGESTAO_PDV_MODO_KEY, m)
  } catch {
    /* ignore */
  }
}
