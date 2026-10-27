import { describe, expect, it } from "vitest"
import {
  agregarProdutosVendidos,
  LIMITE_MAXIMO,
  parsePeriodoRelatorio,
  type DadosProdutosVendidos,
  type ProdutoCatalogo,
} from "./produtos-vendidos"

function produto(id: string, name: string, extra: Partial<ProdutoCatalogo> = {}): ProdutoCatalogo {
  return { id, name, sku: null, barcode: null, category: null, brand: null, active: true, ...extra }
}

function dados(over: Partial<DadosProdutosVendidos> = {}): DadosProdutosVendidos {
  return {
    grupos: [],
    vendasComDevolucao: [],
    devolucoes: [],
    produtos: [],
    categorias: [],
    vendas: { quantidade: 0, total: 0 },
    canceladas: { quantidade: 0, total: 0 },
    devolucoesSemVenda: { documentos: 0, quantidade: 0, valor: 0 },
    ...over,
  }
}

const PELICULA = produto("p-pel", "Película 3D iPhone 13", { category: "peliculas", sku: "PEL13", barcode: "789000001" })
const CAPA = produto("p-capa", "Capinha Silicone", { category: "Capinhas" })
const CABO = produto("p-cabo", "Cabo USB-C", { category: "" })

describe("agregarProdutosVendidos — ranking bruto", () => {
  it("ordena por quantidade líquida e por receita líquida", () => {
    const d = dados({
      grupos: [
        { inventoryId: "p-pel", nome: "Película 3D iPhone 13", quantidade: 10, receita: 300 },
        { inventoryId: "p-capa", nome: "Capinha Silicone", quantidade: 4, receita: 400 },
      ],
      produtos: [PELICULA, CAPA],
      vendas: { quantidade: 8, total: 700 },
    })
    const porQtd = agregarProdutosVendidos(d)
    expect(porQtd.produtos.map((p) => p.produtoId)).toEqual(["p-pel", "p-capa"])
    expect(porQtd.produtos[0]).toMatchObject({ quantidadeBruta: 10, quantidadeLiquida: 10, receitaLiquida: 300, precoMedio: 30 })
    expect(porQtd.totais).toMatchObject({ quantidadeBruta: 14, quantidadeLiquida: 14, receitaBruta: 700, receitaLiquida: 700 })
    expect(porQtd.produtos[0].participacaoQuantidade).toBeCloseTo(10 / 14)

    const porReceita = agregarProdutosVendidos(d, { ordem: "receita" })
    expect(porReceita.produtos.map((p) => p.produtoId)).toEqual(["p-capa", "p-pel"])
    expect(porReceita.produtos[0].participacaoReceita).toBeCloseTo(400 / 700)
  })

  it("produto repetido em várias linhas/nomes vira UMA linha; nomes legados ficam visíveis", () => {
    const d = dados({
      grupos: [
        { inventoryId: "p-pel", nome: "Película 3D iPhone 13", quantidade: 3, receita: 90 },
        { inventoryId: "p-pel", nome: "PELICULA IPH 13 (antigo)", quantidade: 2, receita: 50 },
        // Linha legada gravada com SKU e outra com código de barras no lugar do id.
        { inventoryId: "PEL13", nome: "Película 3D iPhone 13", quantidade: 1, receita: 30 },
        { inventoryId: "789000001", nome: "Película 3D iPhone 13", quantidade: 1, receita: 30 },
      ],
      produtos: [PELICULA],
    })
    const r = agregarProdutosVendidos(d)
    expect(r.produtos).toHaveLength(1)
    expect(r.produtos[0]).toMatchObject({ chave: "produto:p-pel", quantidadeBruta: 7, receitaBruta: 200, nome: "Película 3D iPhone 13" })
    expect(r.produtos[0].nomesNaVenda).toEqual(["PELICULA IPH 13 (antigo)"])
  })

  it("produto excluído do catálogo mantém o histórico com o nome gravado na venda", () => {
    const r = agregarProdutosVendidos(
      dados({ grupos: [{ inventoryId: "p-removido", nome: "Fone antigo", quantidade: 2, receita: 40 }] }),
    )
    expect(r.produtos[0]).toMatchObject({
      produtoId: null,
      nome: "Fone antigo",
      situacao: "fora_do_catalogo",
      categoriaNome: "Fora do catálogo atual",
      quantidadeBruta: 2,
    })
  })

  it("itens avulsos/serviços/O.S. só entram com incluirNaoCatalogo e agrupam por nome", () => {
    const d = dados({
      grupos: [
        { inventoryId: "p-capa", nome: "Capinha Silicone", quantidade: 1, receita: 50 },
        { inventoryId: "__avulso__a1", nome: "Chaveiro", quantidade: 2, receita: 10 },
        { inventoryId: "__avulso__b2", nome: "chaveiro ", quantidade: 1, receita: 5 },
        { inventoryId: "__servico__s1", nome: "Troca de tela", quantidade: 1, receita: 200 },
        { inventoryId: "__os_servico__os1", nome: "OS-0001", quantidade: 1, receita: 150 },
      ],
      produtos: [CAPA],
    })
    expect(agregarProdutosVendidos(d).produtos.map((p) => p.chave)).toEqual(["produto:p-capa"])
    const todos = agregarProdutosVendidos(d, { incluirNaoCatalogo: true })
    const avulso = todos.produtos.find((p) => p.tipo === "avulso")!
    expect(avulso).toMatchObject({ quantidadeBruta: 3, receitaBruta: 15, categoriaNome: "Itens avulsos", situacao: "sem_catalogo" })
    expect(todos.categorias.map((c) => c.nome).sort()).toEqual(["Capinhas", "Itens avulsos", "Ordens de serviço", "Serviços"])
  })

  it("expõe a diferença entre Σ Venda.total e Σ linhas (desconto geral não rateado)", () => {
    const r = agregarProdutosVendidos(
      dados({
        grupos: [{ inventoryId: "p-capa", nome: "Capinha", quantidade: 2, receita: 100 }],
        produtos: [CAPA],
        vendas: { quantidade: 1, total: 90 },
      }),
    )
    expect(r.diagnostico.ajusteNaoRateado).toBe(-10)
    // A receita do produto continua sendo a das linhas — nada é inventado.
    expect(r.produtos[0].receitaBruta).toBe(100)
  })

  it("canceladas passam só como resumo; não entram no ranking", () => {
    const r = agregarProdutosVendidos(dados({ canceladas: { quantidade: 2, total: 59.9 } }))
    expect(r.canceladas).toEqual({ quantidade: 2, total: 59.9 })
    expect(r.produtos).toEqual([])
    expect(r.totalProdutos).toBe(0)
  })
})

