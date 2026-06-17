import { describe, it, expect } from "vitest"
import {
  gerarSugestoesProdutoIA,
  gerarDescricoesProduto,
  sugestoesParaMetadata,
  mesclarSugestoesComMetadata,
} from "@/lib/catalog/produto-sugestoes"
import { normalizeProduto } from "@/lib/catalog/produto-catalogo"

describe("gerarSugestoesProdutoIA", () => {
  it("deriva sugestões completas de 'Capa Galaxy A06'", () => {
    const s = gerarSugestoesProdutoIA({
      id: "p1",
      nome: "Capa Galaxy A06",
      categoria: "Capinhas",
      preco: 25,
      estoque: 7,
    })
    expect(s.categoria).toBe("capinha")
    expect(s.marca).toBe("samsung")
    expect(s.compatibilidade).toContain("a06")
    expect(s.sinonimos).toContain("capinha")
    expect(s.descricaoCurta.toLowerCase()).toContain("compatível com")
    expect(s.descricaoLonga.length).toBeGreaterThan(0)
    expect(s.tags).toContain("a06")
  })

  it("produto genérico sem sinal não inventa compatibilidade", () => {
    const s = gerarSugestoesProdutoIA({ id: "p2", nome: "Caderno 100 folhas", categoria: "", preco: 9, estoque: 3 })
    expect(s.compatibilidade).toEqual([])
    expect(s.descricaoLonga).toContain("Caderno 100 folhas")
  })
})

describe("gerarDescricoesProduto", () => {
  it("curta usa compatibilidade quando existe", () => {
    const n = normalizeProduto({ id: "x", nome: "Película iPhone 13", categoria: "Películas", preco: 15, estoque: 1 })
    const d = gerarDescricoesProduto(n)
    expect(d.curta.toLowerCase()).toContain("iphone 13")
    expect(d.longa.toLowerCase()).toContain("película")
  })
})

describe("sugestoesParaMetadata", () => {
  it("mapeia categoria/marca para *Sugerida e omite vazios", () => {
    const meta = sugestoesParaMetadata({
      categoria: "capinha",
      marca: "samsung",
      modelo: "",
      sinonimos: ["capa"],
      palavrasChave: [],
      compatibilidade: ["a06"],
      descricaoCurta: "x",
      descricaoLonga: "",
      tags: ["a06"],
    })
    expect(meta.categoriaSugerida).toBe("capinha")
    expect(meta.marcaSugerida).toBe("samsung")
    expect(meta.sinonimos).toEqual(["capa"])
    expect(meta.compatibilidade).toEqual(["a06"])
    expect(meta.descricaoCurta).toBe("x")
    expect("modelo" in meta).toBe(false)
    expect("palavrasChave" in meta).toBe(false)
    expect("descricaoLonga" in meta).toBe(false)
  })
})

describe("mesclarSugestoesComMetadata", () => {
  const base = gerarSugestoesProdutoIA({ id: "p", nome: "Capa Galaxy A06", categoria: "Capinhas", preco: 1, estoque: 1 })

  it("metadata salvo sobrescreve a sugestão fresca", () => {
    const merged = mesclarSugestoesComMetadata(base, {
      descricaoCurta: "Texto do operador",
      tags: ["promo"],
      categoriaSugerida: "Capa Premium",
    })
    expect(merged.descricaoCurta).toBe("Texto do operador")
    expect(merged.tags).toEqual(["promo"])
    expect(merged.categoria).toBe("Capa Premium")
    // campos não salvos mantêm a sugestão
    expect(merged.compatibilidade).toEqual(base.compatibilidade)
  })

  it("metadata nulo retorna a base intacta", () => {
    expect(mesclarSugestoesComMetadata(base, null)).toEqual(base)
  })
})
