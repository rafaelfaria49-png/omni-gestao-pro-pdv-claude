/**
 * Contador HUB · testes do serviço `getOrCreateCompetencia`. GOAL 009.
 *
 * Unitários com cliente Prisma em memória (mock) — NUNCA tocam banco real.
 * Cobrem: validação, criação + evento único, idempotência, concorrência (P2002
 * relacionado engolido / não relacionado repropagado / erro não-P2002 repropagado).
 *
 * A verificação FÍSICA das constraints (unique real, FK, cross-loja no Postgres)
 * fica pendente de banco descartável — declarada como ressalva do Gate SQL.
 */
import { describe, it, expect } from "vitest"
import {
  getOrCreateCompetencia,
  CompetenciaInvalidaError,
  EVENTO_COMPETENCIA_CRIADA,
  ATOR_SISTEMA_TIPO,
  ATOR_SISTEMA_ID,
  ORIGEM_SERVICE,
  type CompetenciaDbClient,
  type CompetenciaPersistida,
} from "@/lib/contador/db/competencia"

/* ───────────────────────── helpers ───────────────────────── */

function linhaComp(over: Partial<CompetenciaPersistida> & { id: string; storeId: string; ano: number; mes: number }): CompetenciaPersistida {
  const now = new Date("2026-06-01T00:00:00Z")
  return { status: "aberta", versao: 1, createdAt: now, updatedAt: now, ...over }
}

function p2002(target: string[]) {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target } })
}

type EventoRegistrado = {
  storeId: string
  competenciaId: string
  tipo: string
  atorTipo: string
  atorId: string
  origem: string
  metadata: Record<string, unknown>
}

/**
 * Mock Prisma em memória com unique `(storeId, ano, mes)`, `$transaction` de
 * callback SERIALIZADO (isolamento) e rollback por snapshot profundo. O mesmo
 * objeto `client` é passado ao callback do `$transaction` — overrides valem
 * dentro e fora da transação.
 */
function criarMockClient() {
  const competencias: CompetenciaPersistida[] = []
  const eventos: EventoRegistrado[] = []
  let seq = 0
  let cadeiaTx: Promise<unknown> = Promise.resolve()

  const acharIndex = (c: { storeId: string; ano: number; mes: number }) =>
    competencias.findIndex((x) => x.storeId === c.storeId && x.ano === c.ano && x.mes === c.mes)

  const client: CompetenciaDbClient = {
    contadorCompetencia: {
      findUnique: async ({ where }) => {
        const i = acharIndex(where.storeId_ano_mes)
        return i >= 0 ? { ...competencias[i] } : null
      },
      create: async ({ data }) => {
        if (acharIndex(data) >= 0) throw p2002(["storeId", "ano", "mes"])
        const row = linhaComp({ id: `comp_${++seq}`, storeId: data.storeId, ano: data.ano, mes: data.mes })
        competencias.push(row)
        return { ...row }
      },
    },
    contadorEvento: {
      create: async ({ data }) => {
        eventos.push({
          storeId: data.storeId,
          competenciaId: data.competenciaId,
          tipo: data.tipo,
          atorTipo: data.atorTipo,
          atorId: data.atorId,
          origem: data.origem,
          metadata: data.metadata,
        })
        return { id: `evt_${++seq}` }
      },
    },
    // Serializado + rollback por snapshot: modela isolamento de transação e unique no commit.
    $transaction: (fn) => {
      const executar = async () => {
        const snapComp = competencias.slice()
        const snapEvt = eventos.slice()
        try {
          return await fn(client)
        } catch (e) {
          competencias.splice(0, competencias.length, ...snapComp)
          eventos.splice(0, eventos.length, ...snapEvt)
          throw e
        }
      }
      const resultado = cadeiaTx.then(executar, executar)
      cadeiaTx = resultado.then(
        () => undefined,
        () => undefined,
      )
      return resultado
    },
  }

  return { client, competencias, eventos }
}

/* ──────────────────────────────── validação ──────────────────────────────── */

describe("getOrCreateCompetencia · validação", () => {
  it("rejeita storeId vazio/branco sem tocar o banco", async () => {
    const { client, competencias } = criarMockClient()
    await expect(getOrCreateCompetencia("", { ano: 2026, mes: 6 }, { client })).rejects.toBeInstanceOf(
      CompetenciaInvalidaError,
    )
    await expect(getOrCreateCompetencia("   ", { ano: 2026, mes: 6 }, { client })).rejects.toBeInstanceOf(
      CompetenciaInvalidaError,
    )
    expect(competencias).toHaveLength(0)
  })

  it("rejeita mês 0 e mês 13", async () => {
    const { client, competencias } = criarMockClient()
    await expect(getOrCreateCompetencia("loja-1", { ano: 2026, mes: 0 }, { client })).rejects.toBeInstanceOf(
      CompetenciaInvalidaError,
    )
    await expect(getOrCreateCompetencia("loja-1", { ano: 2026, mes: 13 }, { client })).rejects.toBeInstanceOf(
      CompetenciaInvalidaError,
    )
    expect(competencias).toHaveLength(0)
  })

  it("rejeita mês não inteiro", async () => {
    const { client } = criarMockClient()
    await expect(getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6.5 }, { client })).rejects.toBeInstanceOf(
      CompetenciaInvalidaError,
    )
  })

  it("rejeita ano fora da faixa operacional e não inteiro", async () => {
    const { client, competencias } = criarMockClient()
    await expect(getOrCreateCompetencia("loja-1", { ano: 1999, mes: 6 }, { client })).rejects.toBeInstanceOf(
      CompetenciaInvalidaError,
    )
    await expect(getOrCreateCompetencia("loja-1", { ano: 2101, mes: 6 }, { client })).rejects.toBeInstanceOf(
      CompetenciaInvalidaError,
    )
    await expect(getOrCreateCompetencia("loja-1", { ano: 2026.4, mes: 6 }, { client })).rejects.toBeInstanceOf(
      CompetenciaInvalidaError,
    )
    expect(competencias).toHaveLength(0)
  })
})

