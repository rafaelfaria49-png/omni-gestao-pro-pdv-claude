/**
 * Status canônicos do domínio financeiro (contrato de produto).
 * Valores gravados no Prisma / payloads legados podem divergir — use sempre normalize*.
 */

export const RECEBER_STATUS = {
  PENDENTE: "pendente",
  PARCIAL: "parcial",
  PAGO: "pago",
  VENCIDO: "vencido",
  CANCELADO: "cancelado",
  ESTORNADO: "estornado",
} as const

export type ReceberStatusCanon = (typeof RECEBER_STATUS)[keyof typeof RECEBER_STATUS]

export const PAGAR_STATUS = {
  PENDENTE: "pendente",
  PARCIAL: "parcial",
  PAGO: "pago",
  VENCIDO: "vencido",
  CANCELADO: "cancelado",
  ESTORNADO: "estornado",
} as const

export type PagarStatusCanon = (typeof PAGAR_STATUS)[keyof typeof PAGAR_STATUS]

export const MOVIMENTO_STATUS = {
  PREVISTO: "previsto",
  CONFIRMADO: "confirmado",
  CANCELADO: "cancelado",
  ESTORNADO: "estornado",
} as const

export type MovimentoStatusCanon = (typeof MOVIMENTO_STATUS)[keyof typeof MOVIMENTO_STATUS]

const RECEBER_ALIASES = new Map<string, ReceberStatusCanon>([
  ["pendente", RECEBER_STATUS.PENDENTE],
  ["em_aberto", RECEBER_STATUS.PENDENTE],
  ["aberto", RECEBER_STATUS.PENDENTE],
  ["parcial", RECEBER_STATUS.PARCIAL],
  ["parcialmente_pago", RECEBER_STATUS.PARCIAL],
  ["pago", RECEBER_STATUS.PAGO],
  ["paga", RECEBER_STATUS.PAGO],
  ["quitado", RECEBER_STATUS.PAGO],
  ["liquidado", RECEBER_STATUS.PAGO],
  ["vencido", RECEBER_STATUS.VENCIDO],
  ["atrasado", RECEBER_STATUS.VENCIDO],
  ["vencida", RECEBER_STATUS.VENCIDO],
  ["cancelado", RECEBER_STATUS.CANCELADO],
  ["cancelada", RECEBER_STATUS.CANCELADO],
  ["estornado", RECEBER_STATUS.ESTORNADO],
  ["estornada", RECEBER_STATUS.ESTORNADO],
])

const PAGAR_ALIASES = new Map<string, PagarStatusCanon>([
  ["pendente", PAGAR_STATUS.PENDENTE],
  ["em_aberto", PAGAR_STATUS.PENDENTE],
  ["parcial", PAGAR_STATUS.PARCIAL],
  ["pago", PAGAR_STATUS.PAGO],
  ["paga", PAGAR_STATUS.PAGO],
  ["quitado", PAGAR_STATUS.PAGO],
  ["vencido", PAGAR_STATUS.VENCIDO],
  ["atrasado", PAGAR_STATUS.VENCIDO],
  ["cancelado", PAGAR_STATUS.CANCELADO],
  ["cancelada", PAGAR_STATUS.CANCELADO],
  ["estornado", PAGAR_STATUS.ESTORNADO],
  ["estornada", PAGAR_STATUS.ESTORNADO],
])

const MOVIMENTO_ALIASES = new Map<string, MovimentoStatusCanon>([
  ["previsto", MOVIMENTO_STATUS.PREVISTO],
  ["prevista", MOVIMENTO_STATUS.PREVISTO],
  ["planejado", MOVIMENTO_STATUS.PREVISTO],
  ["confirmado", MOVIMENTO_STATUS.CONFIRMADO],
  ["confirmada", MOVIMENTO_STATUS.CONFIRMADO],
  ["realizado", MOVIMENTO_STATUS.CONFIRMADO],
  ["cancelado", MOVIMENTO_STATUS.CANCELADO],
  ["cancelada", MOVIMENTO_STATUS.CANCELADO],
  ["estornado", MOVIMENTO_STATUS.ESTORNADO],
  ["estornada", MOVIMENTO_STATUS.ESTORNADO],
])

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
}

