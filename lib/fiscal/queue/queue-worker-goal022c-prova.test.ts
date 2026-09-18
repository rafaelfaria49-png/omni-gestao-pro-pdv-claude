/**
 * GOAL 022C — freio GOAL-011 com PROVA OPACA de EMISSAO do piloto de homologação.
 *
 * O executor armado do piloto nasce de ativação persistente one-shot, capability e
 * external authority válidas — mas o freio GOAL-011 reescrevia TODA EMISSAO não
 * simulada para `provider_real_bloqueado` (causa observada no 022B: uma EMISSAO
 * consumida + CONSULTA 217 posterior). A única porta nova é a prova opaca
 * `pilotEmissionExternalAuthorization`, nascida do consumo persistente da ativação
 * (activationId + job/store/nota + NFeAutorizacao4 + HOMOLOGACAO + janela) e validada
 * por IDENTIDADE (WeakMap privado do gate), com consumo one-shot.
 *
 * Cobre os itens A–I do GOAL (nível do freio; o ciclo de vida da prova e a integração
 * loopback ponta a ponta vivem em
 * `lib/fiscal/homologation/pilot-emission-authorization-handoff-022c.test.ts`):
 *
 * A. EMISSAO + prova válida + success ⇒ CONCLUIDO (não vira provider_real_bloqueado);
 *    terminal definitivo e throttled/processing preservam a semântica existente.
 * B. uncertain após boundary ⇒ permanece uncertain e exige CONSULTA.
 * C. prova ausente ⇒ provider_real_bloqueado.
 * D. prova estrutural/forjada (plain object, spread, JSON) ⇒ bloqueada.
 * E. mismatch job/store/nota, ativação forjada e janela inválida ⇒ bloqueado.
 * F. executor genérico não autorizado e wiring dormente/default ⇒ bloqueados/incapazes.
 * G. uma prova não autoriza duas execuções (one-shot).
 * H. CONSULTA 022B passa SOMENTE no contrato existente (sem prova do piloto).
 * I. contingência e inutilização mantêm o comportamento atual; a exceção do piloto
 *    NÃO é ampliada para outros tipos.
 *
 * Zero rede externa. Zero SEFAZ. Zero Neon write (ledger fake em memória com a mesma
 * semântica de unicidade do banco).
 */
import { describe, expect, it, vi } from "vitest"
import { drainFiscalQueue } from "./queue-worker"
import type {
  FiscalQueueExecutionResult,
  FiscalQueueJob,
  FiscalQueueLease,
  FiscalQueuePauseSnapshot,
  FiscalQueueWorkerPorts,
} from "./queue.types"
import {
  consumePilotEmissionActivation,
  consumePilotEmissionAuthorizationProof,
  createPilotEmissionAuthorizationProof,
  isPilotEmissionAuthorizationProof,
} from "../homologation/pilot-emission-gate"
import type { PilotEmissionWindowConfig } from "../homologation/pilot-emission-gate"
import { createNfceHomologationPilotWiring } from "../homologation/nfce-homologation-pilot-wiring"
import { EXTERNAL_EXECUTION_DENIED } from "../emission/uncertain-state.types"

const AGORA = new Date("2026-09-12T12:00:00.000Z")
const ACTIVATION = "homolog-022c-prova-test-0001"

const TRIO = {
  jobId: "job-emissao-022c",
  storeId: "loja-piloto-022c",
  notaFiscalId: "nota-022c-1",
} as const

function window022c(activationId = ACTIVATION): PilotEmissionWindowConfig {
  return {
    activationId,
    notBeforeUtc: new Date(AGORA.getTime() - 5 * 60_000).toISOString(),
    expiresAtUtc: new Date(AGORA.getTime() + 10 * 60_000).toISOString(),
  }
}

