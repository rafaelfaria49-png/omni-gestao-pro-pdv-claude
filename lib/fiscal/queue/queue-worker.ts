import {
  calculateFiscalQueueBackoffMs,
  canStartFiscalTransmission,
  sanitizeFiscalQueueError,
  withExecutionResult,
  withTransmissionStarted,
} from "./queue-policy"
import type {
  DrainFiscalQueueInput,
  DrainFiscalQueueItemResult,
  DrainFiscalQueueReport,
  FiscalQueueJob,
  FiscalQueueLease,
  FiscalQueueWorkerPorts,
} from "./queue.types"

const DEFAULT_BATCH_SIZE = 10
const MAX_BATCH_SIZE = 50
const DEFAULT_LEASE_MS = 60_000

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return fallback
  return Math.min(max, Math.max(min, value as number))
}

function safeAudit(
  ports: FiscalQueueWorkerPorts,
  event: Parameters<FiscalQueueWorkerPorts["audit"]>[0],
): Promise<void> {
  return ports.audit(event).catch(() => undefined)
}

function startHeartbeat(input: {
  ports: FiscalQueueWorkerPorts
  job: FiscalQueueJob
  workerId: string
  leaseMs: number
  heartbeatMs: number
  now: () => Date
}): {
  lost: () => boolean
  stop: () => Promise<boolean>
} {
  let lockLost = false
  let pending = Promise.resolve()
  const beat = () => {
    pending = pending
      .then(async () => {
        const ok = await input.ports.heartbeat({
          jobId: input.job.id,
          workerId: input.workerId,
          now: input.now(),
          leaseMs: input.leaseMs,
        })
        if (!ok) lockLost = true
      })
      .catch(() => {
        lockLost = true
      })
  }
  const timer = setInterval(beat, input.heartbeatMs)
  timer.unref?.()
  return {
    lost: () => lockLost,
    stop: async () => {
      clearInterval(timer)
      await pending
      return !lockLost
    },
  }
}

async function processLease(input: {
  lease: FiscalQueueLease
  ports: FiscalQueueWorkerPorts
  workerId: string
  leaseMs: number
  heartbeatMs: number
  baseBackoffMs: number
  maxBackoffMs: number
  now: () => Date
}): Promise<DrainFiscalQueueItemResult> {
  const { job, takeover } = input.lease
  await safeAudit(input.ports, {
    job,
    acao: takeover ? "fiscal.queue.lock.takeover" : "fiscal.queue.lock.acquired",
    nivel: takeover ? "WARN" : "INFO",
    mensagem: takeover
      ? "Lock fiscal vencido assumido por outro worker."
      : "Job fiscal adquirido pelo worker.",
    detalhe: { workerId: input.workerId, tentativas: job.tentativas },
  })

  if (job.tentativas > job.maxTentativas) {
    const error = sanitizeFiscalQueueError(
      `Máximo de ${job.maxTentativas} tentativa(s) excedido.`,
    )
    await input.ports.fail({
      job,
      workerId: input.workerId,
      now: input.now(),
      error,
      payload: job.payload ?? {},
    })
    return {
      jobId: job.id,
      storeId: job.storeId,
      status: "falha",
      takeover,
      tentativas: job.tentativas,
      mensagem: error,
    }
  }

  const guard = canStartFiscalTransmission(job)
  if (!guard.allowed) {
    const error = sanitizeFiscalQueueError(
      "Nova transmissão bloqueada: consulta autorizadora obrigatória.",
    )
    await input.ports.fail({
      job,
      workerId: input.workerId,
      now: input.now(),
      error,
      payload: job.payload ?? {},
    })
    await safeAudit(input.ports, {
      job,
      acao: "fiscal.queue.transmission.blocked",
      nivel: "ERROR",
      mensagem: error,
      detalhe: { reasonCode: guard.reason },
    })
    return {
      jobId: job.id,
      storeId: job.storeId,
      status: "falha",
      takeover,
      tentativas: job.tentativas,
      mensagem: error,
    }
  }

  const startedAt = input.now()
  const startedPayload = withTransmissionStarted(job, startedAt)
  const marked = await input.ports.markTransmissionStarted({
    job,
    workerId: input.workerId,
    now: startedAt,
    payload: startedPayload,
  })
  if (!marked) {
    return {
      jobId: job.id,
      storeId: job.storeId,
      status: "lock_perdido",
      takeover,
      tentativas: job.tentativas,
      mensagem: "Lock perdido antes da execução.",
    }
  }

  const heartbeat = startHeartbeat({
    ports: input.ports,
    job,
    workerId: input.workerId,
    leaseMs: input.leaseMs,
    heartbeatMs: input.heartbeatMs,
    now: input.now,
  })

  let execution
  try {
    execution = await input.ports.execute({ ...job, payload: startedPayload })
  } catch (error) {
    execution = {
      kind: "transient" as const,
      code: "executor_exception",
      mensagem: sanitizeFiscalQueueError(error),
      simulado: true,
      externalTransmissionAttempted: false,
    }
  }
  const heartbeatOk = await heartbeat.stop()
  if (!heartbeatOk || heartbeat.lost()) {
    await safeAudit(input.ports, {
      job,
      acao: "fiscal.queue.lock.lost",
      nivel: "WARN",
      mensagem: "Worker perdeu o lock; resultado não foi persistido pelo proprietário antigo.",
      detalhe: { workerId: input.workerId },
    })
    return {
      jobId: job.id,
      storeId: job.storeId,
      status: "lock_perdido",
      takeover,
      tentativas: job.tentativas,
      mensagem: "Lock perdido durante a execução.",
    }
  }

  if (!execution.simulado) {
    execution = {
      kind: "terminal" as const,
      code: "provider_real_bloqueado",
      mensagem: "GOAL-011 bloqueia provider ou transmissão real.",
      simulado: true,
      externalTransmissionAttempted: true,
    }
  }

  const now = input.now()
  const error = sanitizeFiscalQueueError(execution.mensagem)
  const payload = withExecutionResult(startedPayload, {
    now,
    code: execution.code,
    kind: execution.kind,
    externalTransmissionAttempted: execution.externalTransmissionAttempted,
  })

  if (execution.kind === "success") {
    const completed = await input.ports.complete({
      job,
      workerId: input.workerId,
      now,
      payload,
    })
    return {
      jobId: job.id,
      storeId: job.storeId,
      status: completed ? "concluido" : "lock_perdido",
      takeover,
      tentativas: job.tentativas,
      mensagem: completed ? execution.mensagem : "Lock perdido ao concluir.",
    }
  }

  const exhausted = job.tentativas >= job.maxTentativas
  if (execution.kind === "terminal" || exhausted) {
    const failed = await input.ports.fail({
      job,
      workerId: input.workerId,
      now,
      error,
      payload,
    })
    return {
      jobId: job.id,
      storeId: job.storeId,
      status: failed ? "falha" : "lock_perdido",
      takeover,
      tentativas: job.tentativas,
      mensagem: failed ? error : "Lock perdido ao registrar falha.",
    }
  }

  const delay = calculateFiscalQueueBackoffMs(
    job.tentativas,
    input.baseBackoffMs,
    input.maxBackoffMs,
  )
  const retried = await input.ports.retry({
    job,
    workerId: input.workerId,
    now,
    nextAttemptAt: new Date(now.getTime() + delay),
    error,
    payload,
  })
  return {
    jobId: job.id,
    storeId: job.storeId,
    status: retried ? "retry" : "lock_perdido",
    takeover,
    tentativas: job.tentativas,
    mensagem: retried ? error : "Lock perdido ao agendar retry.",
  }
}

