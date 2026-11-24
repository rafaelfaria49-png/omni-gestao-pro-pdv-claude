import { describe, expect, it } from "vitest"
import {
  chaveNomeCadastro,
  compararNomesPtBR,
  correspondeBuscaCadastro,
  digitosCadastro,
  encontrarNomeDuplicado,
  limparTextoCadastro,
  mensagemErroCadastro,
  nomeCadastroParaGravar,
  ordenarPorNome,
  padronizarNomeCadastro,
  unirNomesCadastro,
} from "./nome-cadastro"

describe("limparTextoCadastro", () => {
  it("apara, colapsa espaços, NBSP, tabs e remove invisíveis", () => {
    expect(limparTextoCadastro("  Capa   iPhone\t13 ​ ")).toBe("Capa iPhone 13")
    expect(limparTextoCadastro("Linha\nquebrada")).toBe("Linha quebrada")
  })
  it("normaliza acentos compostos para NFC sem removê-los", () => {
    const decomposto = "Película" // í decomposto
    expect(limparTextoCadastro(decomposto)).toBe("Película")
    expect(limparTextoCadastro(decomposto)).toHaveLength(8)
  })
  it("valores ausentes viram vazio", () => {
    expect(limparTextoCadastro(null)).toBe("")
    expect(limparTextoCadastro(undefined)).toBe("")
  })
})

describe("chaveNomeCadastro", () => {
  it("ignora caixa, acento e espaços extras", () => {
    expect(chaveNomeCadastro("  Película   3D ")).toBe(chaveNomeCadastro("pelicula 3d"))
    expect(chaveNomeCadastro("AÇÚCAR")).toBe("acucar")
  })
  it("mantém nomes distintos distintos", () => {
    expect(chaveNomeCadastro("Azul")).not.toBe(chaveNomeCadastro("Azul Royal"))
    expect(chaveNomeCadastro("iPhone 11")).not.toBe(chaveNomeCadastro("iPhone 11 Pro"))
  })
})

describe("padronizarNomeCadastro — pessoa", () => {
  it("capitaliza nomes vindos todo em maiúsculas ou minúsculas", () => {
    expect(padronizarNomeCadastro("JOÃO DA SILVA", "pessoa")).toBe("João da Silva")
    expect(padronizarNomeCadastro("  maria   das dores  ", "pessoa")).toBe("Maria das Dores")
    expect(padronizarNomeCadastro("ANA-MARIA D'ÁVILA", "pessoa")).toBe("Ana-Maria D'Ávila")
    expect(padronizarNomeCadastro("pedro de souza e silva", "pessoa")).toBe("Pedro de Souza e Silva")
  })
  it("mantém numeral romano em maiúsculas", () => {
    expect(padronizarNomeCadastro("CARLOS ALBERTO II", "pessoa")).toBe("Carlos Alberto II")
  })
  it("preserva grafia mista escolhida pelo usuário", () => {
    expect(padronizarNomeCadastro("Ronald McDonald", "pessoa")).toBe("Ronald McDonald")
    expect(padronizarNomeCadastro("João DA Silva", "pessoa")).toBe("João DA Silva")
  })
  it("preserva siglas quando o nome veio em caixa alta", () => {
    expect(padronizarNomeCadastro("PJ", "pessoa")).toBe("PJ")
    expect(padronizarNomeCadastro("JOSÉ SILVA JR", "pessoa")).toBe("José Silva JR")
    expect(padronizarNomeCadastro("MERCADO BOM PREÇO LTDA ME", "pessoa")).toBe("Mercado Bom Preço LTDA ME")
    expect(padronizarNomeCadastro("mercado bom preço ltda", "pessoa")).toBe("Mercado Bom Preço Ltda")
  })
  it("preserva tokens com dígitos", () => {
    expect(padronizarNomeCadastro("loja 3b cliente", "pessoa")).toBe("Loja 3b Cliente")
  })
  it("conector no início é capitalizado", () => {
    expect(padronizarNomeCadastro("da silva", "pessoa")).toBe("Da Silva")
  })
})

describe("padronizarNomeCadastro — rótulo e preservar", () => {
  it("rótulo só sobe a primeira letra quando tudo veio minúsculo", () => {
    expect(padronizarNomeCadastro("capinhas", "rotulo")).toBe("Capinhas")
    expect(padronizarNomeCadastro("troca de tela", "rotulo")).toBe("Troca de tela")
    expect(padronizarNomeCadastro("CAPINHAS", "rotulo")).toBe("CAPINHAS")
    expect(padronizarNomeCadastro("capas iPhone", "rotulo")).toBe("capas iPhone")
  })
  it("preservar nunca mexe em letras de marcas, modelos e códigos", () => {
    for (const v of ["iPhone 15 Pro Max", "LG", "xiaomi", "SKU-ab12", "7891234567895", "356938035643809"]) {
      expect(padronizarNomeCadastro(v, "preservar")).toBe(v)
    }
    expect(padronizarNomeCadastro("  Galaxy   A15 ", "preservar")).toBe("Galaxy A15")
  })
  it("texto sem letras volta só limpo", () => {
    expect(padronizarNomeCadastro(" 123  456 ", "pessoa")).toBe("123 456")
  })
})

