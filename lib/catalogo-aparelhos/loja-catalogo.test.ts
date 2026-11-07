import { describe, expect, it } from "vitest"
import { buildCatalogoIndex, parseDeviceAliases, parseDeviceCompatibilities, parseDeviceModels } from "./catalogo-aparelhos"
import { getPeliculasPorModelo, type PeliculaGrupoMember } from "./peliculas"
import {
  AVISO_COMPAT_MANUAL,
  applyPeliculaOverrides,
  buildLojaCatalogoIndex,
  cleanCatalogText,
  findGlobalDuplicate,
  lojaModeloCanonicalName,
  orderedPair,
  overridesUtilizaveis,
  sanitizeLojaModeloInput,
  searchDeviceModelsComLoja,
  type LojaCompatOverride,
  type LojaModelo,
} from "./loja-catalogo"

const MODELS = `model_key,brand,commercial_line,canonical_name,short_name,generation,network_variant,year_hint,source_origin,status,confidence,notes
samsung_a05,Samsung,Galaxy A,Samsung Galaxy A05,A05,,,,seed,ativo,alta,
samsung_a05s,Samsung,Galaxy A,Samsung Galaxy A05s,A05s,,,,seed,ativo,alta,
samsung_a06,Samsung,Galaxy A,Samsung Galaxy A06,A06,,,,seed,ativo,alta,
motorola_g35,Motorola,Moto G,Motorola Moto G35,G35,,,,seed,ativo,alta,`

const ALIASES = `alias_key,model_key,alias,normalized_alias,alias_type,is_ambiguous,requires_brand_context,confidence,notes
a1,samsung_a05,Galaxy A05,GALAXY A05,commercial_variant,false,false,alta,
a2,motorola_g35,Moto G35,MOTO G35,brand_short,false,false,alta,`

const COMPAT = `compatibility_key,compatibility_type,group_name,source_model_key,target_model_key,product_category,status,confidence,source_origin,evidence,requires_dry_test,notes
pelicula_g001__a05__a05s,grupo_pelicula,Grupo A05,samsung_a05,samsung_a05s,pelicula_tela,provavel_mercado,media,seed,,true,
pelicula_g001__a05__a06,grupo_pelicula,Grupo A05,samsung_a05,samsung_a06,pelicula_tela,provavel_mercado,media,seed,,true,
pelicula_g001__a05s__a06,grupo_pelicula,Grupo A05,samsung_a05s,samsung_a06,pelicula_tela,provavel_mercado,media,seed,,true,`

const globalIndex = buildCatalogoIndex({
  models: parseDeviceModels(MODELS),
  aliases: parseDeviceAliases(ALIASES),
  compatibilities: parseDeviceCompatibilities(COMPAT),
})

function modelo(partial: Partial<LojaModelo> & Pick<LojaModelo, "modelKey" | "brand" | "name">): LojaModelo {
  return { id: partial.modelKey, storeId: "loja-a", aliases: [], notes: "", active: true, version: 1, ...partial }
}

const resolve = (key: string): PeliculaGrupoMember => {
  const g = globalIndex.modelByKey.get(key)
  return g ? { modelKey: key, canonicalName: g.canonicalName, brand: g.brand } : { modelKey: key, canonicalName: key, brand: "Marca X" }
}

