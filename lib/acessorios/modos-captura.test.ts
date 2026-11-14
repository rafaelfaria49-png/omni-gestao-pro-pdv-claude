/**
 * COMPAT-PROFISSIONAL-001 — captura de modelo/cor obrigatória / opcional / desativada,
 * compatível com produtos antigos (só booleanos) e com o validador da venda (booleanos coerentes).
 */
import { describe, expect, it } from "vitest"
import { accessoryConfigRequiresSelection, buildAccessoryCartLine, resolveAccessoryColorOptions } from "./cart-line"
import { modoCorEfetivo, modoModeloEfetivo, sanitizeProdutoAcessoriosMetadata } from "./metadata"
import {
  emptyProdutoAcessoriosForm,
  produtoAcessoriosFormFromMetadata,
  produtoAcessoriosMetadataFromForm,
  withModoCaptura,
  type ProdutoAcessoriosFormValue,
} from "./form"
import { validateAccessorySelectionAgainstConfig } from "./selection"

const base = { version: 1, tipo: "capinha", exigeModelo: false, exigeCor: false, usaCoresPadrao: true } as const

describe("modo de captura", () => {
  it("produto antigo: booleanos viram obrigatório/desativado (sem mudança de comportamento)", () => {
    const antigo = sanitizeProdutoAcessoriosMetadata({ ...base, exigeModelo: true })
    expect(modoModeloEfetivo(antigo)).toBe("obrigatorio")
    expect(modoCorEfetivo(antigo)).toBe("desativado")
    expect(antigo).not.toHaveProperty("modoModelo")
    expect(accessoryConfigRequiresSelection(sanitizeProdutoAcessoriosMetadata(base))).toBe(false)
  })

  it("modo explícito manda e mantém os booleanos coerentes", () => {
    const c = sanitizeProdutoAcessoriosMetadata({ ...base, exigeModelo: true, modoModelo: "opcional", modoCor: "obrigatorio" })
    expect(c).toMatchObject({ modoModelo: "opcional", exigeModelo: false, modoCor: "obrigatorio", exigeCor: true })
  })

  it("modo inválido invalida a config inteira (fail-closed)", () => {
    expect(sanitizeProdutoAcessoriosMetadata({ ...base, modoModelo: "talvez" })).toBeNull()
  })

  it("opcional abre o seletor mas a venda passa sem modelo/cor", () => {
    const c = sanitizeProdutoAcessoriosMetadata({ ...base, modoModelo: "opcional", modoCor: "opcional" })
    expect(accessoryConfigRequiresSelection(c)).toBe(true)
    expect(validateAccessorySelectionAgainstConfig(c, { version: 1 }).valid).toBe(true)
    const line = buildAccessoryCartLine({ inventoryId: "p1", productName: "Capinha transparente", config: c, selection: { version: 1 } })
    expect(line.ok).toBe(true)
    expect(resolveAccessoryColorOptions(c).length).toBeGreaterThan(0)
  })

  it("obrigatório continua bloqueando sem modelo", () => {
    const c = sanitizeProdutoAcessoriosMetadata({ ...base, modoModelo: "obrigatorio" })
    const r = validateAccessorySelectionAgainstConfig(c, { version: 1 })
    expect(r.valid).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain("MODEL_REQUIRED")
  })

  it("desativado nos dois = venda direta, sem modal", () => {
    const c = sanitizeProdutoAcessoriosMetadata({ ...base, modoModelo: "desativado", modoCor: "desativado" })
    expect(accessoryConfigRequiresSelection(c)).toBe(false)
    expect(resolveAccessoryColorOptions(c)).toEqual([])
  })
})

describe("formulário do produto", () => {
  it("ida e volta preserva modos e cores da loja", () => {
    let v: ProdutoAcessoriosFormValue = { ...emptyProdutoAcessoriosForm(), enabled: true, tipo: "capinha" }
    v = withModoCaptura(v, "modelo", "opcional")
    v = withModoCaptura(v, "cor", "obrigatorio")
    const meta = produtoAcessoriosMetadataFromForm({ ...v, coresLoja: ["cor_1"] })
    expect(meta).toMatchObject({ modoModelo: "opcional", modoCor: "obrigatorio", exigeCor: true, coresLoja: ["cor_1"] })
    const back = produtoAcessoriosFormFromMetadata({ acessorios: meta })
    expect(back).toMatchObject({ modoModelo: "opcional", modoCor: "obrigatorio", coresLoja: ["cor_1"] })
  })

  it("paleta restrita + cores da loja inclui 'outra' (a cor própria viaja como 'outra' + rótulo)", () => {
    const meta = produtoAcessoriosMetadataFromForm({
      ...emptyProdutoAcessoriosForm(),
      enabled: true,
      tipo: "capinha",
      usaCoresPadrao: false,
      coresPermitidas: ["preto"],
      coresLoja: ["cor_1"],
    })
    expect(meta?.coresPermitidas).toEqual(["preto", "outra"])
  })

  it("ids de cores da loja são saneados", () => {
    const c = sanitizeProdutoAcessoriosMetadata({ ...base, coresLoja: ["ok_1", "ok_1", "<script>", 3, ""] })
    expect(c?.coresLoja).toEqual(["ok_1"])
  })
})
