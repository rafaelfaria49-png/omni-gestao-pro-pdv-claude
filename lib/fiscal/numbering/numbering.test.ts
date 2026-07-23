/**
 * Testes da numeração fiscal por série (GOAL_010).
 *
 * Duas camadas:
 *  1. Orquestrador PURO (`allocateFiscalNumber`) com PORTAS FALSAS: primeiro número,
 *     incremento, idempotência, série inativa, concorrência simulada, não-reutilização
 *     (conflito → retry), conflito persistente, nota inexistente.
 *  2. Adapter Prisma (`createPrismaFiscalNumberingPorts`) com client INJETADO: matemática
 *     da reserva (proximoNumero - 1), mapeamento da nota e sinalização de conflito (P2002).
 */
import { describe, it, expect, vi } from "vitest"

// `@/lib/prisma` é apenas importado pelo adapter; mockamos para não instanciar o client real.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { allocateFiscalNumber } from "./allocate-fiscal-number"
import { createPrismaFiscalNumberingPorts, type NumberingPrismaClient } from "./prisma-numbering-ports"
import type {
  FiscalNumberingPorts,
  NumberingActiveSerie,
  NumberingBindResult,
  NumberingNota,
} from "./numbering.types"

// ── Portas falsas (contador em memória) ──────────────────────────────────────────────────

type FakeOpts = {
  nota?: Partial<NumberingNota> | null // null = não encontrada
  serie?: NumberingActiveSerie | null // undefined = série ativa padrão; null = inexistente
  startNumero?: number // valor inicial de proximoNumero
  bind?: (numero: number, tentativa: number) => NumberingBindResult
}

function fakePorts(opts: FakeOpts = {}) {
  const counter = { proximoNumero: opts.startNumero ?? 1 }
  const calls = { reserve: 0, bind: 0, reservedNumeros: [] as number[], boundNumeros: [] as number[] }

  const notaDefault: NumberingNota = {
    id: "nf-1",
    storeId: "store-matriz-fixture",
    vendaId: "venda-1",
    modelo: "NFCE",
    ambiente: "HOMOLOGACAO",
    serie: null,
    numero: null,
    serieFiscalId: null,
    localKey: "nfce:store-matriz-fixture:venda-1",
  }
  const nota = opts.nota === null ? null : { ...notaDefault, ...(opts.nota ?? {}) }
  const notaTemIdExplicito = opts.nota != null && Object.prototype.hasOwnProperty.call(opts.nota, "id")
  const serie: NumberingActiveSerie | null =
    opts.serie === undefined ? { id: "serie-1", serie: 1, modelo: "NFCE", ambiente: "HOMOLOGACAO" } : opts.serie

  const ports: FiscalNumberingPorts = {
    getNota: async ({ notaFiscalId }) =>
      nota && !notaTemIdExplicito ? { ...nota, id: notaFiscalId } : nota,
    findActiveSerie: async () => serie,
    reserveNextNumber: async () => {
      // Incremento ATÔMICO (síncrono: captura + avança antes de qualquer await).
      calls.reserve += 1
      const numero = counter.proximoNumero
      counter.proximoNumero += 1
      calls.reservedNumeros.push(numero)
      await Promise.resolve() // simula I/O após a reserva
      return { serieFiscalId: serie!.id, serie: serie!.serie, numero }
    },
    bindNotaNumero: async ({ numero }) => {
      calls.bind += 1
      const res: NumberingBindResult = opts.bind ? opts.bind(numero, calls.bind) : { ok: true }
      if (res.ok) calls.boundNumeros.push(numero)
      return res
    },
  }

  return { ports, counter, calls }
}

// ── 1. Orquestrador puro ──────────────────────────────────────────────────────────────────

