/**
 * Contador HUB · Pacote do Contador — correções do GOAL 008C (testes puros, sem banco/ZIP).
 *
 * Cobre os cinco desvios corrigidos antes da readiness do GOAL 008:
 *  C1 — títulos limitados à competência (posição em aberto, regra canônica do GOAL 006);
 *  C2 — paginação real por cursor (não uma única query `take: MAX+1`);
 *  C3 — timeout lógico de duração efetivamente aplicado;
 *  C4 — falha do lookup de produtos marca a fonte `itens` como parcial (códigos vazios);
 *  C5 — venda cancelada FORA dos CSVs detalhados (revisado no GOAL 008D: nem zerada); seu bruto
 *       permanece apenas no agregado informativo (canceladasTotal do GOAL 006).
 *
 * As fontes são injetadas via `PacoteReaderClient`. A paridade de C1 é aferida contra o
 * DTO agregado do GOAL 006 (`montarDados`) derivado da MESMA carga.
 */
import { describe, it, expect, vi } from "vitest"
import { resolvePeriodoUtc } from "@/lib/contador/competencia"
import { montarDados } from "@/lib/contador/readers"
import type { ContadorScopeInterno } from "@/lib/contador/scope-core"
import {
  carregarFontesPacoteComCliente,
  paginarFonte,
  type PacoteReaderClient,
} from "./carregar-fontes"
import { executarComTimeoutLogico, PacoteLimiteExcedidoError, PacoteTimeoutError } from "./seguranca"

const competencia = { ano: 2026, mes: 6 }
const periodo = resolvePeriodoUtc(competencia)
const STORE = "loja-teste-42"
const USER = "user-abc"
const scope = { ok: true, storeId: STORE, userId: USER, permissaoFinanceiro: true } as unknown as ContadorScopeInterno

const J = (d: string) => new Date(`2026-06-${d}T12:00:00.000Z`)

/** Cliente com todas as fontes vazias; cada teste sobrescreve só o que exercita. */
function clienteVazio(overrides: Partial<PacoteReaderClient> = {}): PacoteReaderClient {
  const base: PacoteReaderClient = {
    venda: { findMany: async () => [] },
    produto: { findMany: async () => [] },
    devolucaoVenda: { findMany: async () => [] },
    movimentacaoFinanceira: { findMany: async () => [] },
    contaReceberTitulo: { findMany: async () => [] },
    contaPagarTitulo: { findMany: async () => [] },
    sessaoCaixa: { findMany: async () => [] },
    caixaOperacao: { findMany: async () => [] },
  }
  return { ...base, ...overrides }
}

async function carregar(cliente: PacoteReaderClient) {
  return carregarFontesPacoteComCliente(scope, periodo, competencia, cliente)
}

const somaOriginal = (linhas: readonly { valorOriginal: number }[]) =>
  linhas.reduce((s, l) => s + l.valorOriginal, 0)

/* ═══════════════════════ C1 — títulos limitados à competência ═══════════════════════ */

