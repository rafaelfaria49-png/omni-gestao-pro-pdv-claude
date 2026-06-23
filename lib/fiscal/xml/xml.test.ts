/**
 * Testes do XML Builder da NFC-e (GOAL_009).
 *
 * Foco: DETERMINISMO (mesmo snapshot → mesmo XML/hash; muda quando muda número/série/
 * item/pagamento), estrutura completa (ide/emit/dest/det/total/transp/pag/infAdic),
 * consumidor final (sem `dest`), múltiplos itens, totais e ordem determinística dos nós.
 *
 * Builder é PURO — nenhum mock de Prisma necessário (não toca banco/rede/relógio).
 */
import { describe, it, expect } from "vitest"
import { buildNfceXml } from "./xml-builder"
import type {
  NfceXmlInput,
  NfceXmlItem,
  NfceXmlPagamentoSnapshot,
  SnapshotDestinatario,
  SnapshotEmitente,
} from "./xml-types"

const emitente: SnapshotEmitente = {
  cnpj: "12.345.678/0001-95",
  razaoSocial: "Loja Teste LTDA",
  nomeFantasia: "Loja Teste",
  inscricaoEstadual: "1234567890",
  inscricaoMunicipal: "",
  regimeTributario: "SIMPLES_NACIONAL",
  crt: 1,
  ambiente: "HOMOLOGACAO",
  modelo: "NFCE",
  endereco: {
    logradouro: "Rua A",
    numero: "100",
    complemento: "",
    bairro: "Centro",
    municipio: "Sao Paulo",
    codigoMunicipioIbge: "3550308",
    uf: "SP",
    cep: "01001-000",
    codigoPais: "1058",
  },
  fone: "1133334444",
  email: "loja@teste.com",
}

const destCpf: SnapshotDestinatario = {
  tipo: "cpf",
  nome: "Fulano de Tal",
  documento: "123.456.789-09",
  documentoTipo: "CPF",
  telefone: null,
  email: null,
  municipio: "Sao Paulo",
}

const destConsumidor: SnapshotDestinatario = {
  tipo: "consumidor_final",
  nome: null,
  documento: null,
  documentoTipo: "",
  telefone: null,
  email: null,
  municipio: null,
}

function item(over: Partial<NfceXmlItem> = {}): NfceXmlItem {
  return {
    numeroItem: 1,
    codigoProduto: "P1",
    descricao: "Produto 1",
    gtin: "7891234567890",
    ncm: "12345678",
    cest: "",
    cfop: "5102",
    cst: "",
    csosn: "102",
    origemMercadoria: "0",
    unidadeComercial: "UN",
    quantidade: 2,
    valorUnitario: 10,
    valorBruto: 20,
    valorDesconto: 0,
    valorTotal: 20,
    ...over,
  }
}

const pagamento: NfceXmlPagamentoSnapshot = {
  versao: 1,
  geradoEm: "2026-06-20T10:00:00.000Z",
  venda: { data: "2026-06-20T09:59:00.000Z", paymentBreakdown: { dinheiro: 20 } },
  totais: { valorTotal: 20, valorDesconto: 0, quantidadeItens: 1 },
}

function baseInput(over: Partial<NfceXmlInput> = {}): NfceXmlInput {
  return {
    nota: { modelo: "NFCE", ambiente: "HOMOLOGACAO", serie: 1, numero: 1, valorTotal: 20, valorDesconto: 0 },
    emitente,
    destinatario: destCpf,
    pagamento,
    itens: [item()],
    ...over,
  }
}

describe("buildNfceXml — determinismo", () => {
  it("mesma entrada → MESMO XML e MESMO hash", () => {
    const a = buildNfceXml(baseInput())
    const b = buildNfceXml(baseInput())
    expect(a.xml).toBe(b.xml)
    expect(a.hash).toBe(b.hash)
  })

  it("muda ao mudar o NÚMERO", () => {
    const a = buildNfceXml(baseInput())
    const b = buildNfceXml(baseInput({ nota: { ...baseInput().nota, numero: 2 } }))
    expect(b.hash).not.toBe(a.hash)
    expect(b.xml).toContain("<nNF>2</nNF>")
  })

  it("muda ao mudar a SÉRIE", () => {
    const a = buildNfceXml(baseInput())
    const b = buildNfceXml(baseInput({ nota: { ...baseInput().nota, serie: 2 } }))
    expect(b.hash).not.toBe(a.hash)
    expect(b.xml).toContain("<serie>2</serie>")
  })

  it("muda ao mudar um ITEM", () => {
    const a = buildNfceXml(baseInput())
    const b = buildNfceXml(baseInput({ itens: [item({ descricao: "Produto ALTERADO" })] }))
    expect(b.hash).not.toBe(a.hash)
    expect(b.xml).toContain("Produto ALTERADO")
  })

  it("muda ao mudar o PAGAMENTO", () => {
    const a = buildNfceXml(baseInput())
    const b = buildNfceXml(
      baseInput({
        pagamento: { ...pagamento, venda: { data: pagamento!.venda!.data, paymentBreakdown: { pix: 20 } } },
      }),
    )
    expect(b.hash).not.toBe(a.hash)
    expect(b.xml).toContain("<tPag>17</tPag>") // PIX
    expect(a.xml).toContain("<tPag>01</tPag>") // dinheiro
  })
})

