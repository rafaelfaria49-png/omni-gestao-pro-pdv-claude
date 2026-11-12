import { dialog, type BrowserWindow, type Session } from "electron"
import { isSameAppOrigin } from "../shared/url-policy"

/** Permissões concedidas sem pergunta à origem do app (mesmo comportamento do Chrome). */
const SILENT_ALLOW = new Set(["clipboard-sanitized-write", "fullscreen"])

type MediaKind = "video" | "audio"

/**
 * Câmera (QR Code de contato) e microfone (Voz de Clientes) só com consentimento explícito
 * do operador, uma vez por execução do app. Todo o resto é negado — inclusive Serial/USB/HID,
 * geolocalização e protocolos externos.
 */
export function installPermissionPolicy(
  session: Session,
  appOrigin: string,
  getParent: () => BrowserWindow | null,
): void {
  const granted = new Set<MediaKind>()
  const denied = new Set<MediaKind>()

  session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const requesting = details.requestingUrl ?? ""
    if (!isSameAppOrigin(requesting, appOrigin)) return callback(false)
    if (SILENT_ALLOW.has(permission)) return callback(true)
    if (permission !== "media") return callback(false)

    const kinds = ((details as { mediaTypes?: string[] }).mediaTypes ?? []).filter(
      (k): k is MediaKind => k === "video" || k === "audio",
    )
    if (kinds.length === 0) return callback(false)
    if (kinds.some((k) => denied.has(k))) return callback(false)
    if (kinds.every((k) => granted.has(k))) return callback(true)

    const label = kinds.map((k) => (k === "video" ? "câmera" : "microfone")).join(" e ")
    const parent = getParent()
    const options = {
      type: "question" as const,
      buttons: ["Permitir", "Não permitir"],
      defaultId: 1,
      cancelId: 1,
      title: "OmniGestão Pro",
      message: `Permitir que o OmniGestão use ${label}?`,
      detail: "A permissão vale até você fechar o programa.",
      noLink: true,
    }
    const ask = parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
    ask
      .then(({ response }) => {
        const ok = response === 0
        for (const k of kinds) (ok ? granted : denied).add(k)
        callback(ok)
      })
      .catch(() => callback(false))
  })

  session.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    if (!isSameAppOrigin(requestingOrigin, appOrigin)) return false
    if (SILENT_ALLOW.has(permission)) return true
    if (permission === "media") {
      const t = (details as { mediaType?: string }).mediaType
      return t === "video" || t === "audio" ? granted.has(t) : false
    }
    return false
  })

  // Dispositivos (WebUSB/WebHID/Web Serial): fora da V1 — a balança serial segue no navegador.
  session.setDevicePermissionHandler(() => false)
  session.on("select-serial-port", (event, _ports, _wc, callback) => {
    event.preventDefault()
    callback("")
  })
  session.on("select-hid-device", (event, _details, callback) => {
    event.preventDefault()
    callback()
  })
  session.on("select-usb-device", (event, _details, callback) => {
    event.preventDefault()
    callback()
  })
}