describe("C1 · títulos: posição em aberto SÓ da competência", () => {
  // Conjunto que cobre ISO, BR, mês anterior/posterior e fechado — SEM inválidos (real).
  const receberReais = [
    { id: "cr-iso", valor: 100, status: "pendente", vencimento: "2026-06-15" }, // ISO, na competência
    { id: "cr-br", valor: 50, status: "pendente", vencimento: "15/06/2026" }, // BR, na competência
    { id: "cr-ant", valor: 999, status: "pendente", vencimento: "2026-05-31" }, // mês anterior → fora
    { id: "cr-post", valor: 888, status: "pendente", vencimento: "2026-07-01" }, // mês posterior → fora
    { id: "cr-pago", valor: 777, status: "pago", vencimento: "2026-06-10" }, // fechado → fora
  ]

  it("aberto na competência (ISO e BR) entra; anterior/posterior/fechado ficam fora sem tornar parcial", async () => {
    const d = await carregar(clienteVazio({ contaReceberTitulo: { findMany: async () => receberReais } }))
    const ids = d.contasReceber.linhas.map((l) => l.tituloId)
    expect(ids).toEqual(["cr-iso", "cr-br"])
    expect(d.contasReceber.registros).toBe(2)
    expect(d.contasReceber.estado).toBe("real") // nenhum inválido ⇒ cobertura completa
    // mês anterior/posterior/fechado não aparecem e não foram "rejeitados"
    for (const fora of ["cr-ant", "cr-post", "cr-pago"]) expect(ids).not.toContain(fora)
  })

  it("aberto com vencimento inválido fica fora e torna a fonte parcial (não vira valor_aberto=0)", async () => {
    const comInvalido = [...receberReais, { id: "cr-inv", valor: 13, status: "pendente", vencimento: "xx/xx" }]
    const d = await carregar(clienteVazio({ contaReceberTitulo: { findMany: async () => comInvalido } }))
    const ids = d.contasReceber.linhas.map((l) => l.tituloId)
    expect(ids).toEqual(["cr-iso", "cr-br"]) // inválido NÃO entra
    expect(ids).not.toContain("cr-inv")
    expect(d.contasReceber.estado).toBe("parcial")
    expect(d.contasReceber.observacao).toContain("1 título(s) aberto(s) sem vencimento reconhecível ficaram fora")
    // nenhum título entrou com valor_aberto = 0 (fechados/ inválidos são descartados, não zerados)
    expect(d.contasReceber.linhas.every((l) => l.valorAberto > 0)).toBe(true)
  })

  it("título fechado no mês não entra — nem como aberto, nem com valor_aberto=0", async () => {
    const d = await carregar(
      clienteVazio({
        contaReceberTitulo: {
          findMany: async () => [{ id: "cr-pago", valor: 500, status: "quitado", vencimento: "2026-06-10" }],
        },
      }),
    )
    expect(d.contasReceber.registros).toBe(0)
    expect(d.contasReceber.linhas).toHaveLength(0)
    expect(d.contasReceber.estado).toBe("real") // fechado não é rejeição nem parcialidade
  })

  it("paridade real: soma e contagem do CSV == titulosReceber/Pagar do agregado GOAL 006", async () => {
    const d = await carregar(
      clienteVazio({
        contaReceberTitulo: { findMany: async () => receberReais },
        contaPagarTitulo: {
          findMany: async () => [
            { id: "cp-1", valor: 40, status: "pendente", vencimento: "2026-06-20" },
            { id: "cp-2", valor: 60, status: "pendente", vencimento: "20/06/2026" },
            { id: "cp-ant", valor: 5, status: "pendente", vencimento: "2026-05-01" },
          ],
        },
      }),
    )
    const dados = montarDados(d.agregado, competencia)

    // Receber: cr-iso(100) + cr-br(50) = 150, qtd 2
    expect(d.contasReceber.registros).toBe(dados.financeiro.titulosReceberQuantidade.valor)
    expect(somaOriginal(d.contasReceber.linhas)).toBe(dados.financeiro.titulosReceberAberto.valor)
    expect(somaOriginal(d.contasReceber.linhas)).toBe(150)

    // Pagar: cp-1(40) + cp-2(60) = 100, qtd 2 (cp-ant é outra competência)
    expect(d.contasPagar.registros).toBe(dados.financeiro.titulosPagarQuantidade.valor)
    expect(somaOriginal(d.contasPagar.linhas)).toBe(dados.financeiro.titulosPagarAberto.valor)
    expect(somaOriginal(d.contasPagar.linhas)).toBe(100)
    expect(d.contasPagar.estado).toBe("real")
  })

  it("fonte de títulos indisponível → estado indisponivel e nenhuma linha", async () => {
    const d = await carregar(
      clienteVazio({
        contaPagarTitulo: {
          findMany: async () => {
            throw new Error("boom")
          },
        },
      }),
    )
    expect(d.contasPagar.estado).toBe("indisponivel")
    expect(d.contasPagar.registros).toBe(0)
    expect(d.contasPagar.linhas).toHaveLength(0)
  })
})

/* ═══════════════════════ C2 — paginação real por cursor ═══════════════════════ */

