import { describe, expect, it, vi } from "vitest"
import { requestFiscalEmissionWithJob } from "./queue-producer"
import { drainFiscalQueue } from "./queue-worker"
import type { FiscalQueueJob, FiscalQueueWorkerPorts } from "./queue.types"

type ProducerState = {
  venda: {
    id: string
    pedidoId: string
    fiscalStatus: string
    status: string
  }
  job: {
    id: string
    status: string
    tentativas: number
    maxTentativas: number
    dedupeKey: string
  } | null
}

function producerFixture(options: { failJob?: boolean } = {}) {
  const state: ProducerState = {
    venda: {
      id: "venda-real-id",
      pedidoId: "VDA-2026-001",
      fiscalStatus: "NAO_FISCAL",
      status: "concluida",
    },
    job: null,
  }
  let jobSequence = 0
  const client = {
    venda: {
      findFirst: vi.fn(async () => ({ ...state.venda })),
    },
    configuracaoFiscalLoja: {
      findUnique: vi.fn(async () => ({ fiscalEnabled: true })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const draft: ProducerState = {
        venda: { ...state.venda },
        job: state.job ? { ...state.job } : null,
      }
      const tx = {
        venda: {
          findFirst: vi.fn(async () => ({
            id: draft.venda.id,
            fiscalStatus: draft.venda.fiscalStatus,
            status: draft.venda.status,
          })),
          updateMany: vi.fn(async () => {
            if (draft.venda.fiscalStatus !== "NAO_FISCAL") return { count: 0 }
            draft.venda.fiscalStatus = "PENDENTE"
            return { count: 1 }
          }),
        },
        fiscalEmissaoJob: {
          findUnique: vi.fn(async () => (draft.job ? { id: draft.job.id } : null)),
          upsert: vi.fn(async (args: {
            create: { dedupeKey: string }
          }) => {
            if (options.failJob) throw new Error("job insert failed")
            if (!draft.job) {
              jobSequence += 1
              draft.job = {
                id: `job-${jobSequence}`,
                status: "PENDENTE",
                tentativas: 0,
                maxTentativas: 5,
                dedupeKey: args.create.dedupeKey,
              }
            }
            return { ...draft.job }
          }),
        },
      }
      const result = await fn(tx)
      state.venda = draft.venda
      state.job = draft.job
      return result
    }),
  }
  const createSnapshot = vi.fn(async () => ({
    ok: true as const,
    notaFiscalId: "nota-fiscal-real-id",
    localKey: "nfce:store-matriz-fixture:venda-real-id",
    snapshotHash: "hash-fixture",
    hashContratoVersao: 1,
    created: true,
    diagnostico: { prontoParaEmissao: true },
  }))
  return { state, client, createSnapshot }
}

