/**
 * Email de Cliente — normalização mínima e determinística.
 * trim + lowercase; vazio → ausência de sinal.
 * Sem transformações de provider (não remove pontos do Gmail, nem `+tag`).
 */
import type { ClientEmailSignal } from "./types"

export function normalizeClientEmail(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw.trim().toLowerCase()
}

export function toEmailSignal(raw: unknown): ClientEmailSignal {
  const value = normalizeClientEmail(raw)
  if (!value) return { present: false }
  return { present: true, value }
}
