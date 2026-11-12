import { BrowserWindow, dialog, shell, type WebContents, type WebPreferences } from "electron"
import {
  classifyNavigation,
  classifyPopupNavigation,
  classifyWindowOpen,
  isOpenableExternally,
  isTrustedExternal,
  safeParseUrl,
} from "../shared/url-policy"

export interface NavigationContext {
  appOrigin: string
  partition: string
  devTools: boolean
  log: (msg: string) => void
}

/** Preferências de toda janela que exibe conteúdo remoto: nada de Node, nada de preload. */
export function remoteWebPreferences(ctx: NavigationContext): WebPreferences {
  return {
    partition: ctx.partition,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    spellcheck: false,
    devTools: ctx.devTools,
    // Visualizador de PDF embutido do Chromium (sem plugins de terceiros).
    plugins: true,
  }
}

/** Abre no navegador do sistema: hosts conhecidos direto; o resto, com confirmação. */
export async function openExternalSafely(raw: string, parent: BrowserWindow | null, ctx: NavigationContext) {
  if (!isOpenableExternally(raw)) {
    ctx.log(`external-blocked ${raw.slice(0, 80)}`)
    return
  }
  if (!isTrustedExternal(raw)) {
    const host = safeParseUrl(raw)?.host ?? ""
    const options = {
      type: "question" as const,
      buttons: ["Abrir no navegador", "Cancelar"],
      defaultId: 1,
      cancelId: 1,
      title: "OmniGestão Pro",
      message: `Abrir ${host} no navegador?`,
      detail: "Este endereço fica fora do OmniGestão e será aberto no navegador padrão do Windows.",
      noLink: true,
    }
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
    if (response !== 0) return
  }
  await shell.openExternal(raw, { activate: true })
}

/**
 * Guardas comuns a qualquer webContents remoto. `isPopup` usa a política de janela de documento
 * (about:blank permitido).
 */
export function guardWebContents(wc: WebContents, ctx: NavigationContext, isPopup: boolean) {
  const decide = (url: string) =>
    isPopup ? classifyPopupNavigation(url, ctx.appOrigin) : classifyNavigation(url, ctx.appOrigin)

  const onNavigate = (event: { preventDefault: () => void }, url: string, isMainFrame = true) => {
    if (!isMainFrame) return // subframes seguem CSP/X-Frame-Options do próprio site
    const decision = decide(url)
    if (decision === "allow") return
    event.preventDefault()
    ctx.log(`navigation-${decision} ${url.slice(0, 120)}`)
    if (decision === "external") {
      void openExternalSafely(url, BrowserWindow.fromWebContents(wc), ctx)
    }
  }

  wc.on("will-navigate", (e) => onNavigate(e, e.url, e.isMainFrame))
  wc.on("will-redirect", (e) => onNavigate(e, e.url, e.isMainFrame))

  wc.on("will-attach-webview", (e) => e.preventDefault())

  wc.setWindowOpenHandler(({ url }) => {
    const decision = classifyWindowOpen(url, ctx.appOrigin)
    if (decision === "allow-blank" || decision === "allow-same-origin") {
      const parent = BrowserWindow.fromWebContents(wc)
      return {
        action: "allow",
        outlivesOpener: false,
        overrideBrowserWindowOptions: {
          parent: parent ?? undefined,
          modal: false,
          width: 900,
          height: 760,
          minWidth: 360,
          minHeight: 320,
          autoHideMenuBar: true,
          title: "OmniGestão Pro — Documento",
          webPreferences: remoteWebPreferences(ctx),
        },
      }
    }
    ctx.log(`window-open-${decision} ${url.slice(0, 120)}`)
    if (decision === "external") void openExternalSafely(url, BrowserWindow.fromWebContents(wc), ctx)
    return { action: "deny" }
  })

  // Toda janela filha (documento/impressão) recebe as mesmas guardas.
  wc.on("did-create-window", (child) => {
    child.removeMenu()
    guardWebContents(child.webContents, ctx, true)
  })
}
