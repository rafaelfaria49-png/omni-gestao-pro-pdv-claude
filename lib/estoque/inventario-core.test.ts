/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 1. Testes do núcleo PURO (inventario-core.ts).
 *
 * Funções puras sobre dados simples — sem Prisma, sem rede. Cobre: bipagem (novo/incremento/
 * reconciliação/erro), diferença, e classificação do relatório (encontrados, divergências,
 * fila de reconciliação, não contados, "zerado no inventário", produto deletado via snapshot).
 */
import { describe, expect, it } from "vitest"
import {
  STATUS_CONTAGEM,
  MODO_CONTAGEM,
  assertStoreId,
  normalizarCodigo,
  normalizarModoContagem,
  sanitizarQuantidadeContagem,
  aplicarModoContagem,
  aplicarBipe,
  diferencaContagem,
  resumirContagens,
  montarRelatorioInventario,
  type ContagemLinha,
  type LinhaContagemResumo,
  type ProdutoEstoque,
} from "./inventario-core"

const prod = (over: Partial<ProdutoEstoque> & { id: string }): ProdutoEstoque => ({
  nome: `Produto ${over.id}`,
  sku: null,
  barcode: null,
  stock: 0,
  ...over,
})

describe("assertStoreId / normalizarCodigo", () => {
  it("rejeita storeId vazio (sem fallback de loja)", () => {
    expect(() => assertStoreId("  ")).toThrow(/storeId obrigat/i)
    expect(assertStoreId(" loja-2 ")).toBe("loja-2")
  })

  it("normaliza código com espaços", () => {
    expect(normalizarCodigo("  789  ")).toBe("789")
    expect(normalizarCodigo(null)).toBe("")
  })
})

describe("aplicarBipe", () => {
  it("primeiro bipe de produto conhecido → encontrado + snapshot do estoque", () => {
    const r = aplicarBipe(null, { codigoBipado: "789", produto: prod({ id: "p1", nome: "Capinha", stock: 15 }) })
    expect(r.novaLinha).toBe(true)
    expect(r.linha.status).toBe(STATUS_CONTAGEM.ENCONTRADO)
    expect(r.linha.produtoId).toBe("p1")
    expect(r.linha.quantidadeContada).toBe(1)
    expect(r.linha.estoqueSistemaSnapshot).toBe(15)
    expect(r.linha.produtoNomeSnapshot).toBe("Capinha")
  })

  it("primeiro bipe de código sem cadastro → fila de reconciliação", () => {
    const r = aplicarBipe(null, { codigoBipado: "0001", produto: null })
    expect(r.novaLinha).toBe(true)
    expect(r.linha.status).toBe(STATUS_CONTAGEM.RECONCILIACAO)
    expect(r.linha.produtoId).toBeNull()
    expect(r.linha.estoqueSistemaSnapshot).toBeNull()
    expect(r.linha.quantidadeContada).toBe(1)
  })

  it("segundo bipe incrementa a linha existente (não duplica)", () => {
    const existente: ContagemLinha = {
      produtoId: "p1",
      codigoBipado: "789",
      quantidadeContada: 1,
      estoqueSistemaSnapshot: 15,
      status: STATUS_CONTAGEM.ENCONTRADO,
    }
    const r = aplicarBipe(existente, { codigoBipado: "789", produto: prod({ id: "p1", stock: 99 }) })
    expect(r.novaLinha).toBe(false)
    expect(r.linha.quantidadeContada).toBe(2)
    // Snapshot do 1º bipe é preservado (não re-fotografa o estoque).
    expect(r.linha.estoqueSistemaSnapshot).toBe(15)
  })

  it("incremento customizado é respeitado; default = 1; valores inválidos caem para 1", () => {
    expect(aplicarBipe(null, { codigoBipado: "1", produto: null, incremento: 5 }).linha.quantidadeContada).toBe(5)
    expect(aplicarBipe(null, { codigoBipado: "1", produto: null, incremento: 0 }).linha.quantidadeContada).toBe(1)
    expect(aplicarBipe(null, { codigoBipado: "1", produto: null, incremento: -3 }).linha.quantidadeContada).toBe(1)
  })

  it("código vazio lança", () => {
    expect(() => aplicarBipe(null, { codigoBipado: "   ", produto: null })).toThrow(/vazio/i)
  })
})

describe("diferencaContagem", () => {
  it("contado − sistema (sobra positiva / falta negativa)", () => {
    expect(diferencaContagem(12, 15)).toBe(-3)
    expect(diferencaContagem(20, 15)).toBe(5)
    expect(diferencaContagem(15, 15)).toBe(0)
  })
})

