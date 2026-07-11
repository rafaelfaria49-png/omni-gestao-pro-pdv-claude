import { describe, expect, it } from "vitest"
import {
  accessoryConfigRequiresSelection,
  buildAccessoryCartLine,
  resolveAccessoryColorOptions,
  sameAccessoryCartLine,
  sumCartQuantityByInventoryId,
} from "./cart-line"
import { ACESSORIO_CORES_PADRAO } from "./cores"
import type { ProdutoAcessoriosMetadataV1 } from "./types"

/**
 * PDV-ACESSORIOS-SELETOR-MODELO-COR-003 — contrato puro da linha do carrinho.
 */

const CONFIG_CAPINHA: ProdutoAcessoriosMetadataV1 = {
  version: 1,
  tipo: "capinha",
  exigeModelo: true,
  exigeCor: true,
  usaCoresPadrao: true,
}

const CONFIG_PELICULA: ProdutoAcessoriosMetadataV1 = {
  version: 1,
  tipo: "pelicula",
  exigeModelo: true,
  exigeCor: false,
  usaCoresPadrao: false,
}

const SELECAO_A06_PRETO = {
  version: 1,
  deviceModelKey: "samsung_galaxy_a06",
  deviceBrand: "Samsung",
  deviceModelName: "Galaxy A06",
  colorKey: "preto",
}

function buildCapinha(selection: unknown) {
  return buildAccessoryCartLine({
    inventoryId: "CAP-SIL-001",
    productName: "Capinha silicone",
    config: CONFIG_CAPINHA,
    selection,
  })
}

describe("buildAccessoryCartLine — chave determinística e descrição", () => {
  it("mesmo produto/modelo/cor gera a MESMA chave (idempotente)", () => {
    const a = buildCapinha(SELECAO_A06_PRETO)
    const b = buildCapinha({ ...SELECAO_A06_PRETO })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.line.cartLineKey).toBe(b.line.cartLineKey)
    expect(a.line.lineDescription).toBe("Capinha silicone — Samsung Galaxy A06 — Preto")
  })

  it("mesma capinha e modelo com cor diferente gera chave DIFERENTE", () => {
    const preto = buildCapinha(SELECAO_A06_PRETO)
    const transparente = buildCapinha({ ...SELECAO_A06_PRETO, colorKey: "transparente" })
    expect(preto.ok && transparente.ok).toBe(true)
    if (!preto.ok || !transparente.ok) return
    expect(preto.line.cartLineKey).not.toBe(transparente.line.cartLineKey)
  })

  it("mesma capinha e cor com modelo diferente gera chave DIFERENTE", () => {
    const a06 = buildCapinha(SELECAO_A06_PRETO)
    const moto = buildCapinha({
      ...SELECAO_A06_PRETO,
      deviceModelKey: "motorola_moto_g35",
      deviceBrand: "Motorola",
      deviceModelName: "Moto G35",
    })
    expect(a06.ok && moto.ok).toBe(true)
    if (!a06.ok || !moto.ok) return
    expect(a06.line.cartLineKey).not.toBe(moto.line.cartLineKey)
    expect(moto.line.lineDescription).toBe("Capinha silicone — Motorola Moto G35 — Preto")
  })

  it("película sem cor tem chave estável e descrição sem parte de cor", () => {
    const build = () =>
      buildAccessoryCartLine({
        inventoryId: "PEL-3D-001",
        productName: "Película 3D",
        config: CONFIG_PELICULA,
        selection: {
          version: 1,
          deviceModelKey: "motorola_moto_g35",
          deviceBrand: "Motorola",
          deviceModelName: "Moto G35",
        },
      })
    const a = build()
    const b = build()
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.line.cartLineKey).toBe(b.line.cartLineKey)
    expect(a.line.lineDescription).toBe("Película 3D — Motorola Moto G35")
  })

  it("normaliza cor personalizada (espaços/caixa) na chave, preservando o label digitado", () => {
    const base = {
      version: 1,
      deviceModelKey: "apple_iphone_13",
      deviceBrand: "Apple",
      deviceModelName: "iPhone 13",
      colorKey: "outra",
    }
    const a = buildCapinha({ ...base, customColorLabel: "  Azul   Bebê " })
    const b = buildCapinha({ ...base, customColorLabel: "azul bebê" })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.line.cartLineKey).toBe(b.line.cartLineKey)
    // O label digitado é preservado (trim nas pontas); a normalização vive só na chave.
    expect(a.line.lineDescription).toBe("Capinha silicone — Apple iPhone 13 — Azul   Bebê")
    expect(a.line.selection.customColorLabel).toBe("Azul   Bebê")
  })

  it("seleção inválida/incompleta NÃO passa silenciosamente (ok:false com erros)", () => {
    const semModelo = buildCapinha({ version: 1, colorKey: "preto" })
    expect(semModelo.ok).toBe(false)
    if (!semModelo.ok) {
      expect(semModelo.errors.some((e) => e.code === "MODEL_REQUIRED")).toBe(true)
    }

    const semCor = buildCapinha({
      version: 1,
      deviceModelKey: "samsung_galaxy_a06",
      deviceModelName: "Galaxy A06",
    })
    expect(semCor.ok).toBe(false)
    if (!semCor.ok) {
      expect(semCor.errors.some((e) => e.code === "COLOR_REQUIRED")).toBe(true)
    }

    const outraSemLabel = buildCapinha({ ...SELECAO_A06_PRETO, colorKey: "outra" })
    expect(outraSemLabel.ok).toBe(false)
    if (!outraSemLabel.ok) {
      expect(outraSemLabel.errors.some((e) => e.code === "CUSTOM_COLOR_REQUIRED")).toBe(true)
    }

    const vazia = buildCapinha(undefined)
    expect(vazia.ok).toBe(false)
  })
})