describe("produtor transacional da outbox fiscal", () => {
  it("cria job e muda Venda para PENDENTE na mesma transação", async () => {
    const fixture = producerFixture()
    const result = await requestFiscalEmissionWithJob(
      {
        storeId: "store-matriz-fixture",
        pedidoId: "VDA-2026-001",
        operador: "admin-fixture",
        now: new Date("2026-07-23T00:00:00.000Z"),
      },
      {
        client: fixture.client as never,
        createSnapshot: fixture.createSnapshot,
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.jobCreated).toBe(true)
      expect(result.transitioned).toBe(true)
      expect(result.dedupeKey).toBe("fiscal:emissao:v1:venda:venda-real-id")
    }
    expect(fixture.state.venda.fiscalStatus).toBe("PENDENTE")
    expect(fixture.state.job).toMatchObject({ status: "PENDENTE", tentativas: 0 })
    expect(fixture.client.$transaction).toHaveBeenCalledTimes(1)
  })

  it("solicitações repetidas reutilizam a mesma dedupeKey e não duplicam jobs", async () => {
    const fixture = producerFixture()
    const input = {
      storeId: "store-matriz-fixture",
      pedidoId: "VDA-2026-001",
      operador: "admin-fixture",
    }
    const first = await requestFiscalEmissionWithJob(input, {
      client: fixture.client as never,
      createSnapshot: fixture.createSnapshot,
    })
    const second = await requestFiscalEmissionWithJob(input, {
      client: fixture.client as never,
      createSnapshot: fixture.createSnapshot,
    })

    expect(first.ok && first.jobId).toBe("job-1")
    expect(second.ok && second.jobId).toBe("job-1")
    expect(second.ok && second.jobCreated).toBe(false)
    expect(second.ok && second.transitioned).toBe(false)
    expect(fixture.state.job?.dedupeKey).toBe("fiscal:emissao:v1:venda:venda-real-id")
  })

  it("falha ao criar job faz rollback e não deixa Venda parcialmente PENDENTE", async () => {
    const fixture = producerFixture({ failJob: true })
    await expect(
      requestFiscalEmissionWithJob(
        {
          storeId: "store-matriz-fixture",
          pedidoId: "VDA-2026-001",
          operador: "admin-fixture",
        },
        {
          client: fixture.client as never,
          createSnapshot: fixture.createSnapshot,
        },
      ),
    ).rejects.toThrow("Falha na transação da outbox fiscal")

    expect(fixture.state.venda.fiscalStatus).toBe("NAO_FISCAL")
    expect(fixture.state.job).toBeNull()
  })

  it("fluxo ponta a ponta local: solicita → PENDENTE/job → worker simulado → CONCLUIDO", async () => {
    const fixture = producerFixture()
    const produced = await requestFiscalEmissionWithJob(
      {
        storeId: "store-matriz-fixture",
        pedidoId: "VDA-2026-001",
        operador: "admin-fixture",
      },
      {
        client: fixture.client as never,
        createSnapshot: fixture.createSnapshot,
      },
    )
    expect(produced.ok).toBe(true)
    if (!produced.ok) throw new Error(produced.error)

    const queueJob: FiscalQueueJob = {
      id: produced.jobId,
      storeId: "store-matriz-fixture",
      vendaId: produced.vendaId,
      notaFiscalId: produced.notaFiscalId,
      tipo: "EMISSAO",
      status: "PENDENTE",
      tentativas: 0,
      maxTentativas: 5,
      proximaTentativaEm: new Date(0),
      prioridade: 0,
      lockOwner: null,
      lockedAt: null,
      lockExpiresAt: null,
      dedupeKey: produced.dedupeKey,
      payload: { transmission: { external: false } },
      ultimoErro: null,
      concluidoEm: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }
    let current = queueJob
    const execute = vi.fn(async () => ({
      kind: "success" as const,
      code: "autorizada",
      mensagem: "Provider STUB_HOMOLOGACAO concluiu.",
      simulado: true,
      externalTransmissionAttempted: false,
    }))
    const ports: FiscalQueueWorkerPorts = {
      readPauseSnapshot: async () => ({
        globalPaused: false,
        globalSource: "none",
        pausedStoreIds: [],
      }),
      acquireNextJob: async ({ workerId, now, leaseMs }) => {
        if (current.status !== "PENDENTE") return null
        current = {
          ...current,
          status: "PROCESSANDO",
          tentativas: 1,
          lockOwner: workerId,
          lockedAt: now,
          lockExpiresAt: new Date(now.getTime() + leaseMs),
        }
        return { job: { ...current }, takeover: false }
      },
      heartbeat: async () => true,
      markTransmissionStarted: async ({ payload }) => {
        current.payload = payload
        return true
      },
      complete: async ({ payload, now }) => {
        current = {
          ...current,
          status: "CONCLUIDO",
          payload,
          concluidoEm: now,
          lockOwner: null,
          lockedAt: null,
          lockExpiresAt: null,
        }
        return true
      },
      retry: async () => false,
      fail: async () => false,
      execute,
      audit: async () => undefined,
    }
    const report = await drainFiscalQueue(
      { workerId: "worker-e2e", batchSize: 1 },
      ports,
    )
    expect(fixture.state.venda.fiscalStatus).toBe("PENDENTE")
    expect(report.completed).toBe(1)
    expect(current.status).toBe("CONCLUIDO")
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
