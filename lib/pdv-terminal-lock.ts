/**
 * Lógica pura de lock/heartbeat de terminal PDV (Fase 2).
 * Sem "use client" / sem prisma: usado tanto nas rotas server quanto na UI client,
 * garantindo a MESMA regra de expiração nos dois lados.
 */

/** Intervalo do heartbeat do terminal ativo (client envia a cada N ms). */
export const TERMINAL_HEARTBEAT_INTERVAL_MS = 30_000

/**
 * TTL do lock: se o último heartbeat for mais antigo que isto, o terminal é
 * considerado "expirado/offline" e pode ser assumido por outro device sem admin.
 * ~4 batidas de folga para tolerar rede instável; libera um PC travado em ~2 min.
 */
export const TERMINAL_LOCK_TTL_MS = 120_000

export type TerminalLockStatus =
  | "LIVRE" // sem lock — pode usar
  | "EM_USO" // travado por ESTE device — pode continuar
  | "OCUPADO" // travado por OUTRO device com heartbeat fresco — bloqueado (admin assume)
  | "EXPIRADO" // travado mas heartbeat velho — pode assumir sem admin
  | "INATIVO" // terminal desativado

/** Heartbeat ainda válido em relação ao TTL. */
export function isHeartbeatFresh(
  heartbeatAtMs: number | null | undefined,
  nowMs: number,
): boolean {
  if (!heartbeatAtMs || !Number.isFinite(heartbeatAtMs)) return false
  return nowMs - heartbeatAtMs < TERMINAL_LOCK_TTL_MS
}

export function computeLockStatus(input: {
  status: "ACTIVE" | "INACTIVE" | string
  lockedByDeviceId: string | null | undefined
  heartbeatAtMs: number | null | undefined
  nowMs: number
  myDeviceId: string | null | undefined
}): TerminalLockStatus {
  if (input.status === "INACTIVE") return "INATIVO"
  const locked = !!(input.lockedByDeviceId && String(input.lockedByDeviceId).trim())
  if (!locked) return "LIVRE"
  const fresh = isHeartbeatFresh(input.heartbeatAtMs, input.nowMs)
  if (input.myDeviceId && input.lockedByDeviceId === input.myDeviceId) {
    // É meu: continua "EM_USO" mesmo se eu fiquei um tempo sem bater (vou renovar).
    return "EM_USO"
  }
  if (!fresh) return "EXPIRADO"
  return "OCUPADO"
}

/** Pode ser selecionado sem precisar de admin (livre, meu ou expirado). */
export function isSelectableWithoutAdmin(s: TerminalLockStatus): boolean {
  return s === "LIVRE" || s === "EM_USO" || s === "EXPIRADO"
}
