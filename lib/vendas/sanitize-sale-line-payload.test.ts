import { describe, expect, it } from "vitest"
import { sanitizeSaleLinesPayload } from "./sanitize-sale-line-payload"

describe("sanitizeSaleLinesPayload", () => {
  it("preserva campos operacionais e sanea accessorySelection válida (label do client não é confiado)", () => {
    const { lines, warnings } = sanitizeSaleLinesPayload([
      {
        inventoryId: "prod-1",
        name: "Capinha — Samsung Galaxy A06 — Preto",
        quantity: 1,
        unitPrice: 25,
        lineTotal: 25,
        isAvulso: true,
        custoUnitario: 10,
        accessorySelection: {
          version: 1,
          deviceModelKey: "samsung_galaxy_a06",
          colorKey: "preto",
          colorLabel: "texto forjado pelo client",
        },
      },
    ])

    expect(warnings).toEqual([])
    expect(lines).toEqual([
      {
        inventoryId: "prod-1",
        name: "Capinha — Samsung Galaxy A06 — Preto",
        quantity: 1,
        unitPrice: 25,
        lineTotal: 25,
        isAvulso: true,
        custoUnitario: 10,
        accessorySelection: {
          version: 1,
          deviceModelKey: "samsung_galaxy_a06",
          colorKey: "preto",
          colorLabel: "Preto",
        },
      },
    ])
  })

  it("descarta accessorySelection inválida sem bloquear a linha e reporta o índice correto", () => {
    const { lines, warnings } = sanitizeSaleLinesPayload([
      { inventoryId: "prod-1", name: "Produto A", quantity: 1, accessorySelection: { version: 1, colorKey: "preto" } },
      { inventoryId: "prod-2", name: "Produto B", quantity: 1, accessorySelection: { version: 99 } },
    ])

    expect(lines[0]).toHaveProperty("accessorySelection")
    expect(lines[1]).not.toHaveProperty("accessorySelection")
    expect(warnings).toEqual([{ code: "ACCESSORY_SELECTION_INVALID_DROPPED", index: 1 }])
  })

  it("remove cartLineKey defensivamente mesmo com seleção válida", () => {
    const { lines } = sanitizeSaleLinesPayload([
      {
        inventoryId: "prod-1",
        name: "Capinha",
        cartLineKey: '["prod-1","samsung_galaxy_a06","preto",""]',
        accessorySelection: { version: 1, colorKey: "preto" },
      },
    ])

    expect(lines[0]).not.toHaveProperty("cartLineKey")
    expect(lines[0]).toHaveProperty("accessorySelection")
  })

  it("remove cartLineKey mesmo em linha sem accessorySelection", () => {
    const { lines } = sanitizeSaleLinesPayload([
      { inventoryId: "prod-1", name: "Produto comum", cartLineKey: "qualquer-coisa" },
    ])

    expect(lines[0]).not.toHaveProperty("cartLineKey")
    expect(lines[0]).toEqual({ inventoryId: "prod-1", name: "Produto comum" })
  })

  it("preserva metadata F4 e outras extensões desconhecidas sem tocar", () => {
    const { lines } = sanitizeSaleLinesPayload([
      {
        inventoryId: "prod-1",
        name: "Telefone",
        metadata: { imei: "123456789012345", serial: "ABC123" },
        extensionFutura: { canal: "marketplace" },
      },
    ])

    expect(lines[0]).toMatchObject({
      metadata: { imei: "123456789012345", serial: "ABC123" },
      extensionFutura: { canal: "marketplace" },
    })
  })

  it("linha sem accessorySelection permanece sem a chave", () => {
    const { lines } = sanitizeSaleLinesPayload([
      { inventoryId: "prod-1", name: "Produto comum", quantity: 1, unitPrice: 10, lineTotal: 10 },
    ])

    expect(lines[0]).not.toHaveProperty("accessorySelection")
  })

  it("não muta a entrada", () => {
    const input = [
      { inventoryId: "prod-1", name: "Capinha", cartLineKey: "k1", accessorySelection: { version: 1, colorKey: "preto" } },
    ]
    const snapshot = JSON.parse(JSON.stringify(input))
    sanitizeSaleLinesPayload(input)
    expect(input).toEqual(snapshot)
  })

  it("entrada não-array retorna listas vazias sem lançar", () => {
    expect(sanitizeSaleLinesPayload(undefined)).toEqual({ lines: [], warnings: [] })
    expect(sanitizeSaleLinesPayload(null)).toEqual({ lines: [], warnings: [] })
    expect(sanitizeSaleLinesPayload("não é array")).toEqual({ lines: [], warnings: [] })
  })

  it("linha não-objeto vira objeto vazio sem lançar", () => {
    const { lines, warnings } = sanitizeSaleLinesPayload([null, "linha-invalida", 42])
    expect(lines).toEqual([{}, {}, {}])
    expect(warnings).toEqual([])
  })

  it("múltiplas linhas: cada índice gera warning independente", () => {
    const { warnings } = sanitizeSaleLinesPayload([
      { accessorySelection: { version: 2 } },
      { accessorySelection: { version: 1, colorKey: "preto" } },
      { accessorySelection: { version: "x" } },
    ])
    expect(warnings).toEqual([
      { code: "ACCESSORY_SELECTION_INVALID_DROPPED", index: 0 },
      { code: "ACCESSORY_SELECTION_INVALID_DROPPED", index: 2 },
    ])
  })

  it("accessorySelection null é tratada como ausente (sem warning, sem chave)", () => {
    const { lines, warnings } = sanitizeSaleLinesPayload([{ inventoryId: "prod-1", accessorySelection: null }])
    expect(lines[0]).not.toHaveProperty("accessorySelection")
    expect(warnings).toEqual([])
  })
})
