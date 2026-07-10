import { describe, it, expect } from "vitest"
import { buildCatalogoIndex, parseDeviceAliases, parseDeviceCompatibilities, parseDeviceModels } from "./catalogo-aparelhos"
import { loadCatalogoIndex } from "./catalogo-loader"
import { getPeliculasPorModelo } from "./peliculas"

// ============================================================================
// CATALOGO-PELICULAS-BUSCADOR-MVP-002 — consulta pura de grupos de película.
// Metade dos testes ancora nos seeds REAIS; metade usa índices sintéticos
// para fixar as regras de agregação/exclusão independentemente dos dados.
// ============================================================================

describe("seeds reais — grupos de película", () => {
  const index = loadCatalogoIndex()

  it("A06 (samsung_galaxy_a06) retorna grupos de película", () => {
    const grupos = getPeliculasPorModelo(index, "samsung_galaxy_a06")
    expect(grupos.length).toBeGreaterThanOrEqual(2)
    // Todos os grupos retornados são de película de tela.
    for (const g of grupos) {
      expect(g.productCategory).toBe("pelicula_tela")
    }
  })

  it("ordena honestamente: confirmado_fornecedor antes de precisa_testar", () => {
    const grupos = getPeliculasPorModelo(index, "samsung_galaxy_a06")
    expect(grupos[0].groupKey).toBe("pelicula_g011") // "A06 / A07", confirmado/alta
    expect(grupos[0].status).toBe("confirmado_fornecedor")
    expect(grupos[0].confidence).toBe("alta")
    expect(grupos[0].requiresDryTest).toBe(false)
    expect(grupos[0].members.map((m) => m.modelKey)).toEqual(["samsung_galaxy_a07"])
    // O grupo cruzado grande vem depois, sem promoção de status.
    const superGrupo = grupos.find((g) => g.groupKey === "pelicula_g003")
    expect(superGrupo).toBeTruthy()
    expect(superGrupo!.status).toBe("precisa_testar")
    expect(superGrupo!.confidence).toBe("baixa")
  })

  it("membros excluem o modelo consultado e resolvem nome/marca", () => {
    const grupos = getPeliculasPorModelo(index, "samsung_galaxy_a06")
    for (const g of grupos) {
      expect(g.members.some((m) => m.modelKey === "samsung_galaxy_a06")).toBe(false)
      for (const m of g.members) {
        expect(m.canonicalName.length).toBeGreaterThan(0)
      }
    }
  })

  it("grupo multimarca é sinalizado com aviso de molde cruzado", () => {
    const grupos = getPeliculasPorModelo(index, "samsung_galaxy_a06")
    const superGrupo = grupos.find((g) => g.groupKey === "pelicula_g003")! // Samsung+Redmi+POCO+Realme
    expect(superGrupo.isCrossBrandGroup).toBe(true)
    expect(superGrupo.requiresDryTest).toBe(true)
    expect(superGrupo.memberCount).toBe(10)
    expect(superGrupo.warnings.join(" ")).toContain("multimarcas")
  })

  it("acha grupo quando o modelo aparece apenas como TARGET nos pares", () => {
    // apple_iphone_14_pro só aparece como target_model_key nos seeds (pares i<j).
    const grupos = getPeliculasPorModelo(index, "apple_iphone_14_pro")
    expect(grupos.length).toBeGreaterThanOrEqual(1)
    expect(grupos.some((g) => g.members.some((m) => m.modelKey === "apple_iphone_14"))).toBe(true)
  })

  it("iPhone 12 Mini retorna a relação p002 sem promover compatibilidade", () => {
    expect(index.modelByKey.has("apple_iphone_12_mini")).toBe(true)
    const grupos = getPeliculasPorModelo(index, "apple_iphone_12_mini")
    const grupo = grupos.find((g) => g.groupKey === "pelicula_p002")

    expect(grupo).toBeTruthy()
    expect(grupo!.members.map((m) => m.modelKey)).toContain("apple_iphone_13_mini")
    expect(grupo!.status).toBe("precisa_testar")
    expect(grupo!.status).not.toBe("confirmado_fornecedor")
    expect(grupo!.confidence).toBe("baixa")
    expect(grupo!.requiresDryTest).toBe(true)
  })

  it("modelKey desconhecido/vazio retorna vazio sem lançar", () => {
    expect(getPeliculasPorModelo(index, "modelo_que_nao_existe")).toEqual([])
    expect(getPeliculasPorModelo(index, "")).toEqual([])
  })
})

// ----------------------------------------------------------------------------
// Índices sintéticos — regras de agregação/exclusão
// ----------------------------------------------------------------------------

const MODELS_CSV = [
  "model_key,brand,commercial_line,canonical_name,short_name,status,confidence",
  "marca_a_um,MarcaA,Linha,MarcaA Um,Um,ativo,alta",
  "marca_a_dois,MarcaA,Linha,MarcaA Dois,Dois,ativo,alta",
  "marca_a_tres,MarcaA,Linha,MarcaA Tres,Tres,ativo,alta",
  "marca_b_um,MarcaB,Linha,MarcaB Um,Um,ativo,alta",
].join("\n")

const COMPAT_HEADER =
  "compatibility_key,compatibility_type,group_name,source_model_key,target_model_key,product_category,status,confidence,source_origin,evidence,requires_dry_test,notes"

function buildIndexWithCompat(rows: string[]) {
  return buildCatalogoIndex({
    models: parseDeviceModels(MODELS_CSV),
    aliases: parseDeviceAliases("alias_key,model_key,alias,normalized_alias\n"),
    compatibilities: parseDeviceCompatibilities([COMPAT_HEADER, ...rows].join("\n")),
  })
}

