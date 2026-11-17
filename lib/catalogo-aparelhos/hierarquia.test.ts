import { describe, expect, it } from "vitest"
import {
  chaveNomeSemFabricante,
  fabricanteDaMarca,
  hierarquiaDoModeloGlobal,
  hierarquiaDoModeloLoja,
  nomePadronizado,
  sugestoesHierarquia,
} from "./hierarquia"
import { loadCatalogoIndex } from "./catalogo-loader"

describe("hierarquia Fabricante › Marca › Linha › Modelo", () => {
  it("deriva o fabricante da marca comercial", () => {
    expect(fabricanteDaMarca("POCO")).toBe("Xiaomi")
    expect(fabricanteDaMarca("redmi")).toBe("Xiaomi")
    expect(fabricanteDaMarca("Galaxy")).toBe("Samsung")
    expect(fabricanteDaMarca("Moto")).toBe("Motorola")
    expect(fabricanteDaMarca("iPhone")).toBe("Apple")
    // Marca desconhecida: ela mesma (nada é inventado).
    expect(fabricanteDaMarca("Marca Nova")).toBe("Marca Nova")
    expect(fabricanteDaMarca("")).toBe("")
  })

  it("projeta as convenções mistas do CSV global sem alterá-lo", () => {
    expect(hierarquiaDoModeloGlobal({ brand: "Samsung", commercialLine: "Galaxy A" })).toEqual({
      fabricante: "Samsung", marca: "Galaxy", linha: "A",
    })
    expect(hierarquiaDoModeloGlobal({ brand: "Redmi", commercialLine: "Redmi Note" })).toEqual({
      fabricante: "Xiaomi", marca: "Redmi", linha: "Note",
    })
    expect(hierarquiaDoModeloGlobal({ brand: "POCO", commercialLine: "POCO C" })).toEqual({
      fabricante: "Xiaomi", marca: "POCO", linha: "C",
    })
    expect(hierarquiaDoModeloGlobal({ brand: "Motorola", commercialLine: "Moto G" })).toEqual({
      fabricante: "Motorola", marca: "Moto", linha: "G",
    })
    expect(hierarquiaDoModeloGlobal({ brand: "Apple", commercialLine: "iPhone" })).toEqual({
      fabricante: "Apple", marca: "iPhone", linha: "",
    })
    expect(hierarquiaDoModeloGlobal({ brand: "Infinix", commercialLine: "Infinix Hot" })).toEqual({
      fabricante: "Infinix", marca: "Infinix", linha: "Hot",
    })
  })

  it("modelo manual antigo (sem fabricante) deriva da marca; novo usa o informado", () => {
    expect(hierarquiaDoModeloLoja({ brand: "POCO", manufacturer: "", line: "C" })).toEqual({ fabricante: "Xiaomi", marca: "POCO", linha: "C" })
    expect(hierarquiaDoModeloLoja({ brand: "Marca X" })).toEqual({ fabricante: "Marca X", marca: "Marca X", linha: "" })
    expect(hierarquiaDoModeloLoja({ brand: "Redmi", manufacturer: "Xiaomi" }).fabricante).toBe("Xiaomi")
  })

  it("gera o nome padronizado sem repetir a marca", () => {
    expect(nomePadronizado("Redmi", "A7 Pro")).toBe("Redmi A7 Pro")
    expect(nomePadronizado("POCO", "C81 Pro")).toBe("POCO C81 Pro")
    expect(nomePadronizado("Galaxy", "Galaxy A56 5G")).toBe("Galaxy A56 5G")
    expect(nomePadronizado("Moto", "  G56   5G ")).toBe("Moto G56 5G")
    expect(nomePadronizado("", "G47")).toBe("G47")
  })

  it("chave sem fabricante diferencia nomes semelhantes", () => {
    expect(chaveNomeSemFabricante("Samsung", "Samsung Galaxy A56 5G")).toBe("GALAXY A56 5G")
    expect(chaveNomeSemFabricante("Samsung", "Galaxy A56 5G")).toBe("GALAXY A56 5G")
    expect(chaveNomeSemFabricante("Samsung", "Galaxy A56")).not.toBe(chaveNomeSemFabricante("Samsung", "Galaxy A56 5G"))
  })

  it("sugestões do catálogo real agrupam Redmi/POCO sob Xiaomi e Galaxy sob Samsung", () => {
    const arvore = sugestoesHierarquia(loadCatalogoIndex().models)
    const xiaomi = arvore.find((f) => f.fabricante === "Xiaomi")
    expect(xiaomi?.marcas.map((m) => m.marca)).toEqual(expect.arrayContaining(["Redmi", "POCO"]))
    const samsung = arvore.find((f) => f.fabricante === "Samsung")
    expect(samsung?.marcas.find((m) => m.marca === "Galaxy")?.linhas).toEqual(expect.arrayContaining(["A", "S", "M"]))
  })
})