describe("allocateFiscalNumber — alocação", () => {
  it("aloca o primeiro número e avança proximoNumero", async () => {
    const { ports, counter, calls } = fakePorts({ startNumero: 1 })
    const out = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.reused).toBe(false)
      expect(out.serie).toBe(1)
      expect(out.numero).toBe(1)
      expect(out.modelo).toBe("NFCE")
      expect(out.ambiente).toBe("HOMOLOGACAO")
    }
    expect(counter.proximoNumero).toBe(2) // contador avançou
    expect(calls.reservedNumeros).toEqual([1])
  })

  it("incrementa proximoNumero a cada alocação (números sequenciais, sem repetir)", async () => {
    const { ports, counter, calls } = fakePorts({ startNumero: 1 })
    const a = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-1" }, ports)
    const b = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-2" }, ports)

    expect(a.ok && a.numero).toBe(1)
    expect(b.ok && b.numero).toBe(2)
    expect(counter.proximoNumero).toBe(3)
    expect(calls.reservedNumeros).toEqual([1, 2])
  })

  it("é idempotente: nota já numerada devolve o número existente sem tocar o contador", async () => {
    const { ports, counter, calls } = fakePorts({
      nota: { serie: 2, numero: 7, serieFiscalId: "serie-2" },
      startNumero: 50,
    })
    const out = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.reused).toBe(true)
      expect(out.serie).toBe(2)
      expect(out.numero).toBe(7)
      expect(out.serieFiscalId).toBe("serie-2")
      expect(out.modelo).toBe("NFCE")
      expect(out.ambiente).toBe("HOMOLOGACAO")
      expect(out.localKey).toBe("nfce:store-matriz-fixture:venda-1")
    }
    expect(calls.reserve).toBe(0) // contador NÃO foi tocado
    expect(calls.bind).toBe(0)
    expect(counter.proximoNumero).toBe(50)
  })
})

describe("allocateFiscalNumber — erros e bordas", () => {
  it("série inexistente → erro claro, não reserva nem numera", async () => {
    const { ports, calls } = fakePorts({ serie: null })
    const out = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe("serie_nao_encontrada")
    expect(calls.reserve).toBe(0)
    expect(calls.bind).toBe(0)
  })

  it("nota inexistente → nota_nao_encontrada", async () => {
    const { ports } = fakePorts({ nota: null })
    const out = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-x" }, ports)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe("nota_nao_encontrada")
  })

  it("parâmetros vazios → parametros_invalidos", async () => {
    const { ports } = fakePorts()
    const out = await allocateFiscalNumber({ storeId: "", notaFiscalId: "" }, ports)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe("parametros_invalidos")
  })
})

