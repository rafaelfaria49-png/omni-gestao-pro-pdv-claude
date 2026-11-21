/**
 * Impressão direta (spooler do Windows) — contrato entre a página do OmniGestão e o processo principal.
 *
 * A página remota recebe SOMENTE estas 4 operações (preload `print-preload.ts`). Nada de Node,
 * arquivo, comando ou porta: a página entrega um trecho HTML de cupom e o processo principal monta o
 * documento, desliga scripts/rede e manda para a impressora que o OPERADOR escolheu nesta estação.
 */
export const PRINT_CHANNEL = {
  list: "omni-print:list-printers",
  getStation: "omni-print:get-station",
  setStation: "omni-print:set-station",
  print: "omni-print:print",
} as const

export type Bobina = "58mm" | "80mm"

export interface PrintStation {
  deviceName: string
  bobina: Bobina
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface PrintRequest {
  /** Corpo interno do cupom (o documento e o CSS são montados no processo principal). */
  html: string
  bobina?: Bobina
  title?: string
  /** "test" ignora o HTML recebido e imprime um cupom sintético gerado aqui. */
  kind?: "receipt" | "test"
}

export type PrintOutcome =
  | { ok: true; status: "queued"; deviceName: string; duplicate?: boolean }
  | { ok: false; status: "not-configured" | "invalid" | "printer-missing" | "failed"; error: string }

export const MAX_PRINT_HTML = 256 * 1024
const MAX_DEVICE_NAME = 256

export function isBobina(v: unknown): v is Bobina {
  return v === "58mm" || v === "80mm"
}

export function validateStation(raw: unknown): PrintStation | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const deviceName = typeof r.deviceName === "string" ? r.deviceName.trim() : ""
  if (!deviceName || deviceName.length > MAX_DEVICE_NAME || /[\0\r\n]/.test(deviceName)) return null
  if (!isBobina(r.bobina)) return null
  return { deviceName, bobina: r.bobina }
}

export function validatePrintRequest(raw: unknown): PrintRequest | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const kind = r.kind === "test" ? "test" : r.kind === undefined || r.kind === "receipt" ? "receipt" : null
  if (!kind) return null
  const html = typeof r.html === "string" ? r.html : ""
  if (kind === "receipt" && (!html.trim() || html.length > MAX_PRINT_HTML)) return null
  if (r.bobina !== undefined && !isBobina(r.bobina)) return null
  const title = typeof r.title === "string" ? r.title.slice(0, 120) : undefined
  return { html: kind === "test" ? "" : html, bobina: r.bobina as Bobina | undefined, title, kind }
}

/**
 * Documento final. CSP bloqueia QUALQUER script (inclusive os vindos no HTML) e toda rede exceto
 * imagens (logo da loja). Mesmo layout do fallback do navegador (openThermalHtmlPrint).
 */
export function buildPrintDocument(inner: string, bobina: Bobina, title = "Cupom"): string {
  // Área imprimível real (80 mm → ~72 mm de cabeça). Medido no POS-80: 72 mm + padding cortava a direita.
  const wrapWidth = bobina === "58mm" ? "46mm" : "64mm"
  const safeTitle = title.replace(/[<>&"]/g, "")
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'none'" />
<title>${safeTitle}</title>
<style>
  @page { size: ${bobina} auto; margin: 0; }
  html, body { margin: 0; padding: 0; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; color: #000; background: #fff; }
  .wrap { box-sizing: border-box; width: ${wrapWidth}; margin: 0; padding: 1mm 0 3mm 3mm; /* POS-80: medido 5 mm à esq. e 9 mm à dir. com 1 mm */ overflow-wrap: anywhere; }
  p { margin: 2px 0; }
  .no-print { display: none !important; }
</style></head>
<body><div class="wrap">${inner}</div></body></html>`
}

export function buildTestReceiptInner(deviceName: string, bobina: Bobina, when: Date, appVersion: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
  return `
  <div style="text-align:center;font-weight:700">OMNIGESTÃO PRO</div>
  <div style="text-align:center;font-size:11px">TESTE DE IMPRESSÃO</div>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <div style="text-align:center;font-size:11px;font-weight:700">SEM MOVIMENTAÇÃO COMERCIAL</div>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <p>Impressora: ${esc(deviceName)}</p>
  <p>Bobina: ${bobina}</p>
  <p>Data: ${esc(when.toLocaleString("pt-BR"))}</p>
  <p>App: ${esc(appVersion)}</p>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <div style="display:flex;justify-content:space-between"><span>1x Item de teste</span><span>${brl.format(12.5)}</span></div>
  <div style="display:flex;justify-content:space-between"><span>2x Acentuação ÇÃÉÕ</span><span>${brl.format(1234.56)}</span></div>
  <div style="border-top:1px dashed #000;margin:6px 0"></div>
  <p style="font-weight:700">Total: ${brl.format(1247.06)}</p>
  <div style="font-size:10px;margin-top:8px;text-align:center">Se este texto está legível e dentro da largura, a estação está pronta.</div>`
}

/** Bloqueia o mesmo cupom enviado em rajada (re-render, duplo clique, efeito repetido). */
export class DuplicateGuard {
  private readonly seen = new Map<string, number>()
  constructor(private readonly windowMs = 5000) {}
  isDuplicate(key: string, now = Date.now()): boolean {
    for (const [k, t] of this.seen) if (now - t > this.windowMs) this.seen.delete(k)
    if (this.seen.has(key)) return true
    this.seen.set(key, now)
    return false
  }
  forget(key: string) {
    this.seen.delete(key)
  }
}

/** Altura da página em mícrons a partir da altura do conteúdo em px CSS (96 dpi). */
export function pageHeightMicrons(contentPx: number): number {
  const px = Number.isFinite(contentPx) && contentPx > 0 ? contentPx : 600
  return Math.min(3_000_000, Math.max(50_000, Math.ceil((px * 25400) / 96) + 5_000))
}
