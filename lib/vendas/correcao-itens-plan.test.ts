import { describe, it, expect } from "vitest"
import { computeCorrecaoItensPlan, type CorrecaoLineInput } from "./correcao-itens-plan"

// Helpers de fixture
const prod = (id: string, nome: string, qty: number, unit: number, desconto = 0): CorrecaoLineInput => ({
  inventoryId: id, nome, quantidade: qty, precoUnitario: unit, desconto,
})
const avulso = (nome: string, qty: number, unit: number): CorrecaoLineInput => ({
  inventoryId: `__avulso__${nome}`, nome, quantidade: qty, precoUnitario: unit, isAvulso: true,
})

describe("computeCorrecaoItensPlan — produtos", () => {
  it("adicionar produto: baixa estoque novo, total sobe, dinheiro absorve", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 1, 10)],
      newLines: [prod("p1", "Caneta", 1, 10), prod("p2", "Caderno", 2, 20)],
      oldTotal: 10,
      oldBreakdown: { dinheiro: 10 },
    })
    expect(p.ok).toBe(true)
    expect(p.newTotal).toBe(50)
    expect(p.deltaTotal).toBe(40)
    expect(p.stockDeltas).toContainEqual({ inventoryId: "p2", nome: "Caderno", deltaQty: 2 })
    expect(p.requiresStockCheck).toBe(true)
    expect(p.newBreakdown.dinheiro).toBe(50)
    expect(p.changes.added).toHaveLength(1)
  })

  it("remover produto: devolve estoque, total cai, dinheiro reduz", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 1, 10), prod("p2", "Caderno", 2, 20)],
      newLines: [prod("p1", "Caneta", 1, 10)],
      oldTotal: 50,
      oldBreakdown: { dinheiro: 50 },
    })
    expect(p.ok).toBe(true)
    expect(p.newTotal).toBe(10)
    expect(p.stockDeltas).toContainEqual({ inventoryId: "p2", nome: "Caderno", deltaQty: -2 })
    expect(p.requiresStockCheck).toBe(false)
    expect(p.newBreakdown.dinheiro).toBe(10)
    expect(p.changes.removed).toHaveLength(1)
  })

  it("aumentar quantidade: baixa a diferença", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 2, 10)],
      newLines: [prod("p1", "Caneta", 5, 10)],
      oldTotal: 20,
      oldBreakdown: { dinheiro: 20 },
    })
    expect(p.stockDeltas).toContainEqual({ inventoryId: "p1", nome: "Caneta", deltaQty: 3 })
    expect(p.newTotal).toBe(50)
    expect(p.changes.modified).toHaveLength(1)
  })

  it("reduzir quantidade: devolve a diferença", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 5, 10)],
      newLines: [prod("p1", "Caneta", 2, 10)],
      oldTotal: 50,
      oldBreakdown: { dinheiro: 50 },
    })
    expect(p.stockDeltas).toContainEqual({ inventoryId: "p1", nome: "Caneta", deltaQty: -3 })
    expect(p.requiresStockCheck).toBe(false)
  })

  it("alterar preço unitário: total muda, estoque não", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 2, 10)],
      newLines: [prod("p1", "Caneta", 2, 15)],
      oldTotal: 20,
      oldBreakdown: { dinheiro: 20 },
    })
    expect(p.newTotal).toBe(30)
    expect(p.stockDeltas).toHaveLength(0)
    expect(p.newBreakdown.dinheiro).toBe(30)
  })

  it("alterar desconto: total cai pelo desconto", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 2, 10, 0)],
      newLines: [prod("p1", "Caneta", 2, 10, 5)],
      oldTotal: 20,
      oldBreakdown: { dinheiro: 20 },
    })
    expect(p.newTotal).toBe(15)
    expect(p.newBreakdown.dinheiro).toBe(15)
    expect(p.stockDeltas).toHaveLength(0)
  })

  it("trocar produto: devolve o antigo, baixa o novo", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 1, 10)],
      newLines: [prod("p2", "Lápis", 1, 10)],
      oldTotal: 10,
      oldBreakdown: { dinheiro: 10 },
    })
    expect(p.stockDeltas).toContainEqual({ inventoryId: "p1", nome: "Caneta", deltaQty: -1 })
    expect(p.stockDeltas).toContainEqual({ inventoryId: "p2", nome: "Lápis", deltaQty: 1 })
    expect(p.newTotal).toBe(10)
  })

  it("item avulso: muda total mas NÃO gera delta de estoque", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 1, 10)],
      newLines: [prod("p1", "Caneta", 1, 10), avulso("Embalagem", 1, 5)],
      oldTotal: 10,
      oldBreakdown: { dinheiro: 10 },
    })
    expect(p.ok).toBe(true)
    expect(p.newTotal).toBe(15)
    expect(p.stockDeltas).toHaveLength(0) // avulso não toca estoque
    expect(p.newBreakdown.dinheiro).toBe(15)
  })
})

describe("computeCorrecaoItensPlan — guardas", () => {
  it("no_change quando itens idênticos", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 1, 10)],
      newLines: [prod("p1", "Caneta", 1, 10)],
      oldTotal: 10,
      oldBreakdown: { dinheiro: 10 },
    })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("no_change")
  })

  it("sem_itens quando draft fica vazio", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 1, 10)],
      newLines: [],
      oldTotal: 10,
      oldBreakdown: { dinheiro: 10 },
    })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("sem_itens")
  })

  it("bloqueia venda à prazo", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 1, 100)],
      newLines: [prod("p1", "Caneta", 2, 100)],
      oldTotal: 100,
      oldBreakdown: { aPrazo: 100 },
    })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("aprazo_ou_vale_bloqueado")
  })

  it("bloqueia venda com vale/crédito", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 1, 100)],
      newLines: [prod("p1", "Caneta", 2, 100)],
      oldTotal: 100,
      oldBreakdown: { creditoVale: 100 },
    })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("aprazo_ou_vale_bloqueado")
  })

  it("bloqueia quando a parcela em dinheiro não absorve a redução", () => {
    // dinheiro 10 + pix 90 = 100; reduz total para 50 ⇒ dinheiro ficaria -40
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "A", 1, 100)],
      newLines: [prod("p1", "A", 1, 50)],
      oldTotal: 100,
      oldBreakdown: { dinheiro: 10, pix: 90 },
    })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("caixa_nao_absorve")
  })

  it("linha_invalida quando quantidade zero/negativa no draft", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "Caneta", 1, 10)],
      newLines: [{ inventoryId: "p1", nome: "Caneta", quantidade: 0, precoUnitario: 10 }],
      oldTotal: 10,
      oldBreakdown: { dinheiro: 10 },
    })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("linha_invalida")
  })

  it("múltiplo à vista absorve aumento em dinheiro", () => {
    const p = computeCorrecaoItensPlan({
      oldLines: [prod("p1", "A", 1, 100)],
      newLines: [prod("p1", "A", 1, 120)],
      oldTotal: 100,
      oldBreakdown: { dinheiro: 50, pix: 50 },
    })
    expect(p.ok).toBe(true)
    expect(p.newBreakdown.dinheiro).toBe(70)
    expect(p.newBreakdown.pix).toBe(50)
    expect(p.newTotal).toBe(120)
  })
})
