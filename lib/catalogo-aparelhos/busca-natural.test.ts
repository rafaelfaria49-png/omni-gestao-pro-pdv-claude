/**
 * COMPAT-BUSCA-MODELOS-NATURAL-001 — regressão da busca de modelos (CSVs reais).
 *
 * Bug de produção: digitar "iPhone" na configuração de capinha mostrava 11, 12, 13… e o iPhone 7
 * sumia — ordem alfabética ("11" < "7") + corte silencioso em 20 resultados.
 */
import { describe, expect, it } from "vitest"
import { loadCatalogoIndex } from "./catalogo-loader"
import {
  buildCatalogoIndex,
  compareModelosNatural,
  parseDeviceModels,
  searchDeviceModels,
  tokensModeloNatural,
} from "./catalogo-aparelhos"
import {
  buildLojaCatalogoIndex,
  searchDeviceModelsComLoja,
  searchDeviceModelsComLojaPagina,
  type LojaModelo,
} from "./loja-catalogo"

const index = loadCatalogoIndex()
const curtos = (q: string, limit = 20) =>
  searchDeviceModelsComLoja(index, null, q, { limit }).map((r) => index.modelByKey.get(r.modelKey)?.shortName ?? r.shortName)

/** Todas as páginas de uma busca, seguindo `nextOffset` até o fim. */
function todasAsPaginas(q: string, limit: number, loja: ReturnType<typeof buildLojaCatalogoIndex> | null = null) {
  const out: string[] = []
  let offset: number | null = 0
  let guard = 0
  while (offset !== null && guard++ < 500) {
    const page = searchDeviceModelsComLojaPagina(index, loja, q, { limit, offset })
    out.push(...page.results.map((r) => r.modelKey))
    offset = page.nextOffset
  }
  return out
}

function modeloLoja(p: Partial<LojaModelo> & Pick<LojaModelo, "brand" | "name" | "modelKey">): LojaModelo {
  return {
    id: p.modelKey,
    storeId: "loja-a",
    manufacturer: "",
    line: "",
    lancamento: "lancado",
    aliases: [],
    notes: "",
    active: true,
    version: 1,
    ...p,
  }
}

describe("ordem natural de modelos", () => {
  it("tokens: número como número, iPhone X/XR/XS como 10ª geração", () => {
    expect(tokensModeloNatural("6s Plus")).toEqual([6, "S", "PLUS"])
    expect(tokensModeloNatural("S21 FE")).toEqual(["S", 21, "FE"])
    expect(tokensModeloNatural("XS Max", "iPhone")).toEqual([10, "S", "MAX"])
    expect(tokensModeloNatural("XR", "iPhone")).toEqual([10, "R"])
    // fora do iPhone, "X" é só uma letra (ex.: Redmi Note X, POCO X6)
    expect(tokensModeloNatural("X6", "POCO")).toEqual(["X", 6])
  })

  it("compara por marca → linha → nome natural", () => {
    const m = (shortName: string, commercialLine = "iPhone", brand = "Apple") => ({ brand, commercialLine, shortName, canonicalName: "" })
    const ordem = ["6", "6 Plus", "6s", "6s Plus", "7", "7 Plus", "8", "8 Plus", "X", "XR", "XS", "XS Max", "11", "12", "12 Mini", "12 Pro", "12 Pro Max", "16", "16e", "Air", "SE 2020"]
    const embaralhado = [...ordem].reverse().map((s) => m(s))
    expect(embaralhado.sort(compareModelosNatural).map((x) => x.shortName)).toEqual(ordem)
  })
})

describe('busca "iPhone" (bug de produção)', () => {
  it("o iPhone 7 aparece já na primeira página e a sequência é a esperada", () => {
    const primeira = curtos("iPhone", 20)
    expect(primeira).toContain("7")
    const esperado = ["6", "6 Plus", "6s", "6s Plus", "7", "7 Plus", "8", "8 Plus", "X", "XR", "XS", "XS Max", "11"]
    expect(primeira.slice(0, esperado.length)).toEqual(esperado)
  })

  it('"iPhone 7" devolve o 7 primeiro (exato) e o 7 Plus em seguida — sem confundir os dois', () => {
    const r = searchDeviceModelsComLoja(index, null, "iPhone 7", { limit: 20 })
    expect(r[0].modelKey).toBe("apple_iphone_7")
    expect(r[0].matchType).toBe("exact")
    expect(r[1].modelKey).toBe("apple_iphone_7_plus")
    expect(r[1].matchType).not.toBe("exact")
    // linhas mescladas (cor da borda da película) nunca voltam como aparelho
    expect(r.map((x) => x.modelKey)).not.toContain("apple_iphone_7_branco")
  })

  it('"iPhone 12" encontra 12, 12 mini, 12 Pro e 12 Pro Max, nessa ordem', () => {
    expect(searchDeviceModelsComLoja(index, null, "iPhone 12", { limit: 20 }).map((r) => r.modelKey).slice(0, 4)).toEqual([
      "apple_iphone_12",
      "apple_iphone_12_mini",
      "apple_iphone_12_pro",
      "apple_iphone_12_pro_max",
    ])
  })
})

