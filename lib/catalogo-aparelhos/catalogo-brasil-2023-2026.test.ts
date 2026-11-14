/**
 * COMPAT-CATALOGO-BRASIL-2023-2026-002 — validação do catálogo global atualizado (CSVs reais).
 */
import { describe, expect, it } from "vitest"
import { loadCatalogoIndex } from "./catalogo-loader"
import { buildCatalogoIndex, modeloOperacional, normalizeDeviceQuery, searchDeviceModels } from "./catalogo-aparelhos"
import { getPeliculasPorModelo } from "./peliculas"
import { buildLojaCatalogoIndex, canonicalizarOverrides, globaisCobertosPelaLoja, searchDeviceModelsComLoja, type LojaModelo } from "./loja-catalogo"
import { listarMarcasDoCatalogo, marcasOcultasDaLoja, sanitizeMarcasConfig } from "./marcas"

const index = loadCatalogoIndex()
const busca = (q: string, opts = {}) => searchDeviceModels(index, q, { limit: 30, ...opts })
const chaves = (q: string, opts = {}) => busca(q, opts).map((r) => r.modelKey)
const nomes = new Set(index.models.map((m) => normalizeDeviceQuery(m.canonicalName)))
const tem = (nome: string) => nomes.has(normalizeDeviceQuery(nome))

