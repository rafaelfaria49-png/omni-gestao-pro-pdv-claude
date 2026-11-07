/**
 * PDV-CADASTROS-SYNC-AUTOMATICO-001 — carrinho aberto × catálogo editado em outra aba
 * ou aparelho. A identidade é `Produto.id`; SKU, código e nome nunca identificam a linha.
 */
import { describe, expect, it } from "vitest"
import { reconcileCartWithCatalog, type ReconcileCatalogItem } from "./cart-catalog-reconcile"
import { avulsoInventoryId, osServicoInventoryId, servicoInventoryId } from "@/lib/os-pdv-virtual-lines"

type Line = {
  lineId: string
  inventoryId: string
  name: string
  price: number
  quantity: number
  isAvulso?: boolean
  produtoId?: string
  catalogUnitPrice?: number
}

const catalogo = (over: Partial<ReconcileCatalogItem> = {}): ReconcileCatalogItem => ({
  id: "KIT-91A",
  dbId: "cuid-carregador",
  name: "KIT DE CARREGADOR TURBO 9.1A",
  price: 59.99,
  stock: 3,
  category: "Acessórios",
  ...over,
})

const linha = (over: Partial<Line> = {}): Line => ({
  lineId: "l1",
  inventoryId: "KIT-91A",
  name: "KIT DE CARREGADOR TURBO 9.1A",
  price: 59.99,
  quantity: 1,
  produtoId: "cuid-carregador",
  catalogUnitPrice: 59.99,
  ...over,
})

describe("reconcileCartWithCatalog", () => {
  it("SKU editado: a linha reaponta para o código novo pelo Produto.id, sem revisão", () => {
    const r = reconcileCartWithCatalog([linha()], [catalogo({ id: "CA42-1", name: "CARREGADOR TURBO 9.1A MICRO USB V8 AGOLD" })])
    expect(r.changed).toBe(true)
    expect(r.divergences).toEqual([])
    expect(r.lines[0]).toMatchObject({ inventoryId: "CA42-1", produtoId: "cuid-carregador", price: 59.99 })
    // O nome do item vendido é preservado (o cupom mostra o que o operador escolheu).
    expect(r.lines[0]!.name).toBe("KIT DE CARREGADOR TURBO 9.1A")
  })

  it("código de barras ou nome editados não geram divergência nem mexem na linha", () => {
    const r = reconcileCartWithCatalog([linha()], [catalogo({ name: "NOME NOVO" })])
    expect(r.changed).toBe(false)
    expect(r.divergences).toEqual([])
  })

  it("preço de cadastro mudou → divergência explícita; nada é alterado sozinho", () => {
    const lines = [linha()]
    const r = reconcileCartWithCatalog(lines, [catalogo({ price: 64.9 })])
    expect(r.divergences).toEqual([
      expect.objectContaining({ kind: "price", lineId: "l1", cartPrice: 59.99, previousCatalogPrice: 59.99, catalogPrice: 64.9 }),
    ])
    expect(r.lines[0]!.price).toBe(59.99)
    expect(lines[0]!.catalogUnitPrice).toBe(59.99)
  })

  it("preço editado manualmente no carrinho não vira divergência falsa", () => {
    const r = reconcileCartWithCatalog([linha({ price: 50 })], [catalogo()])
    expect(r.divergences).toEqual([])
  })

  it("revisão aceita (catalogUnitPrice = novo) encerra a divergência de preço", () => {
    const r = reconcileCartWithCatalog([linha({ catalogUnitPrice: 64.9 })], [catalogo({ price: 64.9 })])
    expect(r.divergences).toEqual([])
  })

  it("produto excluído → divergência `removed`, linha intacta", () => {
    const r = reconcileCartWithCatalog([linha()], [catalogo({ id: "OUTRO", dbId: "cuid-outro" })])
    expect(r.divergences).toEqual([expect.objectContaining({ kind: "removed", lineId: "l1" })])
    expect(r.lines[0]).toEqual(linha())
  })

  it("SKU reatribuído a OUTRO produto não captura a linha (casamento só por Produto.id)", () => {
    const r = reconcileCartWithCatalog([linha()], [catalogo({ dbId: "cuid-outro", name: "CAPINHA" })])
    expect(r.divergences).toEqual([expect.objectContaining({ kind: "removed" })])
    expect(r.lines[0]!.produtoId).toBe("cuid-carregador")
  })

  it("saldo caiu abaixo do carrinho (duas linhas somam) → divergência `stock` até ajustar ou remover", () => {
    const lines = [linha(), linha({ lineId: "l2", quantity: 2 })]
    const r = reconcileCartWithCatalog(lines, [catalogo({ stock: 2 })])
    expect(r.divergences.filter((d) => d.kind === "stock")).toEqual([
      expect.objectContaining({ lineId: "l1", inCart: 3, available: 2, lineQuantity: 1 }),
      expect.objectContaining({ lineId: "l2", inCart: 3, available: 2, lineQuantity: 2 }),
    ])
    // Ajustar a linha l2 para 1 (cabe no saldo junto com l1) encerra a divergência.
    const ajustado = [linha(), linha({ lineId: "l2", quantity: 1 })]
    expect(reconcileCartWithCatalog(ajustado, [catalogo({ stock: 2 })]).divergences).toEqual([])
  })

  it("estoque não controlado (critério do PDV) nunca diverge", () => {
    const r = reconcileCartWithCatalog([linha({ quantity: 5 })], [catalogo({ stock: 1, category: "Serviços" })], {
      isStockControlled: (i) => i.category !== "Serviços",
    })
    expect(r.divergences).toEqual([])
  })

  it("linha antiga sem Produto.id (venda em espera) adota a identidade pelo id exato e recebe a base de preço", () => {
    const r = reconcileCartWithCatalog([linha({ produtoId: undefined, catalogUnitPrice: undefined })], [catalogo()])
    expect(r.changed).toBe(true)
    expect(r.lines[0]).toMatchObject({ produtoId: "cuid-carregador", catalogUnitPrice: 59.99 })
    expect(r.divergences).toEqual([])
  })

  it("avulso, serviço, O.S., complemento e voz não são tocados", () => {
    const virtuais = [
      linha({ lineId: "a", inventoryId: avulsoInventoryId("x"), isAvulso: true, produtoId: undefined }),
      linha({ lineId: "s", inventoryId: servicoInventoryId("svc"), produtoId: undefined }),
      linha({ lineId: "o", inventoryId: osServicoInventoryId("os-1"), produtoId: undefined }),
      linha({ lineId: "c", inventoryId: "comp-KIT-91A-1", produtoId: undefined }),
      linha({ lineId: "v", inventoryId: "voice-123", produtoId: undefined }),
    ]
    const r = reconcileCartWithCatalog(virtuais, [catalogo({ price: 1, stock: 0 })])
    expect(r.changed).toBe(false)
    expect(r.divergences).toEqual([])
  })

  it("catálogo vazio (carga falhou) não acusa exclusão em massa", () => {
    const r = reconcileCartWithCatalog([linha()], [])
    expect(r.divergences).toEqual([])
    expect(r.changed).toBe(false)
  })

  it("é estável: aplicar o resultado de novo não muda nada (sem loop de render)", () => {
    const first = reconcileCartWithCatalog([linha({ produtoId: undefined, catalogUnitPrice: undefined })], [catalogo({ id: "CA42-1" })])
    const second = reconcileCartWithCatalog(first.lines, [catalogo({ id: "CA42-1" })])
    expect(second.changed).toBe(false)
  })
})