describe("buildNfceXml — destinatário", () => {
  it("destinatário identificado (CPF) → bloco dest com CPF", () => {
    const out = buildNfceXml(baseInput({ destinatario: destCpf }))
    expect(out.xml).toContain("<dest>")
    expect(out.xml).toContain("<CPF>12345678909</CPF>")
    expect(out.xml).toContain("<indIEDest>9</indIEDest>")
  })

  it("consumidor final → SEM bloco dest", () => {
    const out = buildNfceXml(baseInput({ destinatario: destConsumidor }))
    expect(out.xml).not.toContain("<dest>")
    expect(out.xml).not.toContain("<CPF>")
    // ainda é consumidor final (indFinal=1) e presencial (indPres=1)
    expect(out.xml).toContain("<indFinal>1</indFinal>")
    expect(out.xml).toContain("<indPres>1</indPres>")
  })

  it("destinatario null também é tratado como consumidor final (sem dest)", () => {
    const out = buildNfceXml(baseInput({ destinatario: null }))
    expect(out.xml).not.toContain("<dest>")
  })
})

describe("buildNfceXml — itens e totais", () => {
  it("múltiplos itens → um <det> por item, em ordem de numeroItem", () => {
    const out = buildNfceXml(
      baseInput({
        itens: [
          item({ numeroItem: 1, codigoProduto: "P1", descricao: "Item Um" }),
          item({ numeroItem: 2, codigoProduto: "P2", descricao: "Item Dois", valorTotal: 30, valorBruto: 30 }),
        ],
        nota: { modelo: "NFCE", ambiente: "HOMOLOGACAO", serie: 1, numero: 1, valorTotal: 50, valorDesconto: 0 },
      }),
    )
    expect((out.xml.match(/<det nItem=/g) ?? []).length).toBe(2)
    expect(out.xml.indexOf('nItem="1"')).toBeLessThan(out.xml.indexOf('nItem="2"'))
  })

  it("itens fora de ordem produzem o MESMO XML que ordenados (ordem determinística)", () => {
    const i1 = item({ numeroItem: 1, codigoProduto: "P1", descricao: "Um" })
    const i2 = item({ numeroItem: 2, codigoProduto: "P2", descricao: "Dois" })
    const ordenado = buildNfceXml(baseInput({ itens: [i1, i2] }))
    const inverso = buildNfceXml(baseInput({ itens: [i2, i1] }))
    expect(inverso.xml).toBe(ordenado.xml)
    expect(inverso.hash).toBe(ordenado.hash)
  })

  it("totais refletem o cabeçalho congelado (vNF, vProd, vDesc)", () => {
    const out = buildNfceXml(
      baseInput({
        nota: { modelo: "NFCE", ambiente: "HOMOLOGACAO", serie: 1, numero: 1, valorTotal: 20, valorDesconto: 1.5 },
      }),
    )
    expect(out.xml).toContain("<vNF>20.00</vNF>")
    expect(out.xml).toContain("<vProd>20.00</vProd>")
    expect(out.xml).toContain("<vDesc>1.50</vDesc>")
  })
})

describe("buildNfceXml — estrutura e ordem dos nós", () => {
  it("contém todos os blocos exigidos", () => {
    const { xml } = buildNfceXml(baseInput())
    for (const bloco of ["<ide>", "<emit>", "<det ", "<total>", "<transp>", "<pag>", "<infAdic>"]) {
      expect(xml).toContain(bloco)
    }
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<NFe xmlns="http://www.portalfiscal.inf.br/nfe">')
    expect(xml).toContain('<infNFe versao="4.00"')
  })

  it("ordem determinística: ide < emit < dest < det < total < transp < pag < infAdic", () => {
    const { xml } = buildNfceXml(baseInput({ destinatario: destCpf }))
    const ordem = ["<ide>", "<emit>", "<dest>", "<det ", "<total>", "<transp>", "<pag>", "<infAdic>"]
    const posicoes = ordem.map((t) => xml.indexOf(t))
    for (const p of posicoes) expect(p).toBeGreaterThan(-1)
    const ordenado = [...posicoes].sort((a, b) => a - b)
    expect(posicoes).toEqual(ordenado)
  })

  it("emitente é congelado: CNPJ/UF/cUF vêm do snapshot (sem dado vivo)", () => {
    const { xml } = buildNfceXml(baseInput())
    expect(xml).toContain("<CNPJ>12345678000195</CNPJ>")
    expect(xml).toContain("<UF>SP</UF>")
    expect(xml).toContain("<cUF>35</cUF>") // SP
    expect(xml).toContain("<mod>65</mod>") // NFC-e
    expect(xml).toContain("<tpAmb>2</tpAmb>") // homologação
  })

  it("número ausente (nota ainda não numerada) → nós vazios, ainda determinístico", () => {
    const a = buildNfceXml(baseInput({ nota: { ...baseInput().nota, serie: null, numero: null } }))
    const b = buildNfceXml(baseInput({ nota: { ...baseInput().nota, serie: null, numero: null } }))
    expect(a.xml).toBe(b.xml)
    expect(a.xml).toContain("<nNF></nNF>")
    expect(a.xml).toContain("<serie></serie>")
  })
})
