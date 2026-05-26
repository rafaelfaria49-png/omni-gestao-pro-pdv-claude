/**
 * Configuração de impressão PDV por unidade — persistida em `StoreSettings.printerConfig.impressao`.
 * Runtime web: TCP via `/api/print/raw`, fallback HTML 58/80mm e download .bin.
 */

export const PDV_IMPRESSAO_CONFIG_KEY = "impressao"

export type BobinaTamanho = "58mm" | "80mm"
export type ComprovanteModo = "simplificado" | "completo"

export type PdvImpressaoConfig = {
  /** Host/IP da impressora raw (sobrescreve THERMAL_PRINT_HOST no proxy quando preenchido). */
  impressoraHost: string
  impressoraPorta: number
  bobinaTamanho: BobinaTamanho
  abrirGaveta: boolean
  imprimirAutomatico: boolean
  comprovanteModo: ComprovanteModo
  logoNoCupom: boolean
  /** Rodapé extra; se vazio, o PDV usa `StoreSettings.receiptFooter`. */
  rodapeCupom: string
  viasCupom: number
  imprimirOs: boolean
  imprimirCrediario: boolean
}

export const BOBINA_CHARS: Record<BobinaTamanho, number> = {
  "58mm": 32,
  "80mm": 48,
}

export function defaultPdvImpressaoConfig(): PdvImpressaoConfig {
  return {
    impressoraHost: "",
    impressoraPorta: 9100,
    bobinaTamanho: "80mm",
    abrirGaveta: false,
    imprimirAutomatico: false,
    comprovanteModo: "completo",
    logoNoCupom: true,
    rodapeCupom: "",
    viasCupom: 1,
    imprimirOs: true,
    imprimirCrediario: true,
  }
}

function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

export function parseImpressaoFromPrinterConfig(printerConfig: unknown): PdvImpressaoConfig {
  const root = safeObj(printerConfig)
  const raw = safeObj(root[PDV_IMPRESSAO_CONFIG_KEY])
  const d = defaultPdvImpressaoConfig()

  const host = String(raw.impressoraHost ?? raw.host ?? "").trim()
  const portRaw = Number(raw.impressoraPorta ?? raw.port ?? d.impressoraPorta)
  const porta = Number.isFinite(portRaw) ? Math.min(65535, Math.max(1, Math.round(portRaw))) : d.impressoraPorta

  const bobina = raw.bobinaTamanho === "58mm" ? "58mm" : "80mm"
  const modo = raw.comprovanteModo === "simplificado" ? "simplificado" : "completo"

  const viasRaw = Number(raw.viasCupom ?? raw.vias ?? d.viasCupom)
  const vias = Number.isFinite(viasRaw) ? Math.min(5, Math.max(1, Math.round(viasRaw))) : d.viasCupom

  return {
    impressoraHost: host,
    impressoraPorta: porta,
    bobinaTamanho: bobina,
    abrirGaveta: raw.abrirGaveta === true || raw.abrirGaveta === "true",
    imprimirAutomatico: raw.imprimirAutomatico === true || raw.imprimirAutomatico === "true",
    comprovanteModo: modo,
    logoNoCupom: raw.logoNoCupom !== false && raw.logoNoCupom !== "false",
    rodapeCupom: String(raw.rodapeCupom ?? "").trim(),
    viasCupom: vias,
    imprimirOs: raw.imprimirOs !== false && raw.imprimirOs !== "false",
    imprimirCrediario: raw.imprimirCrediario !== false && raw.imprimirCrediario !== "false",
  }
}

export function mergeImpressaoIntoPrinterConfig(
  printerConfig: Record<string, unknown> | null | undefined,
  impressao: PdvImpressaoConfig,
): Record<string, unknown> {
  const base = printerConfig && typeof printerConfig === "object" ? { ...printerConfig } : {}
  return {
    ...base,
    [PDV_IMPRESSAO_CONFIG_KEY]: impressao,
  }
}

/** Rodapé efetivo no cupom: override da aba impressão ou coluna receiptFooter. */
export function resolveCupomRodape(impressao: PdvImpressaoConfig, receiptFooter?: string | null): string {
  const extra = impressao.rodapeCupom.trim()
  if (extra) return extra
  return String(receiptFooter ?? "").trim()
}