describe("C2 · paginarFonte percorre páginas por cursor", () => {
  it("coleta todas as linhas atravessando páginas até a última (incompleta)", async () => {
    const dados = Array.from({ length: 7 }, (_, k) => ({ id: `x${k}` }))
    let chamadas = 0
    const out = await paginarFonte({
      nomeFonte: "teste",
      buscarPagina: async (cursor, tamanho) => {
        chamadas += 1
        const inicio = cursor ? dados.findIndex((d) => d.id === cursor) + 1 : 0
        return dados.slice(inicio, inicio + tamanho)
      },
      extrairCursor: (l) => l.id,
      maxRegistros: 100,
      tamanhoPagina: 3,
    })
    expect(out.map((o) => o.id)).toEqual(dados.map((d) => d.id))
    expect(chamadas).toBe(3) // 3 + 3 + 1
  })

  it("lança PacoteLimiteExcedidoError ao detectar a linha maxRegistros + 1 (limite na fonte crua, 008D)", async () => {
    let n = 0
    await expect(
      paginarFonte({
        nomeFonte: "teste",
        buscarPagina: async (_cursor, tamanho) => Array.from({ length: tamanho }, () => ({ id: `y${n++}` })),
        extrairCursor: (l) => l.id,
        maxRegistros: 5,
        tamanhoPagina: 2,
      }),
    ).rejects.toBeInstanceOf(PacoteLimiteExcedidoError)
  })

  it("página vazia inicial → retorna vazio sem segunda chamada", async () => {
    let chamadas = 0
    const out = await paginarFonte<{ id: string }>({
      nomeFonte: "teste",
      buscarPagina: async () => {
        chamadas += 1
        return []
      },
      extrairCursor: (l) => l.id,
      maxRegistros: 100,
      tamanhoPagina: 10,
    })
    expect(out).toHaveLength(0)
    expect(chamadas).toBe(1)
  })

  it("a carga real dispara múltiplas queries de venda (paginação, não consulta única)", async () => {
    const TOTAL = 1001 // > 2 páginas de PAGE_SIZE_PACOTE (500)
    const vendas = Array.from({ length: TOTAL }, (_, k) => ({
      id: `v${String(k).padStart(5, "0")}`,
      pedidoId: `VDA-${k}`,
      total: 10,
      status: "concluida",
      at: J("10"),
      payload: {},
      itens: [],
    }))
    let chamadas = 0
    const cliente = clienteVazio({
      venda: {
        findMany: async (args: Record<string, unknown>) => {
          chamadas += 1
          const cursor = (args.cursor as { id?: string } | undefined)?.id
          const skip = (args.skip as number | undefined) ?? 0
          const take = args.take as number
          const inicio = cursor ? vendas.findIndex((v) => v.id === cursor) + skip : 0
          return vendas.slice(inicio, inicio + take)
        },
      },
    })
    const d = await carregar(cliente)
    expect(d.vendas.registros).toBe(TOTAL)
    expect(chamadas).toBe(3) // 500 + 500 + 1 — prova de paginação real
  })
})

/* ═══════════════════════ C3 — timeout lógico aplicado ═══════════════════════ */

describe("C3 · executarComTimeoutLogico", () => {
  it("resolve normalmente quando a execução termina antes do teto", async () => {
    await expect(executarComTimeoutLogico(async () => 42, 30_000)).resolves.toBe(42)
  })

  it("rejeita com PacoteTimeoutError quando estoura o teto", async () => {
    vi.useFakeTimers()
    try {
      const p = executarComTimeoutLogico<never>(() => new Promise<never>(() => {}), 30_000)
      p.catch(() => {}) // evita unhandledRejection antes do assert
      await vi.advanceTimersByTimeAsync(30_000)
      await expect(p).rejects.toBeInstanceOf(PacoteTimeoutError)
    } finally {
      vi.useRealTimers()
    }
  })

  it("assentamento tardio após o estouro é ignorado (sem dupla liquidação)", async () => {
    vi.useFakeTimers()
    try {
      let resolverInterno: (v: number) => void = () => {}
      const p = executarComTimeoutLogico<number>(() => new Promise<number>((r) => (resolverInterno = r)), 10)
      p.catch(() => {})
      await vi.advanceTimersByTimeAsync(10)
      await expect(p).rejects.toBeInstanceOf(PacoteTimeoutError)
      expect(() => resolverInterno(1)).not.toThrow() // resolve tardio é no-op
    } finally {
      vi.useRealTimers()
    }
  })
})

