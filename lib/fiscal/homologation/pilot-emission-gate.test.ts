/**
 * GOAL 022 · slice do runtime one-shot — gate de EMISSAO do piloto.
 *
 * Prova: janela dormente/inválida/futura/expirada; consumo one-shot GLOBAL e PERSISTENTE
 * (dedupeKey sem jobId ⇒ 1 documento por ativação); replay/cold-start/segundo job
 * bloqueados pela unicidade do ledger; falha de persistência bloqueia; capability
 * vinculada a (loja, job) e não forjável; authority externa nasce da ativação consumida.
 */
import { describe, expect, it, vi } from "vitest"
import {
  consumePilotEmissionActivation,
  createPilotEmissionExternalAuthority,
  evaluatePilotEmissionWindow,
  PILOT_EMISSION_HOMOLOGATION_WINDOW,
  pilotEmissionCapability,
  pilotEmissionDedupeKey,
  pilotEmissionActivationStillActive,
} from "./pilot-emission-gate"

const NOW = new Date("2026-09-12T12:00:00.000Z")
const WINDOW = {
  activationId: "homolog-emissao-gate-test-0001",
  notBeforeUtc: "2026-09-12T11:55:00.000Z",
  expiresAtUtc: "2026-09-12T12:10:00.000Z",
}

/** Ledger fake com unicidade REAL de (storeId, dedupeKey) — a mesma semântica do banco. */
function ledgerClient(options: { failPersistence?: boolean } = {}) {
  const created = new Set<string>()
  const rows: { storeId: string; dedupeKey: string }[] = []
  return {
    createdKeys: () => [...created],
    rows,
    $transaction: async (op: (tx: never) => Promise<unknown>) => {
      if (options.failPersistence) throw new Error("persistência indisponível")
      return op({
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
            rows.push({ storeId: data.storeId, dedupeKey: data.dedupeKey })
            return { id: `ledger-${created.size}` }
          },
        },
        fiscalLog: {
          create: async () => ({}),
        },
      } as never)
    },
  }
}

const INPUT = {
  jobId: "job-emissao-gate-1",
  storeId: "store-piloto-gate",
  notaFiscalId: "nota-gate-1",
  operatorId: "operador-teste",
}

describe("evaluatePilotEmissionWindow · janela versionada em código", () => {
  it("nasce DORMENTE (todas nulas) e bloqueia", () => {
    const status = evaluatePilotEmissionWindow(PILOT_EMISSION_HOMOLOGATION_WINDOW, NOW)
    expect(status).toEqual({ active: false, reason: "disabled" })
  })

  it("parcial/inválida (datas não-UTC estritas, janela > 15 min, expires <= notBefore) bloqueia", () => {
    expect(evaluatePilotEmissionWindow({ activationId: "x".repeat(20), notBeforeUtc: null, expiresAtUtc: null }, NOW))
      .toEqual({ active: false, reason: "invalid" })
    expect(
      evaluatePilotEmissionWindow(
        {
          activationId: WINDOW.activationId,
          notBeforeUtc: "2026-09-12T11:00:00.000Z",
          expiresAtUtc: "2026-09-12T12:10:00.000Z",
        },
        NOW,
      ),
    ).toEqual({ active: false, reason: "invalid" })
    expect(
      evaluatePilotEmissionWindow(
        { activationId: WINDOW.activationId, notBeforeUtc: "2026-09-12T12:10:00.000Z", expiresAtUtc: "2026-09-12T11:55:00.000Z" },
        NOW,
      ),
    ).toEqual({ active: false, reason: "invalid" })
  })

  it("futura e expirada bloqueiam; vigente ativa", () => {
    expect(evaluatePilotEmissionWindow(WINDOW, new Date("2026-09-12T11:00:00.000Z")))
      .toEqual({ active: false, reason: "not_started" })
    expect(evaluatePilotEmissionWindow(WINDOW, new Date("2026-09-12T12:10:00.000Z")))
      .toEqual({ active: false, reason: "expired" })
    const active = evaluatePilotEmissionWindow(WINDOW, NOW)
    expect(active.active).toBe(true)
    if (active.active) {
      expect(active.window.activationId).toBe(WINDOW.activationId)
      expect(active.window.notBefore.toISOString()).toBe(WINDOW.notBeforeUtc)
      expect(active.window.expiresAt.toISOString()).toBe(WINDOW.expiresAtUtc)
    }
  })
})

