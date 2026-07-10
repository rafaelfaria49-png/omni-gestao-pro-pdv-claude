import { describe, expect, expectTypeOf, it } from "vitest"
import {
  ACESSORIO_CORES_PADRAO,
  getAcessorioCorByKey,
  isAcessorioColorKey,
  resolveAcessorioColorLabel,
  type AcessorioCor,
} from "./cores"

type IsReadonlyArray<T> = T extends readonly unknown[] ? (T extends unknown[] ? false : true) : false

describe("ACESSORIO_CORES_PADRAO", () => {
  it("contém as 18 cores na ordem canônica", () => {
    expect(ACESSORIO_CORES_PADRAO).toHaveLength(18)
    expect(ACESSORIO_CORES_PADRAO.map((cor) => cor.key)).toEqual([
      "transparente", "preto", "branco", "azul", "azul_claro", "azul_escuro",
      "verde", "verde_claro", "verde_escuro", "rosa", "lilas", "vermelho",
      "amarelo", "fume", "dourado", "prata", "colorida", "outra",
    ])
  })

  it("possui chaves únicas", () => {
    const keys = ACESSORIO_CORES_PADRAO.map((cor) => cor.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("possui somente labels não vazios", () => {
    expect(ACESSORIO_CORES_PADRAO.every((cor) => cor.label.trim().length > 0)).toBe(true)
  })

  it("é readonly no contrato TypeScript e congelada em runtime", () => {
    expectTypeOf<IsReadonlyArray<typeof ACESSORIO_CORES_PADRAO>>().toEqualTypeOf<true>()
    expectTypeOf(ACESSORIO_CORES_PADRAO).toMatchTypeOf<readonly AcessorioCor[]>()
    expect(Object.isFrozen(ACESSORIO_CORES_PADRAO)).toBe(true)
    expect(ACESSORIO_CORES_PADRAO.every(Object.isFrozen)).toBe(true)
  })
})

describe("helpers de cores", () => {
  it("consulta uma cor por key", () => {
    expect(getAcessorioCorByKey("lilas")).toEqual({ key: "lilas", label: "Lilás" })
  })

  it("resolve o label canônico", () => {
    expect(resolveAcessorioColorLabel("fume")).toBe("Fumê")
    expect(resolveAcessorioColorLabel("azul_claro")).toBe("Azul claro")
  })

  it("rejeita key desconhecida", () => {
    expect(isAcessorioColorKey("vinho")).toBe(false)
    expect(getAcessorioCorByKey("vinho")).toBeNull()
    expect(resolveAcessorioColorLabel("vinho")).toBeNull()
  })

  it("rejeita valores não textuais", () => {
    expect(isAcessorioColorKey(null)).toBe(false)
    expect(isAcessorioColorKey(1)).toBe(false)
  })
})