describe("sanitizeLojaModeloInput", () => {
  it("exige marca e nome e saneia controles/espaços/tamanho", () => {
    expect(sanitizeLojaModeloInput({ brand: "", name: "" })).toMatchObject({ ok: false })
    const r = sanitizeLojaModeloInput({ brand: "  Marca\u0000X  ", name: "G47\u200b", aliases: "Apelido 1, apelido 1, G47, x", notes: "a".repeat(999) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.brand).toBe("Marca X")
    expect(r.value.name).toBe("G47")
    // dedupe por chave normalizada, ignora alias igual ao nome e curto demais
    expect(r.value.aliases).toEqual(["Apelido 1"])
    expect(r.value.notes).toHaveLength(300)
  })

  it("limita a quantidade de apelidos", () => {
    const r = sanitizeLojaModeloInput({ brand: "M", name: "G47", aliases: Array.from({ length: 11 }, (_, i) => `ap${i}`) })
    expect(r).toMatchObject({ ok: false, errors: { aliases: expect.any(String) } })
  })

  it("cleanCatalogText remove separadores de linha unicode", () => {
    expect(cleanCatalogText("a\u2028b\u2029c\ufeff", 20)).toBe("a b c")
  })
})

describe("nome canônico e duplicidade global", () => {
  it("compõe 'Marca Modelo' sem repetir a marca", () => {
    expect(lojaModeloCanonicalName({ brand: "Marca X", name: "G47" })).toBe("Marca X G47")
    expect(lojaModeloCanonicalName({ brand: "Marca X", name: "marca x G47" })).toBe("marca x G47")
  })

  it("acusa duplicidade só na MESMA marca (nome curto, canônico, alias)", () => {
    expect(findGlobalDuplicate(globalIndex, { brand: "Motorola", name: "G35" })?.modelKey).toBe("motorola_g35")
    expect(findGlobalDuplicate(globalIndex, { brand: "motorola", name: "Moto G35" })?.modelKey).toBe("motorola_g35")
    expect(findGlobalDuplicate(globalIndex, { brand: "Samsung", name: "Galaxy A05" })?.modelKey).toBe("samsung_a05")
    // mesmo nome em marca diferente é permitido
    expect(findGlobalDuplicate(globalIndex, { brand: "Samsung", name: "G35" })).toBeNull()
    // G47 inexistente
    expect(findGlobalDuplicate(globalIndex, { brand: "Motorola", name: "G47" })).toBeNull()
  })
})

describe("busca combinada global + loja", () => {
  const loja = buildLojaCatalogoIndex([
    modelo({ modelKey: "manual_g47", brand: "Marca X", name: "G47", aliases: ["XG47"] }),
    modelo({ modelKey: "manual_off", brand: "Marca X", name: "G48", active: false }),
  ])

  it("encontra o G47 manual pelo nome e pelo apelido, marcado como da loja", () => {
    const r = searchDeviceModelsComLoja(globalIndex, loja, "G47")
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ modelKey: "manual_g47", canonicalName: "Marca X G47", source: "loja" })
    expect(r[0].reviewFlags).toContain("cadastro_manual_loja")
    expect(searchDeviceModelsComLoja(globalIndex, loja, "xg47")[0]?.modelKey).toBe("manual_g47")
  })

  it("não mostra modelo desativado e preserva os globais", () => {
    expect(searchDeviceModelsComLoja(globalIndex, loja, "G48")).toEqual([])
    const g = searchDeviceModelsComLoja(globalIndex, loja, "G35")
    expect(g.map((x) => x.modelKey)).toEqual(["motorola_g35"])
    expect(g[0].source).toBe("global")
  })

  it("sem índice da loja = comportamento global inalterado", () => {
    expect(searchDeviceModelsComLoja(globalIndex, null, "A05").map((r) => r.modelKey)).toEqual(
      searchDeviceModelsComLoja(globalIndex, buildLojaCatalogoIndex([]), "A05").map((r) => r.modelKey),
    )
  })
})