/** Drena sequencialmente um lote; cada aquisição é CAS e cada resultado exige o mesmo lockOwner. */
export async function drainFiscalQueue(
  input: DrainFiscalQueueInput,
  ports: FiscalQueueWorkerPorts,
): Promise<DrainFiscalQueueReport> {
  const workerId = String(input.workerId ?? "").trim()
  if (!workerId) throw new Error("workerId obrigatório.")
  const now = input.now ?? (() => new Date())
  const batchSize = clampInt(input.batchSize, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE)
  const leaseMs = clampInt(input.leaseMs, DEFAULT_LEASE_MS, 5_000, 15 * 60_000)
  const heartbeatMs = clampInt(
    input.heartbeatMs,
    Math.max(1_000, Math.floor(leaseMs / 3)),
    250,
    Math.max(250, leaseMs - 100),
  )
  const baseBackoffMs = clampInt(input.baseBackoffMs, 30_000, 1_000, 60 * 60_000)
  const maxBackoffMs = clampInt(input.maxBackoffMs, 30 * 60_000, baseBackoffMs, 24 * 60 * 60_000)

  const report: DrainFiscalQueueReport = {
    workerId,
    paused: false,
    pauseSource: "none",
    acquired: 0,
    completed: 0,
    retried: 0,
    failed: 0,
    lockLost: 0,
    items: [],
  }

  for (let index = 0; index < batchSize; index++) {
    const pause = await ports.readPauseSnapshot()
    if (pause.globalPaused) {
      report.paused = true
      report.pauseSource = pause.globalSource
      break
    }
    const lease = await ports.acquireNextJob({
      workerId,
      now: now(),
      leaseMs,
      pausedStoreIds: pause.pausedStoreIds,
    })
    if (!lease) break
    report.acquired += 1
    const item = await processLease({
      lease,
      ports,
      workerId,
      leaseMs,
      heartbeatMs,
      baseBackoffMs,
      maxBackoffMs,
      now,
    })
    report.items.push(item)
    if (item.status === "concluido") report.completed += 1
    else if (item.status === "retry") report.retried += 1
    else if (item.status === "falha") report.failed += 1
    else report.lockLost += 1
  }

  return report
}
