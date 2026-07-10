import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolverCadeia } from "./orquestrador"
import { MemoLookup, proximaMeiaNoiteSaoPaulo } from "./memo"
import type { FabricaProvedorResult, ProvedorId, ProvedorLookup, ResultadoLookup } from "./types"

/**
 * Testes do orquestrador da cadeia de lookup (GOAL 004A).
 * Nenhuma chamada externa real: provedores são mocks via fábrica injetada.
 */

function fakeProvedor(id: ProvedorId, resultado: ResultadoLookup): ProvedorLookup & { chamadas: number } {
  let chamadas = 0
  return {
    id,
    async consultar(_gtin: string, _signal: AbortSignal): Promise<ResultadoLookup> {
      chamadas += 1
      return resultado
    },
    get chamadas() {
      return chamadas
    },
  }
}

/** Fábrica que mapeia ids a provedores fake pré-construídos. */
function fabricaMock(mapa: Partial<Record<ProvedorId, ProvedorLookup & { chamadas: number }>>) {
  return (id: ProvedorId): FabricaProvedorResult => {
    const p = mapa[id]
    if (!p) return { erro: `Provedor ${id} não configurado no mock.` }
    return p
  }
}

const GTIN_VALIDO = "7891000053508"

describe("resolverCadeia", () => {
  let memo: MemoLookup

  beforeEach(() => {
    memo = new MemoLookup()
  })

  it("respeita a ordem dos provedores", async () => {
    const ordemChamadas: ProvedorId[] = []
    const cosmos = fakeProvedor("cosmos", { status: "nao_encontrado" })
    const upc = fakeProvedor("upcitemdb", { status: "nao_encontrado" })
    const factory = (id: ProvedorId): FabricaProvedorResult => {
      ordemChamadas.push(id)
      if (id === "cosmos") return cosmos
      if (id === "upcitemdb") return upc
      return { erro: "x" }
    }
    await resolverCadeia(GTIN_VALIDO, { ordem: ["cosmos", "upcitemdb"], criarProvedor: factory, memo })
    expect(ordemChamadas).toEqual(["cosmos", "upcitemdb"])
  })

  it("primeiro encontrado encerra a cadeia (não chama provedores seguintes)", async () => {
    const cosmos = fakeProvedor("cosmos", { status: "encontrado", dados: { nome: "Produto A" } })
    const upc = fakeProvedor("upcitemdb", { status: "encontrado", dados: { nome: "Produto B" } })
    const res = await resolverCadeia(GTIN_VALIDO, {
      ordem: ["cosmos", "upcitemdb"],
      criarProvedor: fabricaMock({ cosmos, upcitemdb: upc }),
      memo,
    })
    expect(res.status).toBe("encontrado")
    if (res.status === "encontrado") {
      expect(res.provedor).toBe("cosmos")
      expect(res.dados.nome).toBe("Produto A")
    }
    expect(upc.chamadas).toBe(0)
  })

  it("limite_excedido gera memo e skipa provedor esgotado na próxima chamada", async () => {
    const cosmos = fakeProvedor("cosmos", { status: "limite_excedido" })
    const upc = fakeProvedor("upcitemdb", { status: "encontrado", dados: { nome: "Fallback" } })
    // 1ª chamada: cosmos esgota, upcitemdb responde.
    const res1 = await resolverCadeia(GTIN_VALIDO, {
      ordem: ["cosmos", "upcitemdb"],
      criarProvedor: fabricaMock({ cosmos, upcitemdb: upc }),
      memo,
    })
    expect(res1.status).toBe("encontrado")
    expect(cosmos.chamadas).toBe(1)
    // Memo marcou cosmos como esgotado.
    expect(memo.esgotadoAte("cosmos")).not.toBeNull()

    // 2ª chamada com outro GTIN: cosmos deve ser skipado (sem chamar consultar).
    const cosmosChamadasAntes = cosmos.chamadas
    const res2 = await resolverCadeia("7890000000017", {
      ordem: ["cosmos", "upcitemdb"],
      criarProvedor: fabricaMock({ cosmos, upcitemdb: upc }),
      memo,
    })
    expect(cosmos.chamadas).toBe(cosmosChamadasAntes) // não chamou cosmos de novo
    expect(res2.status).toBe("encontrado")
    // A tentativa de cosmos registra limite_excedido (skip do memo).
    if (res2.status === "encontrado") {
      const t0 = res2.tentativas[0]
      expect(t0.provedor).toBe("cosmos")
      expect(t0.status).toBe("limite_excedido")
    }
  })

  it("trace de tentativas é correto e em ordem", async () => {
    const cosmos = fakeProvedor("cosmos", { status: "nao_encontrado" })
    const upc = fakeProvedor("upcitemdb", { status: "erro", tipo: "timeout" })
    const res = await resolverCadeia(GTIN_VALIDO, {
      ordem: ["cosmos", "upcitemdb"],
      criarProvedor: fabricaMock({ cosmos, upcitemdb: upc }),
      memo,
    })
    expect(res.status).toBe("nao_encontrado")
    if (res.status === "nao_encontrado") {
      expect(res.tentativas).toHaveLength(2)
      expect(res.tentativas[0]).toMatchObject({ provedor: "cosmos", status: "nao_encontrado" })
      expect(res.tentativas[1]).toMatchObject({ provedor: "upcitemdb", status: "erro" })
      expect(typeof res.tentativas[0].em).toBe("string")
    }
  })

  it("chave ausente gera erro de configuração, não crash", async () => {
    const factory = (id: ProvedorId): FabricaProvedorResult => {
      if (id === "cosmos") return { erro: "COSMOS_API_KEY não configurada." }
      return { erro: `Provedor ${id} não configurado.` }
    }
    const res = await resolverCadeia(GTIN_VALIDO, { ordem: ["cosmos"], criarProvedor: factory, memo })
    expect(res.status).toBe("erro_config")
    if (res.status === "erro_config") {
      expect(res.mensagem).toContain("COSMOS_API_KEY")
    }
  })

  it("mesmo GTIN no mesmo dia reaproveita memo (não chama provedor de novo)", async () => {
    const cosmos = fakeProvedor("cosmos", { status: "encontrado", dados: { nome: "Cache" } })
    const factory = fabricaMock({ cosmos })
    const res1 = await resolverCadeia(GTIN_VALIDO, { ordem: ["cosmos"], criarProvedor: factory, memo })
    expect(res1.status).toBe("encontrado")
    expect(cosmos.chamadas).toBe(1)

    // 2ª chamada mesmo GTIN: deve vir do memo, sem chamar o provedor.
    const res2 = await resolverCadeia(GTIN_VALIDO, { ordem: ["cosmos"], criarProvedor: factory, memo })
    expect(res2.status).toBe("encontrado")
    expect(cosmos.chamadas).toBe(1) // não chamou novamente
  })

  it("todos os provedores em erro de runtime => status erro", async () => {
    const cosmos = fakeProvedor("cosmos", { status: "erro", tipo: "timeout" })
    const res = await resolverCadeia(GTIN_VALIDO, {
      ordem: ["cosmos"],
      criarProvedor: fabricaMock({ cosmos }),
      memo,
    })
    expect(res.status).toBe("erro")
  })

  it("todos os provedores em limite => status limite_excedido", async () => {
    const cosmos = fakeProvedor("cosmos", { status: "limite_excedido" })
    const res = await resolverCadeia(GTIN_VALIDO, {
      ordem: ["cosmos"],
      criarProvedor: fabricaMock({ cosmos }),
      memo,
    })
    expect(res.status).toBe("limite_excedido")
    if (res.status === "limite_excedido") {
      expect(res.resetEm).toBeInstanceOf(Date)
    }
  })

  it("aplica timeout por provedor via AbortController (aborta chamada pendente)", async () => {
    // Provedor que nunca resolve; o timeout do orquestrador aborta.
    const provedorLento: ProvedorLookup = {
      id: "cosmos",
      async consultar(_gtin, signal) {
        return new Promise<ResultadoLookup>((resolve) => {
          signal.addEventListener("abort", () => resolve({ status: "erro", tipo: "timeout" }), { once: true })
        })
      },
    }
    const res = await resolverCadeia(GTIN_VALIDO, {
      ordem: ["cosmos"],
      criarProvedor: () => provedorLento,
      memo,
      timeoutMs: 50,
    })
    expect(res.status).toBe("erro")
  })
})

describe("proximaMeiaNoiteSaoPaulo", () => {
  it("retorna um instante futuro", () => {
    const agora = new Date("2026-07-09T20:00:00Z") // 17:00 SP
    const prox = proximaMeiaNoiteSaoPaulo(agora)
    expect(prox.getTime()).toBeGreaterThan(agora.getTime())
    // Meia-noite SP = 03:00 UTC do dia seguinte.
    expect(prox.toISOString()).toBe("2026-07-10T03:00:00.000Z")
  })

  it("SP é UTC-3 fixo (sem DST)", () => {
    const agora = new Date("2026-01-15T22:00:00Z") // 19:00 SP verão
    const prox = proximaMeiaNoiteSaoPaulo(agora)
    expect(prox.toISOString()).toBe("2026-01-16T03:00:00.000Z")
  })
})