describe("agregarProdutosVendidos — devoluções", () => {
  const base = () =>
    dados({
      grupos: [
        { inventoryId: "p-pel", nome: "Película", quantidade: 10, receita: 300 },
        { inventoryId: "p-capa", nome: "Capinha", quantidade: 2, receita: 100 },
      ],
      produtos: [PELICULA, CAPA],
      vendasComDevolucao: [
        {
          pedidoId: "VDA-1",
          itens: [
            { inventoryId: "p-pel", nome: "Película", quantidade: 3, valor: 90 },
            { inventoryId: "p-capa", nome: "Capinha", quantidade: 1, valor: 50 },
          ],
        },
      ],
    })

  it("desconta devolução parcial da venda de origem (bruto − devolvido)", () => {
    const d = base()
    d.devolucoes = [{ vendaLocalId: "VDA-1", itens: [{ inventoryId: "p-pel", nome: "Película", quantidade: 1, valor: 30 }] }]
    const pel = agregarProdutosVendidos(d).produtos.find((p) => p.produtoId === "p-pel")!
    expect(pel).toMatchObject({ quantidadeBruta: 10, quantidadeDevolvida: 1, quantidadeLiquida: 9, valorDevolvido: 30, receitaLiquida: 270 })
  })

  it("várias devoluções da mesma venda somam e nunca passam do vendido (sem duplicar)", () => {
    const d = base()
    d.devolucoes = [
      { vendaLocalId: "VDA-1", itens: [{ inventoryId: "p-pel", nome: "Película", quantidade: 2, valor: 60 }] },
      { vendaLocalId: "VDA-1", itens: [{ inventoryId: "p-pel", nome: "Película", quantidade: 2, valor: 60 }] },
    ]
    const r = agregarProdutosVendidos(d)
    const pel = r.produtos.find((p) => p.produtoId === "p-pel")!
    expect(pel.quantidadeDevolvida).toBe(3)
    expect(pel.valorDevolvido).toBe(90)
    expect(pel.quantidadeLiquida).toBe(7)
    expect(r.diagnostico.quantidadeDevolvidaDescartada).toBe(1)
  })

  it("devolução de produto que a venda não tinha é descartada", () => {
    const d = base()
    d.devolucoes = [{ vendaLocalId: "VDA-1", itens: [{ inventoryId: "p-cabo", nome: "Cabo", quantidade: 1, valor: 20 }] }]
    const r = agregarProdutosVendidos(d)
    expect(r.totais.quantidadeDevolvida).toBe(0)
    expect(r.diagnostico.quantidadeDevolvidaDescartada).toBe(1)
  })

  it("devolução de venda fora da coorte é ignorada", () => {
    const d = base()
    d.devolucoes = [{ vendaLocalId: "VDA-OUTRA", itens: [{ inventoryId: "p-pel", nome: "Película", quantidade: 1, valor: 30 }] }]
    expect(agregarProdutosVendidos(d).totais.quantidadeDevolvida).toBe(0)
  })

  it("devolução gravada pelo SKU legado casa com o produto vendido pelo id", () => {
    const d = base()
    d.devolucoes = [{ vendaLocalId: "VDA-1", itens: [{ inventoryId: "PEL13", nome: "Película", quantidade: 1, valor: 30 }] }]
    expect(agregarProdutosVendidos(d).produtos.find((p) => p.produtoId === "p-pel")!.quantidadeDevolvida).toBe(1)
  })

  it("devolução integral zera o líquido e o produto continua visível com bruto", () => {
    const d = base()
    d.grupos = [{ inventoryId: "p-capa", nome: "Capinha", quantidade: 1, receita: 50 }]
    d.vendasComDevolucao = [{ pedidoId: "VDA-1", itens: [{ inventoryId: "p-capa", nome: "Capinha", quantidade: 1, valor: 50 }] }]
    d.devolucoes = [{ vendaLocalId: "VDA-1", itens: [{ inventoryId: "p-capa", nome: "Capinha", quantidade: 1, valor: 50 }] }]
    const r = agregarProdutosVendidos(d)
    expect(r.produtos[0]).toMatchObject({ quantidadeBruta: 1, quantidadeLiquida: 0, receitaLiquida: 0 })
    expect(r.totais.receitaLiquida).toBe(0)
  })
})