/** Ledger fake com unicidade REAL de (storeId, dedupeKey) — a mesma semântica do banco. */
function ledgerClient() {
  const created = new Set<string>()
  return {
    $transaction: async (op: (tx: never) => Promise<unknown>) =>
      op({
        fiscalEmissaoJob: {
          create: async (args: unknown) => {
            const data = (args as { data: { storeId: string; dedupeKey: string } }).data
            const key = `${data.storeId}::${data.dedupeKey}`
            if (created.has(key)) {
              const err = new Error("Unique constraint failed")
              ;(err as { code?: string }).code = "P2002"
              throw err
            }
            created.add(key)
            return { id: `ledger-${created.size}` }
          },
        },
        fiscalLog: { create: async () => ({}) },
      } as never),
  }
}

/** Prova válida nascida do consumo persistente one-shot, para o trio canônico. */
async function provaValida(
  trio: { jobId: string; storeId: string; notaFiscalId: string } = { ...TRIO },
  activationId = ACTIVATION,
) {
  const consumed = await consumePilotEmissionActivation(
    ledgerClient() as never,
    window022c(activationId),
    { ...trio, operatorId: "operador-022c" },
    () => AGORA,
  )
  if (!consumed.ok) throw new Error(`consumo esperado OK: ${consumed.code}`)
  const proof = createPilotEmissionAuthorizationProof(consumed.activation, { ...trio })
  if (!proof) throw new Error("prova esperada válida")
  return { proof, activation: consumed.activation }
}

function jobEmissao(overrides: Partial<FiscalQueueJob> = {}): FiscalQueueJob {
  return {
    id: TRIO.jobId,
    storeId: TRIO.storeId,
    vendaId: "venda-022c-1",
    notaFiscalId: TRIO.notaFiscalId,
    tipo: "EMISSAO",
    status: "PENDENTE",
    tentativas: 0,
    maxTentativas: 1,
    proximaTentativaEm: AGORA,
    prioridade: 0,
    lockOwner: null,
    lockedAt: null,
    lockExpiresAt: null,
    dedupeKey: "fiscal:emissao:v1:venda:venda-022c-1",
    payload: {},
    ultimoErro: null,
    concluidoEm: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...overrides,
  }
}

/** EMISSAO real (não simulada, provider invocado) com ou sem a prova do piloto. */
function emissaoReal(proof?: unknown): FiscalQueueExecutionResult {
  return {
    kind: "success",
    code: "autorizada",
    mensagem: "Autorização real do piloto concluída com evidência fiscal completa.",
    simulado: false,
    externalTransmissionAttempted: true,
    providerInvoked: true,
    ...(proof !== undefined ? { pilotEmissionExternalAuthorization: proof } : {}),
  }
}

