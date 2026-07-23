import { describe, expect, it, vi } from "vitest"
import {
  cancelFiscalQueueJob,
  FiscalQueueAdminError,
  reprocessFailedFiscalJob,
  setFiscalQueuePause,
} from "./queue-admin"

function adminFixture(status = "FALHA") {
  const state = {
    job: {
      id: "job-1",
      storeId: "store-matriz-fixture",
      vendaId: "venda-1",
      notaFiscalId: "nota-1",
      status,
      tentativas: 5,
      maxTentativas: 5,
      payload: {
        transmission: {
          external: true,
          startedAt: "2026-07-22T23:00:00.000Z",
        },
      },
    },
    logs: [] as Array<Record<string, unknown>>,
  }
  const client = {
    fiscalLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        state.logs.push(args.data)
        return args.data
      }),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        fiscalEmissaoJob: {
          findFirst: vi.fn(async () => ({ ...state.job })),
          updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
            if (
              (status === "FALHA" && state.job.status !== "FALHA") ||
              (status !== "FALHA" && state.job.status === "PROCESSANDO")
            ) {
              return { count: 0 }
            }
            state.job = { ...state.job, ...args.data }
            return { count: 1 }
          }),
        },
        fiscalLog: {
          create: vi.fn(async (args: { data: Record<string, unknown> }) => {
            state.logs.push(args.data)
            return args.data
          }),
        },
      }
      return fn(tx)
    }),
  }
  return { state, client }
}

describe("administração auditada da fila fiscal", () => {
  it("reprocessa somente FALHA, preserva tentativas e concede uma tentativa explícita", async () => {
    const fixture = adminFixture()
    const now = new Date("2026-07-23T00:00:00.000Z")

    const result = await reprocessFailedFiscalJob(
      {
        jobId: "job-1",
        storeId: "store-matriz-fixture",
        actor: "admin-fixture",
        reason: "consulta confirmou ausência na autorizadora",
        consultationAuthorizedRetry: true,
        now,
      },
      fixture.client as never,
    )

    expect(result).toEqual({
      jobId: "job-1",
      status: "PENDENTE",
      tentativas: 5,
      maxTentativas: 6,
    })
    expect(fixture.state.job).toMatchObject({
      status: "PENDENTE",
      tentativas: 5,
      maxTentativas: 6,
      proximaTentativaEm: now,
      lockOwner: null,
      lockedAt: null,
      lockExpiresAt: null,
    })
    expect(fixture.state.job.payload).toMatchObject({
      transmission: {
        retryAuthorizedAt: now.toISOString(),
      },
      manualReprocess: {
        requestedBy: "admin-fixture",
      },
    })
    expect(fixture.state.logs[0]).toMatchObject({
      acao: "fiscal.queue.reprocess.manual",
      operador: "admin-fixture",
    })
  })

  it("rejeita reprocessamento de job que não está em dead-letter", async () => {
    const fixture = adminFixture("PENDENTE")
    await expect(
      reprocessFailedFiscalJob(
        {
          jobId: "job-1",
          storeId: "store-matriz-fixture",
          actor: "admin-fixture",
          reason: "tentativa indevida",
        },
        fixture.client as never,
      ),
    ).rejects.toMatchObject({
      code: "status_incompativel",
    } satisfies Partial<FiscalQueueAdminError>)
  })

  it("cancela estado compatível sem apagar tentativas e registra ator/motivo/data", async () => {
    const fixture = adminFixture("PENDENTE")
    const now = new Date("2026-07-23T00:00:00.000Z")
    const result = await cancelFiscalQueueJob(
      {
        jobId: "job-1",
        storeId: "store-matriz-fixture",
        actor: "admin-fixture",
        reason: "venda cancelada antes do processamento",
        now,
      },
      fixture.client as never,
    )

    expect(result).toEqual({
      jobId: "job-1",
      status: "CANCELADO",
      tentativas: 5,
    })
    expect(fixture.state.job).toMatchObject({
      status: "CANCELADO",
      tentativas: 5,
    })
    expect(fixture.state.logs[0]).toMatchObject({
      acao: "fiscal.queue.cancel.manual",
      operador: "admin-fixture",
    })
  })

  it("bloqueia cancelamento inseguro de job em PROCESSANDO", async () => {
    const fixture = adminFixture("PROCESSANDO")
    await expect(
      cancelFiscalQueueJob(
        {
          jobId: "job-1",
          storeId: "store-matriz-fixture",
          actor: "admin-fixture",
          reason: "não deve interromper lock ativo",
        },
        fixture.client as never,
      ),
    ).rejects.toMatchObject({
      code: "status_incompativel",
    } satisfies Partial<FiscalQueueAdminError>)
    expect(fixture.state.job.status).toBe("PROCESSANDO")
    expect(fixture.state.logs).toHaveLength(0)
  })

  it("pausa e despausa gravam eventos append-only com escopo e auditoria", async () => {
    const fixture = adminFixture()
    await setFiscalQueuePause(
      {
        scope: "store",
        storeId: "store-matriz-fixture",
        paused: true,
        actor: "admin-fixture",
        reason: "manutenção operacional",
        now: new Date("2026-07-23T00:00:00.000Z"),
      },
      fixture.client as never,
    )
    await setFiscalQueuePause(
      {
        scope: "store",
        storeId: "store-matriz-fixture",
        paused: false,
        actor: "admin-fixture",
        reason: "manutenção concluída",
        now: new Date("2026-07-23T00:05:00.000Z"),
      },
      fixture.client as never,
    )

    expect(fixture.state.logs).toHaveLength(2)
    expect(fixture.state.logs.map((entry) => entry.acao)).toEqual([
      "fiscal.queue.pause.store",
      "fiscal.queue.pause.store",
    ])
    expect(fixture.state.logs.map((entry) => entry.operador)).toEqual([
      "admin-fixture",
      "admin-fixture",
    ])
  })
})
