import { describe, it, expect } from "vitest"
import {
  resolveCategoriaCanonica,
  expandTermoSinonimos,
  rotuloCategoria,
  CATEGORIA_SINONIMOS,
} from "@/lib/catalog/produto-sinonimos"

describe("resolveCategoriaCanonica", () => {
  it("resolve sinônimo exato (com e sem acento)", () => {
    expect(resolveCategoriaCanonica("capa")).toBe("capinha")
    expect(resolveCategoriaCanonica("case")).toBe("capinha")
    expect(resolveCategoriaCanonica("película")).toBe("pelicula")
    expect(resolveCategoriaCanonica("pelicula")).toBe("pelicula")
    expect(resolveCategoriaCanonica("display")).toBe("tela")
  })

  it("resolve por palavra contida em termo composto", () => {
    expect(resolveCategoriaCanonica("capinha transparente")).toBe("capinha")
    expect(resolveCategoriaCanonica("bateria original")).toBe("bateria")
  })

  it("retorna null quando nada bate (nunca inventa)", () => {
    expect(resolveCategoriaCanonica("teclado mecanico")).toBeNull()
    expect(resolveCategoriaCanonica("")).toBeNull()
  })
})

describe("expandTermoSinonimos", () => {
  it("expande para todos os sinônimos da categoria, incluindo o próprio termo", () => {
    const out = expandTermoSinonimos("capa")
    expect(out).toContain("capa")
    expect(out).toContain("capinha")
    expect(out).toContain("case")
  })

  it("termo sem categoria retorna só ele mesmo (normalizado)", () => {
    expect(expandTermoSinonimos("Mochila")).toEqual(["mochila"])
  })

  it("sem duplicatas", () => {
    const out = expandTermoSinonimos("capinha")
    expect(new Set(out).size).toBe(out.length)
  })
})

describe("rotuloCategoria", () => {
  it("devolve o primeiro rótulo (preferido) da categoria", () => {
    expect(rotuloCategoria("capinha")).toBe(CATEGORIA_SINONIMOS.capinha[0])
  })
})
