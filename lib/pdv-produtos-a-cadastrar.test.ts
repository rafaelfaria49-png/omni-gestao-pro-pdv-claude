/**
 * Testes das funções PURAS da fila "Produtos a cadastrar" (itens avulsos vendidos).
 * Sem localStorage/IO — só a lógica de construção/normalização/dedupe/agrupamento/status.
 */
import { describe, expect, it } from "vitest"
import {
  normalizarCodigoCadastro,
  construirProdutosACadastrar,
  mesclarProdutosACadastrar,
  contarOcorrenciasPorCodigo,
  aplicarStatusProdutoACadastrar,
  ordenarProdutosACadastrar,
  acharProdutoPorCodigoExato,
  type ProdutoACadastrarRecord,
} from "./pdv-produtos-a-cadastrar"

describe("normalizarCodigoCadastro", () => {
  it("trim, colapsa espaços e vazio→null", () => {
    expect(normalizarCodigoCadastro("  789  ")).toBe("789")
    expect(normalizarCodigoCadastro("ABC  12")).toBe("ABC 12")
    expect(normalizarCodigoCadastro("   ")).toBeNull()
    expect(normalizarCodigoCadastro(null)).toBeNull()
  })
})

describe("construirProdutosACadastrar", () => {
  it("monta registros pendentes a partir dos itens avulsos com id estável por venda+linha", () => {
    const recs = construirProdutosACadastrar({
      storeId: "loja-2",
      vendaId: "V-1",
      operador: "Ana",
      criadoEm: "2026-06-14T10:00:00.000Z",
      itens: [
        { lineId: "l1", nome: "  Boneca X ", codigo: " 789 ", precoVenda: 19.9, custo: 8, quantidade: 2 },
        { lineId: "l2", nome: "Pião", codigo: null, precoVenda: 5, quantidade: 1 },
      ],
    })
    expect(recs).toHaveLength(2)
    expect(recs[0]).toMatchObject({
      id: "V-1:l1",
      storeId: "loja-2",
      vendaId: "V-1",
      nome: "Boneca X",
      codigo: "789",
      precoVenda: 19.9,
      custo: 8,
      quantidade: 2,
      operador: "Ana",
      status: "pendente",
    })
    expect(recs[1].codigo).toBeNull()
    expect(recs[1].custo).toBeNull() // custo ausente = desconhecido
  })

  it("ignora itens sem nome e sanitiza quantidade/custo inválidos", () => {
    const recs = construirProdutosACadastrar({
      storeId: "loja-2",
      vendaId: "V-2",
      itens: [
        { lineId: "a", nome: "   ", precoVenda: 1, quantidade: 1 },
        { lineId: "b", nome: "Carrinho", precoVenda: 10, quantidade: 0, custo: -3 },
      ],
    })
    expect(recs).toHaveLength(1)
    expect(recs[0].nome).toBe("Carrinho")
    expect(recs[0].quantidade).toBe(1) // 0 → 1
    expect(recs[0].custo).toBeNull() // negativo → null
  })

  it("sem storeId ou vendaId retorna vazio (multi-loja: nada órfão)", () => {
    expect(construirProdutosACadastrar({ storeId: "", vendaId: "V", itens: [{ nome: "x", precoVenda: 1, quantidade: 1 }] })).toEqual([])
    expect(construirProdutosACadastrar({ storeId: "loja-2", vendaId: "  ", itens: [{ nome: "x", precoVenda: 1, quantidade: 1 }] })).toEqual([])
  })
})

const rec = (over: Partial<ProdutoACadastrarRecord> & { id: string }): ProdutoACadastrarRecord => ({
  storeId: "loja-2",
  vendaId: "V",
  nome: "Item",
  codigo: null,
  precoVenda: 1,
  custo: null,
  quantidade: 1,
  operador: null,
  criadoEm: "2026-06-14T10:00:00.000Z",
  status: "pendente",
  ...over,
})

describe("mesclarProdutosACadastrar", () => {
  it("não duplica por id e preserva o status já definido (idempotente)", () => {
    const existentes = [rec({ id: "V-1:l1", status: "cadastrado" })]
    const novos = [rec({ id: "V-1:l1", status: "pendente" }), rec({ id: "V-1:l2" })]
    const out = mesclarProdutosACadastrar(existentes, novos)
    expect(out).toHaveLength(2)
    expect(out.find((r) => r.id === "V-1:l1")?.status).toBe("cadastrado") // mantém, não ressuscita
  })
})

describe("contarOcorrenciasPorCodigo", () => {
  it("conta repetições só de códigos informados (Mesmo código vendido X vezes)", () => {
    const m = contarOcorrenciasPorCodigo([
      rec({ id: "1", codigo: "789" }),
      rec({ id: "2", codigo: " 789 " }),
      rec({ id: "3", codigo: "111" }),
      rec({ id: "4", codigo: null }),
    ])
    expect(m.get("789")).toBe(2)
    expect(m.get("111")).toBe(1)
    expect(m.has("")).toBe(false)
  })
})

describe("aplicarStatusProdutoACadastrar", () => {
  it("muda o status apenas do id alvo", () => {
    const out = aplicarStatusProdutoACadastrar([rec({ id: "1" }), rec({ id: "2" })], "2", "ignorado")
    expect(out.find((r) => r.id === "1")?.status).toBe("pendente")
    expect(out.find((r) => r.id === "2")?.status).toBe("ignorado")
  })
})

describe("ordenarProdutosACadastrar", () => {
  it("mais recentes primeiro", () => {
    const out = ordenarProdutosACadastrar([
      rec({ id: "old", criadoEm: "2026-06-10T10:00:00.000Z" }),
      rec({ id: "new", criadoEm: "2026-06-14T10:00:00.000Z" }),
    ])
    expect(out.map((r) => r.id)).toEqual(["new", "old"])
  })
})

describe("acharProdutoPorCodigoExato", () => {
  const catalogo = [
    { id: "p1", name: "Boneca Cadastrada", barcode: "789", sku: "BON-1" },
    { id: "p2", name: "Carrinho", sku: "CAR", codigoBarras: "555" },
  ]
  it("acha por barcode/sku/codigoBarras (case-insensitive)", () => {
    expect(acharProdutoPorCodigoExato(catalogo, "789")?.nome).toBe("Boneca Cadastrada")
    expect(acharProdutoPorCodigoExato(catalogo, "bon-1")?.nome).toBe("Boneca Cadastrada")
    expect(acharProdutoPorCodigoExato(catalogo, "555")?.nome).toBe("Carrinho")
  })
  it("retorna null quando não existe ou código vazio", () => {
    expect(acharProdutoPorCodigoExato(catalogo, "000")).toBeNull()
    expect(acharProdutoPorCodigoExato(catalogo, "  ")).toBeNull()
  })
})