/* ═══════════════════════ C4 — falha do lookup de produtos ═══════════════════════ */

describe("C4 · lookup de produto", () => {
  const vendaComItem = {
    id: "v1",
    pedidoId: "VDA-1",
    total: 100,
    status: "concluida",
    at: J("10"),
    payload: {},
    itens: [{ id: "i1", inventoryId: "p1", nome: "Produto A", quantidade: 1, precoUnitario: 100, lineTotal: 100 }],
  }

  it("falha do lookup → itens PARCIAL com códigos vazios; vendas permanece real", async () => {
    const d = await carregar(
      clienteVazio({
        venda: { findMany: async () => [vendaComItem] },
        produto: {
          findMany: async () => {
            throw new Error("produto boom")
          },
        },
      }),
    )
    expect(d.itens.estado).toBe("parcial")
    // 008D: mensagem agora quantifica itens e lotes afetados pela falha.
    expect(d.itens.observacao).toContain("Código de produto indisponível para 1 item(ns) devido à falha em 1 lote(s)")
    expect(d.itens.linhas.every((l) => l.produtoCodigo === "")).toBe(true)
    expect(d.vendas.estado).toBe("real") // vendas não é contaminada pela falha do produto
  })

  it("lookup vazio (sucesso sem match) → itens REAL com códigos vazios (não é falha)", async () => {
    const d = await carregar(
      clienteVazio({
        venda: { findMany: async () => [vendaComItem] },
        produto: { findMany: async () => [] }, // sucesso, porém sem correspondência
      }),
    )
    expect(d.itens.estado).toBe("real")
    expect(d.itens.observacao).toBeUndefined()
    expect(d.itens.linhas[0].produtoCodigo).toBe("")
  })
})

/* ═══════════════════════ C5 — venda cancelada fora do faturamento ═══════════════════════ */

describe("C5 · venda cancelada (revisado no 008D — fora dos CSVs detalhados)", () => {
  it("cancelada ausente das linhas de vendas e itens; agregado preserva o bruto informativo", async () => {
    const d = await carregar(
      clienteVazio({
        venda: {
          findMany: async () => [
            {
              id: "v1",
              pedidoId: "VDA-1",
              total: 100,
              status: "concluida",
              at: J("10"),
              payload: { paymentBreakdown: { pix: 100 }, discountTotal: 5 },
              itens: [{ id: "i1", inventoryId: null, nome: "OK", quantidade: 1, precoUnitario: 100, lineTotal: 100 }],
            },
            {
              id: "v2",
              pedidoId: "VDA-2",
              total: 80,
              status: "cancelada",
              at: J("11"),
              payload: { paymentBreakdown: { pix: 80 }, discountTotal: 8 },
              itens: [{ id: "i2", inventoryId: null, nome: "Cancelado", quantidade: 1, precoUnitario: 80, lineTotal: 80 }],
            },
          ],
        },
      }),
    )

    // cancelada NÃO aparece nas linhas detalhadas (nem zerada)
    expect(d.vendas.linhas.map((l) => l.vendaId)).toEqual(["v1"])
    expect(d.vendas.linhas.find((l) => l.vendaId === "v2")).toBeUndefined()
    expect(d.vendas.registros).toBe(1)

    // itens da venda cancelada não entram
    expect(d.itens.linhas.map((l) => l.itemId)).toEqual(["i1"])

    // agregado GOAL 006 preserva o bruto cancelado (informativo em canceladasTotal)
    const dados = montarDados(d.agregado, competencia)
    expect(dados.vendas.canceladasTotal.valor).toBe(80)
    expect(dados.vendas.canceladasQuantidade.valor).toBe(1)
    expect(dados.vendas.total.valor).toBe(100) // faturamento exclui cancelada
  })
})
