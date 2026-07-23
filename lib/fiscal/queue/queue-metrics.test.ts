import { describe, expect, it, vi } from "vitest"
import { readFiscalQueueMetrics } from "./queue-metrics"

describe("métricas administrativas da fila fiscal", () => {
  it("expõe profundidade, idade, estados, falhas, locks vencidos e pausa", async () => {
    const now = new Date("2026-07-23T00:10:00.000Z")
    const count = vi
      .fn()
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
    const client = {
      fiscalEmissaoJob: {
        groupBy: vi.fn(async () => [
          { status: "PENDENTE", _count: { _all: 5 } },
          { status: "FALHA", _count: { _all: 2 } },
        ]),
        count,
        findFirst: vi.fn(async () => ({
          createdAt: new Date("2026-07-23T00:00:00.000Z"),
        })),
      },
      fiscalLog: {
        findFirst: vi.fn(async () => ({ detalhe: { paused: false } })),
        findMany: vi.fn(async () => [
          { storeId: "store-matriz-fixture", detalhe: { paused: true } },
        ]),
      },
    }

    const metrics = await readFiscalQueueMetrics(
      { storeId: "store-matriz-fixture", now },
      client as never,
    )

    expect(metrics).toEqual({
      observedAt: now.toISOString(),
      depth: 7,
      oldestPendingAgeMs: 600_000,
      byStatus: { PENDENTE: 5, FALHA: 2 },
      failures: 2,
      expiredLocks: 1,
      pause: {
        globalPaused: false,
        globalSource: "none",
        pausedStoreIds: ["store-matriz-fixture"],
      },
    })
  })
})
