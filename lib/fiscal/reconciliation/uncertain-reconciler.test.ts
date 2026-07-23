import { describe, expect, it, vi } from "vitest"
import { collectUncertainStateMetrics } from "./uncertain-metrics"
import {
  MIN_UNCERTAIN_AGE_MS,
  reconcileAgedTransmittingNotes,
} from "./uncertain-reconciler"

const NOW = new Date("2026-07-23T12:00:00.000Z")

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: "nota-1",
    storeId: "store-matriz",
    vendaId: "venda-1",
    modelo: "NFCE",
    ambiente: "HOMOLOGACAO",
    serie: 1,
    numero: 42,
    chaveAcesso: "35260712345678000199650010000000421123456789",
    xmlAssinado: "<NFe>bytes-exatos</NFe>",
    updatedAt: new Date(NOW.getTime() - MIN_UNCERTAIN_AGE_MS - 1),
    ...overrides,
  }
}

describe("reconciliador de TRANSMITINDO envelhecida", () => {
  it("cria uma única CONSULTA por nota mesmo sob duas varreduras concorrentes", async () => {
    const jobs = new Map<string, Record<string, unknown>>()
    let sequence = 0
    const client = {
      notaFiscal: { findMany: vi.fn(async () => [note()]) },
      fiscalEmissaoJob: {
        findFirst: vi.fn(async (args: unknown) => {
          const where = (args as { where: Record<string, unknown> }).where
          if (where.tipo === "EMISSAO") return null
          return jobs.get(String(where.dedupeKey)) ?? null
        }),
        upsert: vi.fn(async (args: unknown) => {
          const input = args as {
            where: { storeId_dedupeKey: { dedupeKey: string } }
            create: Record<string, unknown>
          }
          const key = input.where.storeId_dedupeKey.dedupeKey
          const existing = jobs.get(key)
          if (existing) return existing
          await Promise.resolve()
          const afterYield = jobs.get(key)
          if (afterYield) return afterYield
          const created = { ...input.create, id: `consulta-${++sequence}` }
          jobs.set(key, created)
          return created
        }),
      },
      fiscalLog: { create: vi.fn(async () => ({})) },
    }

    await Promise.all([
      reconcileAgedTransmittingNotes(
        {
          now: NOW,
          uncertainAgeMs: MIN_UNCERTAIN_AGE_MS,
          pauseSnapshot: {
            globalPaused: false,
            globalSource: "none",
            pausedStoreIds: [],
          },
        },
        client,
      ),
      reconcileAgedTransmittingNotes(
        {
          now: NOW,
          uncertainAgeMs: MIN_UNCERTAIN_AGE_MS,
          pauseSnapshot: {
            globalPaused: false,
            globalSource: "none",
            pausedStoreIds: [],
          },
        },
        client,
      ),
    ])

    expect(jobs.size).toBe(1)
    expect([...jobs.values()][0]).toMatchObject({
      tipo: "CONSULTA",
      storeId: "store-matriz",
      notaFiscalId: "nota-1",
    })
  })

  it("respeita pausa por loja e lease de emissão ainda válido", async () => {
    const client = {
      notaFiscal: {
        findMany: vi.fn(async () => [
          note(),
          note({ id: "nota-2", vendaId: "venda-2", storeId: "store-pausada" }),
        ]),
      },
      fiscalEmissaoJob: {
        findFirst: vi.fn(async (args: unknown) => {
          const where = (args as { where: Record<string, unknown> }).where
          return where.tipo === "EMISSAO" && where.notaFiscalId === "nota-1"
            ? { id: "emissao-lock-valido" }
            : null
        }),
        upsert: vi.fn(),
      },
      fiscalLog: { create: vi.fn(async () => ({})) },
    }
    const report = await reconcileAgedTransmittingNotes(
      {
        now: NOW,
        uncertainAgeMs: MIN_UNCERTAIN_AGE_MS,
        pauseSnapshot: {
          globalPaused: false,
          globalSource: "none",
          pausedStoreIds: ["store-pausada"],
        },
      },
      client as never,
    )

    expect(report).toMatchObject({
      candidates: 2,
      skippedPaused: 1,
      skippedActiveLease: 1,
      created: 0,
    })
    expect(client.fiscalEmissaoJob.upsert).not.toHaveBeenCalled()
  })

  it("rejeita threshold curto e mantém fail-closed", async () => {
    await expect(
      reconcileAgedTransmittingNotes(
        {
          now: NOW,
          uncertainAgeMs: 1,
          pauseSnapshot: {
            globalPaused: false,
            globalSource: "none",
            pausedStoreIds: [],
          },
        },
        {
          notaFiscal: { findMany: vi.fn() },
          fiscalEmissaoJob: { findFirst: vi.fn(), upsert: vi.fn() },
          fiscalLog: { create: vi.fn() },
        } as never,
      ),
    ).rejects.toThrow("uncertainAgeMs")
  })
})

describe("métricas do estado incerto", () => {
  it("expõe backlog, idade e resultados de consulta sem dados sensíveis", async () => {
    const client = {
      notaFiscal: {
        count: vi.fn(async () => 3),
        findFirst: vi.fn(async () => ({
          updatedAt: new Date(NOW.getTime() - 90_000),
        })),
      },
      fiscalEmissaoJob: { count: vi.fn(async () => 2) },
      fiscalLog: {
        count: vi
          .fn()
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(1),
      },
    }
    const metrics = await collectUncertainStateMetrics(
      { now: NOW, storeId: "store-matriz" },
      client,
    )
    expect(metrics).toEqual({
      transmittingUncertain: 3,
      oldestUncertainAgeMs: 90_000,
      pendingConsultations: 2,
      authorizedByConsultation: 5,
      notFoundRetryAuthorized: 4,
      rejectedAwaitingInutilizacao: 1,
    })
  })
})