describe("contagem por quantidade (substituir × somar)", () => {
  it("normalizarModoContagem: só 'somar' vira somar; o resto cai em substituir (default seguro)", () => {
    expect(normalizarModoContagem("somar")).toBe(MODO_CONTAGEM.SOMAR)
    expect(normalizarModoContagem("substituir")).toBe(MODO_CONTAGEM.SUBSTITUIR)
    expect(normalizarModoContagem("qualquer")).toBe(MODO_CONTAGEM.SUBSTITUIR)
    expect(normalizarModoContagem(null)).toBe(MODO_CONTAGEM.SUBSTITUIR)
  })

  it("sanitizarQuantidadeContagem: inteiro >= 0; inválidos/negativos viram 0", () => {
    expect(sanitizarQuantidadeContagem(13)).toBe(13)
    expect(sanitizarQuantidadeContagem(13.9)).toBe(13)
    expect(sanitizarQuantidadeContagem(0)).toBe(0)
    expect(sanitizarQuantidadeContagem(-4)).toBe(0)
    expect(sanitizarQuantidadeContagem(Number.NaN)).toBe(0)
    expect(sanitizarQuantidadeContagem(null)).toBe(0)
  })

  it("substituir: a quantidade vira o total contado (ignora o já contado)", () => {
    expect(aplicarModoContagem(MODO_CONTAGEM.SUBSTITUIR, 0, 13)).toBe(13)
    expect(aplicarModoContagem(MODO_CONTAGEM.SUBSTITUIR, 99, 13)).toBe(13)
  })

  it("somar: a quantidade soma ao já contado (10 + 5 = 15)", () => {
    expect(aplicarModoContagem(MODO_CONTAGEM.SOMAR, 10, 5)).toBe(15)
    expect(aplicarModoContagem(MODO_CONTAGEM.SOMAR, 0, 5)).toBe(5)
  })

  it("nunca negativo; quantidades inválidas não baixam o já contado em somar", () => {
    expect(aplicarModoContagem(MODO_CONTAGEM.SOMAR, 10, -3)).toBe(10) // -3 sanitiza p/ 0
    expect(aplicarModoContagem(MODO_CONTAGEM.SUBSTITUIR, 10, -3)).toBe(0)
  })
})

describe("resumirContagens (observabilidade da sessão)", () => {
  const linha = (over: Partial<LinhaContagemResumo>): LinhaContagemResumo => ({
    produtoId: "p1",
    codigoBipado: "789",
    produtoNome: "Produto",
    quantidadeContada: 1,
    diferenca: 0,
    status: STATUS_CONTAGEM.ENCONTRADO,
    ultimoBipeEm: "2026-06-20T10:00:00.000Z",
    ...over,
  })

  it("lista vazia → zeros e nulls", () => {
    const r = resumirContagens([])
    expect(r).toEqual({
      produtosContados: 0,
      unidadesContadas: 0,
      reconciliacao: 0,
      divergencias: 0,
      ultimoProduto: null,
      ultimoBipeEm: null,
    })
  })

  it("conta distintos, unidades, reconciliação e divergências", () => {
    const r = resumirContagens([
      linha({ produtoId: "p1", quantidadeContada: 10, diferenca: 0 }),
      linha({ produtoId: "p2", quantidadeContada: 5, diferenca: -3 }), // divergência
      linha({ produtoId: null, codigoBipado: "9999", produtoNome: null, quantidadeContada: 2, diferenca: null, status: STATUS_CONTAGEM.RECONCILIACAO }),
    ])
    expect(r.produtosContados).toBe(2)
    expect(r.unidadesContadas).toBe(17)
    expect(r.reconciliacao).toBe(1)
    expect(r.divergencias).toBe(1)
  })

  it("não conta o mesmo produtoId duas vezes em 'distintos'", () => {
    const r = resumirContagens([
      linha({ produtoId: "p1", codigoBipado: "barras", quantidadeContada: 3 }),
      linha({ produtoId: "p1", codigoBipado: "sku", quantidadeContada: 2 }),
    ])
    expect(r.produtosContados).toBe(1)
    expect(r.unidadesContadas).toBe(5)
  })

  it("último = maior ultimoBipeEm (independe da ordem da lista)", () => {
    const r = resumirContagens([
      linha({ produtoId: "p1", produtoNome: "Antigo", ultimoBipeEm: "2026-06-20T10:00:00.000Z" }),
      linha({ produtoId: "p2", produtoNome: "Recente", ultimoBipeEm: "2026-06-22T18:30:00.000Z" }),
      linha({ produtoId: "p3", produtoNome: "Meio", ultimoBipeEm: "2026-06-21T09:00:00.000Z" }),
    ])
    expect(r.ultimoProduto).toBe("Recente")
    expect(r.ultimoBipeEm).toBe("2026-06-22T18:30:00.000Z")
  })

  it("reconciliação sem nome usa o código como 'último produto'", () => {
    const r = resumirContagens([
      linha({ produtoId: null, codigoBipado: "SEM-NOME", produtoNome: null, status: STATUS_CONTAGEM.RECONCILIACAO, ultimoBipeEm: "2026-06-23T08:00:00.000Z" }),
    ])
    expect(r.ultimoProduto).toBe("SEM-NOME")
  })
})

