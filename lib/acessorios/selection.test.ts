import { describe, expect, it } from "vitest"
import {
  ACCESSORY_SELECTION_TEXT_LIMITS,
  buildAccessoryConsolidationKey,
  sanitizeAccessorySelection,
  validateAccessorySelectionAgainstConfig,
} from "./selection"

const requiredConfig = {
  version: 1,
  tipo: "capinha",
  exigeModelo: true,
  exigeCor: true,
  usaCoresPadrao: true,
} as const

describe("sanitizeAccessorySelection", () => {
  it("saneia seleção válida e resolve label canônico", () => {
    const output = sanitizeAccessorySelection({
      version: 1,
      deviceModelKey: " samsung_galaxy_a06 ",
      deviceBrand: " Samsung ",
      deviceModelName: " Samsung Galaxy A06 ",
      colorKey: "preto",
      colorLabel: "texto não confiável",
    })
    expect(output).toEqual({
      version: 1,
      deviceModelKey: "samsung_galaxy_a06",
      deviceBrand: "Samsung",
      deviceModelName: "Samsung Galaxy A06",
      colorKey: "preto",
      colorLabel: "Preto",
    })
    expect(Object.isFrozen(output)).toBe(true)
  })

  it("remove strings vazias", () => {
    expect(sanitizeAccessorySelection({
      version: 1,
      deviceModelKey: " ",
      deviceBrand: "",
      deviceModelName: "  ",
    })).toEqual({ version: 1 })
  })

  it("rejeita versão inválida e valor não-objeto", () => {
    expect(sanitizeAccessorySelection({ version: 2 })).toBeNull()
    expect(sanitizeAccessorySelection("seleção")).toBeNull()
  })

  it("rejeita colorKey desconhecida", () => {
    expect(sanitizeAccessorySelection({ version: 1, colorKey: "vinho" })).toBeNull()
  })

  it("preserva customColorLabel somente para outra", () => {
    expect(sanitizeAccessorySelection({ version: 1, colorKey: "outra", customColorLabel: " Vinho " })).toEqual({
      version: 1,
      colorKey: "outra",
      colorLabel: "Outra",
      customColorLabel: "Vinho",
    })
    expect(sanitizeAccessorySelection({ version: 1, colorKey: "preto", customColorLabel: "Vinho" }))
      .not.toHaveProperty("customColorLabel")
  })

  it("limita textos excessivos deterministicamente", () => {
    const output = sanitizeAccessorySelection({
      version: 1,
      deviceModelKey: "k".repeat(500),
      deviceBrand: "b".repeat(500),
      deviceModelName: "m".repeat(500),
      colorKey: "outra",
      customColorLabel: "c".repeat(500),
    })
    expect(output?.deviceModelKey).toHaveLength(ACCESSORY_SELECTION_TEXT_LIMITS.deviceModelKey)
    expect(output?.deviceBrand).toHaveLength(ACCESSORY_SELECTION_TEXT_LIMITS.deviceBrand)
    expect(output?.deviceModelName).toHaveLength(ACCESSORY_SELECTION_TEXT_LIMITS.deviceModelName)
    expect(output?.customColorLabel).toHaveLength(ACCESSORY_SELECTION_TEXT_LIMITS.customColorLabel)
  })

  it("não muta a seleção de entrada", () => {
    const input = { version: 1, deviceModelName: " Modelo ", colorKey: "preto" }
    const snapshot = { ...input }
    sanitizeAccessorySelection(input)
    expect(input).toEqual(snapshot)
  })

  it("não adiciona campos monetários ou de estoque", () => {
    const output = sanitizeAccessorySelection({
      version: 1,
      colorKey: "preto",
      price: 10,
      custo: 2,
      stock: 5,
      desconto: 1,
      quantity: 3,
    })
    expect(Object.keys(output ?? {})).toEqual(["version", "colorKey", "colorLabel"])
  })
})

