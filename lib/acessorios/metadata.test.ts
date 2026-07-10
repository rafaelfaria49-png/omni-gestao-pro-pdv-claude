import { describe, expect, it } from "vitest"
import {
  getProdutoAcessoriosMetadata,
  mergeProdutoAcessoriosIntoMetadata,
  sanitizeProdutoAcessoriosMetadata,
} from "./metadata"

const validConfig = {
  version: 1,
  tipo: "capinha",
  exigeModelo: true,
  exigeCor: true,
  usaCoresPadrao: true,
} as const

describe("sanitizeProdutoAcessoriosMetadata", () => {
  it("namespace ausente representa produto comum", () => {
    expect(sanitizeProdutoAcessoriosMetadata(undefined)).toBeNull()
    expect(getProdutoAcessoriosMetadata({ fiscal: {} })).toBeNull()
  })

  it("rejeita versão inválida", () => {
    expect(sanitizeProdutoAcessoriosMetadata({ ...validConfig, version: 2 })).toBeNull()
    expect(sanitizeProdutoAcessoriosMetadata({ ...validConfig, version: "1" })).toBeNull()
  })

  it("rejeita tipo desconhecido", () => {
    expect(sanitizeProdutoAcessoriosMetadata({ ...validConfig, tipo: "cabo" })).toBeNull()
  })

  it("aceita somente os três tipos publicados", () => {
    for (const tipo of ["capinha", "pelicula", "acessorio_generico"]) {
      expect(sanitizeProdutoAcessoriosMetadata({ ...validConfig, tipo })?.tipo).toBe(tipo)
    }
  })

  it("rejeita booleanos em string", () => {
    expect(sanitizeProdutoAcessoriosMetadata({ ...validConfig, exigeModelo: "true" })).toBeNull()
    expect(sanitizeProdutoAcessoriosMetadata({ ...validConfig, exigeCor: "false" })).toBeNull()
    expect(sanitizeProdutoAcessoriosMetadata({ ...validConfig, usaCoresPadrao: "1" })).toBeNull()
  })

  it("rejeita booleanos ausentes", () => {
    const { exigeCor: _exigeCor, ...withoutExigeCor } = validConfig
    expect(sanitizeProdutoAcessoriosMetadata(withoutExigeCor)).toBeNull()
  })

  it("saneia configuração válida e produz retorno imutável", () => {
    const output = sanitizeProdutoAcessoriosMetadata({ ...validConfig, extra: "ignorado" })
    expect(output).toEqual(validConfig)
    expect(Object.isFrozen(output)).toBe(true)
  })

  it("mantém null como todas as cores padrão", () => {
    expect(sanitizeProdutoAcessoriosMetadata({ ...validConfig, coresPermitidas: null })?.coresPermitidas).toBeNull()
  })

  it("remove cores desconhecidas e duplicadas", () => {
    const output = sanitizeProdutoAcessoriosMetadata({
      ...validConfig,
      coresPermitidas: ["preto", "vinho", "preto", "azul"],
    })
    expect(output?.coresPermitidas).toEqual(["preto", "azul"])
  })

  it("ordena o subconjunto pela ordem canônica", () => {
    const output = sanitizeProdutoAcessoriosMetadata({
      ...validConfig,
      coresPermitidas: ["outra", "azul", "preto"],
    })
    expect(output?.coresPermitidas).toEqual(["preto", "azul", "outra"])
  })

  it("preserva lista vazia com semântica de nenhuma cor permitida", () => {
    const output = sanitizeProdutoAcessoriosMetadata({ ...validConfig, coresPermitidas: [] })
    expect(output?.coresPermitidas).toEqual([])
    expect(Object.isFrozen(output?.coresPermitidas)).toBe(true)
  })

  it("rejeita coresPermitidas com formato diferente de lista ou null", () => {
    expect(sanitizeProdutoAcessoriosMetadata({ ...validConfig, coresPermitidas: "preto" })).toBeNull()
  })
})

describe("leitura e merge de metadata", () => {
  it("lê do metadata e de um produto com metadata", () => {
    const metadata = { acessorios: validConfig }
    expect(getProdutoAcessoriosMetadata(metadata)?.tipo).toBe("capinha")
    expect(getProdutoAcessoriosMetadata({ metadata })?.exigeModelo).toBe(true)
  })

  it("configuração inválida no namespace representa produto comum", () => {
    expect(getProdutoAcessoriosMetadata({ acessorios: { version: 99 } })).toBeNull()
  })

  it("merge preserva fiscal e catálogo de aparelhos", () => {
    const base = {
      fiscal: { ncm: "12345678" },
      catalogoAparelhos: { version: 1, deviceModelKeys: ["x"] },
    }
    const merged = mergeProdutoAcessoriosIntoMetadata(base, validConfig)
    expect(merged.fiscal).toBe(base.fiscal)
    expect(merged.catalogoAparelhos).toBe(base.catalogoAparelhos)
    expect(merged.acessorios).toEqual(validConfig)
  })

  it("merge preserva atributos, cadastroIa, barcodeLookup e namespace desconhecido", () => {
    const base = {
      atributos: { tags: ["a"] },
      cadastroIa: { phase: "x" },
      barcodeLookup: { status: "ok" },
      futuro: { ativo: true },
    }
    const merged = mergeProdutoAcessoriosIntoMetadata(base, validConfig)
    for (const key of Object.keys(base)) expect(merged[key]).toBe(base[key as keyof typeof base])
  })

  it("substitui somente metadata.acessorios", () => {
    const base = { fiscal: { ncm: "1" }, acessorios: { ...validConfig, tipo: "pelicula" } }
    const merged = mergeProdutoAcessoriosIntoMetadata(base, validConfig)
    expect(merged.fiscal).toBe(base.fiscal)
    expect(merged.acessorios).toEqual(validConfig)
  })

  it("remove somente metadata.acessorios com null", () => {
    const base = { fiscal: { ncm: "1" }, acessorios: validConfig }
    const merged = mergeProdutoAcessoriosIntoMetadata(base, null)
    expect(merged).toEqual({ fiscal: { ncm: "1" } })
  })

  it("não muta o metadata de entrada", () => {
    const base = { fiscal: { ncm: "1" }, acessorios: validConfig }
    const snapshot = structuredClone(base)
    mergeProdutoAcessoriosIntoMetadata(base, null)
    expect(base).toEqual(snapshot)
  })

  it("base não-objeto vira metadata novo", () => {
    expect(mergeProdutoAcessoriosIntoMetadata("inválido", validConfig)).toHaveProperty("acessorios")
  })
})
