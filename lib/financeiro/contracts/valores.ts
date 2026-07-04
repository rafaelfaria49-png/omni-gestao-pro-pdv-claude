/**
 * Helpers numéricos e de data para o domínio financeiro (sem alterar Prisma/UI).
 */

const MONEY_SCALE = 100

export function safeMoney(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0
  return Math.round(n * MONEY_SCALE) / MONEY_SCALE
}

export function sumMoney(...vals: unknown[]): number {
  let t = 0
  for (const v of vals) t += safeMoney(v)
  return Math.round(t * MONEY_SCALE) / MONEY_SCALE
}

export function formatMoneyBR(n: unknown): string {
  return safeMoney(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function calculatePaidRemaining(total: unknown, pago: unknown): { total: number; pago: number; restante: number } {
  const t = safeMoney(total)
  const p = safeMoney(pago)
  const restante = Math.max(0, Math.round((t - p) * MONEY_SCALE) / MONEY_SCALE)
  return { total: t, pago: p, restante }
}

/** Compara vencimento textual (ISO yyyy-mm-dd ou pt-BR dd/mm/aaaa) com “hoje” local. */
export function isOverdueDateString(vencimento: string | null | undefined, hoje: Date = new Date()): boolean {
  const d = parseDateStringSafe(vencimento)
  if (!d) return false
  const endHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999)
  return d.getTime() < endHoje.getTime()
}

/**
 * Tenta interpretar data comum no app: ISO `yyyy-mm-dd` ou `dd/mm/yyyy`.
 */
export function parseDateStringSafe(raw: string | null | undefined): Date | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) {
    const y = Number(iso[1])
    const mo = Number(iso[2]) - 1
    const d = Number(iso[3])
    const dt = new Date(y, mo, d)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (br) {
    const d = Number(br[1])
    const mo = Number(br[2]) - 1
    const y = Number(br[3])
    const dt = new Date(y, mo, d)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t)
  return null
}

/**
 * Formata vencimento para exibição (pt-BR), aceitando ISO ou `dd/mm/aaaa`.
 * Nunca produz "Invalid Date" — retorna `fallback` quando a data é vazia/inválida.
 */
export function formatDateBR(raw: string | null | undefined, fallback = "—"): string {
  const d = parseDateStringSafe(raw)
  if (!d) return fallback
  return d.toLocaleDateString("pt-BR")
}
