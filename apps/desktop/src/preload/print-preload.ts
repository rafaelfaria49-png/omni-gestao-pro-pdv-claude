/**
 * Preload da janela principal: ÚNICA ponte da página remota com o Windows.
 *
 * Expõe 4 operações de impressão e nada mais (sem ipcRenderer genérico, sem Node). O processo
 * principal ainda confere remetente, frame principal e origem do app antes de atender.
 */
import { contextBridge, ipcRenderer } from "electron"

// Sandbox: o preload não importa módulos locais — constantes duplicadas de print-protocol.ts.
const CH = {
  list: "omni-print:list-printers",
  getStation: "omni-print:get-station",
  setStation: "omni-print:set-station",
  print: "omni-print:print",
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined)

contextBridge.exposeInMainWorld("omniDesktopPrint", Object.freeze({
  version: 1,
  listPrinters: () => ipcRenderer.invoke(CH.list),
  getStation: () => ipcRenderer.invoke(CH.getStation),
  setStation: (s: { deviceName?: unknown; bobina?: unknown } | null) =>
    ipcRenderer.invoke(CH.setStation, s ? { deviceName: str(s.deviceName, 256), bobina: str(s.bobina, 8) } : null),
  print: (r: { html?: unknown; bobina?: unknown; title?: unknown; kind?: unknown }) =>
    ipcRenderer.invoke(CH.print, {
      html: str(r?.html, 256 * 1024),
      bobina: str(r?.bobina, 8),
      title: str(r?.title, 120),
      kind: str(r?.kind, 10),
    }),
}))
