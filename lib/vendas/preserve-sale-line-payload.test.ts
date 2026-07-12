import { describe, expect, it } from "vitest"
import { composeCorrectedSalePayloadLines, type CorrectedSaleLine } from "./preserve-sale-line-payload"

const correctedLine = (inventoryId: string, name: string, sourceIndex?: number): CorrectedSaleLine => ({
  inventoryId, name, quantity: 2, unitPrice: 15, lineTotal: 30, sourceIndex,
})

describe("composeCorrectedSalePayloadLines", () => {
  it("preserva metadata F4 e sobrescreve campos comerciais", () => {
    const lines = composeCorrectedSalePayloadLines({
      existingPayloadLines: [{ quantity: 1, unitPrice: 10, lineTotal: 10, metadata: { imei: "123456789012345", serial: "ABC123", garantiaDias: 90 } }],
      correctedLines: [correctedLine("produto-1", "Telefone", 0)],
    })

    expect(lines).toEqual([{ inventoryId: "produto-1", name: "Telefone", quantity: 2, unitPrice: 15, lineTotal: 30, metadata: { imei: "123456789012345", serial: "ABC123", garantiaDias: 90 } }])
  })

  it("preserva accessorySelection e extensões desconhecidas sem sanear", () => {
    const selection = { version: 1, deviceModelKey: "samsung-galaxy-a06", colorKey: "preto", colorLabel: "Preto" }
    const [line] = composeCorrectedSalePayloadLines({
      existingPayloadLines: [{ accessorySelection: selection, extensionFuture: { channel: "marketplace" } }],
      correctedLines: [correctedLine("produto-1", "Capinha", 0)],
    })

    expect(line.accessorySelection).toEqual(selection)
    expect(line.extensionFuture).toEqual({ channel: "marketplace" })
  })

  it("não deixa campos canônicos antigos vencerem a correção", () => {
    const [line] = composeCorrectedSalePayloadLines({
      existingPayloadLines: [{ inventoryId: "antigo", name: "Antigo", quantity: 99, unitPrice: 1, lineTotal: 99, desconto: 80, isAvulso: true, qtyReturned: 4, custoUnitario: 2 }],
      correctedLines: [correctedLine("produto-1", "Produto", 0)],
    })

    expect(line).toEqual({ inventoryId: "produto-1", name: "Produto", quantity: 2, unitPrice: 15, lineTotal: 30 })
  })

  it("mantém duplicatas exatas em suas sourceIndexes sem duplicar metadata", () => {
    const lines = composeCorrectedSalePayloadLines({
      existingPayloadLines: [{ metadata: { imei: "IMEI-1" } }, { metadata: { imei: "IMEI-2" } }],
      correctedLines: [correctedLine("produto-1", "Telefone", 0), correctedLine("produto-1", "Telefone", 1)],
    })

    expect(lines[0].metadata).toEqual({ imei: "IMEI-1" })
    expect(lines[1].metadata).toEqual({ imei: "IMEI-2" })
  })

  it("preserva cores distintas quando as linhas são reordenadas", () => {
    const lines = composeCorrectedSalePayloadLines({
      existingPayloadLines: [
        { metadata: { serial: "PRETO" }, accessorySelection: { colorKey: "preto" } },
        { metadata: { serial: "AZUL" }, accessorySelection: { colorKey: "azul" } },
      ],
      correctedLines: [correctedLine("produto-1", "Capinha — Azul", 1), correctedLine("produto-1", "Capinha — Preto", 0)],
    })

    expect(lines[0]).toMatchObject({ metadata: { serial: "AZUL" }, accessorySelection: { colorKey: "azul" } })
    expect(lines[1]).toMatchObject({ metadata: { serial: "PRETO" }, accessorySelection: { colorKey: "preto" } })
  })

  it("preserva extras quando apenas o name canônico muda", () => {
    const [line] = composeCorrectedSalePayloadLines({
      existingPayloadLines: [{ metadata: { serial: "ABC" } }],
      correctedLines: [correctedLine("produto-1", "Nome recalculado", 0)],
    })

    expect(line.metadata).toEqual({ serial: "ABC" })
  })

  it("não transfere extras para linha nova ou produto substituído", () => {
    const lines = composeCorrectedSalePayloadLines({
      existingPayloadLines: [{ metadata: { serial: "ANTIGO" }, accessorySelection: { colorKey: "preto" } }],
      correctedLines: [correctedLine("produto-2", "Produto novo"), correctedLine("produto-3", "Linha nova")],
    })

    expect(lines).toEqual([
      { inventoryId: "produto-2", name: "Produto novo", quantity: 2, unitPrice: 15, lineTotal: 30 },
      { inventoryId: "produto-3", name: "Linha nova", quantity: 2, unitPrice: 15, lineTotal: 30 },
    ])
  })

  it("remove extras junto com a linha removida", () => {
    const lines = composeCorrectedSalePayloadLines({
      existingPayloadLines: [{ metadata: { serial: "REMOVER" } }, { metadata: { serial: "MANTER" } }],
      correctedLines: [correctedLine("produto-2", "Manter", 1)],
    })

    expect(lines).toEqual([{ inventoryId: "produto-2", name: "Manter", quantity: 2, unitPrice: 15, lineTotal: 30, metadata: { serial: "MANTER" } }])
  })

  it("mantém payload legado seguro e não persiste cartLineKey", () => {
    const [line] = composeCorrectedSalePayloadLines({
      existingPayloadLines: [{ cartLineKey: "transitoria", metadata: { serial: "ABC" } }],
      correctedLines: [correctedLine("produto-1", "Produto", 0)],
    })

    expect(line).toEqual({ inventoryId: "produto-1", name: "Produto", quantity: 2, unitPrice: 15, lineTotal: 30, metadata: { serial: "ABC" } })
    expect(composeCorrectedSalePayloadLines({ existingPayloadLines: { lines: "invalido" }, correctedLines: [correctedLine("produto-1", "Produto")] })).toEqual([
      { inventoryId: "produto-1", name: "Produto", quantity: 2, unitPrice: 15, lineTotal: 30 },
    ])
  })

  it("é idempotente", () => {
    const input = { existingPayloadLines: [{ metadata: { serial: "ABC" } }], correctedLines: [correctedLine("produto-1", "Produto", 0)] }
    const once = composeCorrectedSalePayloadLines(input)
    const twice = composeCorrectedSalePayloadLines({ existingPayloadLines: once, correctedLines: input.correctedLines })

    expect(twice).toEqual(once)
  })
})
