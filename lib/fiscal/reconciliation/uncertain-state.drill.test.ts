import { describe, expect, it, vi } from "vitest"
import {
  fiscalBytesSha256,
  fiscalXmlBytes,
  transmitWithUncertainStateSafety,
} from "../emission/uncertain-state-coordinator"
import { createUncertainStateJobExecutor } from "../emission/uncertain-state-job-executor"
import type {
  FinalizedFiscalDocument,
  FiscalDocumentLocator,
  PersistedFiscalDocument,
  UncertainStatePersistence,
} from "../emission/uncertain-state.types"
import { UncertainStateTestStub } from "../provider/uncertain-state-test-stub"
import { drainFiscalQueue } from "../queue/queue-worker"
import type {
  FiscalQueueJob,
  FiscalQueueLease,
  FiscalQueuePauseSnapshot,
  FiscalQueueWorkerPorts,
} from "../queue/queue.types"

const START = Date.parse("2026-07-23T12:00:00.000Z")
const XML_EXATO =
  '<?xml version="1.0" encoding="UTF-8"?><NFe Id="NFe35260712345678000199650010000000421123456789"><Signature>ASSINATURA-DRILL</Signature></NFe>'

function baseDocument(): PersistedFiscalDocument {
  return {
    storeId: "store-matriz-rafa-cell-fixture",
    vendaId: "venda-drill-012",
    notaFiscalId: "nota-drill-012",
    modelo: "NFCE",
    ambiente: "HOMOLOGACAO",
    serie: 1,
    numero: 42,
    chaveAcesso: "35260712345678000199650010000000421123456789",
    status: "RASCUNHO",
    xmlAssinado: null,
    xmlBytesSha256: null,
  }
}

function emissionJob(): FiscalQueueJob {
  const now = new Date(START)
  return {
    id: "job-emissao",
    storeId: "store-matriz-rafa-cell-fixture",
    vendaId: "venda-drill-012",
    notaFiscalId: "nota-drill-012",
    tipo: "EMISSAO",
    status: "PENDENTE",
    tentativas: 0,
    maxTentativas: 5,
    proximaTentativaEm: now,
    prioridade: 0,
    lockOwner: null,
    lockedAt: null,
    lockExpiresAt: null,
    dedupeKey: "fiscal:emissao:v1:venda:venda-drill-012",
    payload: { version: 2, operation: "EMISSAO" },
    ultimoErro: null,
    concluidoEm: null,
    createdAt: now,
    updatedAt: now,
  }
}