describe("índice sintético — pares unidirecionais", () => {
  const index = buildIndexWithCompat([
    "pelicula_g900__marca_a_um__marca_a_dois,grupo_pelicula,Grupo 900,marca_a_um,marca_a_dois,pelicula_tela,confirmado_fornecedor,alta,teste,,false,",
  ])

  it("casa quando o modelo é SOURCE", () => {
    const grupos = getPeliculasPorModelo(index, "marca_a_um")
    expect(grupos).toHaveLength(1)
    expect(grupos[0].members.map((m) => m.modelKey)).toEqual(["marca_a_dois"])
  })

  it("casa quando o modelo é TARGET", () => {
    const grupos = getPeliculasPorModelo(index, "marca_a_dois")
    expect(grupos).toHaveLength(1)
    expect(grupos[0].members.map((m) => m.modelKey)).toEqual(["marca_a_um"])
  })

  it("grupo de uma marca só NÃO é multimarca", () => {
    expect(getPeliculasPorModelo(index, "marca_a_um")[0].isCrossBrandGroup).toBe(false)
  })
})

describe("índice sintético — agregação sem promoção", () => {
  const index = buildIndexWithCompat([
    // Mesmo grupo (g901) com status/confiança mistos e um dry test.
    "pelicula_g901__marca_a_um__marca_a_dois,grupo_pelicula,Grupo 901,marca_a_um,marca_a_dois,pelicula_tela,confirmado_fornecedor,alta,teste,,false,",
    "pelicula_g901__marca_a_um__marca_a_tres,grupo_pelicula,Grupo 901,marca_a_um,marca_a_tres,pelicula_tela,precisa_testar,baixa,teste,,true,",
    "pelicula_g901__marca_a_dois__marca_a_tres,grupo_pelicula,Grupo 901,marca_a_dois,marca_a_tres,pelicula_tela,provavel_mercado,media,teste,,false,",
  ])

  it("status agregado é o PIOR do grupo (não promove)", () => {
    const [grupo] = getPeliculasPorModelo(index, "marca_a_um")
    expect(grupo.status).toBe("precisa_testar")
  })

  it("confiança agregada é a MENOR do grupo", () => {
    const [grupo] = getPeliculasPorModelo(index, "marca_a_um")
    expect(grupo.confidence).toBe("baixa")
  })

  it("requiresDryTest é true se QUALQUER relação exigir teste seco", () => {
    const [grupo] = getPeliculasPorModelo(index, "marca_a_um")
    expect(grupo.requiresDryTest).toBe(true)
    expect(grupo.warnings.join(" ")).toContain("Testar a seco")
  })

  it("membros do grupo são a união dos pares (sem o consultado)", () => {
    const [grupo] = getPeliculasPorModelo(index, "marca_a_um")
    expect(grupo.memberCount).toBe(3)
    expect(grupo.members.map((m) => m.modelKey).sort()).toEqual(["marca_a_dois", "marca_a_tres"])
  })
})

describe("índice sintético — película nunca se confunde com capinha", () => {
  const index = buildIndexWithCompat([
    // Relação de CAPINHA (categoria explícita) — não pode aparecer como película.
    "capinha_g001__marca_a_um__marca_a_dois,grupo_capinha,Capinha 1,marca_a_um,marca_a_dois,capinha,confirmado_fornecedor,alta,teste,,false,",
    // Tipo diz película mas categoria diz capinha — categoria divergente NÃO entra.
    "pelicula_g902__marca_a_um__marca_a_dois,grupo_pelicula,Suspeito,marca_a_um,marca_a_dois,capinha,confirmado_fornecedor,alta,teste,,false,",
    // mesmo_modelo/generico (auto-relação) também não entra.
    "mesmo__marca_a_um,mesmo_modelo,,marca_a_um,marca_a_um,generico,confirmado_fornecedor,alta,teste,,false,",
    // Única película legítima.
    "pelicula_g903__marca_a_um__marca_b_um,grupo_pelicula,Grupo 903,marca_a_um,marca_b_um,pelicula_tela,provavel_mercado,media,teste,,false,",
  ])

  it("só retorna o grupo com product_category=pelicula_tela", () => {
    const grupos = getPeliculasPorModelo(index, "marca_a_um")
    expect(grupos).toHaveLength(1)
    expect(grupos[0].groupKey).toBe("pelicula_g903")
    expect(grupos[0].productCategory).toBe("pelicula_tela")
  })

  it("grupo multimarca sintético sinaliza isCrossBrandGroup", () => {
    const [grupo] = getPeliculasPorModelo(index, "marca_a_um") // MarcaA + MarcaB
    expect(grupo.isCrossBrandGroup).toBe(true)
  })
})

describe("índice sintético — evidência ilegível é omitida", () => {
  it("mojibake em evidence degrada para string vazia (nunca texto quebrado)", () => {
    const mojibake = "ConsolidaÃ§Ã£o dos fornecedores"
    const index = buildIndexWithCompat([
      `pelicula_g904__marca_a_um__marca_a_dois,grupo_pelicula,Grupo 904,marca_a_um,marca_a_dois,pelicula_tela,confirmado_fornecedor,alta,teste,"${mojibake}",false,`,
    ])
    const [grupo] = getPeliculasPorModelo(index, "marca_a_um")
    expect(grupo.evidence).toBe("")
  })

  it("evidência curta e legível é preservada", () => {
    const index = buildIndexWithCompat([
      "pelicula_g905__marca_a_um__marca_a_dois,grupo_pelicula,Grupo 905,marca_a_um,marca_a_dois,pelicula_tela,confirmado_fornecedor,alta,teste,HTML DATA #11; prioridade Alta,false,",
    ])
    const [grupo] = getPeliculasPorModelo(index, "marca_a_um")
    expect(grupo.evidence).toBe("HTML DATA #11; prioridade Alta")
  })
})
