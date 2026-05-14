import type { PdvClassicLayoutKind } from "@/lib/store-settings-types"

/** Preferência global no navegador (espelha `StorePdvParams.pdvClassicLayout` após hidratação). */
export const PDV_CLASSIC_LAYOUT_STORAGE_KEY = "omni-pdv-classic-layout"

export const PDV_CLASSIC_LAYOUT_CHANGED_EVENT = "omni-pdv-classic-layout-changed"

export function readPdvClassicLayout(): PdvClassicLayoutKind {
  if (typeof window === "undefined") return "lovable"
  try {
    const v = String(localStorage.getItem(PDV_CLASSIC_LAYOUT_STORAGE_KEY) || "").trim()
    if (v === "services") return "services"
    if (v === "venda-completa") return "venda-completa"
    return "lovable"
  } catch {
    return "lovable"
  }
}

export function writePdvClassicLayout(kind: PdvClassicLayoutKind) {
  try {
    localStorage.setItem(PDV_CLASSIC_LAYOUT_STORAGE_KEY, kind)
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PDV_CLASSIC_LAYOUT_CHANGED_EVENT))
  }
}

/** Disparado após gravar `@omnigestao:pdv-layout` (ex.: Configurações V3); mesma aba não recebe `storage`. */
export const PDV_MAIN_LAYOUT_CHANGED_EVENT = "omnigestao-pdv-main-layout-changed"

export function notifyPdvMainLayoutChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(PDV_MAIN_LAYOUT_CHANGED_EVENT))
}
