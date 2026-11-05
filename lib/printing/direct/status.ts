/**
 * Operator-facing view of a direct-print job. Pure (client + server). Wording never claims paper output:
 * the strongest known state is "accepted by the printer queue" (SPOOLER_ACCEPTED).
 */
export type CopyPhase = "QUEUED" | "NOT_SENT" | "SENDING" | "IN_PRINTER_QUEUE" | "FAILED_BEFORE_SEND" | "UNCERTAIN" | "CANCELLED"
export type CopyView = { ordinal: number; phase: CopyPhase; label: string; reason: string | null; canRetry: boolean; retrySuppressed: boolean }
export type JobPhase = CopyPhase | "PARTIAL" | "EMPTY"
export type JobView = {
  jobId: string; saleId: string; kind: "INITIAL" | "REPRINT"; terminalId: string; replay: boolean; printerName: string | null
  agentOnline: boolean; phase: JobPhase; final: boolean; copies: CopyView[]
  canRetry: boolean; canReprint: boolean; physicalPrintConfirmed: false
}
export type CopyRow = { ordinal: number; state: string; retry_suppressed_by_job_id: string | null; has_payload: boolean
  payload_expires_at: Date | string; lease_until: Date | string | null; attempts: number; reason: string | null }

export const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  PRINTER_NOT_FOUND: "impressora não encontrada neste computador",
  PRINTER_OFFLINE: "impressora desligada ou desconectada",
  PRINTER_PAUSED: "fila da impressora pausada",
  PRINTER_ERROR: "impressora em erro",
  PAPER_OUT: "sem papel",
  SPOOLER_UNAVAILABLE: "serviço de impressão do Windows indisponível",
  OPEN_FAILED: "não foi possível abrir a impressora",
  START_DOC_FAILED: "a fila recusou o documento",
  PAYLOAD_REFUSED: "conteúdo recusado pelo agente",
  TIMEOUT_BEFORE_SUBMIT: "tempo esgotado antes do envio",
  DOCUMENT_CHANGED: "a venda foi alterada ou cancelada",
  AUTHORIZATION_LOST: "a autorização de impressão expirou",
  BINDING_CHANGED: "o terminal ou a impressora vinculada foi alterado",
  RISK_CHANGED: "a situação das vias mudou; confirme a segunda via novamente",
  REPRINT_REPLACED: "substituída por uma segunda via",
  EXPLICIT_FALLBACK: "substituída pela impressão no navegador",
})

const LABELS: Readonly<Record<CopyPhase, string>> = Object.freeze({
  QUEUED: "Aguardando o agente de impressão",
  NOT_SENT: "Não enviado: o agente de impressão não respondeu",
  SENDING: "Enviando para a impressora",
  IN_PRINTER_QUEUE: "Enviado à fila da impressora",
  FAILED_BEFORE_SEND: "Não enviado",
  UNCERTAIN: "Resultado incerto: confira o papel",
  CANCELLED: "Impressão cancelada",
})

function copyView(c: CopyRow, now: number): CopyView {
  const lapsed = c.lease_until !== null && new Date(c.lease_until).getTime() <= now
  const retryable = !c.retry_suppressed_by_job_id && c.has_payload && new Date(c.payload_expires_at).getTime() > now
  const phase: CopyPhase =
    c.state === "READY" ? (lapsed ? "NOT_SENT" : "QUEUED")
    : c.state === "REGISTERED" ? "QUEUED"
    : c.state === "SENDING" ? "SENDING"
    : c.state === "SPOOLER_ACCEPTED" || c.state === "TRANSPORT_ACCEPTED" ? "IN_PRINTER_QUEUE"
    : c.state === "PRE_SEND_FAILED" ? "FAILED_BEFORE_SEND"
    : c.state === "UNKNOWN" ? "UNCERTAIN"
    : "CANCELLED"
  const reason = c.reason && REASON_LABELS[c.reason] ? c.reason : null
  const label = (phase === "FAILED_BEFORE_SEND" || phase === "CANCELLED") && reason ? `${LABELS[phase]}: ${REASON_LABELS[reason]}` : LABELS[phase]
  return { ordinal: c.ordinal, phase, label, reason, retrySuppressed: !!c.retry_suppressed_by_job_id,
    // UNKNOWN is never retryable (no blind resend). Only proven not-sent copies can retry.
    canRetry: retryable && (phase === "FAILED_BEFORE_SEND" || phase === "NOT_SENT") }
}

export function summarizeCopies(meta: { jobId: string; saleId: string; kind: "INITIAL" | "REPRINT"; terminalId: string; replay: boolean
  printerName: string | null; agentOnline: boolean; authorizationOpen: boolean }, rows: readonly CopyRow[], now = Date.now()): JobView {
  const copies = rows.map(r => copyView(r, now))
  const phases = new Set(copies.map(c => c.phase))
  const phase: JobPhase = phases.size > 1 ? "PARTIAL" : copies[0]?.phase ?? "EMPTY"
  const final = copies.length > 0 && copies.every(c => ["IN_PRINTER_QUEUE", "FAILED_BEFORE_SEND", "UNCERTAIN", "CANCELLED", "NOT_SENT"].includes(c.phase))
  const { authorizationOpen, ...rest } = meta
  return { ...rest, phase, final, copies, canRetry: authorizationOpen && copies.some(c => c.canRetry),
    canReprint: final, physicalPrintConfirmed: false }
}
