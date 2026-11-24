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
  ordenarNatural,
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
    // nome completo (cadastro da loja): "iPhone XR" também é a 10ª geração
    expect(tokensModeloNatural("iPhone XR")).toEqual(["IPHONE", 10, "R"])
    expect(tokensModeloNatural("iPhone X")).toEqual(["IPHONE", 10])
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

  it("iPhone SE 2020 e SE 2022 aparecem separados e encontráveis; A06 4G e A06 5G não se confundem", () => {
    const se2020 = searchDeviceModelsComLoja(index, null, "iPhone SE 2020", { limit: 10 }).map((r) => r.modelKey)
    const se2022 = searchDeviceModelsComLoja(index, null, "iPhone SE 2022", { limit: 10 }).map((r) => r.modelKey)
    expect(se2020[0]).toBe("apple_iphone_se_2020")
    expect(se2022[0]).toBe("apple_iphone_se_2022")

    // Samsung A06 4G × Samsung A06 5G: variantes distintas nunca são tratadas como o mesmo aparelho.
    const a06 = searchDeviceModelsComLoja(index, null, "A06", { limit: 20 }).map((r) => r.modelKey)
    expect(a06).toContain("samsung_galaxy_a06")
    const loja5g = buildLojaCatalogoIndex([
      modeloLoja({ brand: "Samsung", manufacturer: "Samsung", name: "Galaxy A06 5G", modelKey: "manual_a06_5g" }),
    ])
    const a06Com5g = searchDeviceModelsComLoja(index, loja5g, "A06", { limit: 20 }).map((r) => r.modelKey)
    expect(a06Com5g).toContain("samsung_galaxy_a06")
    expect(a06Com5g).toContain("manual_a06_5g")
    // Busca específica por 5G traz o 5G sem misturar com o 4G.
    const so5g = searchDeviceModelsComLoja(index, loja5g, "Samsung Galaxy A06 5G", { limit: 10 }).map((r) => r.modelKey)
    expect(so5g[0]).toBe("manual_a06_5g")
    expect(so5g).not.toContain("samsung_galaxy_a06")
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
    const r = searchDeviceModels(index, q, { limit: 1000 })
    for (let i = 1; i < r.length; i++) {
      if (r[i - 1].matchType !== r[i].matchType) continue
      expect(compareModelosNatural(r[i - 1], r[i]), `${r[i - 1].canonicalName} × ${r[i].canonicalName}`).toBeLessThanOrEqual(0)
    }
    // a ordem final da API (global + loja) é estável sobre si mesma
    const final = searchDeviceModelsComLoja(index, null, q, { limit: 1000 })
    expect(ordenarNatural(final, null).map((x) => x.modelKey)).toEqual(final.map((x) => x.modelKey))
  })

  it("revisão R1 (P2): modelos da loja entram na ordem natural, não todos antes do catálogo global", () => {
    const loja = buildLojaCatalogoIndex([
      modeloLoja({ brand: "iPhone", manufacturer: "Apple", name: "16 Teste Loja", modelKey: "manual_16_teste" }),
      modeloLoja({ brand: "iPhone", manufacturer: "Apple", name: "7", modelKey: "manual_7" }),
    ])
    const r = searchDeviceModelsComLoja(index, loja, "iPhone", { limit: 1000 }).map((x) => x.modelKey)
    expect(r.indexOf("apple_iphone_6")).toBeLessThan(r.indexOf("manual_7"))
    expect(r.indexOf("manual_7")).toBeLessThan(r.indexOf("apple_iphone_7_plus"))
    expect(r.indexOf("apple_iphone_16")).toBeLessThan(r.indexOf("manual_16_teste"))
    expect(r.indexOf("manual_16_teste")).toBeLessThan(r.indexOf("apple_iphone_17"))
  })

  it("revisão R2 (P2): cadastro legado que cobre o global ordena no lugar dele (Motorola + G47)", () => {
    const loja = buildLojaCatalogoIndex([
      modeloLoja({ brand: "Motorola", manufacturer: "Motorola", name: "G47", modelKey: "manual_legado_g47" }),
    ])
    const r = todasAsPaginas("Moto G", 20, loja)
    expect(r).toContain("manual_legado_g47")
    expect(r).not.toContain("motorola_moto_g47")
    expect(r.indexOf("motorola_moto_g7")).toBeLessThan(r.indexOf("manual_legado_g47"))
    expect(r.indexOf("manual_legado_g47")).toBeLessThan(r.indexOf("motorola_moto_g77"))
  })

  it("revisão R2 (P2): 21 cadastros legados 'Apple' + '11', '12 Mini'… não tiram o iPhone 7 da 1ª página", () => {
    const nomes = ["11", "11 Pro", "11 Pro Max", "12", "12 Mini", "12 Pro", "12 Pro Max", "13", "13 Mini", "13 Pro", "13 Pro Max",
      "14", "14 Plus", "14 Pro", "14 Pro Max", "15", "15 Plus", "15 Pro", "15 Pro Max", "16", "16 Plus"]
    const loja = buildLojaCatalogoIndex(nomes.map((n, i) => modeloLoja({ brand: "Apple", manufacturer: "Apple", name: n, modelKey: `manual_legado_${i}` })))
    const p1 = searchDeviceModelsComLojaPagina(index, loja, "iPhone", { limit: 20 }).results.map((x) => x.modelKey)
    expect(p1).toContain("apple_iphone_7")
    expect(p1.indexOf("apple_iphone_7")).toBeLessThan(p1.indexOf("apple_iphone_7_plus"))
  })

  it("revisão R2 (P2): cadastro sem equivalente global com marca = fabricante entra na família ('Apple' + '19 QA')", () => {
    const loja = buildLojaCatalogoIndex([
      modeloLoja({ brand: "Apple", manufacturer: "Apple", name: "19 QA", modelKey: "manual_19_qa" }),
      modeloLoja({ brand: "Samsung", manufacturer: "Samsung", name: "S99 QA", modelKey: "manual_s99_qa" }),
    ])
    // "Apple" + "19 QA" ordena como iPhone 19: depois do 18 Pro Max, nunca antes do iPhone 6
    const ap = searchDeviceModelsComLoja(index, loja, "Apple", { limit: 1000 }).map((x) => x.modelKey)
    expect(ap).toContain("manual_19_qa")
    expect(ap.indexOf("apple_iphone_6")).toBeLessThan(ap.indexOf("manual_19_qa"))
    expect(ap.indexOf("apple_iphone_18_pro_max")).toBeLessThan(ap.indexOf("manual_19_qa"))
    const sam = searchDeviceModelsComLoja(index, loja, "Samsung", { limit: 1000 }).map((x) => x.modelKey)
    expect(sam.indexOf("samsung_galaxy_s26")).toBeLessThan(sam.indexOf("manual_s99_qa"))
  })

  it("revisão R1 (P2): 25 cadastros da loja casando com 'iPhone' não empurram o iPhone 7 para fora da 1ª página", () => {
    const loja = buildLojaCatalogoIndex(
      Array.from({ length: 25 }, (_, i) =>
        modeloLoja({ brand: "iPhone", manufacturer: "Apple", name: `Fold ${String.fromCharCode(65 + i)}`, modelKey: `manual_fold_${i}` }),
      ),
    )
    const p1 = searchDeviceModelsComLojaPagina(index, loja, "iPhone", { limit: 20 })
    expect(p1.results.map((x) => x.modelKey)).toContain("apple_iphone_7")
    expect(p1.hasMore).toBe(true)
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
