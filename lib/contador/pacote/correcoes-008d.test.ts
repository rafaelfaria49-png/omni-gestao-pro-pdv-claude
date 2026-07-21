/**
 * Contador HUB · Pacote do Contador — correções do GOAL 008D (testes puros, sem banco/ZIP).
 *
 * Fecha os quatro bloqueadores da inspeção independente sobre o 008C:
 *  1. LIMITE aplicado às linhas CRUAS (antes da filtragem): MAX+1 sempre lança, mesmo quando
 *     a linha excedente seria filtrada (inválida, de outro mês, título fechado).
 *  2. Contagem REAL de queries: cada página e cada lote de Produto contam — inclusive a página
 *     vazia final e a consulta que falhou.
 *  3. Lookup de Produto em LOTES de PRODUTO_LOOKUP_CHUNK (nenhum `id: { in: [...] }` recebe todos
 *     os ids); falha de um lote é explícita, não contamina vendas nem os demais lotes.
 *  4. Vendas canceladas FORA de vendas.csv/itens.csv; agregado informativo (GOAL 006) preservado.
 *
 * As fontes são injetadas via `PacoteReaderClient`. O máximo por fonte é injetável no cliente
 * (5º parâmetro de `carregarFontesPacoteComCliente`), evitando materializar 50.001 objetos.
 */
import { describe, it, expect } from "vitest"
import { resolvePeriodoUtc } from "@/lib/contador/competencia"
import { montarDados } from "@/lib/contador/readers"
import { montarChecklistFechamento } from "@/lib/contador/fechamento"
import type { ContadorScopeInterno } from "@/lib/contador/scope-core"
import {
  carregarFontesPacoteComCliente,
  PRODUTO_LOOKUP_CHUNK,
  type PacoteReaderClient,
} from "./carregar-fontes"
import { montarConteudoPacote } from "./builder"
import { PacoteLimiteExcedidoError } from "./seguranca"

const competencia = { ano: 2026, mes: 6 }
const periodo = resolvePeriodoUtc(competencia)
const STORE = "loja-teste-42"
const USER = "user-abc"
const scope = { ok: true, storeId: STORE, userId: USER, permissaoContador: true } as unknown as ContadorScopeInterno

const J = (d: string) => new Date(`2026-06-${d}T12:00:00.000Z`)

type ItemLike = {
  id: string
  inventoryId: string | null
  nome: string
  quantidade: number
  precoUnitario: number
  lineTotal: number
}
type VendaLike = {
  id: string
  pedidoId: string
  total: number
  status: string
  at: Date
  payload: unknown
  itens: ItemLike[]
}

const venda = (id: string, extra: Partial<VendaLike> = {}): VendaLike => ({
  id,
  pedidoId: `PED-${id}`,
  total: 10,
  status: "concluida",
  at: J("10"),
  payload: {},
  itens: [],
  ...extra,
})

/** Venda única com N itens de inventoryId distinto (para exercitar o chunking do lookup). */
function vendaComItens(n: number): VendaLike {
  return venda("v1", {
    total: n,
    itens: Array.from({ length: n }, (_, i) => ({
      id: `i${i}`,
      inventoryId: `p${i}`,
      nome: `Prod ${i}`,
      quantidade: 1,
      precoUnitario: 1,
      lineTotal: 1,
    })),
  })
}

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

/** Fonte de vendas que respeita cursor/skip/take — paginação real por id. */
function clienteVendasPaginado(vendas: readonly VendaLike[], onCall?: () => void): PacoteReaderClient["venda"] {
  return {
    findMany: async (args: Record<string, unknown>) => {
      onCall?.()
      const cursor = (args.cursor as { id?: string } | undefined)?.id
      const skip = (args.skip as number | undefined) ?? 0
      const take = args.take as number
      const inicio = cursor ? vendas.findIndex((v) => v.id === cursor) + skip : 0
      return vendas.slice(inicio, inicio + take)
    },
  }
}

