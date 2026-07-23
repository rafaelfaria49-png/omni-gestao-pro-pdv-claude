/**
 * Contratos da fila fiscal operacional (GOAL-011).
 *
 * A fila permanece restrita ao provider simulado. Os contratos já carregam a trava que
 * impedirá retry de transmissão externa sem consulta autorizadora em GOAL futuro.
 */

export type FiscalQueueJobStatus =
  | "PENDENTE"
  | "PROCESSANDO"
  | "AGUARDANDO_RETRY"
  | "CONCLUIDO"
  | "FALHA"
  | "CANCELADO"

export type FiscalQueueJobType =
  | "EMISSAO"
  | "CANCELAMENTO"
  | "INUTILIZACAO"
  | "CONTINGENCIA_TRANSMISSAO"
  | "CONSULTA"

export type FiscalQueuePayload = Record<string, unknown>

export type FiscalQueueJob = {
  id: string
  storeId: string
  vendaId: string
  notaFiscalId: string | null
  tipo: FiscalQueueJobType
  status: FiscalQueueJobStatus
  tentativas: number
  maxTentativas: number
  proximaTentativaEm: Date | null
  prioridade: number
  lockOwner: string | null
  lockedAt: Date | null
  lockExpiresAt: Date | null
  dedupeKey: string | null
  payload: FiscalQueuePayload | null
  ultimoErro: string | null
  concluidoEm: Date | null
  createdAt: Date
  updatedAt: Date
}

export type FiscalQueueLease = {
  job: FiscalQueueJob
  takeover: boolean
}

export type FiscalQueuePauseSnapshot = {
  globalPaused: boolean
  globalSource: "none" | "environment" | "audit_log"
  pausedStoreIds: string[]
}

export type FiscalQueueExecutionResult = {
  kind: "success" | "transient" | "terminal" | "uncertain"
  code: string
  mensagem: string
  /** Sempre true no GOAL-011. Resultado false é bloqueado pelo worker. */
  simulado: boolean
  /**
   * Marca que houve transmissão externa possivelmente ambígua. No GOAL-011 é sempre false,
   * pois o único executor permitido usa STUB_HOMOLOGACAO.
   */
  externalTransmissionAttempted: boolean
  detalhe?: Record<string, unknown>
}

export type FiscalQueueAuditEvent = {
  job: FiscalQueueJob
  acao: string
  nivel: "INFO" | "WARN" | "ERROR"
  mensagem: string
  operador?: string | null
  detalhe?: Record<string, unknown>
}

export type FiscalQueueWorkerPorts = {
  readPauseSnapshot: () => Promise<FiscalQueuePauseSnapshot>
  acquireNextJob: (input: {
    workerId: string
    now: Date
    leaseMs: number
    pausedStoreIds: string[]
  }) => Promise<FiscalQueueLease | null>
  heartbeat: (input: {
    jobId: string
    workerId: string
    now: Date
    leaseMs: number
  }) => Promise<boolean>
  markTransmissionStarted: (input: {
    job: FiscalQueueJob
    workerId: string
    now: Date
    payload: FiscalQueuePayload
  }) => Promise<boolean>
  complete: (input: {
    job: FiscalQueueJob
    workerId: string
    now: Date
    payload: FiscalQueuePayload
  }) => Promise<boolean>
  retry: (input: {
    job: FiscalQueueJob
    workerId: string
    now: Date
    nextAttemptAt: Date
    error: string
    payload: FiscalQueuePayload
  }) => Promise<boolean>
  fail: (input: {
    job: FiscalQueueJob
    workerId: string
    now: Date
    error: string
    payload: FiscalQueuePayload
  }) => Promise<boolean>
  /**
   * Estaciona uma transmissão ambígua sem agendar retry. A consulta deduplicada
   * já deve ter sido persistida atomicamente pelo executor antes deste retorno.
   */
  waitForConsultation?: (input: {
    job: FiscalQueueJob
    workerId: string
    now: Date
    error: string
    payload: FiscalQueuePayload
  }) => Promise<boolean>
  execute: (job: FiscalQueueJob) => Promise<FiscalQueueExecutionResult>
  audit: (event: FiscalQueueAuditEvent) => Promise<void>
}

export type DrainFiscalQueueInput = {
  workerId: string
  batchSize?: number
  leaseMs?: number
  heartbeatMs?: number
  baseBackoffMs?: number
  maxBackoffMs?: number
  now?: () => Date
}

export type DrainFiscalQueueItemResult = {
  jobId: string
  storeId: string
  status: "concluido" | "retry" | "consulta" | "falha" | "lock_perdido"
  takeover: boolean
  tentativas: number
  mensagem: string
}

export type DrainFiscalQueueReport = {
  workerId: string
  paused: boolean
  pauseSource: FiscalQueuePauseSnapshot["globalSource"]
  acquired: number
  completed: number
  retried: number
  awaitingConsultation: number
  failed: number
  lockLost: number
  items: DrainFiscalQueueItemResult[]
}
