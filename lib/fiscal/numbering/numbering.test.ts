/**
 * Testes da numeração fiscal por série (GOAL_008).
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
    storeId: "loja-1",
    vendaId: "venda-1",
    modelo: "NFCE",
    ambiente: "HOMOLOGACAO",
    serie: null,
    numero: null,
    serieFiscalId: null,
  }
  const nota = opts.nota === null ? null : { ...notaDefault, ...(opts.nota ?? {}) }
  const serie: NumberingActiveSerie | null =
    opts.serie === undefined ? { id: "serie-1", serie: 1, modelo: "NFCE", ambiente: "HOMOLOGACAO" } : opts.serie

  const ports: FiscalNumberingPorts = {
    getNota: async () => nota,
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
    const out = await allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: "nf-1" }, ports)

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
    const a = await allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: "nf-1" }, ports)
    const b = await allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: "nf-2" }, ports)

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
    const out = await allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.reused).toBe(true)
      expect(out.serie).toBe(2)
      expect(out.numero).toBe(7)
      expect(out.serieFiscalId).toBe("serie-2")
    }
    expect(calls.reserve).toBe(0) // contador NÃO foi tocado
    expect(calls.bind).toBe(0)
    expect(counter.proximoNumero).toBe(50)
  })
})

describe("allocateFiscalNumber — erros e bordas", () => {
  it("sem série ativa → erro claro (serie_inativa), não reserva nem numera", async () => {
    const { ports, calls } = fakePorts({ serie: null })
    const out = await allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe("serie_inativa")
    expect(calls.reserve).toBe(0)
    expect(calls.bind).toBe(0)
  })

  it("nota inexistente → nota_nao_encontrada", async () => {
    const { ports } = fakePorts({ nota: null })
    const out = await allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: "nf-x" }, ports)
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
        allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: `nf-${i}` }, ports),
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
    const out = await allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: "nf-1" }, ports)

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
    const out = await allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe("bind_falhou")
    expect(calls.reserve).toBe(1) // reservou 1× (número 1 queimado)
    expect(counter.proximoNumero).toBe(2)
  })

  it("conflito persistente esgota o retry → conflito_persistente", async () => {
    const { ports, counter, calls } = fakePorts({
      startNumero: 1,
      bind: () => ({ ok: false, conflito: true, mensagem: "colisão" }),
    })
    const out = await allocateFiscalNumber({ storeId: "loja-1", notaFiscalId: "nf-1" }, ports)

    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.errorCode).toBe("conflito_persistente")
    expect(calls.reserve).toBe(3) // maxTentativas padrão = 3
    expect(counter.proximoNumero).toBe(4) // 3 números queimados
  })
})

// ── 2. Adapter Prisma (client injetado) ────────────────────────────────────────────────────

function fakeClient(over: {
  nota?: unknown
  serie?: unknown
  updateResult?: { proximoNumero: number; serie: number }
  notaUpdate?: () => Promise<unknown>
}): NumberingPrismaClient {
  return {
    notaFiscal: {
      findFirst: vi.fn(async () => (over.nota ?? null) as never),
      update: vi.fn(over.notaUpdate ?? (async () => ({}))),
    },
    serieFiscal: {
      findFirst: vi.fn(async () => (over.serie ?? null) as never),
      update: vi.fn(async () => over.updateResult ?? { proximoNumero: 6, serie: 2 }),
    },
  }
}

describe("createPrismaFiscalNumberingPorts (adapter)", () => {
  it("reserveNextNumber devolve proximoNumero - 1 (valor anterior ao incremento)", async () => {
    const ports = createPrismaFiscalNumberingPorts(fakeClient({ updateResult: { proximoNumero: 6, serie: 2 } }))
    const r = await ports.reserveNextNumber({ serieFiscalId: "serie-1" })
    expect(r.numero).toBe(5)
    expect(r.serie).toBe(2)
  })

  it("getNota mapeia série/número ausentes para null", async () => {
    const ports = createPrismaFiscalNumberingPorts(
      fakeClient({
        nota: {
          id: "nf-1",
          storeId: "loja-1",
          vendaId: "venda-1",
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          serie: null,
          numero: null,
          serieFiscalId: null,
        },
      }),
    )
    const nota = await ports.getNota({ storeId: "loja-1", notaFiscalId: "nf-1" })
    expect(nota).toEqual({
      id: "nf-1",
      storeId: "loja-1",
      vendaId: "venda-1",
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serie: null,
      numero: null,
      serieFiscalId: null,
    })
  })

  it("findActiveSerie devolve null quando não há série ativa", async () => {
    const ports = createPrismaFiscalNumberingPorts(fakeClient({ serie: null }))
    const s = await ports.findActiveSerie({ storeId: "loja-1", modelo: "NFCE", ambiente: "HOMOLOGACAO" })
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
    const r1 = await conflito.bindNotaNumero({ notaFiscalId: "nf-1", serieFiscalId: "s", serie: 1, numero: 1 })
    expect(r1).toEqual({ ok: false, conflito: true, mensagem: expect.any(String) })

    const generico = createPrismaFiscalNumberingPorts(
      fakeClient({
        notaUpdate: async () => {
          throw new Error("boom")
        },
      }),
    )
    const r2 = await generico.bindNotaNumero({ notaFiscalId: "nf-1", serieFiscalId: "s", serie: 1, numero: 1 })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.conflito).toBe(false)
  })
})
