/**
 * Storage operacional isolado do PDV Black (Turno e Cupom).
 *
 * Chaves:
 * - `@omnigestao:pdv-black-turno:${storeId}:${terminalIdOrDefault}`
 * - `@omnigestao:pdv-black-cupom:${storeId}:${terminalIdOrDefault}`
 *
 * Sem storeId válido: não lê/grava em chaves globais.
 * Garante que Loja A != Loja B e Terminal 1 != Terminal 2.
 */

export function resolveTerminalId(terminalId?: string | null): string {
  const t = (terminalId ?? "").trim()
  return t || "default"
}

export function getPdvBlackStorageScope(storeId: string | null | undefined, terminalId?: string | null): string {
  const s = (storeId ?? "").trim() || "default"
  return `${s}:${resolveTerminalId(terminalId)}`
}

export function pdvBlackTurnoKey(storeId: string | null | undefined, terminalId?: string | null): string | null {
  const s = (storeId ?? "").trim()
  if (!s) return null
  return `@omnigestao:pdv-black-turno:${s}:${resolveTerminalId(terminalId)}`
}

export function pdvBlackCupomKey(storeId: string | null | undefined, terminalId?: string | null): string | null {
  const s = (storeId ?? "").trim()
  if (!s) return null
  return `@omnigestao:pdv-black-cupom:${s}:${resolveTerminalId(terminalId)}`
}

export function readPdvBlackTurno(storeId: string | null | undefined, terminalId?: string | null): number {
  if (typeof window === "undefined") return 1
  const key = pdvBlackTurnoKey(storeId, terminalId)
  if (!key) return 1
  try {
    const raw = localStorage.getItem(key)
    return parseInt(raw ?? "1", 10) || 1
  } catch {
    return 1
  }
}

export function writePdvBlackTurno(
  storeId: string | null | undefined,
  terminalId: string | null | undefined,
  n: number
): boolean {
  if (typeof window === "undefined") return false
  const key = pdvBlackTurnoKey(storeId, terminalId)
  if (!key) return false
  try {
    localStorage.setItem(key, String(n))
    return true
  } catch {
    return false
  }
}

export function readPdvBlackCupom(storeId: string | null | undefined, terminalId?: string | null): number {
  if (typeof window === "undefined") return 1000
  const key = pdvBlackCupomKey(storeId, terminalId)
  if (!key) return 1000
  try {
    const raw = localStorage.getItem(key)
    return parseInt(raw ?? "1000", 10) || 1000
  } catch {
    return 1000
  }
}

export function writePdvBlackCupom(
  storeId: string | null | undefined,
  terminalId: string | null | undefined,
  n: number
): boolean {
  if (typeof window === "undefined") return false
  const key = pdvBlackCupomKey(storeId, terminalId)
  if (!key) return false
  try {
    localStorage.setItem(key, String(n))
    return true
  } catch {
    return false
  }
}