describe("allocateFiscalNumber — concorrência e não-reutilização", () => {
  it("concorrência simulada: alocações paralelas recebem números distintos (sem repetir)", async () => {
    const { ports, counter, calls } = fakePorts({ startNumero: 1 })
    const N = 5
    const resultados = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: `nf-${i}` }, ports),
      ),
    )

    const numeros = resultados.map((r) => (r.ok ? r.numero : -1))
    expect(new Set(numeros).size).toBe(N) // todos distintos
    expect([...numeros].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
    expect(counter.proximoNumero).toBe(N + 1)
    expect(new Set(calls.boundNumeros).size).toBe(N)
  })

  it("conflito de gravação → retry controlado e o número conflitante NÃO é reutilizado", async () => {
    // 1ª tentativa: nº 1 conflita (queimado); 2ª tentativa: nº 2 grava OK.
    const { ports, counter, calls } = fakePorts({
      startNumero: 1,
      bind: (_numero, tentativa) =>
        tentativa === 1 ? { ok: false, conflito: true, mensagem: "colisão" } : { ok: true },
    })
    const out = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(true)
    if (out.ok) expect(out.numero).toBe(2) // nº 1 queimado, não reutilizado
    expect(calls.reservedNumeros).toEqual([1, 2])
    expect(calls.boundNumeros).toEqual([2])
    expect(counter.proximoNumero).toBe(3) // avançou 2× (1 queimado + 1 usado)
  })

  it("falha não-conflito após reservar → bind_falhou (número queimado, não reutilizado)", async () => {
    const { ports, counter, calls } = fakePorts({
      startNumero: 1,
      bind: () => ({ ok: false, conflito: false, mensagem: "erro de gravação" }),
    })
    const out = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.errorCode).toBe("bind_falhou")
      expect(out.lacunas).toEqual([
        expect.objectContaining({
          numero: 1,
          motivo: "bind_falhou",
          requerInutilizacao: true,
          localKey: "nfce:store-matriz-fixture:venda-1",
        }),
      ])
    }
    expect(calls.reserve).toBe(1) // reservou 1× (número 1 queimado)
    expect(counter.proximoNumero).toBe(2)
  })

  it("conflito persistente esgota o retry → conflito_persistente", async () => {
    const { ports, counter, calls } = fakePorts({
      startNumero: 1,
      bind: () => ({ ok: false, conflito: true, mensagem: "colisão" }),
    })
    const out = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe("conflito_persistente")
    expect(calls.reserve).toBe(3) // maxTentativas padrão = 3
    expect(counter.proximoNumero).toBe(4) // 3 números queimados
  })

  it("nota devolvida fora da loja solicitada falha sem tocar o contador", async () => {
    const { ports, calls } = fakePorts({ nota: { storeId: "store-outra" } })
    const out = await allocateFiscalNumber({ storeId: "store-matriz-fixture", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe("nota_nao_encontrada")
    expect(calls.reserve).toBe(0)
    expect(calls.bind).toBe(0)
  })
})

// ── Estado concorrente em memória, chaveado como o schema real ──────────────────────────

type StatefulSerie = {
  id: string
  storeId: string
  modelo: string
  ambiente: string
  serie: number
  ativo: boolean
  proximoNumero: number
}

function statefulPorts(input: {
  notas: NumberingNota[]
  series: StatefulSerie[]
  numerosUsados?: Array<{ storeId: string; modelo: string; ambiente: string; serie: number; numero: number }>
  failNextBind?: boolean
}) {
  const notas = new Map(input.notas.map((nota) => [nota.id, { ...nota }]))
  const series = new Map(input.series.map((serie) => [serie.id, { ...serie }]))
  const usados = new Set(
    (input.numerosUsados ?? []).map(
      (n) => `${n.storeId}|${n.modelo}|${n.serie}|${n.ambiente}|${n.numero}`,
    ),
  )
  let failNextBind = input.failNextBind ?? false
  const calls = { reserve: 0, bind: 0 }

  const ports: FiscalNumberingPorts = {
    getNota: async ({ storeId, notaFiscalId }) => {
      const nota = notas.get(notaFiscalId)
      return nota?.storeId === storeId ? { ...nota } : null
    },
    findActiveSerie: async ({ storeId, modelo, ambiente, serie, serieFiscalId }) => {
      const found = serieFiscalId
        ? series.get(serieFiscalId)
        : [...series.values()]
            .filter(
              (candidate) =>
                candidate.storeId === storeId &&
                candidate.modelo === modelo &&
                candidate.ambiente === ambiente &&
                (serie == null || candidate.serie === serie),
            )
            .sort((a, b) => a.serie - b.serie)[0]
      return found ? { ...found } : null
    },
    reserveNextNumber: async ({ serieFiscalId, storeId, modelo, ambiente, serie }) => {
      calls.reserve += 1
      const current = series.get(serieFiscalId)
      if (
        !current ||
        current.storeId !== storeId ||
        current.modelo !== modelo ||
        current.ambiente !== ambiente ||
        current.serie !== serie ||
        !current.ativo
      ) {
        return { ok: false, errorCode: "reserva_falhou", mensagem: "contexto inválido" }
      }
      if (current.proximoNumero < 1) {
        return { ok: false, errorCode: "sequencia_invalida", mensagem: "sequência inválida" }
      }
      if (current.proximoNumero > 999_999_999) {
        return { ok: false, errorCode: "sequencia_esgotada", mensagem: "sequência esgotada" }
      }
      const numero = current.proximoNumero
      current.proximoNumero += 1
      await Promise.resolve()
      return { serieFiscalId, serie, numero }
    },
    bindNotaNumero: async ({ notaFiscalId, storeId, modelo, ambiente, serieFiscalId, serie, numero }) => {
      calls.bind += 1
      await Promise.resolve()
      const nota = notas.get(notaFiscalId)
      if (
        !nota ||
        nota.storeId !== storeId ||
        nota.modelo !== modelo ||
        nota.ambiente !== ambiente
      ) {
        return { ok: false, conflito: false, motivo: "falha", mensagem: "nota fora do contexto" }
      }
      if (nota.numero != null) {
        return {
          ok: false,
          conflito: false,
          motivo: "nota_ja_numerada",
          mensagem: "CAS perdido",
        }
      }
      if (failNextBind) {
        failNextBind = false
        return { ok: false, conflito: false, motivo: "falha", mensagem: "falha após reserva" }
      }
      const key = `${storeId}|${modelo}|${serie}|${ambiente}|${numero}`
      if (usados.has(key)) {
        return { ok: false, conflito: true, motivo: "numero_em_uso", mensagem: "número em uso" }
      }
      nota.serieFiscalId = serieFiscalId
      nota.serie = serie
      nota.numero = numero
      usados.add(key)
      return { ok: true }
    },
  }

  return { ports, notas, series, usados, calls }
}