export function normalizeReceberStatus(raw: string | null | undefined): ReceberStatusCanon | null {
  if (raw == null || raw === "") return null
  const k = normKey(raw)
  return RECEBER_ALIASES.get(k) ?? null
}

export function normalizePagarStatus(raw: string | null | undefined): PagarStatusCanon | null {
  if (raw == null || raw === "") return null
  const k = normKey(raw)
  return PAGAR_ALIASES.get(k) ?? null
}

export function normalizeMovimentoStatus(raw: string | null | undefined): MovimentoStatusCanon | null {
  if (raw == null || raw === "") return null
  const k = normKey(raw)
  return MOVIMENTO_ALIASES.get(k) ?? null
}

export function isReceberPago(status: string | null | undefined): boolean {
  return normalizeReceberStatus(status) === RECEBER_STATUS.PAGO
}

export function isPagarPago(status: string | null | undefined): boolean {
  return normalizePagarStatus(status) === PAGAR_STATUS.PAGO
}

export function isStatusCancelado(status: string | null | undefined): boolean {
  const r = normalizeReceberStatus(status)
  const p = normalizePagarStatus(status)
  const m = normalizeMovimentoStatus(status)
  return (
    r === RECEBER_STATUS.CANCELADO ||
    p === PAGAR_STATUS.CANCELADO ||
    m === MOVIMENTO_STATUS.CANCELADO
  )
}

export type FinanceiroStatusKind = "receber" | "pagar" | "movimento"

export function getFinanceiroStatusLabel(kind: FinanceiroStatusKind, status: string | null | undefined): string {
  const meta = getFinanceiroStatusMeta(kind, status)
  return meta.label
}

export type FinanceiroStatusMeta = {
  label: string
  /** Sugestão de severidade para badges (UI futura). */
  tone: "neutral" | "info" | "warning" | "success" | "danger"
}

export function getFinanceiroStatusMeta(kind: FinanceiroStatusKind, status: string | null | undefined): FinanceiroStatusMeta {
  if (kind === "receber") {
    const c = normalizeReceberStatus(status)
    switch (c) {
      case RECEBER_STATUS.PENDENTE:
        return { label: "Pendente", tone: "neutral" }
      case RECEBER_STATUS.PARCIAL:
        return { label: "Parcial", tone: "info" }
      case RECEBER_STATUS.PAGO:
        return { label: "Pago", tone: "success" }
      case RECEBER_STATUS.VENCIDO:
        return { label: "Vencido", tone: "warning" }
      case RECEBER_STATUS.CANCELADO:
        return { label: "Cancelado", tone: "danger" }
      case RECEBER_STATUS.ESTORNADO:
        return { label: "Estornado", tone: "danger" }
      default:
        return { label: status?.trim() ? status.trim() : "Desconhecido", tone: "neutral" }
    }
  }
  if (kind === "pagar") {
    const c = normalizePagarStatus(status)
    switch (c) {
      case PAGAR_STATUS.PENDENTE:
        return { label: "Pendente", tone: "neutral" }
      case PAGAR_STATUS.PARCIAL:
        return { label: "Parcial", tone: "info" }
      case PAGAR_STATUS.PAGO:
        return { label: "Pago", tone: "success" }
      case PAGAR_STATUS.VENCIDO:
        return { label: "Vencido", tone: "warning" }
      case PAGAR_STATUS.CANCELADO:
        return { label: "Cancelado", tone: "danger" }
      case PAGAR_STATUS.ESTORNADO:
        return { label: "Estornado", tone: "danger" }
      default:
        return { label: status?.trim() ? status.trim() : "Desconhecido", tone: "neutral" }
    }
  }
  const c = normalizeMovimentoStatus(status)
  switch (c) {
    case MOVIMENTO_STATUS.PREVISTO:
      return { label: "Previsto", tone: "info" }
    case MOVIMENTO_STATUS.CONFIRMADO:
      return { label: "Confirmado", tone: "success" }
    case MOVIMENTO_STATUS.CANCELADO:
      return { label: "Cancelado", tone: "danger" }
    case MOVIMENTO_STATUS.ESTORNADO:
      return { label: "Estornado", tone: "danger" }
    default:
      return { label: status?.trim() ? status.trim() : "Desconhecido", tone: "neutral" }
  }
}
