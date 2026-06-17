import { describe, it, expect } from "vitest"
import {
  isProdutoComCompatibilidade,
  detectMarcaAparelho,
  extractModelosCompat,
  buildCompatibilidade,
} from "@/lib/catalog/produto-compatibilidade"

describe("isProdutoComCompatibilidade", () => {
  it("true para peças/acessórios", () => {
    expect(isProdutoComCompatibilidade("capinha")).toBe(true)
    expect(isProdutoComCompatibilidade("película")).toBe(true)
    expect(isProdutoComCompatibilidade("tela")).toBe(true)
    expect(isProdutoComCompatibilidade("bateria")).toBe(true)
  })
  it("false para categoria sem aparelho-alvo / vazio", () => {
    expect(isProdutoComCompatibilidade("carregador")).toBe(false) // não está no set de compat
    expect(isProdutoComCompatibilidade("")).toBe(false)
    expect(isProdutoComCompatibilidade(null)).toBe(false)
  })
})

describe("detectMarcaAparelho", () => {
  it("detecta marca normalizada no texto", () => {
    expect(detectMarcaAparelho("Capa Samsung Galaxy A06")).toBe("samsung")
    expect(detectMarcaAparelho("Película iPhone 13 Pro Max")).toBe("iphone")
    expect(detectMarcaAparelho("Bateria Redmi Note 12")).toBe("redmi")
  })
  it("null quando não há marca", () => {
    expect(detectMarcaAparelho("Cabo USB-C genérico")).toBeNull()
  })
})

describe("extractModelosCompat", () => {
  it("extrai modelos Samsung Galaxy", () => {
    expect(extractModelosCompat("Capa Galaxy A06")).toContain("a06")
    expect(extractModelosCompat("Tela Samsung S23 Ultra")).toContain("s23 ultra")
  })
  it("extrai modelos iPhone", () => {
    expect(extractModelosCompat("Película iPhone 13 Pro Max")).toContain("iphone 13 pro max")
  })
  it("extrai Redmi Note", () => {
    expect(extractModelosCompat("Bateria Redmi Note 12")).toContain("redmi note 12")
  })
  it("texto sem modelo → vazio", () => {
    expect(extractModelosCompat("Capa transparente universal")).toEqual([])
  })
})

describe("buildCompatibilidade", () => {
  it("metadata explícito tem prioridade sobre derivação", () => {
    const r = buildCompatibilidade({
      nome: "Capa Galaxy A06",
      categoria: "capinha",
      metadataCompat: ["A06", "A05"],
    })
    expect(r.fonte).toBe("metadata")
    expect(r.modelos).toEqual(["a06", "a05"])
    expect(r.aplicavel).toBe(true)
  })

  it("deriva do nome quando não há metadata", () => {
    const r = buildCompatibilidade({ nome: "Capa Galaxy A06", categoria: "capinha" })
    expect(r.fonte).toBe("derivado")
    expect(r.modelos).toContain("a06")
    expect(r.marca).toBe("samsung")
  })

  it("categoria não aplicável → não inventa modelos", () => {
    const r = buildCompatibilidade({ nome: "Teclado mecânico RGB", categoria: "outros" })
    expect(r.aplicavel).toBe(false)
    expect(r.modelos).toEqual([])
    expect(r.fonte).toBe("nenhum")
  })
})