function createDrillState(
  provider: UncertainStateTestStub,
  now: () => Date,
) {
  let note = baseDocument()
  const jobs = new Map<string, FiscalQueueJob>([
    ["job-emissao", emissionJob()],
  ])
  const audit: string[] = []
  const builder = vi.fn(() => XML_EXATO.replace("ASSINATURA-DRILL", "SEM-ASSINATURA"))
  const signer = vi.fn((xml: string) => xml.replace("SEM-ASSINATURA", "ASSINATURA-DRILL"))
  const allocator = vi.fn(() => ({ serie: 1, numero: 42 }))
  const preparer = {
    prepare: vi.fn(async (locator: FiscalDocumentLocator): Promise<FinalizedFiscalDocument> => {
      const allocated = allocator()
      return {
        ...locator,
        modelo: "NFCE",
        ambiente: "HOMOLOGACAO",
        ...allocated,
        chaveAcesso: "35260712345678000199650010000000421123456789",
        xmlAssinado: signer(builder()),
      }
    }),
  }

  const persistence: UncertainStatePersistence = {
    load: async (locator) =>
      note.storeId === locator.storeId &&
      note.vendaId === locator.vendaId &&
      note.notaFiscalId === locator.notaFiscalId
        ? { ...note }
        : null,
    persistBeforeTransmission: async ({ document, bytesSha256 }) => {
      note = {
        ...document,
        status: "TRANSMITINDO",
        xmlBytesSha256: bytesSha256,
      }
      return { ...note }
    },
    recordUncertainAndEnsureConsultation: async ({ document }) => {
      const id = "job-consulta"
      const created = !jobs.has(id)
      if (created) {
        jobs.set(id, {
          ...emissionJob(),
          id,
          tipo: "CONSULTA",
          status: "PENDENTE",
          tentativas: 0,
          prioridade: 100,
          proximaTentativaEm: now(),
          dedupeKey: `fiscal:consulta:v1:nota:${document.notaFiscalId}`,
          payload: {
            version: 2,
            operation: "CONSULTA",
            document: {
              bytesSha256: document.xmlBytesSha256,
              chaveAcesso: document.chaveAcesso,
            },
          },
        })
      }
      return { consultationJobId: id, created }
    },
    markAuthorized: async ({ result, source }) => {
      note = {
        ...note,
        status: "AUTORIZADA",
        protocolo: result.protocolo,
        cStat: result.cStat,
        xMotivo: result.xMotivo,
        xmlAutorizado: result.xmlAutorizado,
      }
      if (source === "CONSULTATION") {
        const emission = jobs.get("job-emissao")!
        Object.assign(emission, {
          status: "CONCLUIDO",
          concluidoEm: now(),
          lockOwner: null,
          lockedAt: null,
          lockExpiresAt: null,
          proximaTentativaEm: null,
        })
      }
    },
    markRejected: async ({ result, requiresInutilizacao, source }) => {
      note = {
        ...note,
        status: "REJEITADA",
        cStat: result.cStat,
        xMotivo: result.xMotivo,
      }
      if (source === "CONSULTATION") {
        const emission = jobs.get("job-emissao")!
        emission.status = "FALHA"
        emission.proximaTentativaEm = null
        emission.lockOwner = null
        emission.lockedAt = null
        emission.lockExpiresAt = null
        emission.payload = { ...emission.payload, requiresInutilizacao }
      }
    },
    authorizeExactRetransmission: async () => {
      const emission = jobs.get("job-emissao")!
      const payload = emission.payload ?? {}
      const transmission =
        payload.transmission &&
        typeof payload.transmission === "object" &&
        !Array.isArray(payload.transmission)
          ? payload.transmission as Record<string, unknown>
          : {}
      emission.status = "PENDENTE"
      emission.proximaTentativaEm = now()
      emission.lockOwner = null
      emission.lockedAt = null
      emission.lockExpiresAt = null
      emission.payload = {
        ...payload,
        transmission: {
          ...transmission,
          consultationOutcome: "NOT_FOUND",
          consultationCompletedAt: now().toISOString(),
          retryAuthorizedAt: now().toISOString(),
          retryAuthorizationConsumedAt: null,
        },
      }
    },
  }

  const executor = createUncertainStateJobExecutor({
    persistence,
    preparer,
    provider,
    now,
  })
  let pause: FiscalQueuePauseSnapshot = {
    globalPaused: false,
    globalSource: "none",
    pausedStoreIds: [],
  }
  function owns(job: FiscalQueueJob, workerId: string): boolean {
    return (
      job.status === "PROCESSANDO" &&
      job.lockOwner === workerId &&
      Boolean(job.lockExpiresAt && job.lockExpiresAt.getTime() > now().getTime())
    )
  }
  const ports: FiscalQueueWorkerPorts = {
    readPauseSnapshot: async () => pause,
    acquireNextJob: async ({ workerId, now: acquiredAt, leaseMs, pausedStoreIds }) => {
      const candidate = [...jobs.values()]
        .filter((job) => {
          if (pausedStoreIds.includes(job.storeId)) return false
          if (job.status === "PROCESSANDO") {
            return Boolean(job.lockExpiresAt && job.lockExpiresAt <= acquiredAt)
          }
          if (job.status === "PENDENTE") {
            return !job.proximaTentativaEm || job.proximaTentativaEm <= acquiredAt
          }
          if (job.status === "AGUARDANDO_RETRY") {
            return Boolean(job.proximaTentativaEm && job.proximaTentativaEm <= acquiredAt)
          }
          return false
        })
        .sort((a, b) =>
          b.prioridade - a.prioridade ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
        )[0]
      if (!candidate) return null
      const takeover = candidate.status === "PROCESSANDO"
      candidate.status = "PROCESSANDO"
      candidate.lockOwner = workerId
      candidate.lockedAt = acquiredAt
      candidate.lockExpiresAt = new Date(acquiredAt.getTime() + leaseMs)
      candidate.tentativas += 1
      return { job: { ...candidate }, takeover } satisfies FiscalQueueLease
    },
    heartbeat: async ({ jobId, workerId, leaseMs }) => {
      const job = jobs.get(jobId)
      if (!job || !owns(job, workerId)) return false
      job.lockExpiresAt = new Date(now().getTime() + leaseMs)
      return true
    },
    markTransmissionStarted: async ({ job: leased, workerId, payload }) => {
      const job = jobs.get(leased.id)
      if (!job || !owns(job, workerId)) return false
      job.payload = payload
      return true
    },
    complete: async ({ job: leased, workerId, payload }) => {
      const job = jobs.get(leased.id)
      if (!job || !owns(job, workerId)) return false
      Object.assign(job, {
        status: "CONCLUIDO",
        payload,
        concluidoEm: now(),
        proximaTentativaEm: null,
        ultimoErro: null,
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
      })
      return true
    },
    retry: async ({ job: leased, workerId, payload, error, nextAttemptAt }) => {
      const job = jobs.get(leased.id)
      if (!job || !owns(job, workerId)) return false
      Object.assign(job, {
        status: "PENDENTE",
        payload,
        ultimoErro: error,
        proximaTentativaEm: nextAttemptAt,
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
      })
      return true
    },
    fail: async ({ job: leased, workerId, payload, error }) => {
      const job = jobs.get(leased.id)
      if (!job || !owns(job, workerId)) return false
      Object.assign(job, {
        status: "FALHA",
        payload,
        ultimoErro: error,
        proximaTentativaEm: null,
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
      })
      return true
    },
    waitForConsultation: async ({ job: leased, workerId, payload, error }) => {
      const job = jobs.get(leased.id)
      if (!job || !owns(job, workerId)) return false
      Object.assign(job, {
        status: "AGUARDANDO_RETRY",
        payload,
        ultimoErro: error,
        proximaTentativaEm: null,
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
      })
      return true
    },
    execute: executor,
    audit: async (event) => {
      audit.push(event.acao)
    },
  }
  return {
    ports,
    jobs,
    provider,
    persistence,
    preparer,
    builder,
    signer,
    allocator,
    audit,
    note: () => ({ ...note }),
    setPause(next: FiscalQueuePauseSnapshot) {
      pause = next
    },
  }
}

