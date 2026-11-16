/** Mensagens entre o processo principal e a tela local de status (carregando/offline/erro/sobre). */

export type StatusKind = "loading" | "offline" | "server-error" | "certificate" | "fatal" | "about"

export interface StatusState {
  kind: StatusKind
  detail?: string
  appVersion: string
  channel: string
  channelLabel: string
  host: string
  buildCommit: string
  electronVersion: string
  update?: { available: boolean; version?: string; message: string }
}

export const STATUS_CHANNEL = {
  state: "omni-status:state",
  retry: "omni-status:retry",
  close: "omni-status:close",
  openUpdate: "omni-status:open-update",
} as const