describe("accessoryConfigRequiresSelection — produto comum mantém o legado", () => {
  it("produto comum (sem config / config inválida) não exige seleção", () => {
    expect(accessoryConfigRequiresSelection(undefined)).toBe(false)
    expect(accessoryConfigRequiresSelection(null)).toBe(false)
    expect(accessoryConfigRequiresSelection({ version: 99, tipo: "capinha" })).toBe(false)
    expect(accessoryConfigRequiresSelection("capinha")).toBe(false)
  })

  it("config sem exigências não abre modal; capinha/película exigem", () => {
    expect(
      accessoryConfigRequiresSelection({
        version: 1,
        tipo: "acessorio_generico",
        exigeModelo: false,
        exigeCor: false,
        usaCoresPadrao: false,
      }),
    ).toBe(false)
    expect(accessoryConfigRequiresSelection(CONFIG_CAPINHA)).toBe(true)
    expect(accessoryConfigRequiresSelection(CONFIG_PELICULA)).toBe(true)
  })
})

describe("resolveAccessoryColorOptions — lista global sem duplicação", () => {
  it("usa a lista canônica inteira quando exige cor sem subconjunto", () => {
    const options = resolveAccessoryColorOptions(CONFIG_CAPINHA)
    expect(options).toHaveLength(ACESSORIO_CORES_PADRAO.length)
    // Referências da lista global — nenhuma cópia/duplicação de labels.
    expect(options[0]).toBe(ACESSORIO_CORES_PADRAO[0])
  })

  it("filtra pelo subconjunto coresPermitidas quando presente", () => {
    const options = resolveAccessoryColorOptions({
      ...CONFIG_CAPINHA,
      tipo: "acessorio_generico",
      coresPermitidas: ["preto", "azul"],
    })
    expect(options.map((c) => c.key)).toEqual(["preto", "azul"])
  })

  it("retorna vazio quando a config não exige cor", () => {
    expect(resolveAccessoryColorOptions(CONFIG_PELICULA)).toHaveLength(0)
    expect(resolveAccessoryColorOptions(null)).toHaveLength(0)
  })
})

describe("agrupamento e estoque agregado", () => {
  it("sameAccessoryCartLine agrupa apenas chaves iguais e definidas", () => {
    const a = buildCapinha(SELECAO_A06_PRETO)
    if (!a.ok) throw new Error("setup")
    expect(sameAccessoryCartLine(a.line.cartLineKey, a.line.cartLineKey)).toBe(true)
    expect(sameAccessoryCartLine(a.line.cartLineKey, "outra-chave")).toBe(false)
    expect(sameAccessoryCartLine(undefined, undefined)).toBe(false)
    expect(sameAccessoryCartLine("", "")).toBe(false)
  })

  it("soma TODAS as linhas do mesmo produto real (seleções diferentes) para o estoque", () => {
    const lines = [
      { inventoryId: "CAP-SIL-001", quantity: 2 }, // A06 Preto × 2
      { inventoryId: "CAP-SIL-001", quantity: 1 }, // Moto G35 Azul × 1
      { inventoryId: "OUTRO-PROD", quantity: 5 },
    ]
    expect(sumCartQuantityByInventoryId(lines, "CAP-SIL-001")).toBe(3)
    expect(sumCartQuantityByInventoryId(lines, "OUTRO-PROD")).toBe(5)
    expect(sumCartQuantityByInventoryId([], "CAP-SIL-001")).toBe(0)
  })
})