function notaState(id: string, storeId: string, ambiente = "HOMOLOGACAO"): NumberingNota {
  return {
    id,
    storeId,
    vendaId: `venda-${id}`,
    modelo: "NFCE",
    ambiente,
    serie: null,
    numero: null,
    serieFiscalId: null,
    localKey: `nfce:${storeId}:${id}`,
  }
}

function serieState(
  id: string,
  storeId: string,
  ambiente = "HOMOLOGACAO",
  proximoNumero = 1,
): StatefulSerie {
  return {
    id,
    storeId,
    modelo: "NFCE",
    ambiente,
    serie: 1,
    ativo: true,
    proximoNumero,
  }
}

describe("allocateFiscalNumber — isolamento e validação estrita", () => {
  it("série inativa falha antes do incremento", async () => {
    const { ports, calls } = fakePorts({
      serie: {
        id: "serie-inativa",
        storeId: "store-matriz-fixture",
        serie: 1,
        modelo: "NFCE",
        ambiente: "HOMOLOGACAO",
        ativo: false,
        proximoNumero: 1,
      },
    })
    const out = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-1" },
      ports,
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe("serie_inativa")
    expect(calls.reserve).toBe(0)
  })

  it.each([
    [
      "série de outra loja",
      { storeId: "store-filial-fixture", modelo: "NFCE", ambiente: "HOMOLOGACAO" },
      "serie_outra_loja",
    ],
    [
      "modelo incompatível",
      { storeId: "store-matriz-fixture", modelo: "NFE", ambiente: "HOMOLOGACAO" },
      "modelo_incompativel",
    ],
    [
      "ambiente incompatível",
      { storeId: "store-matriz-fixture", modelo: "NFCE", ambiente: "PRODUCAO" },
      "ambiente_incompativel",
    ],
  ] as const)("%s falha antes da reserva", async (_nome, override, errorCode) => {
    const { ports, calls } = fakePorts({
      serie: {
        id: "serie-contexto",
        serie: 1,
        ativo: true,
        proximoNumero: 1,
        ...override,
      },
    })
    const out = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-1" },
      ports,
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe(errorCode)
    expect(calls.reserve).toBe(0)
  })

  it.each([
    ["zero", 0, "sequencia_invalida"],
    ["negativo", -1, "sequencia_invalida"],
    ["overflow", 1_000_000_000, "sequencia_esgotada"],
  ] as const)("bloqueia contador %s antes do incremento", async (_nome, proximoNumero, errorCode) => {
    const { ports, calls } = fakePorts({
      serie: {
        id: "serie-limite",
        storeId: "store-matriz-fixture",
        serie: 1,
        modelo: "NFCE",
        ambiente: "HOMOLOGACAO",
        ativo: true,
        proximoNumero,
      },
    })
    const out = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-1" },
      ports,
    )
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe(errorCode)
    expect(calls.reserve).toBe(0)
  })

  it("isola contadores de duas lojas", async () => {
    const state = statefulPorts({
      notas: [notaState("nf-matriz", "store-matriz-fixture"), notaState("nf-filial", "store-filial-fixture")],
      series: [
        serieState("serie-matriz", "store-matriz-fixture"),
        serieState("serie-filial", "store-filial-fixture"),
      ],
    })
    const [matriz, filial] = await Promise.all([
      allocateFiscalNumber(
        { storeId: "store-matriz-fixture", notaFiscalId: "nf-matriz" },
        state.ports,
      ),
      allocateFiscalNumber(
        { storeId: "store-filial-fixture", notaFiscalId: "nf-filial" },
        state.ports,
      ),
    ])
    expect(matriz.ok && matriz.numero).toBe(1)
    expect(filial.ok && filial.numero).toBe(1)
    expect(state.series.get("serie-matriz")?.proximoNumero).toBe(2)
    expect(state.series.get("serie-filial")?.proximoNumero).toBe(2)
  })

  it("isola homologação e produção sem ativar emissão", async () => {
    const state = statefulPorts({
      notas: [
        notaState("nf-hom", "store-matriz-fixture", "HOMOLOGACAO"),
        notaState("nf-prod", "store-matriz-fixture", "PRODUCAO"),
      ],
      series: [
        serieState("serie-hom", "store-matriz-fixture", "HOMOLOGACAO"),
        serieState("serie-prod", "store-matriz-fixture", "PRODUCAO"),
      ],
    })
    const hom = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-hom" },
      state.ports,
    )
    const prod = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-prod" },
      state.ports,
    )
    expect(hom.ok && hom.numero).toBe(1)
    expect(prod.ok && prod.numero).toBe(1)
    expect(state.series.get("serie-hom")?.proximoNumero).toBe(2)
    expect(state.series.get("serie-prod")?.proximoNumero).toBe(2)
  })
})

