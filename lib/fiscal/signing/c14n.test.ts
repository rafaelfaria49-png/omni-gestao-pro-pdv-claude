import { describe, expect, it } from "vitest"
import {
  XmlParseError,
  attrOf,
  canonicalizeElement,
  findById,
  findFirst,
  parseXml,
  textOf,
} from "./c14n"

describe("parseXml seguro e namespace-aware", () => {
  it("parseia declaracao, elementos, atributos e texto", () => {
    const root = parseXml(`<?xml version="1.0" encoding="UTF-8"?>\n<a x="1"><b>texto</b></a>`)
    expect(root.name).toBe("a")
    expect(attrOf(root, "x")).toBe("1")
    expect(textOf(findFirst(root, "b"))).toBe("texto")
  })

  it("aceita self-closing e atribui filhos vazios", () => {
    expect(findFirst(parseXml(`<a><b/></a>`), "b")).not.toBeNull()
  })

  it("lanca em XML malformado", () => {
    expect(() => parseXml(`<a><b></a>`)).toThrow(XmlParseError)
  })

  it("bloqueia DTD/XXE antes do parser", () => {
    expect(() => parseXml(`<!DOCTYPE a [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>`)).toThrow(
      /DOCTYPE|DTD/,
    )
  })
})

describe("canonicalizeElement — Canonical XML 1.0", () => {
  it("preserva whitespace de texto entre elementos", () => {
    const compact = parseXml(`<a><b>1</b><c>2</c></a>`)
    const indented = parseXml(`<a>\n  <b>1</b>\n  <c>2</c>\n</a>`)
    expect(canonicalizeElement(compact)).not.toBe(canonicalizeElement(indented))
    expect(canonicalizeElement(indented)).toBe(`<a>\n  <b>1</b>\n  <c>2</c>\n</a>`)
  })

  it("ordena atributos e expande elementos vazios", () => {
    expect(canonicalizeElement(parseXml(`<x b="2" a="1"><y/></x>`))).toBe(
      `<x a="1" b="2"><y></y></x>`,
    )
  })

  it("renderiza o namespace default herdado no apice do subset", () => {
    const root = parseXml(`<NFe xmlns="http://ns"><infNFe Id="X"><v>1</v></infNFe></NFe>`)
    const infNFe = findFirst(root, "infNFe")!
    expect(canonicalizeElement(infNFe, attrOf(root, "xmlns"))).toBe(
      `<infNFe xmlns="http://ns" Id="X"><v>1</v></infNFe>`,
    )
  })

  it("resolve entidades e normaliza caracteres especiais", () => {
    const element = parseXml(`<x a="A&#x9;B">A &amp; B&#xD;C</x>`)
    expect(canonicalizeElement(element)).toBe(`<x a="A&#x9;B">A &amp; B&#xD;C</x>`)
  })

  it("ordena atributos por URI de namespace e inclui namespaces herdados", () => {
    const root = parseXml(`<r xmlns="urn:r" xmlns:z="urn:z" xmlns:a="urn:a"><x z:b="2" plain="0" a:c="1"/></r>`)
    const element = findFirst(root, "x")!
    expect(canonicalizeElement(element)).toBe(
      `<x xmlns="urn:r" xmlns:a="urn:a" xmlns:z="urn:z" plain="0" a:c="1" z:b="2"></x>`,
    )
  })

  it("preserva texto significativo para detectar adulteracao", () => {
    const first = canonicalizeElement(parseXml(`<v>50.00</v>`))
    const second = canonicalizeElement(parseXml(`<v>60.00</v>`))
    expect(first).not.toBe(second)
  })
})

describe("findById", () => {
  it("acha elemento por atributo Id", () => {
    const root = parseXml(`<NFe><infNFe Id="NFe123"><x/></infNFe></NFe>`)
    expect(findById(root, "NFe123")?.name).toBe("infNFe")
    expect(findById(root, "ausente")).toBeNull()
  })
})