describe("validateAccessorySelectionAgainstConfig", () => {
  it("aceita seleção completa", () => {
    const result = validateAccessorySelectionAgainstConfig(requiredConfig, {
      version: 1,
      deviceModelKey: "samsung_galaxy_a06",
      deviceModelName: "Samsung Galaxy A06",
      colorKey: "preto",
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("modelo obrigatório ausente gera MODEL_REQUIRED", () => {
    const result = validateAccessorySelectionAgainstConfig(requiredConfig, { version: 1, colorKey: "preto" })
    expect(result.errors.filter((error) => error.code === "MODEL_REQUIRED")).toHaveLength(2)
  })

  it("cor obrigatória ausente gera COLOR_REQUIRED", () => {
    const result = validateAccessorySelectionAgainstConfig(requiredConfig, {
      version: 1,
      deviceModelKey: "x",
      deviceModelName: "Modelo X",
    })
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "COLOR_REQUIRED", field: "colorKey" }))
  })

  it("outra sem customColorLabel gera CUSTOM_COLOR_REQUIRED", () => {
    const result = validateAccessorySelectionAgainstConfig(
      { ...requiredConfig, exigeModelo: false },
      { version: 1, colorKey: "outra" },
    )
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "CUSTOM_COLOR_REQUIRED" }))
  })

  it("cor fora do subconjunto gera COLOR_NOT_ALLOWED", () => {
    const result = validateAccessorySelectionAgainstConfig(
      { ...requiredConfig, exigeModelo: false, coresPermitidas: ["preto"] },
      { version: 1, colorKey: "azul" },
    )
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "COLOR_NOT_ALLOWED" }))
  })

  it("lista vazia rejeita toda cor selecionada", () => {
    const result = validateAccessorySelectionAgainstConfig(
      { ...requiredConfig, exigeModelo: false, exigeCor: false, coresPermitidas: [] },
      { version: 1, colorKey: "preto" },
    )
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "COLOR_NOT_ALLOWED" }))
  })

  it("campos opcionais podem ficar ausentes", () => {
    const result = validateAccessorySelectionAgainstConfig(
      { ...requiredConfig, exigeModelo: false, exigeCor: false },
      { version: 1 },
    )
    expect(result.valid).toBe(true)
  })

  it("payload antigo sem seleção é compatível com produto comum", () => {
    expect(validateAccessorySelectionAgainstConfig(null, undefined)).toEqual({
      valid: true,
      selection: null,
      errors: [],
    })
  })

  it("payload ausente recebe obrigatórios configurados", () => {
    const result = validateAccessorySelectionAgainstConfig(requiredConfig, undefined)
    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.code)).toEqual(["MODEL_REQUIRED", "MODEL_REQUIRED", "COLOR_REQUIRED"])
  })

  it("payload fornecido mas inválido gera INVALID_SELECTION", () => {
    const result = validateAccessorySelectionAgainstConfig(requiredConfig, { version: 9 })
    expect(result.errors).toEqual([
      { code: "INVALID_SELECTION", field: "accessorySelection", message: "Seleção de acessório inválida." },
    ])
  })

  it("resultado e erros são imutáveis", () => {
    const result = validateAccessorySelectionAgainstConfig(requiredConfig, undefined)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.errors)).toBe(true)
    expect(result.errors.every(Object.isFrozen)).toBe(true)
  })
})

describe("buildAccessoryConsolidationKey", () => {
  const base = {
    version: 1,
    deviceModelKey: "samsung_galaxy_a06",
    deviceModelName: "Samsung Galaxy A06",
    colorKey: "preto",
  } as const

  it("mesma seleção normalizada gera a mesma chave", () => {
    expect(buildAccessoryConsolidationKey(" SKU-1 ", base)).toBe(buildAccessoryConsolidationKey("SKU-1", { ...base }))
  })

  it("modelo diferente gera chave diferente", () => {
    expect(buildAccessoryConsolidationKey("SKU-1", base)).not.toBe(
      buildAccessoryConsolidationKey("SKU-1", { ...base, deviceModelKey: "apple_iphone_11" }),
    )
  })

  it("cor diferente gera chave diferente", () => {
    expect(buildAccessoryConsolidationKey("SKU-1", base)).not.toBe(
      buildAccessoryConsolidationKey("SKU-1", { ...base, colorKey: "azul" }),
    )
  })

  it("customColorLabel diferente gera chave diferente", () => {
    const outra = { ...base, colorKey: "outra" as const }
    expect(buildAccessoryConsolidationKey("SKU-1", { ...outra, customColorLabel: "Vinho" })).not.toBe(
      buildAccessoryConsolidationKey("SKU-1", { ...outra, customColorLabel: "Marsala" }),
    )
  })

  it("normaliza espaços e caixa de customColorLabel", () => {
    const outra = { ...base, colorKey: "outra" as const }
    expect(buildAccessoryConsolidationKey("SKU-1", { ...outra, customColorLabel: "  Vinho Tinto  " })).toBe(
      buildAccessoryConsolidationKey("SKU-1", { ...outra, customColorLabel: "vinho   tinto" }),
    )
  })

  it("inventoryId diferente gera chave diferente", () => {
    expect(buildAccessoryConsolidationKey("SKU-1", base)).not.toBe(buildAccessoryConsolidationKey("SKU-2", base))
  })

  it("seleção ausente gera chave estável para produto comum", () => {
    expect(buildAccessoryConsolidationKey(" SKU-1 ")).toBe(buildAccessoryConsolidationKey("SKU-1", undefined))
  })
})