/** Produto que ecoa `SKU-<id>`; conta chamadas e pode falhar em um lote escolhido. */
function clienteProduto(opts: { falhaNoLote?: number } = {}) {
  const spy = { chamadas: 0, lotes: [] as number[] }
  const produto: PacoteReaderClient["produto"] = {
    findMany: async (args: Record<string, unknown>) => {
      spy.chamadas += 1
      const ids = (args.where as { id?: { in?: string[] } }).id?.in ?? []
      spy.lotes.push(ids.length)
      if (opts.falhaNoLote && spy.chamadas === opts.falhaNoLote) throw new Error("lote boom")
      return ids.map((id) => ({ id, sku: `SKU-${id}`, barcode: null }))
    },
  }
  return { produto, spy }
}

async function carregar(cliente: PacoteReaderClient, max?: number) {
  return carregarFontesPacoteComCliente(scope, periodo, competencia, cliente, max)
}

/* ═══════════════════ 1 · limite aplicado às linhas CRUAS ═══════════════════ */

describe("008D · limite aplicado às linhas CRUAS (antes da filtragem)", () => {
  const gerarVendas = (n: number, mut?: (i: number, v: VendaLike) => void) =>
    Array.from({ length: n }, (_, i) => {
      const v = venda(`v${String(i).padStart(4, "0")}`)
      mut?.(i, v)
      return v
    })

  it("exatamente MAX linhas cruas → passa (sem truncagem)", async () => {
    const d = await carregar(clienteVazio({ venda: clienteVendasPaginado(gerarVendas(3)) }), 3)
    expect(d.vendas.registros).toBe(3)
  })

  it("MAX + 1 linhas válidas → lança PacoteLimiteExcedidoError", async () => {
    await expect(
      carregar(clienteVazio({ venda: clienteVendasPaginado(gerarVendas(4)) }), 3),
    ).rejects.toBeInstanceOf(PacoteLimiteExcedidoError)
  })

  it("MAX + 1 com uma linha INVÁLIDA → lança (a inválida não burla o teto)", async () => {
    // Uma linha com id vazio seria filtrada (sanitizada) e deixaria 3 — o teto age na fonte crua.
    const vendas = gerarVendas(4, (i, v) => {
      if (i === 1) v.id = ""
    })
    await expect(
      carregar(clienteVazio({ venda: clienteVendasPaginado(vendas) }), 3),
    ).rejects.toBeInstanceOf(PacoteLimiteExcedidoError)
  })

  it("MAX + 1 com título de OUTRO MÊS → lança (o filtrável não burla o teto)", async () => {
    const titulos = [
      { id: "t1", valor: 10, status: "pendente", vencimento: "2026-06-05" },
      { id: "t2", valor: 10, status: "pendente", vencimento: "2026-06-06" },
      { id: "t3", valor: 10, status: "pendente", vencimento: "2026-06-07" },
      { id: "t4", valor: 10, status: "pendente", vencimento: "2026-05-01" }, // outro mês → seria filtrado
    ]
    await expect(
      carregar(clienteVazio({ contaReceberTitulo: { findMany: async () => titulos } }), 3),
    ).rejects.toBeInstanceOf(PacoteLimiteExcedidoError)
  })

  it("MAX + 1 com título FECHADO → lança (o filtrável não burla o teto)", async () => {
    const titulos = [
      { id: "t1", valor: 10, status: "pendente", vencimento: "2026-06-05" },
      { id: "t2", valor: 10, status: "pendente", vencimento: "2026-06-06" },
      { id: "t3", valor: 10, status: "pendente", vencimento: "2026-06-07" },
      { id: "t4", valor: 10, status: "pago", vencimento: "2026-06-08" }, // fechado → seria filtrado
    ]
    await expect(
      carregar(clienteVazio({ contaReceberTitulo: { findMany: async () => titulos } }), 3),
    ).rejects.toBeInstanceOf(PacoteLimiteExcedidoError)
  })
})

/* ═══════════════════ 2 · contagem real de queries ═══════════════════ */

