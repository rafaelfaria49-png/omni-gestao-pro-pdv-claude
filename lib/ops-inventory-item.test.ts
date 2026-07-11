import { describe, expect, it } from "vitest"
import { rowToItem, type ProdutoInventoryRow } from "./ops-inventory-item"

/**
 * PDV-ACESSORIOS-CADASTRO-PROJECAO-002 — projeção Produto → catálogo do PDV.
 * A rota `/api/ops/inventory` delega para `rowToItem`; aqui validamos o contrato puro.
 */

function baseRow(overrides: Partial<ProdutoInventoryRow> = {}): ProdutoInventoryRow {
  return {
    id: "prod-1",
    name: "Capinha silicone",
    stock: 845,
    precoCusto: 8.5,
    price: 25,
    sku: "CAP-SIL-001",
    barcode: "7891234500011",
    category: "Acessórios",
    metadata: null,
    ...overrides,
  }
}

const CONFIG_CAPINHA = {
  version: 1,
  tipo: "capinha",
  exigeModelo: true,
  exigeCor: true,
  usaCoresPadrao: true,
}

describe("rowToItem — projeção de acessórios", () => {
  it("produto comum (sem metadata.acessorios) não recebe accessoryConfig", () => {
    expect(rowToItem(baseRow())).not.toHaveProperty("accessoryConfig")
    expect(rowToItem(baseRow({ metadata: { fiscal: { ncm: "39269090" } } }))).not.toHaveProperty(
      "accessoryConfig",
    )
  })

  it("capinha projeta exigeModelo + exigeCor com cores padrão", () => {
    const item = rowToItem(baseRow({ metadata: { acessorios: CONFIG_CAPINHA } }))
    expect(item.accessoryConfig).toEqual(CONFIG_CAPINHA)
  })

  it("película projeta somente modelo (sem exigir cor)", () => {
    const item = rowToItem(
      baseRow({
        metadata: {
          acessorios: {
            version: 1,
            tipo: "pelicula",
            exigeModelo: true,
            exigeCor: false,
            usaCoresPadrao: false,
          },
        },
      }),
    )
    expect(item.accessoryConfig?.exigeModelo).toBe(true)
    expect(item.accessoryConfig?.exigeCor).toBe(false)
  })

  it("não duplica a lista global de cores no payload — só a flag usaCoresPadrao", () => {
    const item = rowToItem(baseRow({ metadata: { acessorios: CONFIG_CAPINHA } }))
    expect(item.accessoryConfig?.usaCoresPadrao).toBe(true)
    expect(item.accessoryConfig).not.toHaveProperty("coresPermitidas")
    // A serialização do item não pode carregar labels da lista global (ex.: "Transparente").
    expect(JSON.stringify(item)).not.toContain("Transparente")
  })

  it("metadata inválida cai em comportamento seguro (sem accessoryConfig)", () => {
    expect(
      rowToItem(baseRow({ metadata: { acessorios: "capinha" } })),
    ).not.toHaveProperty("accessoryConfig")
    expect(
      rowToItem(baseRow({ metadata: { acessorios: { version: 2, tipo: "capinha" } } })),
    ).not.toHaveProperty("accessoryConfig")
    expect(
      rowToItem(baseRow({ metadata: { acessorios: { version: 1, tipo: "drone" } } })),
    ).not.toHaveProperty("accessoryConfig")
  })

  it("demais campos do item não mudam com a configuração de acessório", () => {
    const semConfig = rowToItem(baseRow({ metadata: { fiscal: { ncm: "39269090" } } }))
    const comConfig = rowToItem(
      baseRow({ metadata: { fiscal: { ncm: "39269090" }, acessorios: CONFIG_CAPINHA } }),
    )
    const { accessoryConfig: _ignored, ...restoComConfig } = comConfig
    expect(restoComConfig).toEqual(semConfig)
    // Identidade/preço/estoque/fiscal intactos.
    expect(comConfig.id).toBe("CAP-SIL-001")
    expect(comConfig.dbId).toBe("prod-1")
    expect(comConfig.stock).toBe(845)
    expect(comConfig.cost).toBe(8.5)
    expect(comConfig.price).toBe(25)
    expect(comConfig.fiscal?.ncm).toBe("39269090")
  })

  it("mantém o contrato legado de identidade (sku vira id operacional; sem sku usa o cuid)", () => {
    const semSku = rowToItem(baseRow({ sku: null }))
    expect(semSku.id).toBe("prod-1")
    expect(semSku.sku).toBeUndefined()
    const comSku = rowToItem(baseRow())
    expect(comSku.id).toBe("CAP-SIL-001")
    expect(comSku.codigo).toBe("CAP-SIL-001")
  })
})