describe("agregarProdutosVendidos — categorias e filtros", () => {
  const d = dados({
    grupos: [
      { inventoryId: "p-pel", nome: "Película 3D iPhone 13", quantidade: 10, receita: 300 },
      { inventoryId: "p-capa", nome: "Capinha Silicone", quantidade: 4, receita: 200 },
      { inventoryId: "p-cabo", nome: "Cabo USB-C", quantidade: 1, receita: 25 },
    ],
    produtos: [PELICULA, CAPA, CABO, produto("p-capa2", "Capa Carteira", { category: "capinhas " })],
    categorias: [{ slug: "peliculas", nome: "Películas" }],
  })

  it("resume por categoria (nome do cadastro quando a categoria é slug)", () => {
    const r = agregarProdutosVendidos(d)
    expect(r.categorias.map((c) => [c.nome, c.quantidadeLiquida, c.produtos])).toEqual([
      ["Películas", 10, 1],
      ["Capinhas", 4, 1],
      ["Sem categoria", 1, 1],
    ])
  })

  it("produto com o slug e produto com o nome do cadastro caem na MESMA categoria", () => {
    const r = agregarProdutosVendidos(
      dados({
        grupos: [
          { inventoryId: "a", nome: "A", quantidade: 2, receita: 20 },
          { inventoryId: "b", nome: "B", quantidade: 3, receita: 30 },
        ],
        produtos: [produto("a", "A", { category: "acessorios-celular" }), produto("b", "B", { category: "Acessórios Celular" })],
        categorias: [{ slug: "acessorios-celular", nome: "Acessórios Celular" }],
      }),
    )
    expect(r.categorias).toHaveLength(1)
    expect(r.categorias[0]).toMatchObject({ chave: "acessorios-celular", nome: "Acessórios Celular", quantidadeLiquida: 5, produtos: 2 })
    expect(agregarProdutosVendidos(
      dados({
        grupos: [{ inventoryId: "b", nome: "B", quantidade: 3, receita: 30 }],
        produtos: [produto("b", "B", { category: "Acessórios Celular" })],
        categorias: [{ slug: "acessorios-celular", nome: "Acessórios Celular" }],
      }),
      { categoria: "acessorios-celular" },
    ).totalProdutos).toBe(1)
  })

  it("filtro de categoria restringe ranking/totais mas mantém o resumo completo", () => {
    const r = agregarProdutosVendidos(d, { categoria: "capinhas" })
    expect(r.produtos.map((p) => p.produtoId)).toEqual(["p-capa"])
    expect(r.totais.quantidadeLiquida).toBe(4)
    expect(r.categorias).toHaveLength(3)
  })

  it("busca ignora acento/caixa e casa SKU e código de barras", () => {
    expect(agregarProdutosVendidos(d, { busca: "PELICULA" }).produtos.map((p) => p.produtoId)).toEqual(["p-pel"])
    expect(agregarProdutosVendidos(d, { busca: "pel13" }).produtos.map((p) => p.produtoId)).toEqual(["p-pel"])
    expect(agregarProdutosVendidos(d, { busca: "789000001" }).produtos.map((p) => p.produtoId)).toEqual(["p-pel"])
    expect(agregarProdutosVendidos(d, { busca: "nada disso" }).totalProdutos).toBe(0)
  })

  it("limite corta a lista mas totalProdutos conta tudo", () => {
    const r = agregarProdutosVendidos(d, { limite: 1 })
    expect(r.produtos).toHaveLength(1)
    expect(r.totalProdutos).toBe(3)
    expect(agregarProdutosVendidos(d, { limite: 10_000 }).produtos).toHaveLength(3)
    expect(LIMITE_MAXIMO).toBe(500)
  })
})