function memoryPorts(
  initial: FiscalQueueJob[],
  execute: (job: FiscalQueueJob) => Promise<FiscalQueueExecutionResult>,
) {
  const jobs = new Map(initial.map((item) => [item.id, { ...item }]))
  function owns(current: FiscalQueueJob, workerId: string, now: Date): boolean {
    return (
      current.status === "PROCESSANDO" &&
      current.lockOwner === workerId &&
      current.lockExpiresAt != null &&
      current.lockExpiresAt.getTime() > now.getTime()
    )
  }
  const waitForConsultation = vi.fn(
    async ({ job: leased, workerId, now, error, payload }: {
      job: FiscalQueueJob
      workerId: string
      now: Date
      error: string
      payload: FiscalQueueJob["payload"]
    }) => {
      const current = jobs.get(leased.id)
      if (!current || !owns(current, workerId, now)) return false
      current.payload = payload
      current.ultimoErro = error
      current.status = "AGUARDANDO_RETRY"
      current.proximaTentativaEm = null
      current.lockOwner = null
      current.lockExpiresAt = null
      return true
    },
  )
  const ports: FiscalQueueWorkerPorts = {
    readPauseSnapshot: async (): Promise<FiscalQueuePauseSnapshot> => ({
      globalPaused: false,
      globalSource: "none",
      pausedStoreIds: [],
    }),
    acquireNextJob: async ({ workerId, now, leaseMs }) => {
      const selected = [...jobs.values()].find(
        (c) =>
          ["PENDENTE", "AGUARDANDO_RETRY"].includes(c.status) &&
          (!c.proximaTentativaEm || c.proximaTentativaEm.getTime() <= now.getTime()) &&
          (!c.lockExpiresAt || c.lockExpiresAt.getTime() <= now.getTime()),
      )
      if (!selected) return null
      const takeover = selected.status === "PROCESSANDO"
      selected.status = "PROCESSANDO"
      selected.lockOwner = workerId
      selected.lockExpiresAt = new Date(now.getTime() + leaseMs)
      selected.tentativas += 1
      return { job: { ...selected }, takeover } satisfies FiscalQueueLease
    },
    heartbeat: async () => true,
    markTransmissionStarted: async ({ job: leased, workerId, now, payload }) => {
      const current = jobs.get(leased.id)
      if (!current || !owns(current, workerId, now)) return false
      current.payload = payload
      return true
    },
    complete: async ({ job: leased, workerId, now, payload }) => {
      const current = jobs.get(leased.id)
      if (!current || !owns(current, workerId, now)) return false
      current.status = "CONCLUIDO"
      current.payload = payload
      current.concluidoEm = now
      return true
    },
    retry: async ({ job: leased, workerId, now, nextAttemptAt, error, payload }) => {
      const current = jobs.get(leased.id)
      if (!current || !owns(current, workerId, now)) return false
      current.status = "PENDENTE"
      current.payload = payload
      current.ultimoErro = error
      current.proximaTentativaEm = nextAttemptAt
      current.lockOwner = null
      current.lockExpiresAt = null
      return true
    },
    fail: async ({ job: leased, workerId, now, error, payload }) => {
      const current = jobs.get(leased.id)
      if (!current || !owns(current, workerId, now)) return false
      current.status = "FALHA"
      current.payload = payload
      current.ultimoErro = error
      current.proximaTentativaEm = null
      current.lockOwner = null
      current.lockExpiresAt = null
      return true
    },
    waitForConsultation,
    execute,
    audit: vi.fn(async () => undefined),
  }
  return { ports, jobs, waitForConsultation }
}

describe("022C · A — piloto armado + prova válida + success NÃO vira provider_real_bloqueado", () => {
  it("EMISSAO real com prova válida ⇒ concluido; boundary de transporte preservado", async () => {
    const { proof } = await provaValida()
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => emissaoReal(proof))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("concluido")
    const row = jobs.get(TRIO.jobId)
    expect(row?.status).toBe("CONCLUIDO")
    expect(row?.ultimoErro).toBeNull()
    // Semântica do resultado (item 5 do GOAL): nada fabricado — a informação do
    // boundary atravessa exatamente como o executor a produziu.
    const payload = (row?.payload ?? {}) as Record<string, unknown>
    const transmission = (payload.transmission ?? {}) as Record<string, unknown>
    expect(transmission.external).toBe(true)
    expect((payload.lastExecution as Record<string, unknown> | undefined)?.code).toBe("autorizada")
  })

  it("terminal definitivo com prova válida preserva o código original (sem reescrita)", async () => {
    const { proof } = await provaValida()
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => ({
      kind: "terminal" as const,
      code: "rejeitada_numero_consumido",
      mensagem: "Rejeição definitiva; número permanece consumido e segue para inutilização.",
      simulado: false,
      externalTransmissionAttempted: true,
      providerInvoked: true,
      pilotEmissionExternalAuthorization: proof,
    }))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    const row = jobs.get(TRIO.jobId)
    const payload = (row?.payload ?? {}) as Record<string, unknown>
    expect((payload.lastExecution as Record<string, unknown> | undefined)?.code).toBe(
      "rejeitada_numero_consumido",
    )
    expect(row?.ultimoErro).not.toContain("provider_real_bloqueado")
  })
})

