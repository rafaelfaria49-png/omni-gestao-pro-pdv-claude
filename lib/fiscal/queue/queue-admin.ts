import { prisma } from "@/lib/prisma"
import { readFiscalQueuePauseSnapshot, GLOBAL_PAUSE_ACTION, STORE_PAUSE_ACTION } from "./prisma-queue-worker"
import { sanitizeFiscalQueueError } from "./queue-policy"

type AdminJob = {
  id: string
  storeId: string
  vendaId: string
  notaFiscalId: string | null
  status: string
  tentativas: number
  maxTentativas: number
  payload: unknown
}

type QueueAdminTransaction = {
  fiscalEmissaoJob: {
    findFirst: (args: unknown) => Promise<AdminJob | null>
    updateMany: (args: unknown) => Promise<{ count: number }>
  }
  fiscalLog: {
    create: (args: unknown) => Promise<unknown>
  }
}

type QueueAdminClient = {
  fiscalLog: {
    create: (args: unknown) => Promise<unknown>
    findFirst: (args: unknown) => Promise<unknown | null>
    findMany: (args: unknown) => Promise<unknown[]>
  }
  $transaction: <T>(fn: (tx: QueueAdminTransaction) => Promise<T>) => Promise<T>
}

export class FiscalQueueAdminError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "FiscalQueueAdminError"
  }
}

