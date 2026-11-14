/**
 * COMPAT-PROFISSIONAL-001 — regras puras do catálogo por loja acrescentadas nesta entrega:
 * fabricante/linha, duplicidade entre marca comercial × fabricante, status confirmado pela
 * loja e grupos de CAPINHA independentes de película.
 */
import { describe, expect, it } from "vitest"
import { loadCatalogoIndex } from "./catalogo-loader"
import {
  AVISO_COMPAT_CONFIRMADA_LOJA,
  AVISO_COMPAT_MANUAL,
  LOJA_COMPAT_STATUSES,
  applyPeliculaOverrides,
  buildCapinhaGrupos,
  findGlobalDuplicate,
  normalizeLojaCompatStatus,
  sanitizeLojaModeloInput,
  type LojaCompatOverride,
} from "./loja-catalogo"
import type { PeliculaGrupoMember } from "./peliculas"

const index = loadCatalogoIndex()
const resolve = (k: string): PeliculaGrupoMember => {
  const g = index.modelByKey.get(k)
  return { modelKey: k, canonicalName: g?.canonicalName ?? k, brand: g?.brand ?? "Marca X" }
}
const par = (a: string, b: string) => (a < b ? { modelKeyA: a, modelKeyB: b } : { modelKeyA: b, modelKeyB: a })
const ov = (o: Partial<LojaCompatOverride> & { a: string; b: string }): LojaCompatOverride => ({
  categoria: o.categoria ?? "capinha",
  ...par(o.a, o.b),
  acao: o.acao ?? "adicionar",
  status: o.status ?? "precisa_testar",
  notes: "",
})

describe("modelo da loja: fabricante e linha", () => {
  it("aceita fabricante e linha; fabricante vazio é derivado da marca", () => {
    const r = sanitizeLojaModeloInput({ brand: "POCO", name: "C81 Pro", line: " C " })
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ brand: "POCO", manufacturer: "Xiaomi", line: "C", name: "C81 Pro" }) })
    const r2 = sanitizeLojaModeloInput({ brand: "Marca Própria", manufacturer: "Fabricante Y", name: "Z1" })
    expect(r2.ok && r2.value.manufacturer).toBe("Fabricante Y")
  })
})

describe("duplicidade contra o catálogo global", () => {
  it("marca comercial 'Galaxy' + modelo colide com o global gravado como 'Samsung'", () => {
    const a05 = index.models.find((m) => m.modelKey === "samsung_galaxy_a05")!
    expect(a05.brand).toBe("Samsung")
    expect(findGlobalDuplicate(index, { brand: "Galaxy", name: "A05" })?.modelKey).toBe("samsung_galaxy_a05")
    expect(findGlobalDuplicate(index, { brand: "Galaxy", name: "Galaxy A05" })?.modelKey).toBe("samsung_galaxy_a05")
  })

  it("nome semelhante NÃO é confundido (A05 × A05s / sufixo novo)", () => {
    expect(findGlobalDuplicate(index, { brand: "Galaxy", name: "A05 Ultra Sintético" })).toBeNull()
    const a05s = findGlobalDuplicate(index, { brand: "Galaxy", name: "A05s" })
    expect(a05s?.modelKey).not.toBe("samsung_galaxy_a05")
  })

  it("mesmo nome em fabricante diferente não colide", () => {
    expect(findGlobalDuplicate(index, { brand: "Marca Sintética", name: "A05" })).toBeNull()
  })
})

describe("status confirmado pela loja", () => {
  it("é aceito, vem primeiro e nunca vira 'confirmado_fornecedor'", () => {
    expect(LOJA_COMPAT_STATUSES[0]).toBe("confirmado_loja")
    expect(normalizeLojaCompatStatus("confirmado_loja")).toBe("confirmado_loja")
    expect(normalizeLojaCompatStatus("confirmado_fornecedor")).toBe("precisa_testar")
  })

  it("grupo confirmado tem aviso próprio (loja, não fabricante) e dispensa teste seco", () => {
    const grupos = buildCapinhaGrupos("samsung_galaxy_a05", [ov({ a: "samsung_galaxy_a05", b: "samsung_galaxy_a05s", status: "confirmado_loja" })], resolve)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]).toMatchObject({ status: "confirmado_loja", requiresDryTest: false, productCategory: "capinha" })
    expect(grupos[0].warnings).toEqual([AVISO_COMPAT_CONFIRMADA_LOJA])
    expect(grupos[0].warnings[0]).toMatch(/não é confirmação do fabricante/)
  })
})

describe("capinha × película: independentes", () => {
  const capinhaA05A06 = ov({ a: "samsung_galaxy_a05", b: "samsung_galaxy_a06", categoria: "capinha" })
  const peliculaA05G47 = ov({ a: "samsung_galaxy_a05", b: "manual_g47", categoria: "pelicula_tela" })

  it("vínculo de película nunca aparece em capinha", () => {
    const grupos = buildCapinhaGrupos("samsung_galaxy_a05", [capinhaA05A06, peliculaA05G47], resolve)
    expect(grupos.flatMap((g) => g.members.map((m) => m.modelKey))).toEqual(["samsung_galaxy_a06"])
  })

  it("vínculo de capinha nunca aparece em película (nem como manual)", () => {
    const { grupos } = applyPeliculaOverrides("samsung_galaxy_a05", [], [capinhaA05A06], resolve)
    expect(grupos).toEqual([])
  })

  it("capinha não é transitiva: A05↔A06 e A06↔A07 não tornam A05↔A07", () => {
    const a06a07 = ov({ a: "samsung_galaxy_a06", b: "samsung_galaxy_a07" })
    const deA05 = buildCapinhaGrupos("samsung_galaxy_a05", [capinhaA05A06, a06a07], resolve)
    expect(deA05.flatMap((g) => g.members.map((m) => m.modelKey))).toEqual(["samsung_galaxy_a06"])
    const deA06 = buildCapinhaGrupos("samsung_galaxy_a06", [capinhaA05A06, a06a07], resolve)
    expect(deA06.flatMap((g) => g.members.map((m) => m.modelKey)).sort()).toEqual(["samsung_galaxy_a05", "samsung_galaxy_a07"])
  })

  it("busca por QUALQUER modelo do vínculo encontra o outro (par simétrico)", () => {
    expect(buildCapinhaGrupos("samsung_galaxy_a06", [capinhaA05A06], resolve)[0].members[0].modelKey).toBe("samsung_galaxy_a05")
  })

  it("agrupa por status (pendente/provável separados) com aviso de loja", () => {
    const grupos = buildCapinhaGrupos(
      "samsung_galaxy_a05",
      [capinhaA05A06, ov({ a: "samsung_galaxy_a05", b: "samsung_galaxy_a05s", status: "provavel_mercado" })],
      resolve,
    )
    expect(grupos.map((g) => g.status)).toEqual(["provavel_mercado", "precisa_testar"])
    expect(grupos.every((g) => g.warnings.includes(AVISO_COMPAT_MANUAL))).toBe(true)
  })
})
