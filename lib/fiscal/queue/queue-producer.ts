/**
 * Produtor transacional da outbox fiscal.
 *
 * O snapshot é congelado antes; a única transação de negócio grava, atomicamente,
 * `Venda.fiscalStatus=PENDENTE` e o `FiscalEmissaoJob` deduplicado. Falha do job faz rollback
 * do status. A rota nunca chama emissão.
 */
import { FiscalStatusVenda } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { createVendaFiscalSnapshot } from "../venda-fiscal-snapshot-service"
import { VENDA_FISCAL_SNAPSHOT_VERSAO } from "../venda-fiscal-snapshot"
import { normalizeFiscalStatus } from "../venda-fiscal-state-machine"
import { sanitizeFiscalQueueError } from "./queue-policy"

/** Mantido em v1 para não criar um segundo job para vendas já deduplicadas no GOAL-011. */
export const FISCAL_EMISSION_DEDUPE_VERSION = 1

export function buildFiscalEmissionDedupeKey(vendaId: string): string {
  return `fiscal:emissao:v${FISCAL_EMISSION_DEDUPE_VERSION}:venda:${vendaId}`
}

type SnapshotSuccess = {
  ok: true
  notaFiscalId: string
  localKey: string
  snapshotHash?: string | null
  hashContratoVersao?: number | null
  created: boolean
  diagnostico: unknown
}

type SnapshotFailure = {
  ok: false
  code: string
  error: string
  pendencias?: string[]
}

type QueueProducerClient = {
  venda: {
    findFirst: (args: unknown) => Promise<{
      id: string
      pedidoId: string
      fiscalStatus: string | null
      status: string
    } | null>
  }
  configuracaoFiscalLoja: {
    findUnique: (args: unknown) => Promise<{ fiscalEnabled: boolean } | null>
  }
  $transaction: <T>(fn: (tx: QueueProducerTransaction) => Promise<T>) => Promise<T>
}

type QueueProducerTransaction = {
  venda: {
    findFirst: (args: unknown) => Promise<{
      id: string
      fiscalStatus: string | null
      status: string
    } | null>
    updateMany: (args: unknown) => Promise<{ count: number }>
  }
  fiscalEmissaoJob: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>
    upsert: (args: unknown) => Promise<{
      id: string
      status: unknown
      tentativas: number
      maxTentativas: number
    }>
  }
}

export type RequestFiscalEmissionResult =
  | {
      ok: true
      vendaId: string
      pedidoId: string
      notaFiscalId: string
      localKey: string
      snapshotHash: string
      hashContratoVersao: number
      contratoVersao: number
      snapshotCreated: boolean
      transitioned: boolean
      diagnostico: unknown
      jobId: string
      jobStatus: string
      jobCreated: boolean
      dedupeKey: string
    }
  | {
      ok: false
      status: number
      code: string
      error: string
      pendencias?: string[]
    }