function required(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim()
  if (!normalized) throw new FiscalQueueAdminError("parametros_invalidos", `${label} obrigatório.`)
  return normalized
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

export async function setFiscalQueuePause(
  input: {
    scope: "global" | "store"
    storeId: string
    paused: boolean
    actor: string
    reason: string
    now?: Date
  },
  client: QueueAdminClient = prisma as unknown as QueueAdminClient,
) {
  const storeId = required(input.storeId, "storeId de auditoria")
  const actor = required(input.actor, "ator")
  const reason = required(input.reason, "motivo")
  const now = input.now ?? new Date()
  const action = input.scope === "global" ? GLOBAL_PAUSE_ACTION : STORE_PAUSE_ACTION
  await client.fiscalLog.create({
    data: {
      storeId,
      nivel: "WARN",
      acao: action,
      mensagem: input.paused
        ? `Fila fiscal pausada (${input.scope}).`
        : `Fila fiscal retomada (${input.scope}).`,
      operador: actor,
      detalhe: {
        paused: input.paused,
        scope: input.scope,
        reason: sanitizeFiscalQueueError(reason, 300),
        changedAt: now.toISOString(),
      },
    },
  })
  return readFiscalQueuePauseSnapshot(client as never)
}

export async function reprocessFailedFiscalJob(
  input: {
    jobId: string
    storeId: string
    actor: string
    reason: string
    consultationAuthorizedRetry?: boolean
    now?: Date
  },
  client: QueueAdminClient = prisma as unknown as QueueAdminClient,
) {
  const jobId = required(input.jobId, "jobId")
  const storeId = required(input.storeId, "storeId")
  const actor = required(input.actor, "ator")
  const reason = required(input.reason, "motivo")
  const now = input.now ?? new Date()

  return client.$transaction(async (tx) => {
    const job = await tx.fiscalEmissaoJob.findFirst({
      where: { id: jobId, storeId },
      select: {
        id: true,
        storeId: true,
        vendaId: true,
        notaFiscalId: true,
        status: true,
        tentativas: true,
        maxTentativas: true,
        payload: true,
      },
    })
    if (!job) throw new FiscalQueueAdminError("job_nao_encontrado", "Job fiscal não encontrado nesta loja.")
    if (job.status !== "FALHA") {
      throw new FiscalQueueAdminError(
        "status_incompativel",
        "Reprocessamento manual permitido somente para job em FALHA.",
      )
    }
    const payload = payloadRecord(job.payload)
    const transmission = payloadRecord(payload.transmission)
    const updatedPayload = {
      ...payload,
      transmission: {
        ...transmission,
        ...(input.consultationAuthorizedRetry
          ? { retryAuthorizedAt: now.toISOString(), retryAuthorizationConsumedAt: null }
          : {}),
      },
      manualReprocess: {
        requestedAt: now.toISOString(),
        requestedBy: actor,
        reason: sanitizeFiscalQueueError(reason, 300),
      },
    }
    const nextMaxAttempts = Math.max(job.maxTentativas, job.tentativas + 1)
    const updated = await tx.fiscalEmissaoJob.updateMany({
      where: { id: jobId, storeId, status: "FALHA" },
      data: {
        status: "PENDENTE",
        payload: updatedPayload,
        maxTentativas: nextMaxAttempts,
        proximaTentativaEm: now,
        ultimoErro: null,
        concluidoEm: null,
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
      },
    })
    if (updated.count !== 1) {
      throw new FiscalQueueAdminError("conflito_concorrente", "Job mudou durante o reprocessamento.")
    }
    await tx.fiscalLog.create({
      data: {
        storeId,
        vendaId: job.vendaId,
        notaFiscalId: job.notaFiscalId,
        jobId,
        nivel: "WARN",
        acao: "fiscal.queue.reprocess.manual",
        mensagem: "Reprocessamento manual auditado solicitado.",
        operador: actor,
        detalhe: {
          reason: sanitizeFiscalQueueError(reason, 300),
          requestedAt: now.toISOString(),
          attemptsPreserved: job.tentativas,
          maxTentativas: nextMaxAttempts,
          consultationAuthorizedRetry: input.consultationAuthorizedRetry === true,
        },
      },
    })
    return {
      jobId,
      status: "PENDENTE" as const,
      tentativas: job.tentativas,
      maxTentativas: nextMaxAttempts,
    }
  })
}

export async function cancelFiscalQueueJob(
  input: {
    jobId: string
    storeId: string
    actor: string
    reason: string
    now?: Date
  },
  client: QueueAdminClient = prisma as unknown as QueueAdminClient,
) {
  const jobId = required(input.jobId, "jobId")
  const storeId = required(input.storeId, "storeId")
  const actor = required(input.actor, "ator")
  const reason = required(input.reason, "motivo")
  const now = input.now ?? new Date()

  return client.$transaction(async (tx) => {
    const job = await tx.fiscalEmissaoJob.findFirst({
      where: { id: jobId, storeId },
      select: {
        id: true,
        storeId: true,
        vendaId: true,
        notaFiscalId: true,
        status: true,
        tentativas: true,
        maxTentativas: true,
        payload: true,
      },
    })
    if (!job) throw new FiscalQueueAdminError("job_nao_encontrado", "Job fiscal não encontrado nesta loja.")
    if (!["PENDENTE", "AGUARDANDO_RETRY", "FALHA"].includes(job.status)) {
      throw new FiscalQueueAdminError(
        "status_incompativel",
        job.status === "PROCESSANDO"
          ? "Job em execução não pode ser cancelado; aguarde conclusão ou expiração do lock."
          : `Job em ${job.status} não pode ser cancelado.`,
      )
    }
    const updated = await tx.fiscalEmissaoJob.updateMany({
      where: {
        id: jobId,
        storeId,
        status: { in: ["PENDENTE", "AGUARDANDO_RETRY", "FALHA"] },
        lockOwner: null,
      },
      data: {
        status: "CANCELADO",
        proximaTentativaEm: null,
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
      },
    })
    if (updated.count !== 1) {
      throw new FiscalQueueAdminError("conflito_concorrente", "Job foi adquirido antes do cancelamento.")
    }
    await tx.fiscalLog.create({
      data: {
        storeId,
        vendaId: job.vendaId,
        notaFiscalId: job.notaFiscalId,
        jobId,
        nivel: "WARN",
        acao: "fiscal.queue.cancel.manual",
        mensagem: "Job fiscal cancelado sem apagar histórico.",
        operador: actor,
        detalhe: {
          reason: sanitizeFiscalQueueError(reason, 300),
          cancelledAt: now.toISOString(),
          attemptsPreserved: job.tentativas,
        },
      },
    })
    return { jobId, status: "CANCELADO" as const, tentativas: job.tentativas }
  })
}
