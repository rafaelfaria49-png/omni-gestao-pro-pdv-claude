/**
 * OmniGestão Pro para Windows — processo principal.
 *
 * Cliente desktop do sistema web: abre UMA origem HTTPS fixada no build, sem Node.js, sem preload
 * e sem IPC para a página remota. Banco, Prisma, segredos e regras de negócio ficam na nuvem.
 */
import { app, BrowserWindow, Menu, dialog, nativeImage, WebContentsView, ipcMain, net, session as electronSession, type Session } from "electron"
import { appendFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { channelLabel, windowTitle, type DesktopBuildConfig } from "../shared/build-config"
import { classifyLoadFailure, hasForbiddenDebugSwitch, parseSquirrelEvent } from "../shared/startup"
import { STATUS_CHANNEL, type StatusKind, type StatusState } from "../shared/status-protocol"
import { isLoginPath, isSameAppOrigin, safeParseUrl } from "../shared/url-policy"
import { loadBuildConfig } from "./config-loader"
import { guardWebContents, openExternalSafely, remoteWebPreferences, type NavigationContext } from "./navigation"
import { handleLocalScheme, registerLocalScheme, STATUS_URL } from "./local-protocol"
import { installPermissionPolicy } from "./permissions"
import { LogoutGuard } from "./privacy"
import { handleSquirrelEvent } from "./squirrel"
import { checkDesktopUpdate, type UpdateStatus } from "./updates"

const startedAt = Date.now()

function log(msg: string) {
  // Sem query string nem fragmento: URLs podem carregar IDs de cliente/venda.
  const line = `${new Date().toISOString()} ${msg.replace(/[?#][^\s]*/g, "?…")}\n`
  try {
    const dir = path.join(app.getPath("userData"), "logs")
    mkdirSync(dir, { recursive: true })
    appendFileSync(path.join(dir, "desktop.log"), line)
  } catch {
    /* log é melhor esforço */
  }
  if (!app.isPackaged) process.stdout.write(line)
}

function fatal(message: string) {
  void app.whenReady().then(() => {
    dialog.showErrorBox("OmniGestão Pro não pôde iniciar", message)
    app.exit(1)
  })
}

function run(config: DesktopBuildConfig) {
  const partition = `persist:omnigestao-${config.channel}`
  const devTools = config.channel !== "production"
  const ctx: NavigationContext = { appOrigin: config.origin, partition, devTools, log }
  const startUrl = new URL("/login", config.origin).toString() // mesmo start_url do PWA
  const rendererDir = path.join(__dirname, "..", "renderer")
  const statusHtmlUrl = STATUS_URL
  const iconPath = path.join(app.getAppPath(), "assets", "icon.ico")

  let win: BrowserWindow | null = null
  let statusView: WebContentsView | null = null
  let statusVisible = false
  let statusKind: StatusKind = "loading"
  let statusDetail: string | undefined
  let lastAppUrl: string | null = null
  let lastHttpStatus = 0
  let mainLoadFailed = false
  let firstLoadMs: number | null = null
  let offlinePoll: NodeJS.Timeout | null = null
  let offlineDelayMs = 5000
  let logoutGuard: LogoutGuard | null = null
  let permissionPolicy: { reset: () => void } | null = null
  let updateStatus: UpdateStatus | null = null

  function currentState(): StatusState {
    return {
      kind: statusKind,
      detail: statusDetail,
      appVersion: app.getVersion(),
      channel: config.channel,
      channelLabel: channelLabel(config.channel),
      host: new URL(config.origin).host,
      buildCommit: config.buildCommit,
      electronVersion: process.versions.electron,
      update: updateStatus
        ? { available: updateStatus.available, version: updateStatus.version, message: updateStatus.message }
        : undefined,
    }
  }

  function layoutStatus() {
    if (!win || !statusView) return
    const [w, h] = win.getContentSize()
    statusView.setBounds({ x: 0, y: 0, width: w, height: h })
  }

  function showStatus(kind: StatusKind, detail?: string) {
    if (!win || !statusView) return
    const changed = !statusVisible || statusKind !== kind
    statusKind = kind
    statusDetail = detail
    if (!statusVisible) {
      win.contentView.addChildView(statusView)
      statusVisible = true
      layoutStatus()
    }
    statusView.webContents.send(STATUS_CHANNEL.state, currentState())
    // Foco só na mudança de estado: as novas tentativas em segundo plano não roubam o teclado.
    if (changed && win.isFocused()) statusView.webContents.focus()
    log(`status ${kind}${detail ? ` (${detail})` : ""}`)
    if (kind === "offline") startOfflinePoll()
    else stopOfflinePoll()
  }

  function hideStatus() {
    if (!win || !statusView || !statusVisible) return
    win.contentView.removeChildView(statusView)
    statusVisible = false
    stopOfflinePoll()
    win.webContents.focus()
  }

  /**
   * Sem rede: sonda o servidor em segundo plano (HEAD, sessão padrão sem cookies) com espera
   * crescente de 5 s a 60 s e só recarrega quando ele responde. A volta da rede é apenas uma
   * nova NAVEGAÇÃO (GET) — nenhuma operação é reenviada pelo desktop.
   */
  function startOfflinePoll() {
    if (offlinePoll) return
    const tick = async () => {
      offlinePoll = null
      if (!statusVisible || statusKind !== "offline") return
      let reachable = false
      if (net.isOnline()) {
        try {
          const res = await net.fetch(new URL("/login", config.origin).toString(), {
            method: "HEAD",
            cache: "no-store",
            redirect: "manual",
          })
          reachable = res.status > 0
        } catch {
          reachable = false
        }
      }
      if (!statusVisible || statusKind !== "offline") return
      if (reachable) {
        offlineDelayMs = 5000
        retryLoad()
        return
      }
      offlineDelayMs = Math.min(offlineDelayMs * 2, 60_000)
      offlinePoll = setTimeout(() => void tick(), offlineDelayMs)
    }
    offlinePoll = setTimeout(() => void tick(), offlineDelayMs)
  }
  function stopOfflinePoll() {
    if (offlinePoll) clearTimeout(offlinePoll)
    offlinePoll = null
  }

  function retryLoad(target?: string) {
    if (!win) return
    const url = target && isSameAppOrigin(target, config.origin) ? target : lastAppUrl ?? startUrl
    showStatus("loading")
    void win.webContents.loadURL(url).catch(() => {
      /* did-fail-load trata */
    })
  }

  function openAbout() {
    showStatus("about")
    if (!updateStatus) {
      void checkDesktopUpdate(config, app.getVersion()).then((s) => {
        updateStatus = s
        if (statusVisible && statusKind === "about") statusView?.webContents.send(STATUS_CHANNEL.state, currentState())
      })
    }
  }

  /** Únicos atalhos do desktop: acordes Ctrl+Shift+Alt que o PDV não usa. F1–F12, Ctrl+L etc. ficam com a página. */
  function handleDesktopChord(event: { preventDefault: () => void }, input: Electron.Input) {
    if (input.type !== "keyDown" || !input.control || !input.shift || !input.alt) return
    if (input.code === "KeyV") {
      event.preventDefault()
      openAbout()
    } else if (input.code === "KeyR") {
      event.preventDefault()
      retryLoad(win?.webContents.getURL())
    } else if (input.code === "KeyI" && devTools) {
      event.preventDefault()
      win?.webContents.toggleDevTools()
    }
  }

  function wireSession(ses: Session) {
    const ua = ses.getUserAgent().replace(/\s(Electron|omnigestao-desktop|OmniGest\S*)\/\S+/gi, "")
    ses.setUserAgent(`${ua} OmniGestaoDesktop/${app.getVersion()}`)
    permissionPolicy = installPermissionPolicy(ses, config.origin, () => win, config.channel === "production")
    logoutGuard = new LogoutGuard(ses, config.origin, log)

    ses.on("will-download", (event, item, wc) => {
      const itemUrl = item.getURL()
      const source = wc?.getURL() ?? ""
      const proto = safeParseUrl(itemUrl)?.protocol
      const sourceOk = isSameAppOrigin(source, config.origin) || source === "about:blank"
      const ok = isSameAppOrigin(itemUrl, config.origin) || ((proto === "data:" || proto === "blob:") && sourceOk)
      if (!ok) {
        event.preventDefault()
        log(`download-blocked ${itemUrl.slice(0, 80)}`)
        return
      }
      item.setSaveDialogOptions({
        title: "Salvar arquivo",
        defaultPath: path.join(app.getPath("downloads"), item.getFilename()),
      })
      item.once("done", (_e, state) => log(`download-${state} ${item.getFilename()}`))
    })
  }

  function createWindow() {
    handleLocalScheme(electronSession.fromPartition("omnigestao-status"), rendererDir)
    const ses = electronSession.fromPartition(partition)
    wireSession(ses)

    win = new BrowserWindow({
      title: windowTitle(config),
      icon: iconPath,
      width: 1366,
      height: 860,
      minWidth: 1024,
      minHeight: 640,
      show: false,
      backgroundColor: "#f5f9fc",
      autoHideMenuBar: true,
      webPreferences: remoteWebPreferences(ctx),
    })
    win.removeMenu()
    if (config.channel !== "production") {
      // Marca permanente de QA na barra de tarefas (o ícone é o mesmo de Produção).
      const size = 16
      const px = Buffer.alloc(size * size * 4)
      for (let i = 0; i < size * size; i++) px.set([0x0b, 0x9e, 0xf5, 0xff], i * 4) // BGRA âmbar
      win.setOverlayIcon(nativeImage.createFromBitmap(px, { width: size, height: size }), `Ambiente de ${channelLabel(config.channel)}`)
    }
    win.on("page-title-updated", (e) => e.preventDefault())
    win.on("resize", layoutStatus)
    win.on("closed", () => {
      stopOfflinePoll()
      statusView?.webContents.close()
      statusView = null
      win = null
    })

    const wc = win.webContents
    guardWebContents(wc, ctx, false)
    wc.on("before-input-event", handleDesktopChord)

    // A página pediu para não sair (beforeunload). No Electron isso cancelaria o fechamento
    // em silêncio; aqui o operador decide.
    wc.on("will-prevent-unload", (event) => {
      if (!win) return
      const choice = dialog.showMessageBoxSync(win, {
        type: "warning",
        buttons: ["Continuar no sistema", "Sair mesmo assim"],
        defaultId: 0,
        cancelId: 0,
        title: "OmniGestão Pro",
        message: "Esta tela tem uma operação em andamento.",
        detail: "Se sair agora, o que ainda não foi confirmado nesta tela pode ser perdido.",
        noLink: true,
      })
      if (choice === 1) event.preventDefault()
    })

    wc.on("did-navigate", (_e, url, httpResponseCode) => {
      lastHttpStatus = httpResponseCode
      onAppUrl(url)
      if (httpResponseCode >= 500) showStatus("server-error", `HTTP ${httpResponseCode}`)
    })
    wc.on("did-navigate-in-page", (_e, url, isMainFrame) => {
      if (isMainFrame) onAppUrl(url)
    })
    wc.on("did-finish-load", () => {
      // A página de erro do Chromium também dispara did-finish-load: ela não pode esconder a
      // tela offline nem contar como abertura bem-sucedida.
      if (mainLoadFailed || !isSameAppOrigin(wc.getURL(), config.origin)) return
      if (firstLoadMs === null) {
        firstLoadMs = Date.now() - startedAt
        log(`first-load ${firstLoadMs}ms`)
      }
      if (lastHttpStatus < 500 && statusVisible && statusKind !== "about") hideStatus()
    })
    wc.on("did-start-navigation", (e) => {
      if (e.isMainFrame && !e.isSameDocument) mainLoadFailed = false
    })
    wc.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      const kind = classifyLoadFailure(errorCode)
      if (kind === "ignored") return
      mainLoadFailed = true
      if (isSameAppOrigin(validatedURL, config.origin)) lastAppUrl = validatedURL
      if (kind === "offline") showStatus("offline", errorDescription)
      else if (kind === "certificate") showStatus("certificate", errorDescription)
      else showStatus("server-error", errorDescription)
    })
    wc.on("render-process-gone", (_e, details) => {
      log(`render-process-gone ${details.reason}`)
      if (details.reason !== "clean-exit") showStatus("server-error", "A tela do sistema parou de responder.")
    })

    statusView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "..", "preload", "status-preload.js"),
        partition: "omnigestao-status", // em memória, separado do perfil do sistema
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools,
        spellcheck: false,
      },
    })
    statusView.setBackgroundColor("#f5f9fc")
    const sv = statusView.webContents
    sv.on("will-navigate", (e) => e.preventDefault())
    sv.setWindowOpenHandler(() => ({ action: "deny" }))
    sv.on("before-input-event", handleDesktopChord)
    sv.once("did-finish-load", () => {
      sv.send(STATUS_CHANNEL.state, currentState())
      win?.show()
    })
    win.contentView.addChildView(statusView)
    statusVisible = true
    layoutStatus()
    void sv.loadURL(statusHtmlUrl)

    void wc.loadURL(startUrl).catch(() => {
      /* did-fail-load trata */
    })
  }

  function onAppUrl(url: string) {
    if (!isSameAppOrigin(url, config.origin)) return
    const previous = lastAppUrl
    lastAppUrl = url
    if (isLoginPath(url, config.origin) && previous === null) {
      // Abertura do app no /login. Com o Service Worker, o /login aparece primeiro mesmo para quem
      // tem sessão válida (o redirecionamento ao painel vem depois) — então NADA de cookie aqui.
      // Se, passado um instante, o app continua no /login e ninguém enviou login, a sessão anterior
      // não existe mais (ex.: JWT expirou com o app fechado): limpa só os caches de dados.
      const submitsAtLaunch = logoutGuard?.loginSubmits ?? 0
      setTimeout(() => {
        if (!win || win.isDestroyed() || !logoutGuard) return
        if (!lastAppUrl || !isLoginPath(lastAppUrl, config.origin)) return
        if (logoutGuard.loginSubmits !== submitsAtLaunch) return
        void logoutGuard
          .purgeCaches(win.webContents)
          .then((done) => log(`privacy-purge-abertura ${done.join(",")}`))
          .catch(() => log("privacy-purge-abertura-falhou"))
      }, 3000)
    }
    // /login vindo de outra tela do app: logout ou sessão expirada durante o uso.
    const enteringLogin = isLoginPath(url, config.origin) && previous !== null && !isLoginPath(previous, config.origin)
    if (enteringLogin) {
      // Troca de usuário: documentos abertos pelo anterior fecham e permissões voltam a perguntar.
      for (const child of win?.getChildWindows() ?? []) child.destroy()
      permissionPolicy?.reset()
      if (win && logoutGuard) {
        void logoutGuard
          .engage(win.webContents)
          .then((done) => log(`privacy-purge ${done.join(",")}`))
          .catch((err) => log(`privacy-purge-failed ${(err as Error).message}`))
      }
    }
  }

  /** IPC aceito só da tela local de status, carregada do próprio pacote. */
  function fromStatusView(event: Electron.IpcMainEvent): boolean {
    const ok =
      !!statusView &&
      event.sender === statusView.webContents &&
      event.senderFrame?.url === statusHtmlUrl
    if (!ok) log("ipc-rejected")
    return ok
  }
  ipcMain.on(STATUS_CHANNEL.retry, (e) => {
    if (fromStatusView(e)) retryLoad()
  })
  ipcMain.on(STATUS_CHANNEL.close, (e) => {
    if (fromStatusView(e) && statusKind === "about") hideStatus()
  })
  ipcMain.on(STATUS_CHANNEL.openUpdate, (e) => {
    if (!fromStatusView(e)) return
    const page = updateStatus?.manifest?.downloadPageUrl
    if (page) void openExternalSafely(page, win, ctx)
  })

  app.on("second-instance", () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  app.on("web-contents-created", (_e, contents) => {
    contents.on("will-attach-webview", (ev) => ev.preventDefault())
  })

  app.on("window-all-closed", () => app.quit())

  void app.whenReady().then(() => {
    createWindow()
    log(`started channel=${config.channel} origin=${config.origin} version=${app.getVersion()}`)
    // Verificação silenciosa do executável: só registra; o aviso aparece em "Sobre".
    void checkDesktopUpdate(config, app.getVersion()).then((s) => {
      updateStatus = s
      log(`update-check available=${s.available}`)
    })
  })
}

