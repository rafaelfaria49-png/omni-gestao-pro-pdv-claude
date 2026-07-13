import { describe, expect, it } from "vitest"
import { readAccessorySelectionForDisplay } from "./accessory-selection-readback"

describe("readAccessorySelectionForDisplay", () => {
  it("1. seleção completa válida — modelo e cor", () => {
    const r = readAccessorySelectionForDisplay({
      accessorySelection: {
        version: 1,
        deviceModelKey: "samsung_galaxy_a06",
        deviceBrand: "Samsung",
        deviceModelName: "Samsung Galaxy A06",
        colorKey: "preto",
        colorLabel: "Preto",
      },
    })
    expect(r).toEqual({ hasSelection: true, modelLabel: "Samsung Galaxy A06", colorLabel: "Preto" })
  })

  it("2. somente modelo (sem cor)", () => {
    const r = readAccessorySelectionForDisplay({
      accessorySelection: { version: 1, deviceModelName: "Motorola Moto G75" },
    })
    expect(r).toEqual({ hasSelection: true, modelLabel: "Motorola Moto G75", colorLabel: undefined })
  })

  it("3. somente cor (sem modelo)", () => {
    const r = readAccessorySelectionForDisplay({
      accessorySelection: { version: 1, colorKey: "azul", colorLabel: "Azul" },
    })
    expect(r).toEqual({ hasSelection: true, modelLabel: undefined, colorLabel: "Azul" })
  })

  it("4. cor personalizada (customColorLabel prevalece sobre colorLabel genérico 'Outra')", () => {
    const r = readAccessorySelectionForDisplay({
      accessorySelection: { version: 1, colorKey: "outra", colorLabel: "Outra", customColorLabel: "Azul personalizada" },
    })
    expect(r.colorLabel).toBe("Azul personalizada")
  })

  it("5. ausência total de accessorySelection", () => {
    const r = readAccessorySelectionForDisplay({ inventoryId: "prod-1", name: "Produto comum" })
    expect(r).toEqual({ hasSelection: false })
  })

  it("6. accessorySelection null é tratada como ausente", () => {
    const r = readAccessorySelectionForDisplay({ inventoryId: "prod-1", accessorySelection: null })
    expect(r).toEqual({ hasSelection: false })
  })

  it("7. accessorySelection com shape inválida (objeto vazio) não quebra e é tratada como ausente", () => {
    const r = readAccessorySelectionForDisplay({ accessorySelection: {} })
    expect(r).toEqual({ hasSelection: false })
  })

  it("8. version desconhecida é descartada sem lançar erro", () => {
    const r = readAccessorySelectionForDisplay({ accessorySelection: { version: 99, deviceModelName: "X" } })
    expect(r).toEqual({ hasSelection: false })
  })

  it("9. rawLine null (payload/linha ausente) não lança e retorna ausência honesta", () => {
    expect(readAccessorySelectionForDisplay(null)).toEqual({ hasSelection: false })
    expect(readAccessorySelectionForDisplay(undefined)).toEqual({ hasSelection: false })
  })

  it("10. rawLine sem a chave accessorySelection (payload sem lines/linha crua) não lança", () => {
    expect(readAccessorySelectionForDisplay({})).toEqual({ hasSelection: false })
    expect(readAccessorySelectionForDisplay("string-invalida")).toEqual({ hasSelection: false })
    expect(readAccessorySelectionForDisplay(42)).toEqual({ hasSelection: false })
  })

  it("11. venda antiga (linha no formato pré-004B, sem accessorySelection) continua aceita", () => {
    const r = readAccessorySelectionForDisplay({
      inventoryId: "prod-9",
      name: "Produto antigo",
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
    })
    expect(r).toEqual({ hasSelection: false })
  })

  it("12. linha avulsa com accessorySelection é lida normalmente", () => {
    const r = readAccessorySelectionForDisplay({
      inventoryId: "__avulso__",
      isAvulso: true,
      accessorySelection: { version: 1, colorKey: "preto", colorLabel: "Preto" },
    })
    expect(r).toEqual({ hasSelection: true, modelLabel: undefined, colorLabel: "Preto" })
  })

  it("13. duas linhas do mesmo produto com seleções diferentes produzem leituras independentes", () => {
    const linha1 = { inventoryId: "prod-1", accessorySelection: { version: 1, colorKey: "preto", colorLabel: "Preto" } }
    const linha2 = { inventoryId: "prod-1", accessorySelection: { version: 1, colorKey: "azul", colorLabel: "Azul" } }
    expect(readAccessorySelectionForDisplay(linha1).colorLabel).toBe("Preto")
    expect(readAccessorySelectionForDisplay(linha2).colorLabel).toBe("Azul")
  })

  it("14. não infere modelo/cor a partir do nome do produto", () => {
    const r = readAccessorySelectionForDisplay({
      inventoryId: "prod-1",
      name: "Capinha — Samsung Galaxy A06 — Preto",
      // Sem accessorySelection estruturada — mesmo com o nome expandido, não deve inferir nada.
    })
    expect(r).toEqual({ hasSelection: false })
  })

  it("15. não muta o objeto de entrada", () => {
    const input = { inventoryId: "prod-1", accessorySelection: { version: 1, colorKey: "preto", colorLabel: "Preto" } }
    const snapshot = JSON.parse(JSON.stringify(input))
    readAccessorySelectionForDisplay(input)
    expect(input).toEqual(snapshot)
  })

  it("16. não expõe cartLineKey no resultado, mesmo se presente na linha crua", () => {
    const r = readAccessorySelectionForDisplay({
      inventoryId: "prod-1",
      cartLineKey: '["prod-1","samsung_galaxy_a06","preto",""]',
      accessorySelection: { version: 1, colorKey: "preto", colorLabel: "Preto" },
    })
    expect(r).not.toHaveProperty("cartLineKey")
    expect(Object.keys(r).sort()).toEqual(["colorLabel", "hasSelection", "modelLabel"].sort())
  })

  it("17. preserva o label histórico persistido, mesmo que diferente do que a paleta atual resolveria", () => {
    // colorKey fora da paleta atual (ex.: cor descontinuada) — o label persistido
    // deve prevalecer, sem recomputo/validação contra a paleta vigente.
    const r = readAccessorySelectionForDisplay({
      accessorySelection: { version: 1, colorKey: "cor_descontinuada_2019", colorLabel: "Verde Musgo (descontinuada)" },
    })
    expect(r).toEqual({ hasSelection: true, modelLabel: undefined, colorLabel: "Verde Musgo (descontinuada)" })
  })

  it("18. brand + modelName sem duplicação (modelName já contém a marca)", () => {
    const r = readAccessorySelectionForDisplay({
      accessorySelection: { version: 1, deviceBrand: "Samsung", deviceModelName: "Samsung Galaxy A06" },
    })
    expect(r.modelLabel).toBe("Samsung Galaxy A06")

    const r2 = readAccessorySelectionForDisplay({
      accessorySelection: { version: 1, deviceBrand: "Samsung", deviceModelName: "Galaxy A06" },
    })
    expect(r2.modelLabel).toBe("Samsung Galaxy A06")
  })

  it("19. customColorLabel só prevalece quando colorKey é 'outra'", () => {
    const r = readAccessorySelectionForDisplay({
      // customColorLabel presente mas colorKey != 'outra' — contrato já sanitizado nunca
      // persiste essa combinação, mas o helper deve continuar honesto ao valor de colorKey.
      accessorySelection: { version: 1, colorKey: "preto", colorLabel: "Preto", customColorLabel: "ignorado" },
    })
    expect(r.colorLabel).toBe("Preto")
  })

  it("20. valores desconhecidos/tipos inesperados não quebram a leitura", () => {
    expect(() =>
      readAccessorySelectionForDisplay({
        accessorySelection: { version: 1, deviceModelName: 123, colorKey: true, colorLabel: [] },
      }),
    ).not.toThrow()
    const r = readAccessorySelectionForDisplay({
      accessorySelection: { version: 1, deviceModelName: 123, colorKey: true, colorLabel: [] },
    })
    expect(r).toEqual({ hasSelection: false })
  })
})
