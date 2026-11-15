/** Regras puras de inicialização (argumentos, eventos Squirrel, erros de rede). */

import type { DesktopChannel } from "./build-config"

export type SquirrelEvent = "install" | "updated" | "uninstall" | "obsolete" | "firstrun" | null

export function parseSquirrelEvent(argv: readonly string[]): SquirrelEvent {
  const arg = argv[1]
  switch (arg) {
    case "--squirrel-install":
      return "install"
    case "--squirrel-updated":
      return "updated"
    case "--squirrel-uninstall":
      return "uninstall"
    case "--squirrel-obsolete":
      return "obsolete"
    case "--squirrel-firstrun":
      return "firstrun"
    default:
      return null
  }
}

const DEBUG_SWITCHES = [
  "--remote-debugging-port",
  "--remote-debugging-pipe",
  "--inspect",
  "--inspect-brk",
  "--inspect-port",
  "--remote-allow-origins",
]

/**
 * Em Produção o app recusa iniciar com porta de depuração: qualquer processo local poderia
 * controlar a janela autenticada. QA/desenvolvimento permitem (E2E do pacote real).
 */
export function hasForbiddenDebugSwitch(argv: readonly string[], channel: DesktopChannel): boolean {
  if (channel !== "production") return false
  return argv.some((a) => DEBUG_SWITCHES.some((s) => a === s || a.startsWith(`${s}=`)))
}

/**
 * Códigos de erro do Chromium (net_error_list.h) que significam "sem conexão com o servidor".
 * -3 (ERR_ABORTED) não entra: é navegação cancelada pelo próprio app.
 */
const NETWORK_ERROR_CODES = new Set([
  -7, // TIMED_OUT
  -21, // NETWORK_CHANGED
  -100, // CONNECTION_CLOSED
  -101, // CONNECTION_RESET
  -102, // CONNECTION_REFUSED
  -104, // CONNECTION_FAILED
  -105, // NAME_NOT_RESOLVED
  -106, // INTERNET_DISCONNECTED
  -109, // ADDRESS_UNREACHABLE
  -118, // CONNECTION_TIMED_OUT
  -130, // PROXY_CONNECTION_FAILED
  -137, // NAME_RESOLUTION_FAILED
])

export type LoadFailureKind = "offline" | "certificate" | "ignored" | "other"

export function classifyLoadFailure(errorCode: number): LoadFailureKind {
  if (errorCode === -3) return "ignored"
  if (NETWORK_ERROR_CODES.has(errorCode)) return "offline"
  // -200..-299: erros de certificado. Nunca são contornados — só explicados.
  if (errorCode <= -200 && errorCode > -300) return "certificate"
  return "other"
}