describe("outras linhas em ordem natural", () => {
  const posicao = (lista: string[], k: string) => {
    const i = lista.indexOf(k)
    expect(i, k).toBeGreaterThanOrEqual(0)
    return i
  }

  it("Galaxy S: S7 → S21 → S26 (S7 não está no CSV real: índice sintético)", () => {
    const csv = [
      "model_key,brand,commercial_line,canonical_name,short_name,status",
      "s26,Samsung,Galaxy S,Samsung Galaxy S26,S26,ativo",
      "s21_fe,Samsung,Galaxy S,Samsung Galaxy S21 FE,S21 FE,ativo",
      "s7,Samsung,Galaxy S,Samsung Galaxy S7,S7,ativo",
      "s21,Samsung,Galaxy S,Samsung Galaxy S21,S21,ativo",
      "s7_edge,Samsung,Galaxy S,Samsung Galaxy S7 Edge,S7 Edge,ativo",
    ].join("\n")
    const sint = buildCatalogoIndex({ models: parseDeviceModels(csv), aliases: [] })
    expect(searchDeviceModels(sint, "Galaxy S").map((r) => r.modelKey)).toEqual(["s7", "s7_edge", "s21", "s21_fe", "s26"])
    expect(searchDeviceModels(sint, "Galaxy S7").map((r) => r.modelKey)).toEqual(["s7", "s7_edge"])
    // CSV real: S20 → S21 → … → S26
    const reais = todasAsPaginas("Galaxy S", 20)
    expect(posicao(reais, "samsung_galaxy_s21")).toBeLessThan(posicao(reais, "samsung_galaxy_s26"))
    expect(posicao(reais, "samsung_galaxy_s20")).toBeLessThan(posicao(reais, "samsung_galaxy_s21"))
  })

  it("Moto G: G7 → G47 → G77", () => {
    const todos = todasAsPaginas("Moto G", 20)
    expect(posicao(todos, "motorola_moto_g7")).toBeLessThan(posicao(todos, "motorola_moto_g47"))
    expect(posicao(todos, "motorola_moto_g47")).toBeLessThan(posicao(todos, "motorola_moto_g77"))
  })

  it.each(["Galaxy A", "Galaxy S", "Moto G", "Redmi", "POCO", "iPhone"])("%s: lista crescente pela ordem natural dentro do tipo de casamento", (q) => {
    const r = searchDeviceModelsComLoja(index, null, q, { limit: 1000 })
    for (let i = 1; i < r.length; i++) {
      if (r[i - 1].matchType !== r[i].matchType) continue
      expect(compareModelosNatural(r[i - 1], r[i]), `${r[i - 1].canonicalName} × ${r[i].canonicalName}`).toBeLessThanOrEqual(0)
    }
  })
})

describe("paginação (sem corte silencioso)", () => {
  it.each(["iPhone", "Galaxy A", "Moto G", "Redmi", "POCO"])("%s: páginas somadas = busca completa, sem perder nem repetir", (q) => {
    const completa = searchDeviceModelsComLoja(index, null, q, { limit: 5000 }).map((r) => r.modelKey)
    expect(completa.length).toBeGreaterThan(5)
    for (const limit of [1, 7, 20]) {
      const paginas = todasAsPaginas(q, limit)
      expect(paginas, `${q} / ${limit}`).toEqual(completa)
      expect(new Set(paginas).size).toBe(paginas.length)
    }
  })

  it("informa total, hasMore e nextOffset", () => {
    const total = searchDeviceModelsComLoja(index, null, "iPhone", { limit: 5000 }).length
    expect(total).toBeGreaterThan(20)
    const p1 = searchDeviceModelsComLojaPagina(index, null, "iPhone", { limit: 20 })
    expect(p1).toMatchObject({ total, hasMore: true, nextOffset: 20 })
    const ultima = searchDeviceModelsComLojaPagina(index, null, "iPhone", { limit: 20, offset: total - 1 })
    expect(ultima).toMatchObject({ total, hasMore: false, nextOffset: null })
    expect(ultima.results).toHaveLength(1)
    expect(searchDeviceModelsComLojaPagina(index, null, "iPhone", { limit: 20, offset: total + 5 }).results).toEqual([])
  })

  it("com modelos da loja: paginação estável e sem duplicar manual × global", () => {
    const loja = buildLojaCatalogoIndex([
      modeloLoja({ brand: "iPhone", manufacturer: "Apple", name: "7", modelKey: "manual_loja_iphone7" }),
      modeloLoja({ brand: "iPhone", manufacturer: "Apple", name: "Fold Teste", modelKey: "manual_loja_fold" }),
    ])
    const completa = searchDeviceModelsComLoja(index, loja, "iPhone", { limit: 5000 }).map((r) => r.modelKey)
    expect(todasAsPaginas("iPhone", 9, loja)).toEqual(completa)
    expect(new Set(completa).size).toBe(completa.length)
    // o manual "iPhone 7" cobre o global equivalente: aparece uma vez só
    expect(completa).toContain("manual_loja_iphone7")
    expect(completa).not.toContain("apple_iphone_7")
  })

  it("busca rápida: a primeira página não depende de varrer além do índice em memória", () => {
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) searchDeviceModelsComLojaPagina(index, null, "iPhone", { limit: 20, offset: i * 20 })
    // 20 páginas em bem menos de 1 s (orçamento folgado para CI lenta)
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})

describe("compatibilidade com o contrato anterior", () => {
  it("searchDeviceModels respeita offset/limit sobre a mesma ordem", () => {
    const tudo = searchDeviceModels(index, "iPhone", { limit: 5000 }).map((r) => r.modelKey)
    const meio = searchDeviceModels(index, "iPhone", { limit: 5, offset: 10 }).map((r) => r.modelKey)
    expect(meio).toEqual(tudo.slice(10, 15))
  })
})
