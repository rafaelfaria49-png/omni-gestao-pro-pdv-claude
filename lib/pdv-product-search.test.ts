import { describe, expect, it } from "vitest"
import { filterPdvCatalogBySearch, scorePdvSearch } from "./pdv-product-search"
import type { PdvCatalogProduct } from "./pdv-catalog"

function prod(p: Partial<PdvCatalogProduct> & { name: string }): PdvCatalogProduct {
  return { id: p.sku ?? p.name, price: 10, stock: 5, category: "Geral", ...p }
}

const CATALOG: PdvCatalogProduct[] = [
  prod({ name: "Capinha Samsung A06", sku: "CAP-A06", barcode: "7890000000001", category: "Capinhas" }),
  prod({ name: "Capinha iPhone 15", sku: "CAP-IP15", category: "Capinhas" }),
  prod({ name: "Película 3D Samsung A06", sku: "PEL-A06", category: "Películas" }),
  prod({ name: "Cabo de Dados USB-C", sku: "CABO-USBC", barcode: "7890000000002", category: "Cabos" }),
  prod({ name: "Cabo Lightning iPhone", sku: "CABO-LTN", category: "Cabos" }),
  prod({ name: "Copo Infantil Azul", sku: "COPO-INF", category: "Utilidades" }),
  prod({ name: "Carregador Turbo 20W", sku: "CARR-20W", category: "Carregadores" }),
  prod({ name: "Fone de Ouvido", sku: "FONE-1", category: "Áudio" }),
]

function names(list: PdvCatalogProduct[]): string[] {
  return list.map((p) => p.name)
}

describe("filterPdvCatalogBySearch — busca parcial", () => {
  it('"capi" encontra "Capinha Samsung A06"', () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "capi"))).toContain("Capinha Samsung A06")
  })

  it('"cabo" encontra "Cabo de Dados USB-C"', () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "cabo"))).toContain("Cabo de Dados USB-C")
  })

  it('"carreg" encontra "Carregador Turbo 20W"', () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "carreg"))).toContain("Carregador Turbo 20W")
  })

  it('"pel" encontra "Película 3D Samsung A06"', () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "pel"))).toContain("Película 3D Samsung A06")
  })
})

describe("filterPdvCatalogBySearch — múltiplas palavras (qualquer ordem)", () => {
  it('"copo infantil" encontra "Copo Infantil Azul"', () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "copo infantil"))).toContain("Copo Infantil Azul")
  })

  it('"infantil copo" (ordem invertida) também encontra', () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "infantil copo"))).toContain("Copo Infantil Azul")
  })

  it('"a06 capinha" encontra "Capinha Samsung A06"', () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "a06 capinha"))).toContain("Capinha Samsung A06")
  })

  it('"cabo iphone" encontra "Cabo Lightning iPhone"', () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "cabo iphone"))).toContain("Cabo Lightning iPhone")
  })
})

describe("filterPdvCatalogBySearch — normalização", () => {
  it("busca sem acento encontra com acento (pelicula → Película)", () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "pelicula"))).toContain("Película 3D Samsung A06")
  })

  it("CAIXA ALTA e espaços extras não atrapalham", () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "  CAPINHA   "))).toContain("Capinha Samsung A06")
  })

  it('separadores convergem: "usb c", "usb-c" e "usbc" encontram "Cabo de Dados USB-C"', () => {
    expect(names(filterPdvCatalogBySearch(CATALOG, "usb c"))).toContain("Cabo de Dados USB-C")
    expect(names(filterPdvCatalogBySearch(CATALOG, "usb-c"))).toContain("Cabo de Dados USB-C")
    expect(names(filterPdvCatalogBySearch(CATALOG, "usbc"))).toContain("Cabo de Dados USB-C")
  })
})

describe("filterPdvCatalogBySearch — ordenação por relevância", () => {
  it("match exato de SKU/barcode vem primeiro", () => {
    const catalog: PdvCatalogProduct[] = [
      prod({ name: "777 Peças Quebra-Cabeça", sku: "QC-1" }),
      prod({ name: "Boneca Clássica", sku: "777" }),
    ]
    const result = filterPdvCatalogBySearch(catalog, "777")
    expect(result[0]?.name).toBe("Boneca Clássica")
  })

  it("nome que começa com o termo vence nome que apenas contém", () => {
    const catalog: PdvCatalogProduct[] = [
      prod({ name: "Mini Cabo Extra", sku: "X1" }),
      prod({ name: "Cabo Reforçado", sku: "X2" }),
    ]
    const result = filterPdvCatalogBySearch(catalog, "cabo")
    expect(result[0]?.name).toBe("Cabo Reforçado")
  })

  it("match exato de código pontua acima de match por nome", () => {
    const exact = prod({ name: "Boneca", sku: "ABC123" })
    const byName = prod({ name: "ABC123 Brinquedo", sku: "Z9" })
    expect(scorePdvSearch(exact, "ABC123")).toBeGreaterThan(scorePdvSearch(byName, "ABC123"))
  })
})

describe("filterPdvCatalogBySearch — isolamento (array já escopado por loja)", () => {
  it("nunca retorna item fora do catálogo recebido (loja ativa)", () => {
    const lojaAtiva: PdvCatalogProduct[] = [
      prod({ name: "Produto da Loja 2", sku: "L2-1" }),
    ]
    const foreignSku = "L1-EXCLUSIVO"
    const result = filterPdvCatalogBySearch(lojaAtiva, foreignSku)
    expect(result).toHaveLength(0)
    // e qualquer busca só pode devolver itens que estavam no array de entrada
    const all = filterPdvCatalogBySearch(lojaAtiva, "produto")
    expect(all.every((p) => lojaAtiva.includes(p))).toBe(true)
  })
})