describe("022C · B — uncertain após boundary permanece uncertain e exige CONSULTA", () => {
  it("uncertain com externalTransmissionAttempted + prova ⇒ consulta (estaciona sem retry)", async () => {
    const { proof } = await provaValida()
    const { ports, jobs, waitForConsultation } = memoryPorts([jobEmissao()], async () => ({
      kind: "uncertain" as const,
      code: "resultado_transmissao_incerto",
      mensagem: "Transmissão incerta após boundary; reconciliação por CONSULTA.",
      simulado: false,
      externalTransmissionAttempted: true,
      providerInvoked: true,
      pilotEmissionExternalAuthorization: proof,
    }))
    const report = await drainFiscalQueue(
      { workerId: "w-022c", batchSize: 1, now: () => AGORA },
      ports,
    )
    expect(report.items[0]?.status).toBe("consulta")
    expect(waitForConsultation).toHaveBeenCalledTimes(1)
    expect(jobs.get(TRIO.jobId)?.status).toBe("AGUARDANDO_RETRY")
  })

  it("uncertain após boundary SEM prova continua consulta (caminho mais-restritivo, inalterado)", async () => {
    const { ports, waitForConsultation } = memoryPorts([jobEmissao()], async () => ({
      kind: "uncertain" as const,
      code: "resultado_transmissao_incerto",
      mensagem: "Transmissão incerta após boundary.",
      simulado: false,
      externalTransmissionAttempted: true,
      providerInvoked: true,
    }))
    const report = await drainFiscalQueue(
      { workerId: "w-022c", batchSize: 1, now: () => AGORA },
      ports,
    )
    expect(report.items[0]?.status).toBe("consulta")
    expect(waitForConsultation).toHaveBeenCalledTimes(1)
  })
})

describe("022C · C — prova ausente ⇒ provider_real_bloqueado", () => {
  it("EMISSAO real sem prova ⇒ falha com GOAL-011", async () => {
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => emissaoReal(undefined))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    const row = jobs.get(TRIO.jobId)
    expect(row?.status).toBe("FALHA")
    expect(row?.ultimoErro).toContain("GOAL-011")
  })
})

describe("022C · D — prova estrutural/forjada ⇒ bloqueada", () => {
  it.each([
    ["objeto vazio", {}],
    ["objeto com campos plausíveis", { activationId: ACTIVATION, ...TRIO }],
    ["prova de contingência (outra família)", {
      kind: "transmissao_autorizada",
      jobId: TRIO.jobId,
      storeId: TRIO.storeId,
      notaFiscalId: TRIO.notaFiscalId,
      concedidaPor: "contingencia-drill:v1:xxx:execucao-unica",
    }],
  ])("forjada %s não atravessa o freio", async (_rotulo, forjada) => {
    expect(isPilotEmissionAuthorizationProof(forjada)).toBe(false)
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => emissaoReal(forjada))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
  })

  it("clone por spread e por JSON da prova válida NÃO são provas", async () => {
    const { proof } = await provaValida()
    expect(isPilotEmissionAuthorizationProof(proof)).toBe(true)
    const spread = { ...proof }
    const json = JSON.parse(JSON.stringify(proof)) as unknown
    expect(isPilotEmissionAuthorizationProof(spread)).toBe(false)
    expect(isPilotEmissionAuthorizationProof(json)).toBe(false)
    for (const clone of [spread, json]) {
      const { ports, jobs } = memoryPorts([jobEmissao()], async () => emissaoReal(clone))
      const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
      expect(report.items[0]?.status).toBe("falha")
      expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
    }
  })
})