describe("008D · contagem real de queries", () => {
  it("fontes vazias → 7 consultas iniciais", async () => {
    const d = await carregar(clienteVazio())
    expect(d.totalQueries).toBe(7)
  })

  it("500 vendas → 2 páginas de vendas (a página vazia final é contada)", async () => {
    const vendas = Array.from({ length: 500 }, (_, i) => venda(`v${String(i).padStart(4, "0")}`))
    let chamadasVenda = 0
    const d = await carregar(
      clienteVazio({ venda: clienteVendasPaginado(vendas, () => { chamadasVenda += 1 }) }),
    )
    expect(d.vendas.registros).toBe(500)
    expect(chamadasVenda).toBe(2) // página cheia (500) + página vazia final
    expect(d.totalQueries).toBe(8) // 2 (vendas) + 6 (demais fontes)
  })

  it("1.001 vendas → 3 páginas; totalQueries reflete todas as fontes", async () => {
    const vendas = Array.from({ length: 1001 }, (_, i) => venda(`v${String(i).padStart(5, "0")}`))
    let chamadasVenda = 0
    const d = await carregar(
      clienteVazio({ venda: clienteVendasPaginado(vendas, () => { chamadasVenda += 1 }) }),
    )
    expect(d.vendas.registros).toBe(1001)
    expect(chamadasVenda).toBe(3) // 500 + 500 + 1
    expect(d.totalQueries).toBe(9) // 3 (vendas) + 6 (demais)
  })

  it("a consulta que FALHA também é contada", async () => {
    const d = await carregar(
      clienteVazio({ devolucaoVenda: { findMany: async () => { throw new Error("boom") } } }),
    )
    expect(d.devolucoes.estado).toBe("indisponivel")
    expect(d.totalQueries).toBe(7) // devoluções falhou, mas foi disparada e contada
  })
})

/* ═══════════════════ 3 · lookup de Produto em lotes ═══════════════════ */

describe("008D · lookup de Produto em lotes", () => {
  it("zero inventoryIds → nenhuma query de Produto", async () => {
    const { produto, spy } = clienteProduto()
    const d = await carregar(clienteVazio({ venda: clienteVendasPaginado([venda("v1")]), produto }))
    expect(spy.chamadas).toBe(0)
    expect(d.totalQueries).toBe(7) // 1 vendas + 6 demais, sem Produto
  })

  it("IDs duplicados → consulta uma única vez (dedupe)", async () => {
    const itens: ItemLike[] = Array.from({ length: 600 }, (_, i) => ({
      id: `i${i}`,
      inventoryId: "p-unico",
      nome: "x",
      quantidade: 1,
      precoUnitario: 1,
      lineTotal: 1,
    }))
    const { produto, spy } = clienteProduto()
    const d = await carregar(clienteVazio({ venda: clienteVendasPaginado([venda("v1", { itens })]), produto }))
    expect(spy.chamadas).toBe(1)
    expect(spy.lotes).toEqual([1]) // 600 itens, 1 id distinto
    expect(d.itens.linhas.every((l) => l.produtoCodigo === "SKU-p-unico")).toBe(true)
    expect(d.itens.estado).toBe("real")
  })

  it("até 500 IDs → uma query; 501 → duas; 1.200 → três", async () => {
    expect(PRODUTO_LOOKUP_CHUNK).toBe(500)
    for (const [n, esperado] of [
      [500, 1],
      [501, 2],
      [1200, 3],
    ] as const) {
      const { produto, spy } = clienteProduto()
      await carregar(clienteVazio({ venda: clienteVendasPaginado([vendaComItens(n)]), produto }))
      expect(spy.chamadas, `${n} ids → ${esperado} query(s)`).toBe(esperado)
    }
  })

  it("SKU tem prioridade; barcode é fallback quando sku ausente", async () => {
    const v1 = venda("v1", {
      itens: [
        { id: "i0", inventoryId: "p0", nome: "com sku", quantidade: 1, precoUnitario: 1, lineTotal: 1 },
        { id: "i1", inventoryId: "p1", nome: "só barcode", quantidade: 1, precoUnitario: 1, lineTotal: 1 },
      ],
    })
    const produto: PacoteReaderClient["produto"] = {
      findMany: async (args: Record<string, unknown>) => {
        const ids = (args.where as { id?: { in?: string[] } }).id?.in ?? []
        return ids.map((id) =>
          id === "p0" ? { id, sku: "SKU-0", barcode: "BAR-0" } : { id, sku: null, barcode: "BAR-1" },
        )
      },
    }
    const d = await carregar(clienteVazio({ venda: clienteVendasPaginado([v1]), produto }))
    const cod = (itemId: string) => d.itens.linhas.find((l) => l.itemId === itemId)!.produtoCodigo
    expect(cod("i0")).toBe("SKU-0") // sku primeiro
    expect(cod("i1")).toBe("BAR-1") // barcode fallback
  })

  it("2º lote falha: 1º e 3º aproveitados; itens do 2º sem código; fonte parcial com contagem", async () => {
    const { produto, spy } = clienteProduto({ falhaNoLote: 2 })
    const d = await carregar(clienteVazio({ venda: clienteVendasPaginado([vendaComItens(1200)]), produto }))
    expect(spy.chamadas).toBe(3) // três lotes disparados, incluindo o que falhou
    expect(d.itens.estado).toBe("parcial")
    expect(d.itens.observacao).toContain("devido à falha em 1 lote(s)")
    expect(d.itens.observacao).toContain("500 item(ns)") // o 2º lote tem 500 ids
    const cod = (itemId: string) => d.itens.linhas.find((l) => l.itemId === itemId)!.produtoCodigo
    expect(cod("i0")).toBe("SKU-p0") // lote 1 ok
    expect(cod("i1199")).toBe("SKU-p1199") // lote 3 ok
    expect(cod("i500")).toBe("") // lote 2 falhou → sem código
    expect(cod("i999")).toBe("")
    expect(d.totalQueries).toBe(10) // 1 vendas + 3 lotes Produto + 6 demais
  })

  it("ausência legítima de match (lote OK, id sem produto) NÃO torna a fonte parcial", async () => {
    const produto: PacoteReaderClient["produto"] = { findMany: async () => [] } // sucesso, zero matches
    const d = await carregar(clienteVazio({ venda: clienteVendasPaginado([vendaComItens(3)]), produto }))
    expect(d.itens.estado).toBe("real")
    expect(d.itens.observacao).toBeUndefined()
    expect(d.itens.linhas.every((l) => l.produtoCodigo === "")).toBe(true)
  })
})

