import { prisma } from "@/lib/prisma"

type MetricsClient = {
  notaFiscal: {
    count: (args: unknown) => Promise<number>
    findFirst: (args: unknown) => Promise<unknown | null>
  }
  fiscalEmissaoJob: {
    count: (args: unknown) => Promise<number>
  }
  fiscalLog: {
    count: (args: unknown) => Promise<number>
  }
}
function dateFrom(value: unknown): Date | null {
  if (!value || typeof value !== "object") return null
  const raw = (value as Record<string, unknown>).updatedAt
  if (raw instanceof Date) return raw
  const parsed = new Date(String(raw ?? ""))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export type UncertainStateMetrics = {
  transmittingUncertain: number
  oldestUncertainAgeMs: number
  pendingConsultations: number
  authorizedByConsultation: number
  notFoundRetryAuthorized: number
  rejectedAwaitingInutilizacao: number
}

export async function collectUncertainStateMetrics(
  input: { now?: Date; storeId?: string } = {},
  client: MetricsClient = prisma as unknown as MetricsClient,
): Promise<UncertainStateMetrics> {
  const now = input.now ?? new Date()
  const noteWhere = {
    status: "TRANSMITINDO",
    ...(input.storeId ? { storeId: input.storeId } : {}),
  }
  const jobWhere = {
    tipo: "CONSULTA",
    status: { in: ["PENDENTE", "PROCESSANDO", "AGUARDANDO_RETRY"] },
    ...(input.storeId ? { storeId: input.storeId } : {}),
  }
  const logScope = input.storeId ? { storeId: input.storeId } : {}
  const [
    transmittingUncertain,
    oldest,
    pendingConsultations,
    authorizedByConsultation,
    notFoundRetryAuthorized,
    rejectedAwaitingInutilizacao,
  ] = await Promise.all([
    client.notaFiscal.count({ where: noteWhere }),
    client.notaFiscal.findFirst({
      where: noteWhere,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { updatedAt: true },
    }),
    client.fiscalEmissaoJob.count({ where: jobWhere }),
    client.fiscalLog.count({
      where: { ...logScope, acao: "fiscal.reconciliation.authorized" },
    }),
    client.fiscalLog.count({
      where: {
        ...logScope,
        acao: "fiscal.reconciliation.not_found_retry_authorized",
      },
    }),
    client.fiscalLog.count({
      where: {
        ...logScope,
        acao: "fiscal.reconciliation.rejected_requires_inutilizacao",
      },
    }),
  ])
  const oldestAt = dateFrom(oldest)
  return {
    transmittingUncertain,
    oldestUncertainAgeMs: oldestAt
      ? Math.max(0, now.getTime() - oldestAt.getTime())
      : 0,
    pendingConsultations,
    authorizedByConsultation,
    notFoundRetryAuthorized,
    rejectedAwaitingInutilizacao,
  }
}