describe("022C · E — mismatch job/store/nota, ativação forjada e janela inválida ⇒ bloqueado", () => {
  it.each([
    ["job diferente", { ...TRIO, jobId: "job-OUTRO" }],
    ["loja diferente", { ...TRIO, storeId: "loja-OUTRA" }],
    ["nota diferente", { ...TRIO, notaFiscalId: "nota-OUTRA" }],
  ])("prova de %s não autoriza este job", async (_rotulo, trioOutro) => {
    const { proof } = await provaValida(trioOutro)
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => emissaoReal(proof))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
  })

  it("prova de outra ativação (outro trio consumido) não autoriza este job", async () => {
    const { proof } = await provaValida(
      { jobId: "job-outra-ativacao", storeId: TRIO.storeId, notaFiscalId: "nota-outra-ativacao" },
      "homolog-022c-outra-ativacao-02",
    )
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => emissaoReal(proof))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
  })

  it("ativação forjada (não consumida pelo ledger) não gera prova", async () => {
    const forjada = {} as never
    expect(createPilotEmissionAuthorizationProof(forjada, { ...TRIO })).toBeNull()
  })

  it("prova fora da janela (expirada) não autoriza", async () => {
    const { proof } = await provaValida()
    const depois = new Date(AGORA.getTime() + 60 * 60_000)
    expect(
      consumePilotEmissionAuthorizationProof(proof, { ...TRIO, now: depois }),
    ).toBe(false)
    // E a tentativa fora da janela NÃO queimou a prova: dentro da janela ela vale.
    expect(
      consumePilotEmissionAuthorizationProof(proof, { ...TRIO, now: AGORA }),
    ).toBe(true)
  })
})

describe("022C · R1 — providerInvoked reconferido no freio", () => {
  it("prova válida + providerInvoked=false ⇒ provider_real_bloqueado (e a prova não queima)", async () => {
    const { proof } = await provaValida()
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => ({
      ...emissaoReal(proof),
      providerInvoked: false,
    }))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
    // Short-circuit antes do consume: a prova segue válida para a execução real.
    expect(consumePilotEmissionAuthorizationProof(proof, { ...TRIO, now: AGORA })).toBe(true)
  })
})

describe("022C · R2 — resposta após expiresAt não invalida autorização pré-boundary", () => {
  const T_START = new Date("2026-09-12T12:00:00.000Z")
  const T_AFTER = new Date("2026-09-12T12:06:00.000Z")
  function windowR2(): PilotEmissionWindowConfig {
    return {
      activationId: "homolog-022c-r2-cross-expiry-01",
      notBeforeUtc: new Date(T_START.getTime() - 5 * 60_000).toISOString(),
      expiresAtUtc: new Date(T_START.getTime() + 5 * 60_000).toISOString(),
    }
  }
  async function provaR2() {
    const consumed = await consumePilotEmissionActivation(
      ledgerClient() as never,
      windowR2(),
      { ...TRIO, operatorId: "operador-r2" },
      () => T_START,
    )
    if (!consumed.ok) throw new Error(`consumo esperado OK: ${consumed.code}`)
    const proof = createPilotEmissionAuthorizationProof(consumed.activation, { ...TRIO })
    if (!proof) throw new Error("prova esperada válida")
    return proof
  }

  it("success autorizado em janela, resposta após expiry ⇒ preservado (não reescrito)", async () => {
    const proof = await provaR2()
    let agora = T_START
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => {
      // Round-trip longo cruza o expiry DENTRO do provider, após o boundary.
      agora = T_AFTER
      return emissaoReal(proof)
    })
    const report = await drainFiscalQueue(
      { workerId: "w-022c", batchSize: 1, leaseMs: 900_000, now: () => agora },
      ports,
    )
    expect(report.items[0]?.status).toBe("concluido")
    expect(jobs.get(TRIO.jobId)?.status).toBe("CONCLUIDO")
  })

  it("uncertain após boundary com resposta após expiry ⇒ consulta, sem retransmissão", async () => {
    const proof = await provaR2()
    let agora = T_START
    const { ports, waitForConsultation } = memoryPorts([jobEmissao()], async () => {
      agora = T_AFTER
      return {
        kind: "uncertain" as const,
        code: "resultado_transmissao_incerto",
        mensagem: "Transmissão incerta após boundary; resposta tardia.",
        simulado: false,
        externalTransmissionAttempted: true,
        providerInvoked: true,
        pilotEmissionExternalAuthorization: proof,
      }
    })
    const report = await drainFiscalQueue(
      { workerId: "w-022c", batchSize: 1, leaseMs: 900_000, now: () => agora },
      ports,
    )
    expect(report.items[0]?.status).toBe("consulta")
    expect(waitForConsultation).toHaveBeenCalledTimes(1)
  })

  it("execução que começa somente após o expiry continua bloqueada", async () => {
    const proof = await provaR2()
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => emissaoReal(proof))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => T_AFTER }, ports)
    expect(report.items[0]?.status).toBe("falha")
    expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
  })
})