// ---- inicialização -------------------------------------------------------------------------

let config: DesktopBuildConfig | null = null
let configError: string | null = null
try {
  config = loadBuildConfig()
} catch (err) {
  configError = (err as Error).message
}
// Perfil próprio por canal ANTES de qualquer outra coisa (inclusive eventos do instalador):
// QA nunca cria nem compartilha cookies/cache/vendas pendentes no perfil de Produção.
if (config && config.channel !== "production") {
  const testProfile = process.env.OMNI_DESKTOP_TEST_USER_DATA // testes automatizados
  app.setPath("userData", testProfile || path.join(app.getPath("appData"), `OmniGestão Pro ${channelLabel(config.channel)}`))
}
const squirrelEvent = parseSquirrelEvent(process.argv)
if (!handleSquirrelEvent(squirrelEvent, () => app.quit())) {
  if (!config) fatal(configError ?? "configuração ausente")
  if (config) {
    const debugForbidden =
      hasForbiddenDebugSwitch(process.argv, config.channel) ||
      (config.channel === "production" &&
        (app.commandLine.hasSwitch("remote-debugging-port") || app.commandLine.hasSwitch("remote-debugging-pipe")))
    if (debugForbidden) {
      app.exit(1)
    } else if (!app.requestSingleInstanceLock()) {
      app.quit()
    } else {
      // Mesmo AppUserModelID que o Squirrel grava nos atalhos (fixar na barra de tarefas).
      app.setAppUserModelId(`com.squirrel.${config.channel === "qa" ? "OmniGestaoProQA" : "OmniGestaoPro"}.OmniGestaoPro`)
      app.enableSandbox()
      registerLocalScheme()
      Menu.setApplicationMenu(null) // sem aceleradores nativos: F5, Ctrl+R, Ctrl+W etc. ficam com o PDV
      run(config)
    }
  }
}