/* ═══════════════════ 4 · vendas canceladas fora dos CSVs detalhados ═══════════════════ */

describe("008D · vendas canceladas fora dos CSVs detalhados", () => {
  const cliente = () =>
    clienteVazio({
      venda: clienteVendasPaginado([
        venda("v1", {
          pedidoId: "VDA-1",
          total: 100,
          status: "concluida",
          itens: [{ id: "i1", inventoryId: null, nome: "OK", quantidade: 1, precoUnitario: 100, lineTotal: 100 }],
        }),
        venda("v2", {
          pedidoId: "VDA-2",
          total: 80,
          status: "cancelada",
          itens: [{ id: "i2", inventoryId: null, nome: "Cancelado", quantidade: 1, precoUnitario: 80, lineTotal: 80 }],
        }),
      ]),
    })

  it("linhas detalhadas contêm só a concluída; agregado preserva o bruto cancelado", async () => {
    const d = await carregar(cliente())
    expect(d.vendas.linhas.map((l) => l.vendaId)).toEqual(["v1"])
    expect(d.vendas.linhas.find((l) => l.vendaId === "v2")).toBeUndefined()
    expect(d.itens.linhas.map((l) => l.itemId)).toEqual(["i1"])

    const dados = montarDados(d.agregado, competencia)
    expect(dados.vendas.total.valor).toBe(100) // faturamento exclui cancelada
    expect(dados.vendas.canceladasTotal.valor).toBe(80) // informativo preservado
    expect(dados.vendas.canceladasQuantidade.valor).toBe(1)
  })

  it("vendas.csv e itens.csv não trazem ID/número/itens da cancelada", async () => {
    const detalhadas = await carregar(cliente())
    const dados = montarDados(detalhadas.agregado, competencia)
    const agora = new Date("2026-07-18T12:00:00.000Z")
    const checklist = montarChecklistFechamento({ dados, competencia, agora })
    const conteudo = montarConteudoPacote({ detalhadas, dados, checklist, competencia, agora, storeId: STORE, userId: USER })
    const arq = (c: string) => conteudo.arquivos.find((a) => a.caminho === c)!.conteudo

    const vendasCsv = arq("01-VENDAS/vendas.csv")
    expect(vendasCsv).not.toContain("VDA-2") // número da cancelada ausente
    expect(vendasCsv).not.toContain("cancelada")
    expect(vendasCsv).toContain("VDA-1")

    const itensCsv = arq("01-VENDAS/itens.csv")
    expect(itensCsv).not.toContain("i2") // item da cancelada ausente
    expect(itensCsv).toContain("i1")
  })
})