describe("allocateFiscalNumber — CAS, retries e lacunas", () => {
  it("chamadas paralelas da mesma nota convergem para exatamente o mesmo número", async () => {
    const state = statefulPorts({
      notas: [notaState("nf-unica", "store-matriz-fixture")],
      series: [serieState("serie-matriz", "store-matriz-fixture")],
    })
    const resultados = await Promise.all(
      Array.from({ length: 8 }, () =>
        allocateFiscalNumber(
          { storeId: "store-matriz-fixture", notaFiscalId: "nf-unica" },
          state.ports,
        ),
      ),
    )
    expect(resultados.every((result) => result.ok && result.numero === 1)).toBe(true)
    expect(state.notas.get("nf-unica")?.numero).toBe(1)
    expect(state.series.get("serie-matriz")?.proximoNumero).toBe(9)
    expect(
      resultados.flatMap((result) => (result.ok ? result.lacunas : [])).map((gap) => gap.numero).sort((a, b) => a - b),
    ).toEqual([2, 3, 4, 5, 6, 7, 8])
  })

  it("retry de número já usado consome o conflito e usa o próximo", async () => {
    const state = statefulPorts({
      notas: [notaState("nf-retry", "store-matriz-fixture")],
      series: [serieState("serie-matriz", "store-matriz-fixture")],
      numerosUsados: [
        {
          storeId: "store-matriz-fixture",
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          serie: 1,
          numero: 1,
        },
      ],
    })
    const out = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-retry", maxTentativas: 3 },
      state.ports,
    )
    expect(out.ok && out.numero).toBe(2)
    expect(state.series.get("serie-matriz")?.proximoNumero).toBe(3)
  })

  it("retry transitório da reserva é limitado e bem-sucedido", async () => {
    const state = statefulPorts({
      notas: [notaState("nf-reserva", "store-matriz-fixture")],
      series: [serieState("serie-matriz", "store-matriz-fixture")],
    })
    const reserve = state.ports.reserveNextNumber
    let attempts = 0
    state.ports.reserveNextNumber = async (input) => {
      attempts += 1
      if (attempts === 1) {
        return {
          ok: false,
          errorCode: "reserva_conflito",
          mensagem: "serialization conflict",
          retryable: true,
        }
      }
      return reserve(input)
    }
    const out = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-reserva", maxTentativas: 2 },
      state.ports,
    )
    expect(out.ok && out.numero).toBe(1)
    expect(attempts).toBe(2)
  })

  it("falha após alocação registra lacuna e o próximo número nunca reutiliza a reserva", async () => {
    const state = statefulPorts({
      notas: [
        notaState("nf-falha", "store-matriz-fixture"),
        notaState("nf-seguinte", "store-matriz-fixture"),
      ],
      series: [serieState("serie-matriz", "store-matriz-fixture")],
      failNextBind: true,
    })
    const failed = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-falha" },
      state.ports,
    )
    expect(failed.ok).toBe(false)
    if (!failed.ok) {
      expect(failed.errorCode).toBe("bind_falhou")
      expect(failed.lacunas).toEqual([
        expect.objectContaining({
          numero: 1,
          requerInutilizacao: true,
          motivo: "bind_falhou",
        }),
      ])
    }

    const next = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-seguinte" },
      state.ports,
    )
    expect(next.ok && next.numero).toBe(2)
    expect(state.series.get("serie-matriz")?.proximoNumero).toBe(3)
  })

  it("aloca 999.999.999 uma vez e depois mantém a série esgotada", async () => {
    const state = statefulPorts({
      notas: [
        notaState("nf-max", "store-matriz-fixture"),
        notaState("nf-overflow", "store-matriz-fixture"),
      ],
      series: [serieState("serie-matriz", "store-matriz-fixture", "HOMOLOGACAO", 999_999_999)],
    })
    const max = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-max" },
      state.ports,
    )
    expect(max.ok && max.numero).toBe(999_999_999)

    const overflow = await allocateFiscalNumber(
      { storeId: "store-matriz-fixture", notaFiscalId: "nf-overflow" },
      state.ports,
    )
    expect(overflow.ok).toBe(false)
    if (!overflow.ok) expect(overflow.errorCode).toBe("sequencia_esgotada")
    expect(state.series.get("serie-matriz")?.proximoNumero).toBe(1_000_000_000)
  })
})

