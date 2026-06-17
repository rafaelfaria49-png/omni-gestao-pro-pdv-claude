import { describe, it, expect } from "vitest"
import { parseProdutoQuery, buscarProdutos } from "@/lib/catalog/produto-busca"
import { toBuscaQuery } from "@/lib/catalog/produto-fontes"
import type { PdvCatalogProduct } from "@/lib/pdv-catalog"

const prod = (id: string, name: string, extra?: Partial<PdvCatalogProduct>): PdvCatalogProduct => ({
  id,
  name,
  price: 10,
  stock: 5,
  category: "",
  ...extra,
})

describe("parseProdutoQuery", () => {
  it("'capinha a06' resolve categoria + modelo + sinônimos", () => {
    const p = parseProdutoQuery("capinha a06")
    expect(p.categoriaCanonica).toBe("capinha")
    expect(p.modelos).toContain("a06")
    expect(p.sinonimos).toContain("capa")
    expect(p.sinonimos).toContain("case")
    expect(p.termosBusca).toContain("a06")
    expect(p.termosBusca).toContain("capa")
  })

  it("detecta marca de aparelho", () => {
    const p = parseProdutoQuery("pelicula iphone 13")
    expect(p.categoriaCanonica).toBe("pelicula")
    expect(p.marca).toBe("iphone")
    expect(p.modelos).toContain("iphone 13")
  })

  it("remove stopwords e tokens curtos", () => {
    const p = parseProdutoQuery("quero uma capa para iphone")
    expect(p.tokens).not.toContain("quero")
    expect(p.tokens).not.toContain("para")
    expect(p.categoriaCanonica).toBe("capinha")
  })
})

describe("buscarProdutos", () => {
  const catalogo: PdvCatalogProduct[] = [
    prod("1", "Capa Silicone Galaxy A06", { category: "Capinhas" }),
    prod("2", "Capa Anti Impacto A06", { category: "Capinhas" }),
    prod("3", "Película 3D A06", { category: "Películas" }),
    prod("4", "Carregador Turbo 20W", { category: "Carregadores" }),
  ]

  it("'capinha a06' acha as capas via sinônimo 'capa' + modelo, sem o carregador", () => {
    const r = buscarProdutos(catalogo, "capinha a06")
    const ids = r.map((x) => x.produto.id)
    expect(ids).toContain("1")
    expect(ids).toContain("2")
    expect(ids).not.toContain("4")
    // capas (categoria capinha) rankeiam acima da película
    expect(ids.indexOf("1")).toBeLessThan(ids.indexOf("3"))
  })

  it("match exato de código vence (score alto)", () => {
    const list = [prod("a", "Item X", { sku: "ZZZ9" }), prod("b", "ZZZ9 outro nome")]
    const r = buscarProdutos(list, "ZZZ9")
    expect(r[0]!.produto.id).toBe("a")
  })

  it("query vazia → sem resultados", () => {
    expect(buscarProdutos(catalogo, "   ")).toEqual([])
  })

  it("respeita limit", () => {
    const r = buscarProdutos(catalogo, "a06", { limit: 1 })
    expect(r).toHaveLength(1)
  })

  it("integra com toBuscaQuery (fonte única de captura)", () => {
    const q = toBuscaQuery({ fonte: "voz", texto: "capinha a06" })
    const r = buscarProdutos(catalogo, q)
    expect(r.length).toBeGreaterThan(0)
  })
})