describe("integridade dos CSVs", () => {
  it("chaves únicas, nomes canônicos únicos, aliases/compat sem órfãos, mesclas válidas", () => {
    const keys = index.models.map((m) => m.modelKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(nomes.size).toBe(index.models.length)
    for (const a of index.aliases) expect(index.modelByKey.has(a.modelKey), a.aliasKey).toBe(true)
    for (const c of index.compatibilities) {
      expect(index.modelByKey.has(c.sourceModelKey), c.compatibilityKey).toBe(true)
      expect(index.modelByKey.has(c.targetModelKey), c.compatibilityKey).toBe(true)
    }
    for (const m of index.models.filter((x) => x.replacedBy)) {
      const alvo = index.modelByKey.get(m.replacedBy!)
      expect(alvo, m.modelKey).toBeDefined()
      expect(modeloOperacional(alvo!), m.modelKey).toBe(true)
    }
  })

  it("modelos novos têm ano e fonte; nenhum modelo anterior ao iPhone 6 nem 'iPhone 8 SE'", () => {
    const novos = index.models.filter((m) => m.sourceOrigin === "pesquisa_oficial_2026_11")
    expect(novos.length).toBeGreaterThan(200)
    for (const m of novos) {
      expect(m.releaseYear, m.modelKey).toMatch(/^20\d\d$/)
      expect(m.sources, m.modelKey).not.toBe("")
    }
    for (const proibido of ["Apple iPhone 5", "Apple iPhone 5s", "Apple iPhone 5c", "Apple iPhone 4", "Apple iPhone 4s", "Apple iPhone 8 SE", "Apple iPhone SE"])
      expect(tem(proibido), proibido).toBe(false)
  })

  it("cobertura por ano das marcas prioritárias (2023–2026)", () => {
    const porMarcaAno = new Map<string, number>()
    for (const m of index.models) if (m.releaseYear) porMarcaAno.set(`${m.brand}|${m.releaseYear}`, (porMarcaAno.get(`${m.brand}|${m.releaseYear}`) ?? 0) + 1)
    for (const marca of ["Samsung", "Motorola", "Redmi", "POCO", "Realme", "Infinix"])
      for (const ano of ["2024", "2025", "2026"]) expect(porMarcaAno.get(`${marca}|${ano}`) ?? 0, `${marca} ${ano}`).toBeGreaterThan(0)
    expect(porMarcaAno.get("Apple|2026")).toBeGreaterThanOrEqual(3)
  })
})

describe("Apple", () => {
  it("família do iPhone 6 em diante, com 18 Pro/Pro Max/Duo e sem 'iPhone 18' base", () => {
    for (const n of ["iPhone 6", "iPhone 6 Plus", "iPhone 6s", "iPhone 6s Plus", "iPhone 7", "iPhone X", "iPhone 16e", "iPhone 17e", "iPhone Air", "iPhone 18 Pro", "iPhone 18 Pro Max", "iPhone Duo"])
      expect(tem(`Apple ${n}`), n).toBe(true)
    expect(tem("Apple iPhone 18")).toBe(false)
  })

  it("mini e SE localizáveis por várias grafias", () => {
    expect(chaves("12 mini")).toContain("apple_iphone_12_mini")
    expect(chaves("iPhone 13 mini")).toContain("apple_iphone_13_mini")
    expect(chaves("iPhone SE 2ª geração")[0]).toBe("apple_iphone_se_2020")
    expect(chaves("iPhone SE 3")[0]).toBe("apple_iphone_se_2022")
    expect(chaves("SE 2022")).toContain("apple_iphone_se_2022")
  })

  it("iPhone 17 Air → iPhone Air (uma única entrada na busca; chave antiga preservada)", () => {
    expect(chaves("iPhone 17 Air")).toEqual(["apple_iphone_air"])
    expect(chaves("iPhone Air")).toContain("apple_iphone_air")
    expect(chaves("iPhone Air")).not.toContain("apple_iphone_17_air")
    expect(index.modelByKey.get("apple_iphone_17_air")?.replacedBy).toBe("apple_iphone_air")
  })

  it("registros 'Branco/Preto' do iPhone 7/8 (cor da borda da película) mesclados sem apagar", () => {
    for (const k of ["apple_iphone_7_branco", "apple_iphone_8_plus_preto"]) expect(index.modelByKey.get(k)?.status).toBe("mesclado")
    expect(chaves("iPhone 7 Branco")).toEqual(["apple_iphone_7"])
    const grupos = getPeliculasPorModelo(index, "apple_iphone_7")
    const membros = grupos.flatMap((g) => g.members.map((m) => m.modelKey))
    expect(membros).toContain("apple_iphone_8")
    expect(membros.some((k) => /_(branco|preto)$/.test(k))).toBe(false)
    expect(grupos.map((g) => g.groupName)).toEqual(expect.arrayContaining(["iPhone 7/8 Branco"]))
    // consulta pela chave antiga devolve os mesmos grupos do modelo real
    expect(getPeliculasPorModelo(index, "apple_iphone_7_branco")).toEqual(grupos)
  })
})

describe("Samsung", () => {
  it("linha S completa (S20 → S26 FE) e S27 não publicada", () => {
    for (const n of ["S20", "S20+", "S20 Ultra", "S21 Ultra", "S23 FE", "S24 FE", "S25 Edge", "S25 FE", "S26", "S26 Ultra", "S26 FE"])
      expect(tem(`Samsung Galaxy ${n}`), n).toBe(true)
    expect(index.models.some((m) => /S27/.test(m.canonicalName))).toBe(false)
    expect(chaves("S20 Plus")).toContain("samsung_galaxy_s20_plus")
  })

  it("variantes 4G/5G separadas e localizáveis", () => {
    expect(chaves("A15 5G")[0]).toBe("samsung_galaxy_a15_5g")
    expect(chaves("Galaxy A15")).toEqual(expect.arrayContaining(["samsung_galaxy_a15", "samsung_galaxy_a15_5g"]))
    expect(index.modelByKey.get("samsung_galaxy_a15_5g")?.networkVariant).toBe("5G")
  })

  it("A27/A37/A57, Z Fold/Flip e M recentes", () => {
    for (const n of ["A27 5G", "A37", "A57", "Z Fold7", "Z Flip7 FE", "Z TriFold", "M17e", "M47"]) expect(tem(`Samsung Galaxy ${n}`), n).toBe(true)
  })
})

describe("Motorola", () => {
  it("Moto G 2026 (G37/G47/G67/G77/G87/G Max), Edge 50/60/70, Razr 40–70, Signature; G87 com fonte", () => {
    for (const n of ["Moto G37", "Moto G47", "Moto G67", "Moto G77", "Moto G87", "Moto G Max", "Edge 50 Ultra", "Edge 60 Fusion", "Edge 70 Pro", "Razr 50 Ultra", "Razr 70", "Razr Fold", "Signature"])
      expect(tem(`Motorola ${n}`), n).toBe(true)
    expect(index.modelByKey.get("motorola_moto_g87")?.sources).toMatch(/2026|g47/i)
    expect(index.models.some((m) => /Moto E1[67]/.test(m.canonicalName))).toBe(false)
  })
})

describe("Xiaomi / Redmi / POCO", () => {
  it("marcas separadas, fabricante Xiaomi", () => {
    expect(index.modelByKey.get("redmi_a7_pro")?.brand).toBe("Redmi")
    expect(index.modelByKey.get("poco_c81_pro")?.brand).toBe("POCO")
    expect(index.modelByKey.get("poco_c81_pro")?.manufacturer).toBe("Xiaomi")
    for (const n of ["Redmi Note 15 Pro+ 5G", "Redmi 15 5G", "POCO X8 Pro Max", "POCO M8 Pro", "POCO F8 Ultra", "Xiaomi 17 Ultra"]) expect(tem(n), n).toBe(true)
    for (const n of ["Redmi 16", "Redmi 17", "Redmi Note 17", "POCO F8"]) expect(tem(n), n).toBe(false)
  })

  it("'Xiaomi Mi 13T' reconciliado para 'Xiaomi 13T' mantendo a chave e o nome antigo como alias", () => {
    expect(index.modelByKey.get("xiaomi_mi_13t")?.canonicalName).toBe("Xiaomi 13T")
    expect(chaves("Xiaomi Mi 13T")[0]).toBe("xiaomi_mi_13t")
  })
})

describe("realme e Infinix", () => {
  it("famílias numéricas, GT, Hot, Note, Smart, Zero e GT", () => {
    for (const n of ["Realme 14 Pro+", "Realme 16 Pro", "Realme GT 8 Pro", "Infinix Hot 70", "Infinix Note 60 Pro", "Infinix Zero 40", "Infinix GT 30 Pro", "Infinix Smart 10"])
      expect(tem(n), n).toBe(true)
  })
})

describe("visibilidade de marcas por loja", () => {
  const marcas = listarMarcasDoCatalogo(index, modeloOperacional)

  it("prioritárias visíveis e secundárias ocultas por padrão", () => {
    const ocultas = marcasOcultasDaLoja(marcas, {})
    for (const m of ["APPLE", "SAMSUNG", "MOTOROLA", "XIAOMI", "REDMI", "POCO", "REALME", "INFINIX"]) expect(ocultas.has(m), m).toBe(false)
    for (const m of ["GOOGLE", "OPPO", "HONOR", "TECNO", "ONEPLUS", "LG"]) expect(ocultas.has(m), m).toBe(true)
    expect(chaves("Pixel 9", { marcasOcultas: ocultas })).toEqual([])
    // marca oculta continua resolvível por chave (produtos e vendas antigas)
    expect(index.modelByKey.get("google_pixel_9")?.canonicalName).toBe("Google Pixel 9")
  })

  it("loja ativa uma opcional e desativa uma principal", () => {
    const config = sanitizeMarcasConfig({ google: true, Motorola: false, lixo: "sim" })
    expect(config).toEqual({ GOOGLE: true, MOTOROLA: false })
    const ocultas = marcasOcultasDaLoja(marcas, config)
    expect(chaves("Pixel 9", { marcasOcultas: ocultas })).toContain("google_pixel_9")
    expect(chaves("Moto G47", { marcasOcultas: ocultas })).toEqual([])
  })

  it("modelo cadastrado pela loja aparece mesmo com a marca oculta", () => {
    const loja = buildLojaCatalogoIndex([modeloLoja({ brand: "OPPO", name: "Reno Sintético 99" })])
    const ocultas = marcasOcultasDaLoja(marcas, {})
    const r = searchDeviceModelsComLoja(index, loja, "Reno Sintético 99", { marcasOcultas: ocultas })
    expect(r.map((x) => x.source)).toEqual(["loja"])
  })
})

describe("cadastro manual × catálogo global", () => {
  it("G47 cadastrado à mão pela loja: a busca mostra só o da loja (sem duplicar; chave manual preservada)", () => {
    const g47 = modeloLoja({ brand: "Motorola", name: "G47", modelKey: "manual_rafacell_g47" })
    const loja = buildLojaCatalogoIndex([g47])
    expect(globaisCobertosPelaLoja(index, loja).has("motorola_moto_g47")).toBe(true)
    const r = searchDeviceModelsComLoja(index, loja, "G47", {})
    expect(r.map((x) => x.modelKey)).toContain("manual_rafacell_g47")
    expect(r.map((x) => x.modelKey)).not.toContain("motorola_moto_g47")
    // outra loja (sem o cadastro manual) vê o global
    expect(searchDeviceModelsComLoja(index, null, "G47", {}).map((x) => x.modelKey)).toContain("motorola_moto_g47")
  })

  it("G47 manual: nomes e aliases do global ('Moto G47', 'MotoG47') levam ao cadastro da loja, uma vez só", () => {
    const g47 = modeloLoja({ brand: "Motorola", name: "G47", modelKey: "manual_rafacell_g47" })
    const loja = buildLojaCatalogoIndex([g47])
    for (const q of ["Moto G47", "Motorola Moto G47", "MotoG47", "G47"]) {
      const r = searchDeviceModelsComLoja(index, loja, q, {})
      const chaves = r.map((x) => x.modelKey)
      expect(chaves, q).toContain("manual_rafacell_g47")
      expect(chaves, q).not.toContain("motorola_moto_g47")
      expect(chaves.filter((k) => k === "manual_rafacell_g47"), q).toHaveLength(1)
      expect(r.find((x) => x.modelKey === "manual_rafacell_g47")?.source, q).toBe("loja")
    }
    // com Motorola oculta na loja, o cadastro manual continua achável pelo nome do global
    const ocultas = new Set(["MOTOROLA"])
    expect(searchDeviceModelsComLoja(index, loja, "Moto G47", { marcasOcultas: ocultas }).map((x) => x.modelKey)).toEqual([
      "manual_rafacell_g47",
    ])
    expect(searchDeviceModelsComLoja(index, loja, "Moto G37", { marcasOcultas: ocultas })).toEqual([])
  })

  it("chave mesclada: equivalentes e decisões antigas trazidas para o canônico (a canônica prevalece)", () => {
    expect(index.equivalentKeysOf("apple_iphone_air").sort()).toEqual(["apple_iphone_17_air", "apple_iphone_air"])
    expect(index.equivalentKeysOf("apple_iphone_17_air").sort()).toEqual(["apple_iphone_17_air", "apple_iphone_air"])
    expect(index.equivalentKeysOf("apple_iphone_7").sort()).toEqual(["apple_iphone_7", "apple_iphone_7_branco", "apple_iphone_7_preto"])
    expect(index.equivalentKeysOf("samsung_galaxy_a06")).toEqual(["samsung_galaxy_a06"])
    const base = { categoria: "capinha", acao: "adicionar", notes: "" }
    const r = canonicalizarOverrides(
      [
        { ...base, modelKeyA: "apple_iphone_16_pro", modelKeyB: "apple_iphone_17_air", notes: "antigo" },
        { ...base, modelKeyA: "apple_iphone_16_pro", modelKeyB: "apple_iphone_air", notes: "novo" },
        { ...base, categoria: "pelicula_tela", modelKeyA: "apple_iphone_7_branco", modelKeyB: "apple_iphone_8_branco" },
        { ...base, modelKeyA: "apple_iphone_7", modelKeyB: "apple_iphone_7_preto" },
      ],
      index.canonicalKeyOf,
    )
    expect(r.map((o) => [o.categoria, o.modelKeyA, o.modelKeyB, o.notes])).toEqual([
      ["capinha", "apple_iphone_16_pro", "apple_iphone_air", "novo"],
      ["pelicula_tela", "apple_iphone_7", "apple_iphone_8", ""],
    ])
  })

  it("modelo manual 'aguardando lançamento' fica fora da busca", () => {
    const loja = buildLojaCatalogoIndex([modeloLoja({ brand: "Samsung", name: "Galaxy S27 Sintético", lancamento: "aguardando_lancamento" })])
    expect(searchDeviceModelsComLoja(index, loja, "S27 Sintético", {})).toEqual([])
  })

  it("modelo global 'aguardando_lancamento' fica fora da busca; ao mudar para ativo, aparece", () => {
    const base = { brand: "Samsung", commercialLine: "Galaxy S", shortName: "S99", generation: "", networkVariant: "", yearHint: "", sourceOrigin: "", confidence: "", notes: "" }
    const futuro = buildCatalogoIndex({ models: [{ ...base, modelKey: "samsung_galaxy_s99", canonicalName: "Samsung Galaxy S99", status: "aguardando_lancamento" }], aliases: [] })
    expect(searchDeviceModels(futuro, "S99")).toEqual([])
    const lancado = buildCatalogoIndex({ models: [{ ...base, modelKey: "samsung_galaxy_s99", canonicalName: "Samsung Galaxy S99", status: "ativo" }], aliases: [] })
    expect(searchDeviceModels(lancado, "S99").map((r) => r.modelKey)).toEqual(["samsung_galaxy_s99"])
  })
})

describe("películas documentadas por acessório (não são molde genérico)", () => {
  it("UltraGlass 2: iPhone 17 Pro ↔ 18 Pro com aviso de escopo e confirmação do fornecedor", () => {
    const g = getPeliculasPorModelo(index, "apple_iphone_18_pro").find((x) => x.compatibilityType === "acessorio_especifico")
    expect(g?.members.map((m) => m.modelKey)).toEqual(["apple_iphone_17_pro"])
    expect(g?.status).toBe("confirmado_fornecedor")
    expect(g?.warnings.join(" ")).toMatch(/Documentado só para o acessório/)
    expect(g?.evidence).toBe("")
  })

  it("só as 4 relações documentadas; 15/16 e 15 Plus/16 Plus não foram inventadas", () => {
    const acc = index.compatibilities.filter((c) => c.compatibilityType === "acessorio_especifico")
    expect(acc).toHaveLength(4)
    const pares = acc.map((c) => [c.sourceModelKey, c.targetModelKey].sort().join("|"))
    expect(pares).not.toContain(["apple_iphone_15", "apple_iphone_16"].join("|"))
    expect(acc.every((c) => c.productCategory === "pelicula_tela")).toBe(true)
  })

  it("nenhuma relação de CAPINHA no catálogo global", () => {
    expect(index.compatibilities.some((c) => c.productCategory === "capinha")).toBe(false)
  })
})

function modeloLoja(p: Partial<LojaModelo> & { brand: string; name: string }): LojaModelo {
  return {
    id: p.modelKey ?? `id-${p.name}`,
    storeId: "loja-teste",
    modelKey: p.modelKey ?? `manual_${p.name.replace(/\W+/g, "_").toLowerCase()}`,
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