describe("022C · F — wiring dormente/default e executor genérico seguem incapazes/bloqueados", () => {
  it("default dormente: capability negada e transporte offline", () => {
    const wiring = createNfceHomologationPilotWiring()
    expect(wiring.capability).toBe(EXTERNAL_EXECUTION_DENIED)
    expect(wiring.transport.permiteRede).toBe(false)
  })

  it("executor genérico (EMISSAO real sem prova, só providerInvoked) ⇒ provider_real_bloqueado", async () => {
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => ({
      kind: "success" as const,
      code: "autorizada",
      mensagem: "Executor genérico sem prova do piloto.",
      simulado: false,
      externalTransmissionAttempted: true,
      providerInvoked: true,
    }))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
  })

  it("booleano genérico (allowRealProvider) NÃO é prova e não atravessa", async () => {
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => ({
      ...(emissaoReal(undefined) as unknown as Record<string, unknown>),
      allowRealProvider: true,
    }) as unknown as FiscalQueueExecutionResult)
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
  })
})

describe("022C · G — uma prova não autoriza duas execuções", () => {
  it("prova consumida no primeiro drain é recusada no segundo (provider_real_bloqueado)", async () => {
    const { proof } = await provaValida()
    const { ports, jobs } = memoryPorts([jobEmissao({ maxTentativas: 5 })], async () =>
      emissaoReal(proof),
    )
    const primeiro = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(primeiro.items[0]?.status).toBe("concluido")
    // Segunda execução (mesmo job re-elegível, MESMA prova): o freio nega.
    const atual = jobs.get(TRIO.jobId)
    if (!atual) throw new Error("job esperado")
    atual.status = "PENDENTE"
    atual.proximaTentativaEm = AGORA
    atual.lockOwner = null
    atual.lockExpiresAt = null
    atual.payload = {}
    const segundo = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(segundo.items[0]?.status).toBe("falha")
    expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
  })
})

describe("022C · H — CONSULTA 022B passa SOMENTE no contrato existente", () => {
  it("consulta_not_found com provider invocado e SEM prova do piloto ⇒ concluido", async () => {
    const consulta = jobEmissao({ id: "job-consulta-022c", tipo: "CONSULTA" })
    const { ports, jobs } = memoryPorts([consulta], async () => ({
      kind: "success" as const,
      code: "consulta_not_found",
      mensagem: "Consulta não encontrou a nota; retranmissão do piloto permanece vedada.",
      simulado: false,
      externalTransmissionAttempted: true,
      providerInvoked: true,
    }))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("concluido")
    expect(jobs.get("job-consulta-022c")?.status).toBe("CONCLUIDO")
  })

  it("prova do piloto anexada a CONSULTA é ignorada (não queima) e segue valendo para a EMISSAO", async () => {
    const { proof } = await provaValida()
    const consulta = jobEmissao({ id: "job-consulta-022c", tipo: "CONSULTA" })
    const { ports, jobs } = memoryPorts([consulta, jobEmissao()], async (job) => {
      if (job.tipo === "CONSULTA") {
        return {
          kind: "success" as const,
          code: "consulta_not_found",
          mensagem: "Consulta 022B no contrato existente.",
          simulado: false,
          externalTransmissionAttempted: true,
          providerInvoked: true,
          pilotEmissionExternalAuthorization: proof,
        }
      }
      return emissaoReal(proof)
    })
    const report = await drainFiscalQueue(
      { workerId: "w-022c", batchSize: 2, now: () => AGORA },
      ports,
    )
    expect(report.items.map((item) => item.status)).toEqual(["concluido", "concluido"])
    expect(jobs.get("job-consulta-022c")?.status).toBe("CONCLUIDO")
    expect(jobs.get(TRIO.jobId)?.status).toBe("CONCLUIDO")
  })
})

