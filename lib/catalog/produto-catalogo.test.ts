import { describe, it, expect } from "vitest"
import {
  normalizeProduto,
  readProdutoMetadata,
  fromProdutoDTO,
  fromInventoryItem,
} from "@/lib/catalog/produto-catalogo"

describe("readProdutoMetadata", () => {
  it("objeto válido passa; não-objeto vira {}", () => {
    expect(readProdutoMetadata({ ncm: "123" })).toEqual({ ncm: "123" })
    expect(readProdutoMetadata(null)).toEqual({})
    expect(readProdutoMetadata([1, 2])).toEqual({})
    expect(readProdutoMetadata("x")).toEqual({})
  })
})

describe("normalizeProduto", () => {
  it("deriva categoria canônica, compatibilidade e texto pesquisável do nome", () => {
    const n = normalizeProduto({
      id: "p1",
      nome: "Capa Galaxy A06 Transparente",
      categoria: "Capinhas",
      marca: "Genérica",
      preco: 25,
      estoque: 10,
    })
    expect(n.categoriaCanonica).toBe("capinha")
    expect(n.categoriaSlug).toBe("capinhas")
    expect(n.compatibilidade.modelos).toContain("a06")
    expect(n.compatibilidade.marca).toBe("samsung")
    expect(n.sinonimos).toContain("capinha")
    expect(n.textoPesquisavel).toContain("a06")
    expect(n.textoPesquisavel).toContain("capa")
    // texto pesquisável é normalizado e sem duplicatas de tokens
    const toks = n.textoPesquisavel.split(" ")
    expect(new Set(toks).size).toBe(toks.length)
  })

  it("metadata explícito alimenta nomes alternativos/sinônimos/palavras-chave/descrições", () => {
    const n = normalizeProduto({
      id: "p2",
      nome: "Película 3D",
      categoria: "Películas",
      preco: 15,
      estoque: 3,
      metadata: {
        nomesAlternativos: ["Pelicula de Vidro"],
        sinonimos: ["glass"],
        palavrasChave: ["proteção"],
        compatibilidade: ["iPhone 13"],
        descricaoCurta: "Vidro temperado",
        descricaoLonga: "Película de vidro 3D resistente",
        tags: ["promo"],
        modelo: "3D",
        subcategoria: "Vidro",
      },
    })
    expect(n.nomesAlternativos).toContain("Pelicula de Vidro")
    expect(n.compatibilidade.fonte).toBe("metadata")
    expect(n.compatibilidade.modelos).toContain("iphone 13")
    expect(n.descricaoCurta).toBe("Vidro temperado")
    expect(n.tags).toContain("promo")
    expect(n.palavrasChave).toContain("proteção")
    expect(n.subcategoria).toBe("Vidro")
  })

  it("limpa marcadores '—' e é determinístico/idempotente", () => {
    const raw = { id: "p3", nome: "Cabo USB-C", sku: "—", categoria: "—", marca: "—", preco: 10, estoque: 1 }
    const a = normalizeProduto(raw)
    const b = normalizeProduto(raw)
    expect(a.sku).toBe("")
    expect(a.categoria).toBe("")
    expect(a.marca).toBe("")
    expect(a).toEqual(b)
  })
})

describe("adaptadores de fonte", () => {
  it("fromProdutoDTO mapeia barras→barcode", () => {
    const r = fromProdutoDTO({ id: "x", nome: "N", barras: "789", categoria: "C", preco: 1, estoque: 2 })
    expect(r.barcode).toBe("789")
    expect(normalizeProduto(r).barcode).toBe("789")
  })
  it("fromInventoryItem mapeia name→nome e category→categoria", () => {
    const r = fromInventoryItem({ id: "y", name: "Fone", category: "fone", price: 5, stock: 9 })
    const n = normalizeProduto(r)
    expect(n.nomePrincipal).toBe("Fone")
    expect(n.categoriaCanonica).toBe("fone")
  })
})
