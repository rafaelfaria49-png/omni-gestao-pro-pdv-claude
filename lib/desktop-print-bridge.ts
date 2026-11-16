/**
 * Impressão direta no OmniGestão Pro para Windows (Electron).
 *
 * O app instalado expõe `window.omniDesktopPrint` (4 operações). No navegador comum ela não existe
 * e tudo aqui devolve "indisponível" — o fluxo antigo (proxy/HTML) continua igual.
 * Nunca passa pelo servidor: o cupom vai do PC do caixa direto para o spooler do Windows.
 */

export type DesktopBobina = "58mm" | "80mm"

export type DesktopPrintStation = { deviceName: string; bobina: DesktopBobina }
export type DesktopPrinterInfo = { name: string; displayName: string; isDefault: boolean }
export type DesktopPrintOutcome =
  | { ok: true; status: "queued"; deviceName: string; duplicate?: boolean }
  | { ok: false; status: "not-configured" | "invalid" | "printer-missing" | "failed" | "unavailable"; error: string }

type Bridge = {
  version: number
  listPrinters: () => Promise<DesktopPrinterInfo[]>
  getStation: () => Promise<DesktopPrintStation | null>
  setStation: (s: DesktopPrintStation | null) => Promise<{ ok: boolean; error?: string; station?: DesktopPrintStation | null }>
  print: (r: { html: string; bobina?: DesktopBobina; title?: string; kind?: "receipt" | "test" }) => Promise<DesktopPrintOutcome>
}

export function getDesktopPrintBridge(): Bridge | null {
  if (typeof window === "undefined") return null
  const b = (window as unknown as { omniDesktopPrint?: Bridge }).omniDesktopPrint
  return b && typeof b.print === "function" ? b : null
}

/** Estação configurada (impressora escolhida) — cache para chamadas síncronas. */
let cachedStation: DesktopPrintStation | null = null
let stationLoaded: Promise<DesktopPrintStation | null> | null = null

export function loadDesktopStation(force = false): Promise<DesktopPrintStation | null> {
  const b = getDesktopPrintBridge()
  if (!b) return Promise.resolve(null)
  if (!stationLoaded || force) {
    stationLoaded = b
      .getStation()
      .then((s) => (cachedStation = s ?? null))
      .catch(() => (cachedStation = null))
  }
  return stationLoaded
}

export function getCachedDesktopStation(): DesktopPrintStation | null {
  return cachedStation
}

export async function setDesktopStation(station: DesktopPrintStation | null) {
  const b = getDesktopPrintBridge()
  if (!b) return { ok: false, error: "Disponível só no OmniGestão Pro para Windows." }
  const res = await b.setStation(station)
  if (res.ok) {
    cachedStation = res.station ?? null
    stationLoaded = Promise.resolve(cachedStation)
  }
  return res
}

/** Impressão direta habilitada nesta estação? (app Windows + impressora escolhida) */
export async function isDesktopDirectPrintReady(): Promise<boolean> {
  return !!(await loadDesktopStation())
}

export async function desktopPrintHtml(
  html: string,
  opts?: { bobina?: DesktopBobina; title?: string },
): Promise<DesktopPrintOutcome> {
  const b = getDesktopPrintBridge()
  if (!b) return { ok: false, status: "unavailable", error: "Impressão direta indisponível." }
  try {
    return await b.print({ html, bobina: opts?.bobina, title: opts?.title, kind: "receipt" })
  } catch (e) {
    return { ok: false, status: "failed", error: e instanceof Error ? e.message : String(e) }
  }
}

export async function desktopPrintTest(): Promise<DesktopPrintOutcome> {
  const b = getDesktopPrintBridge()
  if (!b) return { ok: false, status: "unavailable", error: "Impressão direta indisponível." }
  try {
    return await b.print({ html: "", kind: "test" })
  } catch (e) {
    return { ok: false, status: "failed", error: e instanceof Error ? e.message : String(e) }
  }
}

if (typeof window !== "undefined") void loadDesktopStation()
