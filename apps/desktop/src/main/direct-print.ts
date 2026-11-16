import { app, BrowserWindow, ipcMain, session as electronSession, type IpcMainInvokeEvent, type WebContents } from "electron"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import {
  buildPrintDocument,
  buildTestReceiptInner,
  DuplicateGuard,
  PRINT_CHANNEL,
  validatePrintRequest,
  validateStation,
  type PrintOutcome,
  type PrinterInfo,
  type PrintStation,
} from "../shared/print-protocol"
import { isSameAppOrigin } from "../shared/url-policy"

/**
 * Impressão direta pelo spooler do Windows (webContents.print silencioso).
 *
 * Sem porta TCP, sem 127.0.0.1:9100, sem servidor: o cupom vai para a impressora instalada no
 * Windows que o operador escolheu UMA vez nesta estação (arquivo em userData).
 */
export function installDirectPrint(opts: {
  appOrigin: string
  getMainContents: () => WebContents | null
  log: (msg: string) => void
}) {
  const { appOrigin, getMainContents, log } = opts
  const stationFile = () => path.join(app.getPath("userData"), "print-station.json")
  const guard = new DuplicateGuard(5000)
  let queue: Promise<unknown> = Promise.resolve()

  function readStation(): PrintStation | null {
    try {
      return validateStation(JSON.parse(readFileSync(stationFile(), "utf8")))
    } catch {
      return null
    }
  }

  function trusted(event: IpcMainInvokeEvent): boolean {
    const main = getMainContents()
    const ok =
      !!main &&
      event.sender === main &&
      event.senderFrame === main.mainFrame &&
      isSameAppOrigin(event.senderFrame?.url ?? "", appOrigin)
    if (!ok) log("print-ipc-rejected")
    return ok
  }

  async function listPrinters(): Promise<PrinterInfo[]> {
    const wc = getMainContents()
    if (!wc) return []
    const list = await wc.getPrintersAsync()
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!(p as { isDefault?: boolean }).isDefault }))
  }

  async function printHtml(inner: string, station: PrintStation, bobina: PrintStation["bobina"], title: string): Promise<PrintOutcome> {
    const ses = electronSession.fromPartition("omnigestao-print") // em memória, sem cookies do app
    const win = new BrowserWindow({
      show: false,
      width: bobina === "58mm" ? 220 : 302,
      height: 600,
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
        webSecurity: true,
        devTools: false,
        spellcheck: false,
      },
    })
    try {
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
      win.webContents.on("will-navigate", (e) => e.preventDefault())
      const doc = buildPrintDocument(inner, bobina, title)
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`)
      return await new Promise<PrintOutcome>((resolve) => {
        win.webContents.print(
          {
            silent: true,
            printBackground: false,
            deviceName: station.deviceName,
            margins: { marginType: "none" },
            // SEM pageSize: no POS-80 real, página forçada sai EM BRANCO. O driver de bobina corta no fim do conteúdo.
            copies: 1,
          },
          (success, failureReason) => {
            if (success) resolve({ ok: true, status: "queued", deviceName: station.deviceName })
            else resolve({ ok: false, status: "failed", error: failureReason || "O Windows recusou a impressão." })
          },
        )
      })
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  }

  ipcMain.handle(PRINT_CHANNEL.list, async (e) => (trusted(e) ? listPrinters() : []))
  ipcMain.handle(PRINT_CHANNEL.getStation, (e) => (trusted(e) ? readStation() : null))
  ipcMain.handle(PRINT_CHANNEL.setStation, async (e, raw: unknown) => {
    if (!trusted(e)) return { ok: false, error: "Origem não autorizada." }
    if (raw === null) {
      writeFileSync(stationFile(), "null")
      log("print-station cleared")
      return { ok: true, station: null }
    }
    const station = validateStation(raw)
    if (!station) return { ok: false, error: "Impressora ou bobina inválida." }
    const printers = await listPrinters()
    if (!printers.some((p) => p.name === station.deviceName)) return { ok: false, error: "Impressora não encontrada no Windows." }
    mkdirSync(path.dirname(stationFile()), { recursive: true })
    writeFileSync(stationFile(), JSON.stringify(station))
    log(`print-station set bobina=${station.bobina}`)
    return { ok: true, station }
  })
  ipcMain.handle(PRINT_CHANNEL.print, async (e, raw: unknown): Promise<PrintOutcome> => {
    if (!trusted(e)) return { ok: false, status: "invalid", error: "Origem não autorizada." }
    const req = validatePrintRequest(raw)
    if (!req) return { ok: false, status: "invalid", error: "Pedido de impressão inválido." }
    const station = readStation()
    if (!station) return { ok: false, status: "not-configured", error: "Nenhuma impressora definida nesta estação." }
    const printers = await listPrinters()
    if (!printers.some((p) => p.name === station.deviceName)) {
      log("print printer-missing")
      return { ok: false, status: "printer-missing", error: `Impressora "${station.deviceName}" não está instalada/disponível no Windows.` }
    }
    // Impressora USB desligada/desconectada: o spooler ACEITA e DESCARTA o job (provado no POS-80).
    // Checa a presença física antes de enviar para o status ser honesto e o cupom não se perder.
    if ((await usbPresence(station.deviceName)) === "absent") {
      log("print usb-absent")
      return { ok: false, status: "printer-missing", error: `${station.deviceName} está desligada ou desconectada. Ligue a impressora e toque em Tentar novamente.` }
    }
    const bobina = req.bobina ?? station.bobina
    const inner = req.kind === "test" ? buildTestReceiptInner(station.deviceName, bobina, new Date(), app.getVersion()) : req.html
    const key = createHash("sha256").update(`${station.deviceName}\0${bobina}\0${inner}`).digest("hex")
    if (req.kind !== "test" && guard.isDuplicate(key)) {
      log("print duplicate-suppressed")
      return { ok: true, status: "queued", deviceName: station.deviceName, duplicate: true }
    }
    const job = queue.then(() => printHtml(inner, station, bobina, req.title ?? "Cupom"))
    queue = job.catch(() => undefined)
    const out = await job.catch((err: Error) => ({ ok: false as const, status: "failed" as const, error: err.message }))
    if (!out.ok) guard.forget(key) // falha não bloqueia a nova tentativa do operador
    log(`print ${req.kind} ${out.ok ? "queued" : `failed ${out.status}`}`)
    return out
  })
}


/**
 * "absent" só quando a fila usa porta USBnnn e o dispositivo USBPRINT dessa porta não está presente.
 * Porta de rede/outra ou erro na consulta = "unknown" (não bloqueia a impressão).
 */
function usbPresence(deviceName: string): Promise<"present" | "absent" | "unknown"> {
  if (process.platform !== "win32") return Promise.resolve("unknown")
  // Nome da impressora vai por variável de ambiente, nunca interpolado no comando.
  const script =
    "$ErrorActionPreference='Stop';" +
    "$p=Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $env:OMNI_PRINTER };" +
    "if(-not $p){'unknown';exit};$port=[string]$p.PortName;" +
    "if($port -notmatch '^USB[0-9]+$'){'unknown';exit};" +
    "$d2=Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like ('USBPRINT*' + $port) };" +
    "if($d2){'present'}else{'absent'}"
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { env: { ...process.env, OMNI_PRINTER: deviceName }, timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve("unknown")
        const out = String(stdout).trim().split(/\s+/).pop()
        resolve(out === "present" || out === "absent" ? out : "unknown")
      },
    )
  })
}
