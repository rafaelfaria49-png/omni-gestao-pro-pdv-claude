import { prisma } from "@/lib/prisma"
import { fiscalBytesSha256, fiscalXmlBytes } from "../emission/uncertain-state-coordinator"
import type { FiscalQueuePauseSnapshot } from "../queue/queue.types"

export const DEFAULT_UNCERTAIN_AGE_MS = 2 * 60_000
export const MIN_UNCERTAIN_AGE_MS = 30_000

type ReconciliationClient = {
  notaFiscal: {
    findMany: (args: unknown) => Promise<unknown[]>
  }
  fiscalEmissaoJob: {
    findFirst: (args: unknown) => Promise<unknown | null>
    upsert: (args: unknown) => Promise<unknown>
  }
  fiscalLog: {
    create: (args: unknown) => Promise<unknown>
  }
}

type Row = Record<string, unknown>

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {}
}

function resolveThreshold(value: number | undefined): number {
  if (value === undefined) return DEFAULT_UNCERTAIN_AGE_MS
  if (!Number.isFinite(value) || value < MIN_UNCERTAIN_AGE_MS) {
    throw new Error(
      `uncertainAgeMs deve ser >= ${MIN_UNCERTAIN_AGE_MS}ms para evitar consultas prematuras.`,
    )
  }
  return Math.floor(value)
}

export type UncertainReconciliationScanReport = {
  cutoff: Date
  candidates: number
  created: number
  deduplicated: number
  skippedPaused: number
  skippedActiveLease: number
  consultationJobIds: string[]
}

/**
 * Recupera apenas notas TRANSMITINDO envelhecidas. Não retransmite: cria o job
 * CONSULTA idempotente que será resolvido pelo worker.
 */
export async function reconcileAgedTransmittingNotes(
  input: {
    now?: Date
    uncertainAgeMs?: number
    storeId?: string
    pauseSnapshot: FiscalQueuePauseSnapshot
  },
  client: ReconciliationClient = prisma as unknown as ReconciliationClient,
): Promise<UncertainReconciliationScanReport> {
  const now = input.now ?? new Date()
  const cutoff = new Date(now.getTime() - resolveThreshold(input.uncertainAgeMs))
  const report: UncertainReconciliationScanReport = {
    cutoff,
    candidates: 0,
    created: 0,
    deduplicated: 0,
    skippedPaused: 0,
    skippedActiveLease: 0,
    consultationJobIds: [],
  }
  if (input.pauseSnapshot.globalPaused) return report

  const rows = await client.notaFiscal.findMany({
    where: {
      status: "TRANSMITINDO",
      updatedAt: { lte: cutoff },
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      ...(input.storeId ? { storeId: input.storeId } : {}),
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: 1_000,
    select: {
      id: true,
      storeId: true,
      vendaId: true,
      modelo: true,
      ambiente: true,
      serie: true,
      numero: true,
      chaveAcesso: true,
      xmlAssinado: true,
      updatedAt: true,
    },
  })
  report.candidates = rows.length

  for (const raw of rows) {
    const note = record(raw)
    const storeId = String(note.storeId ?? "")
    if (!storeId || input.pauseSnapshot.pausedStoreIds.includes(storeId)) {
      report.skippedPaused += 1
      continue
    }
    const notaFiscalId = String(note.id ?? "")
    const vendaId = String(note.vendaId ?? "")
    const xmlAssinado = String(note.xmlAssinado ?? "")
    if (
      !notaFiscalId ||
      !vendaId ||
      !xmlAssinado ||
      !/^\d{44}$/.test(String(note.chaveAcesso ?? "")) ||
      !Number.isInteger(Number(note.serie)) ||
      !Number.isInteger(Number(note.numero))
    ) {
      await client.fiscalLog.create({
        data: {
          storeId,
          vendaId: vendaId || null,
          notaFiscalId: notaFiscalId || null,
          nivel: "ERROR",
          acao: "fiscal.reconciliation.invalid_persisted_document",
          mensagem: "Nota TRANSMITINDO incompleta; consulta e retransmissão bloqueadas.",
          operador: "fiscal-goal-012-reconciler",
        },
      })
      continue
    }

    const activeEmission = record(await client.fiscalEmissaoJob.findFirst({
      where: {
        storeId,
        vendaId,
        notaFiscalId,
        tipo: "EMISSAO",
        status: "PROCESSANDO",
        lockExpiresAt: { gt: now },
      },
      select: { id: true },
    }))
    if (activeEmission.id) {
      report.skippedActiveLease += 1
      continue
    }

    const dedupeKey = `fiscal:consulta:v1:nota:${notaFiscalId}`
    const existing = record(await client.fiscalEmissaoJob.findFirst({
      where: { storeId, dedupeKey },
      select: { id: true },
    }))
    const bytesSha256 = fiscalBytesSha256(fiscalXmlBytes(xmlAssinado))
    const query = record(await client.fiscalEmissaoJob.upsert({
      where: { storeId_dedupeKey: { storeId, dedupeKey } },
      create: {
        storeId,
        vendaId,
        notaFiscalId,
        tipo: "CONSULTA",
        status: "PENDENTE",
        tentativas: 0,
        maxTentativas: 10,
        prioridade: 100,
        proximaTentativaEm: now,
        dedupeKey,
        payload: {
          version: 2,
          operation: "CONSULTA",
          requestedAt: now.toISOString(),
          reason: "AGED_TRANSMITTING",
          document: {
            notaFiscalId,
            chaveAcesso: String(note.chaveAcesso),
            serie: Number(note.serie),
            numero: Number(note.numero),
            modelo: "NFCE",
            ambiente: "HOMOLOGACAO",
            bytesSha256,
          },
        },
      },
      update: { notaFiscalId },
      select: { id: true },
    }))
    report.consultationJobIds.push(String(query.id))
    if (existing.id) report.deduplicated += 1
    else report.created += 1
  }
  return report
}