describe("montarRelatorioInventario", () => {
  const produtosLoja: ProdutoEstoque[] = [
    prod({ id: "p1", nome: "Capinha A10", sku: "A10", stock: 15 }),
    prod({ id: "p2", nome: "Película", sku: "PEL", stock: 12 }),
    prod({ id: "p3", nome: "Carregador", sku: "CRG", stock: 20 }), // nunca bipado, tem saldo
    prod({ id: "p4", nome: "Brinde", sku: "BR", stock: 0 }), // nunca bipado, sem saldo
  ]

  const contagens: ContagemLinha[] = [
    // p1 contado igual ao sistema → encontrado, sem divergência
    { produtoId: "p1", codigoBipado: "A10", quantidadeContada: 15, estoqueSistemaSnapshot: 15, status: STATUS_CONTAGEM.ENCONTRADO },
    // p2 contado a menos → divergência
    { produtoId: "p2", codigoBipado: "PEL", quantidadeContada: 9, estoqueSistemaSnapshot: 12, status: STATUS_CONTAGEM.ENCONTRADO },
    // código desconhecido → reconciliação
    { produtoId: null, codigoBipado: "9999", quantidadeContada: 3, estoqueSistemaSnapshot: null, status: STATUS_CONTAGEM.RECONCILIACAO },
  ]

  const rel = montarRelatorioInventario({ contagens, produtosLoja })

  it("A) encontrados inclui todos os resolvidos", () => {
    expect(rel.totais.encontrados).toBe(2)
    expect(rel.encontrados.map((e) => e.produtoId).sort()).toEqual(["p1", "p2"])
  })

  it("B) divergências = contado ≠ sistema (atual)", () => {
    expect(rel.totais.divergencias).toBe(1)
    const d = rel.divergencias[0]
    expect(d.produtoId).toBe("p2")
    expect(d.estoqueSistema).toBe(12)
    expect(d.quantidadeContada).toBe(9)
    expect(d.diferenca).toBe(-3)
  })

  it("C) reconciliação isola códigos sem cadastro", () => {
    expect(rel.totais.reconciliacao).toBe(1)
    expect(rel.reconciliacao[0]).toEqual({ codigoBipado: "9999", quantidadeContada: 3 })
  })

  it("não contados = produtos do sistema nunca bipados (p3, p4)", () => {
    expect(rel.naoContados.map((p) => p.produtoId).sort()).toEqual(["p3", "p4"])
  })

  it("D) zerado no inventário = não contados COM saldo (p3, não p4)", () => {
    expect(rel.zeradoNoInventario.map((p) => p.produtoId)).toEqual(["p3"])
  })

  it("usa o stock ATUAL na divergência (não o snapshot), mas cai no snapshot se o produto sumiu", () => {
    // Produto deletado do catálogo: contagem aponta para id ausente em produtosLoja.
    const rel2 = montarRelatorioInventario({
      contagens: [
        { produtoId: "del", codigoBipado: "X", quantidadeContada: 2, estoqueSistemaSnapshot: 7, status: STATUS_CONTAGEM.ENCONTRADO, produtoNomeSnapshot: "Fantasma" },
      ],
      produtosLoja: [],
    })
    expect(rel2.encontrados[0].estoqueSistema).toBe(7) // snapshot
    expect(rel2.encontrados[0].nome).toBe("Fantasma")
    expect(rel2.encontrados[0].diferenca).toBe(-5)
  })

  it("contabiliza unidades contadas", () => {
    expect(rel.totais.unidadesContadas).toBe(15 + 9 + 3)
  })
})
