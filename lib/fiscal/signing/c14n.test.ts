/**
 * BL-FISCAL-005 — Canonicalização XML (parser + C14N-lite), PURO/determinístico.
 */
import { describe, it, expect } from "vitest"
import { parseXml, canonicalizeElement, findFirst, findById, XmlParseError, attrOf, textOf } from "./c14n"

describe("parseXml", () => {
  it("parseia declaração + elementos + atributos + texto", () => {
    const root = parseXml(`<?xml version="1.0" encoding="UTF-8"?>\n<a x="1"><b>texto</b></a>`)
    expect(root.name).toBe("a")
    expect(attrOf(root, "x")).toBe("1")
    expect(textOf(findFirst(root, "b"))).toBe("texto")
  })

  it("aceita self-closing e atribui filhos vazios", () => {
    const root = parseXml(`<a><b/></a>`)
    expect(findFirst(root, "b")).not.toBeNull()
  })

  it("lança em XML malformado (fechamento incorreto)", () => {
    expect(() => parseXml(`<a><b></a>`)).toThrow(XmlParseError)
  })
})

describe("canonicalizeElement · determinismo e independência de formatação", () => {
  it("ignora indentação/whitespace entre elementos", () => {
    const compact = parseXml(`<a><b>1</b><c>2</c></a>`)
    const indented = parseXml(`<a>\n  <b>1</b>\n  <c>2</c>\n</a>`)
    expect(canonicalizeElement(compact)).toBe(canonicalizeElement(indented))
  })

  it("ordena atributos por nome e expande elementos vazios", () => {
    const el = parseXml(`<x b="2" a="1"><y/></x>`)
    expect(canonicalizeElement(el)).toBe(`<x a="1" b="2"><y></y></x>`)
  })

  it("renderiza o namespace default herdado no ápice do subconjunto", () => {
    const root = parseXml(`<NFe xmlns="http://ns"><infNFe Id="X"><v>1</v></infNFe></NFe>`)
    const inf = findFirst(root, "infNFe")!
    const canon = canonicalizeElement(inf, attrOf(root, "xmlns"))
    expect(canon).toBe(`<infNFe xmlns="http://ns" Id="X"><v>1</v></infNFe>`)
  })

  it("preserva texto significativo (detecção de adulteração)", () => {
    const a = canonicalizeElement(parseXml(`<v>50.00</v>`))
    const b = canonicalizeElement(parseXml(`<v>60.00</v>`))
    expect(a).not.toBe(b)
  })
})

describe("findById", () => {
  it("acha elemento por atributo Id", () => {
    const root = parseXml(`<NFe><infNFe Id="NFe123"><x/></infNFe></NFe>`)
    expect(findById(root, "NFe123")?.name).toBe("infNFe")
    expect(findById(root, "ausente")).toBeNull()
  })
})
