/**
 * BL-FISCAL-003 — Integração do Tax Engine ao Snapshot Fiscal (camada PURA).
 *
 * Cobre o bloco `tributacao` produzido por `buildVendaFiscalSnapshot` via `calculateTax`:
 * item simples, desconto (header rateado), múltiplos itens, produto sem fiscal, valores
 * Simples Nacional (sem destaque), arredondamento, determinismo, não-mutação, compatibilidade
 * com o snapshot antigo (campos preservados) e erro controlado fora do baseline (regime normal).
 */
import { describe, it, expect } from "vitest"
import {
  buildVendaFiscalSnapshot,
  type BuildSnapshotInput,
  type SnapshotItemInput,
  type SnapshotLojaInput,
} from "./venda-fiscal-snapshot"
import { sanitizeProdutoFiscal, PRODUTO_FISCAL_VAZIO } from "@/lib/produto-fiscal"

const LOJA_OK: SnapshotLojaInput = {
  cnpj: "11.222.333/0001-81",
  razaoSocial: "RafaCell Comércio LTDA",
  nomeFantasia: "RafaCell",
  inscricaoEstadual: "123456789",
  inscricaoMunicipal: "987654",
  regimeTributario: "SIMPLES_NACIONAL",
  crt: 1,
  ambiente: "HOMOLOGACAO",
  modeloFiscal: "NFCE",
  fiscalEnabled: false,
  logradouro: "Rua das Flores",
  numero: "100",
  complemento: "",
  bairro: "Centro",
  codigoMunicipioIbge: "3550308",
  municipio: "São Paulo",
  uf: "SP",
  cep: "01001-000",
  codigoPais: "1058",
  fone: "",
  email: "",
}

function item(over: Partial<SnapshotItemInput> = {}): SnapshotItemInput {
  return {
    itemVendaId: "iv-1",
    produtoId: "prod-1",
    codigoProduto: "SKU-1",
    descricao: "Cabo USB-C",
    gtin: "7891234567890",
    quantidade: 2,
    valorUnitario: 25,
    valorDesconto: 0,
    valorTotal: 50,
    fiscal: sanitizeProdutoFiscal({ ncm: "85176200", cfop: "5102", csosn: "102", origem: "0", unidade: "UN" }),
    ...over,
  }
}

function baseInput(over: Partial<BuildSnapshotInput> = {}): BuildSnapshotInput {
  return {
    storeId: "loja-1",
    vendaId: "venda-1",
    loja: LOJA_OK,
    cliente: null,
    venda: {
      pedidoId: "VDA-2026-0001",
      data: "2026-06-18T12:00:00.000Z",
      total: 50,
      desconto: 0,
      operador: "João Caixa",
      terminal: "PDV1",
      paymentBreakdown: null,
    },
    itens: [item()],
    ...over,
  }
}

function build(over: Partial<BuildSnapshotInput> = {}) {
  const r = buildVendaFiscalSnapshot(baseInput(over))
  if (!r.ok) throw new Error(`snapshot inesperadamente inválido: ${r.code}`)
  return r.snapshot
}

describe("snapshot+tax · item simples (Simples Nacional, sem destaque)", () => {
  it("congela tributação com ICMS/PIS/COFINS zerados (correto p/ CSOSN 102)", () => {
    const t = build().tributacao!
    expect(t.ok).toBe(true)
    expect(t.semDestaque).toBe(true)
    expect(t.regime).toBe("SIMPLES_NACIONAL")
    expect(t.engineVersion).toBe("1.0.0")
    expect(t.regrasVersion).toBe(1)
    expect(t.itens).toHaveLength(1)
    const it0 = t.itens[0]
    expect(it0.icms.situacao).toBe("nao_destacado")
    expect(it0.icms.codigo).toBe("102")
    expect(it0.icms.valor).toBe(0)
    expect(it0.pis.codigo).toBe("49")
    expect(it0.pis.valor).toBe(0)
    expect(it0.cofins.valor).toBe(0)
    expect(t.totais.valorIcms).toBe(0)
    expect(t.totais.valorTotalTributos).toBe(0)
    expect(t.totais.valorTotalNota).toBe(50)
  })
})

