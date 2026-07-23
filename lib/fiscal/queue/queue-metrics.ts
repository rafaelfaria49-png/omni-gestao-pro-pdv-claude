import { prisma } from "@/lib/prisma"
import { readFiscalQueuePauseSnapshot } from "./prisma-queue-worker"

type QueueMetricsClient = {
  fiscalEmissaoJob: {
    groupBy: (args: unknown) => Promise<Array<{ status: unknown; _count: { _all: number } }>>
    count: (args: unknown) => Promise<number>
    findFirst: (args: unknown) => Promise<{ createdAt: Date } | null>
  }
  fiscalLog: {
    findFirst: (args: unknown) => Promise<unknown | null>
    findMany: (args: unknown) => Promise<unknown[]>
  }
}

export type FiscalQueueMetrics = {
  observedAt: string
  depth: number
  oldestPendingAgeMs: number | null
  byStatus: Record<string, number>
  failures: number
  expiredLocks: number
  pause: {
    globalPaused: boolean
    globalSource: string
    pausedStoreIds: string[]
  }
}

export async function readFiscalQueueMetrics(
  input: { storeId?: string | null; now?: Date } = {},
  client: QueueMetricsClient = prisma as unknown as QueueMetricsClient,
): Promise<FiscalQueueMetrics> {
  const now = input.now ?? new Date()
  const storeId = String(input.storeId ?? "").trim()
  const scope = storeId ? { storeId } : {}
  const queuedStatuses = ["PENDENTE", "AGUARDANDO_RETRY"]
  const [groups, depth, oldest, failures, expiredLocks, pause] = await Promise.all([
    client.fiscalEmissaoJob.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
    client.fiscalEmissaoJob.count({
      where: { ...scope, status: { in: queuedStatuses } },
    }),
    client.fiscalEmissaoJob.findFirst({
      where: { ...scope, status: { in: queuedStatuses } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { createdAt: true },
    }),
    client.fiscalEmissaoJob.count({
      where: { ...scope, status: "FALHA" },
    }),
    client.fiscalEmissaoJob.count({
      where: {
        ...scope,
        status: "PROCESSANDO",
        lockExpiresAt: { lte: now },
      },
    }),
    readFiscalQueuePauseSnapshot(client as never),
  ])
  const byStatus: Record<string, number> = {}
  for (const group of groups) byStatus[String(group.status)] = group._count._all
  return {
    observedAt: now.toISOString(),
    depth,
    oldestPendingAgeMs: oldest
      ? Math.max(0, now.getTime() - oldest.createdAt.getTime())
      : null,
    byStatus,
    failures,
    expiredLocks,
    pause: {
      globalPaused: pause.globalPaused,
      globalSource: pause.globalSource,
      pausedStoreIds: storeId
        ? pause.pausedStoreIds.filter((id) => id === storeId)
        : pause.pausedStoreIds,
    },
  }
}
