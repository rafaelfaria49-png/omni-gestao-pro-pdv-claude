/**
 * GOAL-023 follow-up P2 (revisão independente) — evento e inutilização D01e-compactos.
 *
 * `serializeXmlEmbeddable` agora é sempre compacto, e atende também os
 * produtores de evento (`envEvento`) e inutilização (`inutNFe`). Este teste
 * prova, sem refatorar esses módulos, que ambos:
 *  - saem D01e-compactos (INTERTAG_FORMATTING_WHITESPACE=0, sem CR/LF/TAB
 *    de formatação);
 *  - preservam conteúdo fiscal (textos com espaços, Ids, chaves);
 *  - preservam a estrutura esperada (ordem e raízes);
 *  - continuam compactos DEPOIS da assinatura (splice, sem reserialização).
 *
 * Sintético, offline, sem rede, sem certificado/CSC/secret real.
 */
import { describe, expect, it } from "vitest"
import { loadCertificateMaterialFromPem } from "../signing/nfce-signer"
import { TEST_CERT_PEM, TEST_KEY_PLAIN_PEM } from "../signing/__fixtures__/test-cert"
import { countIntertagFormattingWhitespace, isD01eSafe } from "./d01e-backstop"
import { buildXmlEventoCancelamento } from "../events/evento-xml"
import { signEventoCancelamentoXml } from "../events/evento-sign"
import { buildInutilizacaoXml } from "../inutilizacao/xml-builder"
import { signInutilizacaoXml } from "../inutilizacao/sign-boundary"
import { PEDIDO_VALIDO } from "../inutilizacao/__fixtures__/inutilizacao-fixtures"

const CERT = loadCertificateMaterialFromPem(TEST_KEY_PLAIN_PEM, TEST_CERT_PEM)
const SIGN_OPTS = { ignorarValidade: true } as const

function expectCompactoD01e(xml: string): void {
  expect(countIntertagFormattingWhitespace(xml)).toBe(0)
  expect(xml.includes("\n")).toBe(false)
  expect(xml.includes("\r")).toBe(false)
  expect(xml.includes("\t")).toBe(false)
  expect(isD01eSafe(xml)).toBe(true)
}

describe("evento cancelamento sai D01e-compacto com semântica preservada", () => {
  const unsigned = buildXmlEventoCancelamento({
    chaveAcesso: "35250811222333000165550010000000011000000010",
    protocolo: "135250000000001",
    justificativa: "Cancelamento de teste em homologacao",
    cnpj: "11222333000165",
    tpAmb: "2",
    cOrgao: "35",
    sequencia: 1,
  })

  it("unsigned é compacto e D01e-seguro", () => {
    expectCompactoD01e(unsigned)
    expect(unsigned.includes("<?xml")).toBe(false)
  })

  it("estrutura esperada preservada (raiz, ordem, Id)", () => {
    expect(unsigned.startsWith('<envEvento xmlns="http://www.portalfiscal.inf.br/nfe"')).toBe(true)
    expect(unsigned.endsWith("</envEvento>")).toBe(true)
    expect(unsigned.indexOf("<idLote>")).toBeLessThan(unsigned.indexOf("<evento"))
    expect(unsigned.indexOf("<infEvento")).toBeLessThan(unsigned.indexOf("</evento>"))
    expect(unsigned).toContain('Id="ID1101113525081122233300016555001000000001100000001001"')
    expect(unsigned).toContain("<tpEvento>110111</tpEvento>")
    expect(unsigned).toContain("<nProt>135250000000001</nProt>")
  })

  it("conteúdo fiscal com espaços preservado", () => {
    expect(unsigned).toContain("<xJust>Cancelamento de teste em homologacao</xJust>")
  })

  it("assinado continua compacto e D01e-seguro", () => {
    const signed = signEventoCancelamentoXml(unsigned, CERT, "", { ...SIGN_OPTS })
    expect(signed).toContain("<Signature")
    expectCompactoD01e(signed)
    // Splice, sem reserialização: remover a Signature devolve o produzido.
    expect(signed.replace(/<Signature[\s\S]*<\/Signature>/, "")).toBe(unsigned)
  })
})

describe("inutilização sai D01e-compacta com semântica preservada", () => {
  const built = buildInutilizacaoXml({
    ...PEDIDO_VALIDO,
    xJust: "Falha tecnica sem uso do numero na faixa",
  })

  it("build ok, compacto e D01e-seguro", () => {
    expect(built.ok).toBe(true)
    if (!built.ok || !built.xml) return
    expectCompactoD01e(built.xml)
    expect(built.xml.includes("<?xml")).toBe(false)
  })

  it("estrutura esperada preservada (raiz, ordem, Id)", () => {
    expect(built.ok).toBe(true)
    if (!built.ok || !built.xml) return
    expect(built.xml.startsWith("<inutNFe")).toBe(true)
    expect(built.xml.endsWith("</inutNFe>")).toBe(true)
    expect(built.xml.indexOf("<infInut")).toBeLessThan(built.xml.indexOf("</inutNFe>"))
    expect(built.xml).toContain("<xServ>INUTILIZAR</xServ>")
    expect(built.xml).toContain("<mod>65</mod>")
    expect(built.xml).toContain(`Id="${built.id}"`)
  })

  it("conteúdo fiscal com espaços preservado", () => {
    expect(built.ok).toBe(true)
    if (!built.ok || !built.xml) return
    expect(built.xml).toContain("<xJust>Falha tecnica sem uso do numero na faixa</xJust>")
  })

  it("assinado continua compacto e D01e-seguro", () => {
    expect(built.ok).toBe(true)
    if (!built.ok || !built.xml) return
    const signed = signInutilizacaoXml(built.xml, CERT, "", { ...SIGN_OPTS })
    expect(signed.xml).toContain("<Signature")
    expectCompactoD01e(signed.xml)
    expect(signed.xml.replace(/<Signature[\s\S]*<\/Signature>/, "")).toBe(built.xml)
  })
})