describe("snapshot+tax · desconto do cabeçalho", () => {
  it("desconto da venda entra no cálculo (rateado) e no total tributário da nota", () => {
    const t = build({ venda: { ...baseInput().venda, desconto: 10 } }).tributacao!
    expect(t.ok).toBe(true)
    expect(t.totais.valorTotalNota).toBe(40) // 50 − 10
  })
})

describe("snapshot+tax · múltiplos itens", () => {
  it("produz uma linha de tributação por item, numeração sequencial", () => {
    const t = build({
      itens: [
        item({ itemVendaId: "a", quantidade: 1, valorUnitario: 100, valorTotal: 100 }),
        item({ itemVendaId: "b", quantidade: 1, valorUnitario: 300, valorTotal: 300 }),
      ],
    }).tributacao!
    expect(t.itens.map((i) => i.numeroItem)).toEqual([1, 2])
    expect(t.totais.valorTotalNota).toBe(400)
  })
})

describe("snapshot+tax · produto sem fiscal completo", () => {
  it("CSOSN ausente assume 102; tributação não falha por falta de NCM", () => {
    const t = build({ itens: [item({ fiscal: { ...PRODUTO_FISCAL_VAZIO } })] }).tributacao!
    expect(t.ok).toBe(true) // tax engine não exige NCM (isso é pendência do snapshot, não do imposto)
    expect(t.itens[0].icms.codigo).toBe("102")
    expect(t.itens[0].icms.situacao).toBe("nao_destacado")
  })
})

describe("snapshot+tax · arredondamento (rateio fecha exato)", () => {
  it("desconto 10 sobre 3 itens de 10 fecha o total da nota em 20", () => {
    const t = build({
      venda: { ...baseInput().venda, total: 30, desconto: 10 },
      itens: [
        item({ itemVendaId: "a", quantidade: 1, valorUnitario: 10, valorTotal: 10 }),
        item({ itemVendaId: "b", quantidade: 1, valorUnitario: 10, valorTotal: 10 }),
        item({ itemVendaId: "c", quantidade: 1, valorUnitario: 10, valorTotal: 10 }),
      ],
    }).tributacao!
    expect(t.totais.valorTotalNota).toBe(20)
  })
})

describe("snapshot+tax · determinismo e não-mutação", () => {
  it("mesma entrada → mesma tributação (determinístico, sem timestamp no bloco)", () => {
    const a = build()
    const b = build()
    expect(a.tributacao).toEqual(b.tributacao)
  })

  it("não muta a entrada", () => {
    const input = baseInput({ venda: { ...baseInput().venda, desconto: 5 } })
    const copia = JSON.parse(JSON.stringify(input))
    buildVendaFiscalSnapshot(input)
    expect(input).toEqual(copia)
  })
})

describe("snapshot+tax · compatibilidade com o snapshot antigo", () => {
  it("preserva os campos existentes e adiciona `tributacao` de forma aditiva", () => {
    const snap = build()
    // Campos antigos intactos:
    expect(snap.emitente.cnpj).toBe("11222333000181")
    expect(snap.itens[0].ncm).toBe("85176200")
    expect(snap.diagnostico.prontoParaEmissao).toBe(true)
    expect(snap.totais.valorTotal).toBe(50)
    // Novo bloco aditivo:
    expect(snap.tributacao).toBeDefined()
    expect(snap.tributacao!.ok).toBe(true)
  })
})

describe("snapshot+tax · erro controlado fora do baseline", () => {
  it("regime normal → tributacao.ok=false com pendências; snapshot ainda é criado", () => {
    const r = buildVendaFiscalSnapshot(baseInput({ loja: { ...LOJA_OK, regimeTributario: "REGIME_NORMAL" } }))
    expect(r.ok).toBe(true) // o snapshot não falha
    if (!r.ok) return
    const t = r.snapshot.tributacao!
    expect(t.ok).toBe(false)
    expect(t.pendencias.length).toBeGreaterThan(0)
    expect(t.itens).toEqual([]) // sem cálculo quando fora do baseline
  })

  it("CFOP interestadual (6102) → tributacao.ok=false", () => {
    const r = buildVendaFiscalSnapshot(
      baseInput({ itens: [item({ fiscal: sanitizeProdutoFiscal({ ncm: "85176200", cfop: "6102", csosn: "102", origem: "0" }) })] }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.tributacao!.ok).toBe(false)
  })
})