describe("overrides de película por loja", () => {
  const grupos = getPeliculasPorModelo(globalIndex, "samsung_a05")
  const ov = (o: Partial<LojaCompatOverride> & { a: string; b: string }): LojaCompatOverride => {
    const pair = orderedPair(o.a, o.b)!
    return { categoria: "pelicula_tela", acao: "adicionar", status: "precisa_testar", notes: "", ...pair, ...o }
  }

  it("orderedPair recusa par vazio/igual e ordena", () => {
    expect(orderedPair("b", "a")).toEqual({ modelKeyA: "a", modelKeyB: "b" })
    expect(orderedPair("a", "a")).toBeNull()
    expect(orderedPair("", "a")).toBeNull()
  })

  it("sem decisões, devolve os grupos globais intactos", () => {
    expect(applyPeliculaOverrides("samsung_a05", grupos, [], resolve)).toEqual({ grupos, suprimidos: [] })
  })

  it("suprimir A05↔A06 esconde nos dois sentidos, sem reaparecer por transitividade", () => {
    const supr = [ov({ a: "samsung_a05", b: "samsung_a06", acao: "suprimir" })]
    const deA05 = applyPeliculaOverrides("samsung_a05", grupos, supr, resolve)
    expect(deA05.grupos[0].members.map((m) => m.modelKey)).toEqual(["samsung_a05s"])
    expect(deA05.suprimidos.map((m) => m.modelKey)).toEqual(["samsung_a06"])
    const deA06 = applyPeliculaOverrides("samsung_a06", getPeliculasPorModelo(globalIndex, "samsung_a06"), supr, resolve)
    expect(deA06.grupos[0].members.map((m) => m.modelKey)).toEqual(["samsung_a05s"])
    // A05s continua vendo os dois (a decisão é só sobre o par A05↔A06)
    const deA05s = applyPeliculaOverrides("samsung_a05s", getPeliculasPorModelo(globalIndex, "samsung_a05s"), supr, resolve)
    expect(deA05s.grupos[0].members.map((m) => m.modelKey).sort()).toEqual(["samsung_a05", "samsung_a06"])
  })

  it("adicionar G47↔A05 cria grupo manual não transitivo e nunca confirmado", () => {
    const add = [ov({ a: "manual_g47", b: "samsung_a05", status: "provavel_mercado" })]
    const deG47 = applyPeliculaOverrides("manual_g47", [], add, resolve)
    expect(deG47.grupos).toHaveLength(1)
    expect(deG47.grupos[0]).toMatchObject({ status: "provavel_mercado", confidence: "baixa", requiresDryTest: true })
    expect(deG47.grupos[0].status).not.toBe("confirmado_fornecedor")
    expect(deG47.grupos[0].warnings).toContain(AVISO_COMPAT_MANUAL)
    expect(deG47.grupos[0].members.map((m) => m.modelKey)).toEqual(["samsung_a05"])
    // A06 é do grupo global do A05, mas NÃO vira equivalente ao G47
    const deA06 = applyPeliculaOverrides("samsung_a06", getPeliculasPorModelo(globalIndex, "samsung_a06"), add, resolve)
    expect(deA06.grupos.flatMap((g) => g.members.map((m) => m.modelKey))).not.toContain("manual_g47")
    const deA05 = applyPeliculaOverrides("samsung_a05", grupos, add, resolve)
    expect(deA05.grupos.map((g) => g.groupKey)).toContain("loja_manual__provavel_mercado")
  })

  it("capinha nunca afeta película", () => {
    const capinha = [{ ...ov({ a: "samsung_a05", b: "samsung_a06", acao: "suprimir" }), categoria: "capinha" as const }]
    expect(applyPeliculaOverrides("samsung_a05", grupos, capinha, resolve).grupos).toEqual(grupos)
  })

  it("grupo que fica vazio por supressão é descartado", () => {
    const supr = [
      ov({ a: "samsung_a05", b: "samsung_a06", acao: "suprimir" }),
      ov({ a: "samsung_a05", b: "samsung_a05s", acao: "suprimir" }),
    ]
    expect(applyPeliculaOverrides("samsung_a05", grupos, supr, resolve).grupos).toEqual([])
  })
})

describe("revisão independente P3-4 — decisões utilizáveis", () => {
  it("descarta chave global fora do CSV atual e modelo manual inativo; mantém o resto", () => {
    const all = [
      { modelKeyA: "manual_ativo", modelKeyB: "samsung_a05" },
      { modelKeyA: "manual_inativo", modelKeyB: "samsung_a05" },
      { modelKeyA: "removido_do_csv", modelKeyB: "samsung_a05" },
      { modelKeyA: "samsung_a05", modelKeyB: "samsung_a05s" },
    ]
    const globais = new Set(["samsung_a05", "samsung_a05s"])
    expect(overridesUtilizaveis(all, (k) => globais.has(k), (k) => k === "manual_ativo")).toEqual([all[0], all[3]])
  })
})