describe("agregarProdutosVendidos — alto volume", () => {
  it("20 mil grupos e 5 mil vendas com devolução em tempo aceitável e somas exatas", () => {
    const produtos: ProdutoCatalogo[] = []
    const grupos: DadosProdutosVendidos["grupos"] = []
    for (let i = 0; i < 2000; i++) {
      produtos.push(produto(`p${i}`, `Produto ${i}`, { category: `cat${i % 12}` }))
      // 10 nomes gravados diferentes por produto → 20 mil grupos (inventoryId, nome).
      for (let n = 0; n < 10; n++) grupos.push({ inventoryId: `p${i}`, nome: `Produto ${i} v${n}`, quantidade: 3, receita: 30 })
    }
    const vendasComDevolucao = []
    const devolucoes = []
    for (let v = 0; v < 5000; v++) {
      const id = `p${v % 2000}`
      vendasComDevolucao.push({ pedidoId: `V${v}`, itens: [{ inventoryId: id, nome: "x", quantidade: 2, valor: 20 }] })
      devolucoes.push({ vendaLocalId: `V${v}`, itens: [{ inventoryId: id, nome: "x", quantidade: 1, valor: 10 }] })
    }
    const t0 = performance.now()
    const r = agregarProdutosVendidos(dados({ grupos, produtos, vendasComDevolucao, devolucoes }), { limite: LIMITE_MAXIMO })
    const ms = performance.now() - t0
    expect(r.totalProdutos).toBe(2000)
    expect(r.produtos).toHaveLength(LIMITE_MAXIMO)
    expect(r.totais.quantidadeBruta).toBe(60_000)
    expect(r.totais.quantidadeDevolvida).toBe(5000)
    expect(r.totais.quantidadeLiquida).toBe(55_000)
    expect(r.totais.receitaLiquida).toBe(600_000 - 50_000)
    expect(r.categorias).toHaveLength(12)
    expect(ms).toBeLessThan(3000)
  })
})

describe("parsePeriodoRelatorio", () => {
  it("exige from/to válidos, ordenados e até 366 dias", () => {
    expect(parsePeriodoRelatorio(null, "2026-10-01T00:00:00Z").ok).toBe(false)
    expect(parsePeriodoRelatorio("x", "2026-10-01T00:00:00Z").ok).toBe(false)
    expect(parsePeriodoRelatorio("2026-10-02T00:00:00Z", "2026-10-01T00:00:00Z").ok).toBe(false)
    expect(parsePeriodoRelatorio("2024-01-01T00:00:00Z", "2026-01-01T00:00:00Z").ok).toBe(false)
    const ok = parsePeriodoRelatorio("2026-10-01T03:00:00.000Z", "2026-10-02T02:59:59.999Z")
    expect(ok.ok && ok.periodo.inicio.toISOString()).toBe("2026-10-01T03:00:00.000Z")
  })
})
