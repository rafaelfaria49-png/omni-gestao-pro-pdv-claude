import { describe, expect, it } from "vitest"
import {
  emptyProdutoAcessoriosForm,
  produtoAcessoriosFormFromMetadata,
  produtoAcessoriosMetadataFromForm,
} from "./form"

describe("formulário de configuração de acessórios", () => {
  it("mantém produto comum desativado", () => {
    expect(produtoAcessoriosMetadataFromForm(emptyProdutoAcessoriosForm())).toBeNull()
  })

  it("restaura tipo, booleanos e subconjunto de cores", () => {
    const form = produtoAcessoriosFormFromMetadata({
      acessorios: {
        version: 1,
        tipo: "capinha",
        exigeModelo: true,
        exigeCor: true,
        usaCoresPadrao: false,
        coresPermitidas: ["preto", "azul"],
      },
    })
    expect(form).toMatchObject({
      enabled: true,
      tipo: "capinha",
      exigeModelo: true,
      exigeCor: true,
      usaCoresPadrao: false,
      coresPermitidas: ["preto", "azul"],
    })
  })

  it("usa as 18 cores ao reabrir configuração de cores padrão", () => {
    const form = produtoAcessoriosFormFromMetadata({
      acessorios: {
        version: 1,
        tipo: "pelicula",
        exigeModelo: true,
        exigeCor: false,
        usaCoresPadrao: true,
      },
    })
    expect(form.coresPermitidas).toHaveLength(18)
  })

  it("saneia cores selecionadas antes de salvar", () => {
    const metadata = produtoAcessoriosMetadataFromForm({
      ...emptyProdutoAcessoriosForm(),
      enabled: true,
      tipo: "capinha",
      exigeCor: true,
      usaCoresPadrao: false,
      coresPermitidas: ["azul", "preto", "azul"],
    })
    expect(metadata?.coresPermitidas).toEqual(["preto", "azul"])
  })
})