// ── 2. Adapter Prisma (client injetado) ────────────────────────────────────────────────────

function fakeClient(over: {
  nota?: unknown
  serie?: unknown
  updateResult?: Partial<{
    id: string
    storeId: string
    proximoNumero: number
    serie: number
    modelo: string
    ambiente: string
    ativo: boolean
  }>
  notaUpdate?: () => Promise<unknown>
}): NumberingPrismaClient {
  const updateResult = {
    id: "serie-1",
    storeId: "store-matriz-fixture",
    proximoNumero: 6,
    serie: 2,
    modelo: "NFCE",
    ambiente: "HOMOLOGACAO",
    ativo: true,
    ...(over.updateResult ?? {}),
  }
  return {
    notaFiscal: {
      findFirst: vi.fn(async () => (over.nota ?? null) as never),
      update: vi.fn(over.notaUpdate ?? (async () => ({}))),
    },
    serieFiscal: {
      findFirst: vi.fn(async () => (over.serie ?? null) as never),
      update: vi.fn(async () => updateResult),
    },
  }
}

describe("createPrismaFiscalNumberingPorts (adapter)", () => {
  it("reserveNextNumber devolve proximoNumero - 1 (valor anterior ao incremento)", async () => {
    const client = fakeClient({ updateResult: { proximoNumero: 6, serie: 2 } })
    const ports = createPrismaFiscalNumberingPorts(client)
    const r = await ports.reserveNextNumber({
      serieFiscalId: "serie-1",
      storeId: "store-matriz-fixture",
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serie: 2,
    })
    expect("ok" in r).toBe(false)
    if ("ok" in r) throw new Error("reserva inesperadamente falhou")
    expect(r.numero).toBe(5)
    expect(r.serie).toBe(2)
    expect(client.serieFiscal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "serie-1",
          storeId: "store-matriz-fixture",
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          serie: 2,
          ativo: true,
          proximoNumero: { gte: 1, lte: 999_999_999 },
        }),
      }),
    )
  })

  it("getNota mapeia série/número ausentes para null", async () => {
    const ports = createPrismaFiscalNumberingPorts(
      fakeClient({
        nota: {
          id: "nf-1",
          storeId: "store-matriz-fixture",
          vendaId: "venda-1",
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          serie: null,
          numero: null,
          serieFiscalId: null,
          localKey: "nfce:store-matriz-fixture:venda-1",
        },
      }),
    )
    const nota = await ports.getNota({ storeId: "store-matriz-fixture", notaFiscalId: "nf-1" })
    expect(nota).toEqual({
      id: "nf-1",
      storeId: "store-matriz-fixture",
      vendaId: "venda-1",
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serie: null,
      numero: null,
      serieFiscalId: null,
      localKey: "nfce:store-matriz-fixture:venda-1",
    })
  })

  it("findActiveSerie devolve null quando não há série ativa", async () => {
    const ports = createPrismaFiscalNumberingPorts(fakeClient({ serie: null }))
    const s = await ports.findActiveSerie({
      storeId: "store-matriz-fixture",
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
    })
    expect(s).toBeNull()
  })

  it("bindNotaNumero: P2002 vira conflito (retry); erro genérico vira não-conflito", async () => {
    const conflito = createPrismaFiscalNumberingPorts(
      fakeClient({
        notaUpdate: async () => {
          throw Object.assign(new Error("dup"), { code: "P2002" })
        },
      }),
    )
    const bindInput = {
      notaFiscalId: "nf-1",
      storeId: "store-matriz-fixture",
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serieFiscalId: "s",
      serie: 1,
      numero: 1,
    }
    const r1 = await conflito.bindNotaNumero(bindInput)
    expect(r1).toEqual({
      ok: false,
      conflito: true,
      motivo: "numero_em_uso",
      mensagem: expect.any(String),
    })

    const generico = createPrismaFiscalNumberingPorts(
      fakeClient({
        notaUpdate: async () => {
          throw new Error("boom")
        },
      }),
    )
    const r2 = await generico.bindNotaNumero(bindInput)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.conflito).toBe(false)
  })

  it("bindNotaNumero usa compare-and-swap e classifica P2025 como nota já numerada", async () => {
    const client = fakeClient({
      notaUpdate: async () => {
        throw Object.assign(new Error("cas miss"), { code: "P2025" })
      },
    })
    const ports = createPrismaFiscalNumberingPorts(client)
    const result = await ports.bindNotaNumero({
      notaFiscalId: "nf-1",
      storeId: "store-matriz-fixture",
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serieFiscalId: "serie-1",
      serie: 1,
      numero: 9,
    })
    expect(result).toEqual({
      ok: false,
      conflito: false,
      motivo: "nota_ja_numerada",
      mensagem: expect.any(String),
    })
    expect(client.notaFiscal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "nf-1",
          storeId: "store-matriz-fixture",
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          vigente: true,
          numero: null,
        }),
      }),
    )
  })
})
