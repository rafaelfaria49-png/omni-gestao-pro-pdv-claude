/**
 * PDV-MOTOR-INTEGRITY-N1 — `accessorySelection` chega ao contrato/persistência.
 *
 * Prova que `saleLineRecordFromFinalizeInput` (choke point único usado pelo
 * motor para TODAS as superfícies) copia a seleção válida de modelo/cor para
 * o `SaleLineRecord`, sem segundo modelo de acessórios e sem interferir em
 * resolução de produto, estoque, fiscal ou financeiro.
 *
 * Preserva integralmente a cobertura prévia (serviço/avulso/produto).
 */
import { describe, expect, it } from "vitest"
import { saleLineRecordFromFinalizeInput } from "./operations-sale-line"

describe("finalizeSaleTransaction — snapshot da linha", () => {
  it("preserva identidade completa do serviço sem classificá-lo como avulso", () => {
    const record = saleLineRecordFromFinalizeInput({
      inventoryId: "__servico__svc-1",
      quantity: 1,
      name: "Transferência de Dados",
      unitPrice: 80,
      itemType: "servico",
      serviceId: "svc-1",
      serviceCategory: "Software e Dados",
      warrantyDays: 0,
      serviceTerms: "",
      custoUnitario: 0,
    })
    expect(record).toMatchObject({
      itemType: "servico",
      serviceId: "svc-1",
      serviceCategory: "Software e Dados",
      warrantyDays: 0,
      unitPrice: 80,
      lineTotal: 80,
    })
    expect(record.isAvulso).not.toBe(true)
  })

  it("mantém item avulso explicitamente separado", () => {
    expect(saleLineRecordFromFinalizeInput({
      inventoryId: "__avulso__line-1",
      quantity: 2,
      name: "Cabo sem cadastro",
      unitPrice: 15,
      itemType: "avulso",
      isAvulso: true,
    })).toMatchObject({ itemType: "avulso", isAvulso: true, lineTotal: 30 })
  })

  it("recupera serviceId do identificador virtual em snapshots compatíveis", () => {
    expect(saleLineRecordFromFinalizeInput({
      inventoryId: "__servico__svc-legado",
      quantity: 1,
      unitPrice: 90,
    })).toMatchObject({ itemType: "servico", serviceId: "svc-legado" })
  })

  it("classifica produto normal e usa o snapshot atual do estoque", () => {
    expect(saleLineRecordFromFinalizeInput(
      { inventoryId: "prod-1", quantity: 1, itemType: "produto" },
      { name: "Cabo USB-C", price: 50 },
    )).toMatchObject({ itemType: "produto", name: "Cabo USB-C", unitPrice: 50 })
  })
})

describe("saleLineRecordFromFinalizeInput — accessorySelection", () => {
  it("preserva seleção válida de modelo/cor (Venda Completa usa o mesmo contrato)", () => {
    const record = saleLineRecordFromFinalizeInput(
      {
        inventoryId: "prod-capinha",
        quantity: 1,
        name: "Capinha",
        unitPrice: 49.9,
        accessorySelection: {
          version: 1,
          deviceModelKey: "iphone-15",
          deviceModelName: "iPhone 15",
          colorKey: "preto",
          colorLabel: "Preto",
        },
      },
      { name: "Capinha", price: 49.9 },
    )
    expect(record.accessorySelection).toEqual({
      version: 1,
      deviceModelKey: "iphone-15",
      deviceModelName: "iPhone 15",
      colorKey: "preto",
      colorLabel: "Preto",
    })
    expect(record.inventoryId).toBe("prod-capinha")
    expect(record.lineTotal).toBe(49.9)
  })

  it("linha sem seleção continua sem o campo (sem falso-positivo)", () => {
    const record = saleLineRecordFromFinalizeInput(
      { inventoryId: "prod-1", quantity: 2, name: "Arroz", unitPrice: 10 },
      { name: "Arroz", price: 10 },
    )
    expect("accessorySelection" in record).toBe(false)
    expect(record.lineTotal).toBe(20)
  })
})