describe("022C · I — contingência e inutilização com comportamento atual; sem ampliação", () => {
  it("INUTILIZACAO real SEM prova do piloto ⇒ concluido (exceção GOAL 019 intacta)", async () => {
    const inutilizacao = jobEmissao({ id: "job-inutilizacao-022c", tipo: "INUTILIZACAO" })
    const { ports, jobs } = memoryPorts([inutilizacao], async () => ({
      kind: "success" as const,
      code: "inutilizada",
      mensagem: "Inutilização real concluída.",
      simulado: false,
      externalTransmissionAttempted: true,
      providerInvoked: true,
    }))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("concluido")
    expect(jobs.get("job-inutilizacao-022c")?.status).toBe("CONCLUIDO")
  })

  it("CONTINGENCIA_TRANSMISSAO com prova de contingência coerente ⇒ concluido", async () => {
    const drill = jobEmissao({ id: "job-drill-022c", tipo: "CONTINGENCIA_TRANSMISSAO" })
    const { ports, jobs } = memoryPorts([drill], async () => ({
      kind: "success" as const,
      code: "autorizada",
      mensagem: "Autorização real do drill com evidência fiscal completa.",
      simulado: false,
      externalTransmissionAttempted: true,
      providerInvoked: true,
      contingencyExternalAuthorization: {
        kind: "transmissao_autorizada" as const,
        jobId: "job-drill-022c",
        storeId: TRIO.storeId,
        notaFiscalId: TRIO.notaFiscalId,
        concedidaPor: "contingencia-drill:v1:xxx:execucao-unica",
      },
    }))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("concluido")
    expect(jobs.get("job-drill-022c")?.status).toBe("CONCLUIDO")
  })

  it("EMISSAO com prova de CONTINGÊNCIA (sem prova do piloto) ⇒ bloqueada: exceção não ampliada", async () => {
    const { ports, jobs } = memoryPorts([jobEmissao()], async () => ({
      kind: "success" as const,
      code: "autorizada",
      mensagem: "EMISSAO com prova de outra família.",
      simulado: false,
      externalTransmissionAttempted: true,
      providerInvoked: true,
      contingencyExternalAuthorization: {
        kind: "transmissao_autorizada" as const,
        jobId: TRIO.jobId,
        storeId: TRIO.storeId,
        notaFiscalId: TRIO.notaFiscalId,
        concedidaPor: "contingencia-drill:v1:xxx:execucao-unica",
      },
    }))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    expect(jobs.get(TRIO.jobId)?.ultimoErro).toContain("GOAL-011")
  })

  it("prova do piloto NÃO autoriza CONTINGENCIA/CONSULTA fora do contrato (só EMISSAO)", async () => {
    const { proof } = await provaValida()
    const drill = jobEmissao({
      id: "job-drill-022c",
      tipo: "CONTINGENCIA_TRANSMISSAO",
      dedupeKey: "fiscal:contingencia:v1:022c",
    })
    const { ports, jobs } = memoryPorts([drill], async () => ({
      kind: "success" as const,
      code: "autorizada",
      mensagem: "Drill com prova do piloto (família errada).",
      simulado: false,
      externalTransmissionAttempted: true,
      providerInvoked: true,
      pilotEmissionExternalAuthorization: proof,
    }))
    const report = await drainFiscalQueue({ workerId: "w-022c", now: () => AGORA }, ports)
    expect(report.items[0]?.status).toBe("falha")
    expect(jobs.get("job-drill-022c")?.ultimoErro).toContain("GOAL-011")
  })
})
