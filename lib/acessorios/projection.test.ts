import { describe, expect, it } from "vitest"
import type { InventoryItem } from "@/lib/operations-store"
import { mergePdvCatalogWithInventory } from "@/lib/pdv-catalog"
import { projectProdutoAccessoryConfig } from "./projection"

const validConfig = {
  version: 1,
  tipo: "capinha",
  exigeModelo: true,
  exigeCor: true,
  usaCoresPadrao: true,
} as const

describe("projeção de acessórios para o catálogo operacional", () => {
  it("omite accessoryConfig em produto comum", () => {
    expect(projectProdutoAccessoryConfig({ metadata: { fiscal: { ncm: "1" } } })).toBeUndefined()
  })

  it("projeta configuração válida saneada", () => {
    expect(projectProdutoAccessoryConfig({ metadata: { acessorios: { ...validConfig, extra: "ignorado" } } }))
      .toEqual(validConfig)
  })

  it("omite configuração inválida", () => {
    expect(projectProdutoAccessoryConfig({ metadata: { acessorios: { ...validConfig, exigeCor: "sim" } } }))
      .toBeUndefined()
  })

  it("leva accessoryConfig de InventoryItem até PdvCatalogProduct sem alterar valores monetários", () => {
    const inventory: InventoryItem[] = [{
      id: "sku-1",
      name: "Capinha",
      stock: 7,
      cost: 10,
      price: 25,
      category: "Capinhas",
      accessoryConfig: validConfig,
    }]
    const [product] = mergePdvCatalogWithInventory([], inventory)
    expect(product.accessoryConfig).toEqual(validConfig)
    expect(product).not.toHaveProperty("metadata")
    expect(product.price).toBe(25)
    expect(product.stock).toBe(7)
  })

  it("mantém accessoryConfig ausente no catálogo de produto comum", () => {
    const inventory: InventoryItem[] = [{
      id: "sku-2",
      name: "Cabo",
      stock: 3,
      cost: 5,
      price: 12,
      category: "Cabos",
    }]
    const [product] = mergePdvCatalogWithInventory([], inventory)
    expect(product).not.toHaveProperty("accessoryConfig")
    expect(product).not.toHaveProperty("metadata")
  })
})