async function runFirstTimeout(state: ReturnType<typeof createDrillState>, now: () => Date) {
  const first = await drainFiscalQueue(
    { workerId: "worker-emissao", batchSize: 1, leaseMs: 5_000, now },
    state.ports,
  )
  expect(first.awaitingConsultation).toBe(1)
  expect(state.jobs.get("job-emissao")).toMatchObject({
    status: "AGUARDANDO_RETRY",
    proximaTentativaEm: null,
  })
  expect(state.note().status).toBe("TRANSMITINDO")
  expect(state.provider.transmissions).toHaveLength(1)

  const deadLease = await state.ports.acquireNextJob({
    workerId: "worker-morto",
    now: now(),
    leaseMs: 5_000,
    pausedStoreIds: [],
  })
  expect(deadLease?.job.id).toBe("job-consulta")
  expect(state.provider.consultations).toHaveLength(0)
}

async function takeoverConsultation(
  state: ReturnType<typeof createDrillState>,
  now: () => Date,
) {
  const recovered = await drainFiscalQueue(
    { workerId: "worker-takeover", batchSize: 1, leaseMs: 5_000, now },
    state.ports,
  )
  expect(recovered.items[0]?.takeover).toBe(true)
  expect(state.audit).toContain("fiscal.queue.lock.takeover")
}

