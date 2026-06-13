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
  assertStoreId,
  normalizarCodigo,
  aplicarBipe,
  diferencaContagem,
  montarRelatorioInventario,
  type ContagemLinha,
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