describe("nomeCadastroParaGravar — preservação na edição", () => {
  it("criação aplica o padrão do campo", () => {
    expect(nomeCadastroParaGravar("JOÃO DA SILVA", "pessoa")).toBe("João da Silva")
  })
  it("edição sem mudar o nome mantém o legado intacto (inativar/editar telefone)", () => {
    expect(nomeCadastroParaGravar("JOÃO DA SILVA", "pessoa", "JOÃO DA SILVA")).toBe("JOÃO DA SILVA")
    expect(nomeCadastroParaGravar("capinhas", "rotulo", "capinhas")).toBe("capinhas")
    expect(nomeCadastroParaGravar(" capinhas ", "rotulo", "capinhas")).toBe("capinhas")
  })
  it("edição que muda o nome aplica o padrão — inclusive correção de caixa feita pelo usuário", () => {
    expect(nomeCadastroParaGravar("João da Silva", "pessoa", "JOÃO DA SILVA")).toBe("João da Silva")
    expect(nomeCadastroParaGravar("maria souza", "pessoa", "Maria")).toBe("Maria Souza")
  })
})

describe("ordenação e busca pt-BR", () => {
  it("ordena sem caixa/acento e com números naturais", () => {
    const nomes = ["Ônix", "abacate", "Árvore", "iPhone 11", "iPhone 9", "Banana"]
    expect([...nomes].sort(compararNomesPtBR)).toEqual(["abacate", "Árvore", "Banana", "iPhone 9", "iPhone 11", "Ônix"])
  })
  it("ordenarPorNome não muta a original", () => {
    const rows = [{ n: "b" }, { n: "a" }]
    const out = ordenarPorNome(rows, (r) => r.n)
    expect(out.map((r) => r.n)).toEqual(["a", "b"])
    expect(rows.map((r) => r.n)).toEqual(["b", "a"])
  })
  it("busca sem acento e por vários termos em qualquer campo", () => {
    expect(correspondeBuscaCadastro(["Película 3D iPhone 13", "Películas"], "pelicula iphone")).toBe(true)
    expect(correspondeBuscaCadastro(["José Antônio", "11 99999-0000"], "jose 9999")).toBe(true)
    expect(correspondeBuscaCadastro(["Capa Galaxy"], "capa iphone")).toBe(false)
    expect(correspondeBuscaCadastro(["Qualquer"], "   ")).toBe(true)
  })
})

describe("duplicidade", () => {
  const rows = [
    { id: "1", nome: "Películas" },
    { id: "2", nome: "Capinhas" },
  ]
  it("acha duplicado sem caixa/acento/espaço", () => {
    expect(encontrarNomeDuplicado("  peliculas ", rows, (r) => r.nome)?.id).toBe("1")
  })
  it("ignora o próprio registro na edição", () => {
    expect(encontrarNomeDuplicado("Películas", rows, (r) => r.nome, "1")).toBeNull()
  })
  it("nome vazio nunca é duplicado", () => {
    expect(encontrarNomeDuplicado("  ", rows, (r) => r.nome)).toBeNull()
  })
  it("unirNomesCadastro funde grafias equivalentes e ordena", () => {
    expect(unirNomesCadastro(["Películas", "Capas"], ["peliculas", " Acessórios "])).toEqual([
      "Acessórios",
      "Capas",
      "Películas",
    ])
  })
  it("digitosCadastro compara documentos", () => {
    expect(digitosCadastro("12.345.678/0001-90")).toBe("12345678000190")
  })
})

describe("mensagemErroCadastro", () => {
  it("usa a mensagem real quando existe", () => {
    expect(mensagemErroCadastro(new Error("Já existe a categoria “Capas”."), "x")).toBe("Já existe a categoria “Capas”.")
  })
  it("troca a mensagem mascarada de produção pelo fallback em português", () => {
    const masked = new Error(
      "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.",
    )
    expect(mensagemErroCadastro(masked, "Não foi possível salvar.")).toBe("Não foi possível salvar.")
    expect(mensagemErroCadastro(undefined, "Falhou.")).toBe("Falhou.")
  })
})