describe("GOAL-012 · drills obrigatórios de estado incerto", () => {
  it("drill A: timeout, morte/takeover, consulta encontra autorizada e não retransmite", async () => {
    let clock = START
    const now = () => new Date(clock)
    const state = createDrillState(
      new UncertainStateTestStub({
        transmission: ["UNCERTAIN"],
        consultation: "AUTHORIZED",
      }),
      now,
    )
    const transmit = state.provider.transmit.bind(state.provider)
    vi.spyOn(state.provider, "transmit").mockImplementation(async (input) => {
      expect(state.note()).toMatchObject({
        status: "TRANSMITINDO",
        chaveAcesso: input.document.chaveAcesso,
        xmlBytesSha256: input.bytesSha256,
      })
      return transmit(input)
    })
    await runFirstTimeout(state, now)
    clock += 5_001
    await takeoverConsultation(state, now)

    expect(state.note()).toMatchObject({
      status: "AUTORIZADA",
      protocolo: "PROTOCOLO-CONSULTA-SIMULADO-GOAL012",
      numero: 42,
    })
    expect(state.provider.consultations).toHaveLength(1)
    expect(state.provider.transmissions).toHaveLength(1)
    expect(state.preparer.prepare).toHaveBeenCalledTimes(1)
    expect(state.builder).toHaveBeenCalledTimes(1)
    expect(state.signer).toHaveBeenCalledTimes(1)
  })

  it("drill B: consulta não encontra e libera somente os bytes persistidos", async () => {
    let clock = START
    const now = () => new Date(clock)
    const state = createDrillState(
      new UncertainStateTestStub({
        transmission: ["UNCERTAIN", "AUTHORIZED"],
        consultation: "NOT_FOUND",
      }),
      now,
    )
    await runFirstTimeout(state, now)
    const directBeforeQuery = await transmitWithUncertainStateSafety({
      locator: {
        storeId: "store-matriz-rafa-cell-fixture",
        vendaId: "venda-drill-012",
        notaFiscalId: "nota-drill-012",
      },
      persistence: state.persistence,
      preparer: state.preparer,
      provider: state.provider,
      now: now(),
    })
    expect(directBeforeQuery).toMatchObject({
      kind: "blocked",
      code: "CONSULTATION_REQUIRED",
    })
    expect(state.provider.transmissions).toHaveLength(1)

    clock += 5_001
    await takeoverConsultation(state, now)
    expect(state.jobs.get("job-emissao")?.status).toBe("PENDENTE")
    const resumed = await drainFiscalQueue(
      { workerId: "worker-retomada", batchSize: 1, now },
      state.ports,
    )
    expect(resumed.completed).toBe(1)
    expect(state.note().status).toBe("AUTORIZADA")
    expect(state.provider.transmissions).toHaveLength(2)
    expect(state.provider.transmissions[1]).toEqual(state.provider.transmissions[0])
    expect(state.provider.transmissions[0]?.bytesSha256).toBe(
      fiscalBytesSha256(fiscalXmlBytes(XML_EXATO)),
    )
    expect(state.preparer.prepare).toHaveBeenCalledTimes(1)
    expect(state.builder).toHaveBeenCalledTimes(1)
    expect(state.signer).toHaveBeenCalledTimes(1)
    expect(state.allocator).toHaveBeenCalledTimes(1)
    expect(state.note().numero).toBe(42)
  })

  it("drill C: consulta rejeita, consome número e marca futura inutilização", async () => {
    let clock = START
    const now = () => new Date(clock)
    const state = createDrillState(
      new UncertainStateTestStub({
        transmission: ["UNCERTAIN"],
        consultation: "REJECTED",
      }),
      now,
    )
    await runFirstTimeout(state, now)
    clock += 5_001
    await takeoverConsultation(state, now)

    expect(state.note()).toMatchObject({
      status: "REJEITADA",
      numero: 42,
    })
    expect(state.jobs.get("job-emissao")).toMatchObject({
      status: "FALHA",
      payload: expect.objectContaining({ requiresInutilizacao: true }),
    })
    expect(state.provider.transmissions).toHaveLength(1)
    expect(state.preparer.prepare).toHaveBeenCalledTimes(1)
    expect(state.builder).toHaveBeenCalledTimes(1)
    expect(state.signer).toHaveBeenCalledTimes(1)
    expect(state.allocator).toHaveBeenCalledTimes(1)
  })
})