class ProducerConflict extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function requestFiscalEmissionWithJob(
  params: {
    storeId: string
    pedidoId: string
    operador: string
    now?: Date
  },
  dependencies: {
    client?: QueueProducerClient
    createSnapshot?: (input: {
      storeId: string
      vendaId: string
    }) => Promise<SnapshotSuccess | SnapshotFailure>
  } = {},
): Promise<RequestFiscalEmissionResult> {
  const storeId = String(params.storeId ?? "").trim()
  const pedidoId = String(params.pedidoId ?? "").trim()
  const operador = String(params.operador ?? "").trim()
  if (!storeId || !pedidoId || !operador) {
    return {
      ok: false,
      status: 400,
      code: "parametros_invalidos",
      error: "storeId, pedidoId e operador são obrigatórios.",
    }
  }
  const client = dependencies.client ?? (prisma as unknown as QueueProducerClient)
  const createSnapshot =
    dependencies.createSnapshot ??
    (createVendaFiscalSnapshot as unknown as (input: {
      storeId: string
      vendaId: string
    }) => Promise<SnapshotSuccess | SnapshotFailure>)
  const requestedAt = params.now ?? new Date()

  const venda = await client.venda.findFirst({
    where: { pedidoId, storeId },
    select: { id: true, pedidoId: true, fiscalStatus: true, status: true },
  })
  if (!venda) {
    return {
      ok: false,
      status: 404,
      code: "venda_nao_encontrada",
      error: "Venda não encontrada nesta loja.",
    }
  }
  if (venda.status === "cancelada") {
    return {
      ok: false,
      status: 409,
      code: "venda_cancelada",
      error: "Não é possível solicitar emissão de uma venda cancelada.",
    }
  }
  const initialStatus = normalizeFiscalStatus(venda.fiscalStatus)
  if (
    initialStatus !== FiscalStatusVenda.NAO_FISCAL &&
    initialStatus !== FiscalStatusVenda.PENDENTE
  ) {
    return {
      ok: false,
      status: 409,
      code: "fiscal_status_invalido",
      error: `Venda em estado fiscal ${initialStatus}; solicitação disponível apenas para NAO_FISCAL ou PENDENTE.`,
    }
  }

  const config = await client.configuracaoFiscalLoja.findUnique({
    where: { storeId },
    select: { fiscalEnabled: true },
  })
  if (!config?.fiscalEnabled) {
    return {
      ok: false,
      status: 423,
      code: "loja_fiscal_desabilitada",
      error: "Loja não habilitada fiscalmente.",
    }
  }

  const snapshot = await createSnapshot({ storeId, vendaId: venda.id })
  if (!snapshot.ok) {
    return {
      ok: false,
      status: 422,
      code: snapshot.code,
      error: snapshot.error,
      pendencias: snapshot.pendencias,
    }
  }

  const dedupeKey = buildFiscalEmissionDedupeKey(venda.id)
  try {
    const committed = await client.$transaction(async (tx) => {
      const current = await tx.venda.findFirst({
        where: { id: venda.id, storeId },
        select: { id: true, fiscalStatus: true, status: true },
      })
      if (!current) {
        throw new ProducerConflict(404, "venda_nao_encontrada", "Venda não encontrada nesta loja.")
      }
      if (current.status === "cancelada") {
        throw new ProducerConflict(409, "venda_cancelada", "Venda cancelada durante a solicitação.")
      }
      const currentStatus = normalizeFiscalStatus(current.fiscalStatus)
      if (
        currentStatus !== FiscalStatusVenda.NAO_FISCAL &&
        currentStatus !== FiscalStatusVenda.PENDENTE
      ) {
        throw new ProducerConflict(
          409,
          "fiscal_status_invalido",
          `Venda avançou para ${currentStatus} durante a solicitação.`,
        )
      }

      const existing = await tx.fiscalEmissaoJob.findUnique({
        where: { storeId_dedupeKey: { storeId, dedupeKey } },
        select: { id: true },
      })
      const job = await tx.fiscalEmissaoJob.upsert({
        where: { storeId_dedupeKey: { storeId, dedupeKey } },
        create: {
          storeId,
          vendaId: venda.id,
          notaFiscalId: snapshot.notaFiscalId,
          tipo: "EMISSAO",
          status: "PENDENTE",
          tentativas: 0,
          maxTentativas: 5,
          prioridade: 0,
          proximaTentativaEm: requestedAt,
          dedupeKey,
          payload: {
            version: 2,
            operation: "EMISSAO",
            requestedAt: requestedAt.toISOString(),
            requestedBy: operador,
            snapshotLocalKey: snapshot.localKey,
            transmission: { external: false },
          },
        },
        update: {
          notaFiscalId: snapshot.notaFiscalId,
        },
        select: {
          id: true,
          status: true,
          tentativas: true,
          maxTentativas: true,
        },
      })

      const transitioned = currentStatus === FiscalStatusVenda.NAO_FISCAL
      if (transitioned) {
        const updated = await tx.venda.updateMany({
          where: {
            id: venda.id,
            storeId,
            fiscalStatus: FiscalStatusVenda.NAO_FISCAL,
          },
          data: { fiscalStatus: FiscalStatusVenda.PENDENTE },
        })
        if (updated.count !== 1) {
          throw new ProducerConflict(
            409,
            "fiscal_status_concorrente",
            "Estado fiscal mudou durante a transação da outbox.",
          )
        }
      }
      return { job, jobCreated: !existing, transitioned }
    })

    return {
      ok: true,
      vendaId: venda.id,
      pedidoId,
      notaFiscalId: snapshot.notaFiscalId,
      localKey: snapshot.localKey,
      snapshotHash: snapshot.snapshotHash ?? "",
      hashContratoVersao: snapshot.hashContratoVersao ?? 1,
      contratoVersao: VENDA_FISCAL_SNAPSHOT_VERSAO,
      snapshotCreated: snapshot.created,
      transitioned: committed.transitioned,
      diagnostico: snapshot.diagnostico,
      jobId: committed.job.id,
      jobStatus: String(committed.job.status),
      jobCreated: committed.jobCreated,
      dedupeKey,
    }
  } catch (error) {
    if (error instanceof ProducerConflict) {
      return {
        ok: false,
        status: error.status,
        code: error.code,
        error: error.message,
      }
    }
    throw new Error(`Falha na transação da outbox fiscal: ${sanitizeFiscalQueueError(error)}`)
  }
}
