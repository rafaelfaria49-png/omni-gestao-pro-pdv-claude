import { spawn } from "node:child_process"
import path from "node:path"
import type { SquirrelEvent } from "../shared/startup"

/**
 * Eventos do instalador Squirrel.Windows (instalação por usuário em %LocalAppData%\OmniGestaoPro).
 * Cria/remove os atalhos da Área de Trabalho e do Menu Iniciar e encerra.
 *
 * Desinstalar NÃO apaga %AppData%\OmniGestão Pro (perfil do navegador): lá podem existir vendas
 * do PDV pendentes de sincronização. A remoção do perfil é decisão do operador.
 *
 * Retorna true quando o processo deve sair imediatamente.
 */
export function handleSquirrelEvent(event: SquirrelEvent, quit: () => void): boolean {
  if (event === null || event === "firstrun") return false
  if (event === "obsolete") {
    quit()
    return true
  }
  const updateExe = path.resolve(path.dirname(process.execPath), "..", "Update.exe")
  const exeName = path.basename(process.execPath)
  const args =
    event === "uninstall"
      ? [`--removeShortcut=${exeName}`]
      : [`--createShortcut=${exeName}`, "--shortcut-locations=Desktop,StartMenu"]
  try {
    const child = spawn(updateExe, args, { detached: true, stdio: "ignore", windowsHide: true })
    child.on("close", () => quit())
    child.on("error", () => quit())
  } catch {
    quit()
  }
  // Garantia: nunca ficar pendurado durante install/uninstall.
  setTimeout(quit, 5000).unref()
  return true
}