/* ──────────────────────────────── criação ──────────────────────────────── */

describe("getOrCreateCompetencia · criação", () => {
  it("cria competência aberta versão 1 com storeId/ano/mês corretos", async () => {
    const { client, competencias } = criarMockClient()
    const r = await getOrCreateCompetencia("loja-2", { ano: 2026, mes: 7 }, { client })

    expect(r.criada).toBe(true)
    expect(r.competencia.storeId).toBe("loja-2")
    expect(r.competencia.ano).toBe(2026)
    expect(r.competencia.mes).toBe(7)
    expect(r.competencia.status).toBe("aberta")
    expect(r.competencia.versao).toBe(1)
    expect(competencias).toHaveLength(1)
  })

  it("emite exatamente um evento `competencia_criada` com ator técnico e metadata saneada", async () => {
    const { client, eventos } = criarMockClient()
    await getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6 }, { client })

    expect(eventos).toHaveLength(1)
    const evt = eventos[0]
    expect(evt.tipo).toBe(EVENTO_COMPETENCIA_CRIADA)
    expect(evt.atorTipo).toBe(ATOR_SISTEMA_TIPO)
    expect(evt.atorId).toBe(ATOR_SISTEMA_ID)
    expect(evt.origem).toBe(ORIGEM_SERVICE)
    expect(evt.competenciaId).toBeTruthy()
    expect(evt.storeId).toBe("loja-1")
    // metadata contém APENAS ano/mês — sem PII, sem payload bruto.
    expect(evt.metadata).toEqual({ ano: 2026, mes: 6 })
    expect(Object.keys(evt.metadata).sort()).toEqual(["ano", "mes"])
  })

  it("lojas distintas no mesmo mês são independentes", async () => {
    const { client, competencias, eventos } = criarMockClient()
    await getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6 }, { client })
    await getOrCreateCompetencia("loja-2", { ano: 2026, mes: 6 }, { client })
    expect(competencias).toHaveLength(2)
    expect(eventos).toHaveLength(2)
  })
})

/* ─────────────────────────────── idempotência ─────────────────────────────── */

describe("getOrCreateCompetencia · idempotência", () => {
  it("segunda chamada retorna a existente sem novo evento nem nova linha", async () => {
    const { client, competencias, eventos } = criarMockClient()
    const primeira = await getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6 }, { client })
    const segunda = await getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6 }, { client })

    expect(primeira.criada).toBe(true)
    expect(segunda.criada).toBe(false)
    expect(segunda.competencia.id).toBe(primeira.competencia.id)
    expect(competencias).toHaveLength(1)
    expect(eventos).toHaveLength(1)
  })
})

/* ─────────────────────────────── concorrência ─────────────────────────────── */

describe("getOrCreateCompetencia · concorrência", () => {
  it("duas chamadas concorrentes produzem uma única competência e um único evento", async () => {
    const { client, competencias, eventos } = criarMockClient()

    const [a, b] = await Promise.all([
      getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6 }, { client }),
      getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6 }, { client }),
    ])

    expect(competencias).toHaveLength(1)
    expect(eventos).toHaveLength(1)
    expect(a.competencia.id).toBe(b.competencia.id)
    // Exatamente uma das chamadas reporta criação.
    expect([a.criada, b.criada].filter(Boolean)).toHaveLength(1)
  })

  it("P2002 da unique de competência: perdedor da corrida resolve para a existente, sem novo evento", async () => {
    const eventos: string[] = []
    // Vencedora comita entre nosso findUnique (null) e nosso create (P2002).
    const vencedora = linhaComp({ id: "comp_win", storeId: "loja-1", ano: 2026, mes: 6 })
    let venceuComitou = false

    const client: CompetenciaDbClient = {
      contadorCompetencia: {
        findUnique: async () => (venceuComitou ? { ...vencedora } : null),
        create: async () => {
          venceuComitou = true
          throw p2002(["storeId", "ano", "mes"])
        },
      },
      contadorEvento: {
        create: async () => {
          eventos.push("evt")
          return { id: "evt" }
        },
      },
      $transaction: async (fn) => fn(client),
    }

    const r = await getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6 }, { client })
    expect(r.criada).toBe(false)
    expect(r.competencia.id).toBe("comp_win")
    // create lançou antes do evento — perdedor nunca emite evento.
    expect(eventos).toHaveLength(0)
  })

  it("P2002 de constraint NÃO relacionada é repropagado ao chamador", async () => {
    const client: CompetenciaDbClient = {
      contadorCompetencia: {
        findUnique: async () => null,
        create: async () => {
          throw p2002(["alguma_outra_constraint"])
        },
      },
      contadorEvento: { create: async () => ({ id: "x" }) },
      $transaction: async (fn) => fn(client),
    }
    await expect(
      getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6 }, { client }),
    ).rejects.toMatchObject({ code: "P2002" })
  })

  it("erro não-P2002 na criação é repropagado (não silenciado)", async () => {
    const client: CompetenciaDbClient = {
      contadorCompetencia: {
        findUnique: async () => null,
        create: async () => {
          throw Object.assign(new Error("db down"), { code: "P1001" })
        },
      },
      contadorEvento: { create: async () => ({ id: "x" }) },
      $transaction: async (fn) => fn(client),
    }
    await expect(
      getOrCreateCompetencia("loja-1", { ano: 2026, mes: 6 }, { client }),
    ).rejects.toMatchObject({ code: "P1001" })
  })
})