describe("consumePilotEmissionActivation · one-shot global persistente", () => {
  it("primeiro consumo OK; replay do MESMO job bloqueia pela unicidade", async () => {
    const client = ledgerClient()
    const clock = () => NOW
    const first = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, clock)
    expect(first.ok).toBe(true)
    const second = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, clock)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.code).toBe("already_consumed_or_persistence_unavailable")
  })

  it("SEGUNDO DOCUMENTO (job diferente, mesma ativação) bloqueia — 1 por acionamento", async () => {
    const client = ledgerClient()
    const clock = () => NOW
    const first = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, clock)
    expect(first.ok).toBe(true)
    const other = await consumePilotEmissionActivation(
      client as never,
      WINDOW,
      { ...INPUT, jobId: "job-emissao-gate-OUTRO", notaFiscalId: "nota-2" },
      clock,
    )
    expect(other.ok).toBe(false)
  })

  it("nova INSTÂNCIA (cold start) com ledger já consumido bloqueia", async () => {
    const client = ledgerClient()
    const clock = () => NOW
    expect((await consumePilotEmissionActivation(client as never, WINDOW, INPUT, clock)).ok).toBe(true)
    // "Nova instância": chamada fresca do mesmo gate contra o mesmo banco.
    const cold = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, clock)
    expect(cold.ok).toBe(false)
  })

  it("concorrência: dois consumidores simultâneos — somente um vence", async () => {
    const client = ledgerClient()
    const clock = () => NOW
    const [a, b] = await Promise.all([
      consumePilotEmissionActivation(client as never, WINDOW, INPUT, clock),
      consumePilotEmissionActivation(client as never, WINDOW, { ...INPUT, jobId: "job-concorrente-2" }, clock),
    ])
    const winners = [a, b].filter((r) => r.ok)
    expect(winners).toHaveLength(1)
  })

  it("falha de persistência bloqueia SEM consumir (nenhum transporte nasce)", async () => {
    const client = ledgerClient({ failPersistence: true })
    const result = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, () => NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("already_consumed_or_persistence_unavailable")
  })

  it("janela expira entre consumo e retorno pós-commit ⇒ consumo descartado (rede não)", async () => {
    const client = ledgerClient()
    let tick = 0
    const clock = () => (tick++ === 0 ? NOW : new Date("2026-09-12T13:00:00.000Z"))
    const result = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, clock)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("window_unavailable")
    // O ledger ficou gravado (consumido sem rede): fail-closed conservador, sem segundo tiro.
    expect(client.createdKeys()).toHaveLength(1)
  })

  it("janela dormente ⇒ window_unavailable sem tocar o ledger", async () => {
    const client = ledgerClient()
    const result = await consumePilotEmissionActivation(
      client as never,
      PILOT_EMISSION_HOMOLOGATION_WINDOW,
      INPUT,
      () => NOW,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("window_unavailable")
    expect(client.createdKeys()).toHaveLength(0)
  })

  it("dedupeKey é GLOBAL por ativação (não inclui jobId)", () => {
    expect(pilotEmissionDedupeKey("ativ-A")).toBe(pilotEmissionDedupeKey("ativ-A"))
    expect(pilotEmissionDedupeKey("ativ-A")).not.toBe(pilotEmissionDedupeKey("ativ-B"))
    expect(pilotEmissionDedupeKey("ativ-A")).not.toContain("job")
  })
})

describe("pilotEmissionCapability · capability por execução, não forjável", () => {
  async function consumed() {
    const client = ledgerClient()
    const result = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, () => NOW)
    if (!result.ok) throw new Error("consumo deveria funcionar")
    return result.activation
  }

  it("nasce do binding pós-commit para o par (loja, job) e concede execução externa", async () => {
    const activation = await consumed()
    const capability = pilotEmissionCapability(activation, {
      jobId: INPUT.jobId,
      storeId: INPUT.storeId,
    })
    expect(capability).not.toBeNull()
    expect(capability!.allowExternalProviderExecution).toBe(true)
    expect(capability!.concedidaPor).toContain("homologacao-emissao:v1")
  })

  it("job diferente, loja diferente e objeto forjado não recebem capability", async () => {
    const activation = await consumed()
    expect(pilotEmissionCapability(activation, { jobId: "outro-job", storeId: INPUT.storeId })).toBeNull()
    expect(pilotEmissionCapability(activation, { jobId: INPUT.jobId, storeId: "outra-loja" })).toBeNull()
    const forged = {} as Parameters<typeof pilotEmissionCapability>[0]
    expect(pilotEmissionCapability(forged, { jobId: INPUT.jobId, storeId: INPUT.storeId })).toBeNull()
  })

  it("expira com a janela: capability e authority morrem após expiresAt", async () => {
    const client = ledgerClient()
    let current = NOW
    const clock = () => current
    const result = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, clock)
    if (!result.ok) throw new Error("consumo deveria funcionar")
    expect(pilotEmissionActivationStillActive(result.activation)).toBe(true)
    current = new Date("2026-09-12T12:10:00.000Z") // expiresAt ⇒ janela encerrada
    expect(pilotEmissionActivationStillActive(result.activation)).toBe(false)
    expect(
      pilotEmissionCapability(result.activation, { jobId: INPUT.jobId, storeId: INPUT.storeId }),
    ).toBeNull()
    expect(
      createPilotEmissionExternalAuthority(result.activation, {
        jobId: INPUT.jobId,
        storeId: INPUT.storeId,
      }),
    ).toBeNull()
  })
})

describe("createPilotEmissionExternalAuthority · authority nasce da ativação", () => {
  it("produz authority íntegra vinculada à execução consumida", async () => {
    const client = ledgerClient()
    const result = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, () => NOW)
    if (!result.ok) throw new Error("consumo deveria funcionar")
    const authority = createPilotEmissionExternalAuthority(result.activation, {
      jobId: INPUT.jobId,
      storeId: INPUT.storeId,
    })
    expect(authority).not.toBeNull()
  })

  it("par (loja, job) divergente não produz authority", async () => {
    const client = ledgerClient()
    const result = await consumePilotEmissionActivation(client as never, WINDOW, INPUT, () => NOW)
    if (!result.ok) throw new Error("consumo deveria funcionar")
    expect(
      createPilotEmissionExternalAuthority(result.activation, {
        jobId: "outro-job",
        storeId: INPUT.storeId,
      }),
    ).toBeNull()
    expect(
      createPilotEmissionExternalAuthority(result.activation, {
        jobId: INPUT.jobId,
        storeId: "outra-loja",
      }),
    ).toBeNull()
  })

  it("ativação forjada não produz authority", () => {
    expect(
      createPilotEmissionExternalAuthority({} as never, {
        jobId: INPUT.jobId,
        storeId: INPUT.storeId,
      }),
    ).toBeNull()
  })
})
