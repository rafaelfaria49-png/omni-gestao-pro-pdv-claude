/**
 * Suíte do Motor Tributário (Tax Engine) — Fase F2.
 *
 * Cobre: valor cheio · desconto (item e nota) · frete/seguro/outras · arredondamentos ·
 * zero · item único · múltiplos itens · casos inválidos · crédito do Simples (CSOSN 101) ·
 * isenção (CSOSN 103) · Lei da Transparência · determinismo · snapshot dos resultados.
 *
 * Princípio fiscal verificado: no Simples Nacional (NFC-e, consumidor final, interna, CSOSN 102)
 * NENHUM imposto é destacado — ICMS/PIS/COFINS = 0. Isto é CORRETO (imposto no DAS), não um mock.
 */
import { describe, it, expect } from "vitest"
import { calculateTax } from "./calculator"
import { roundTo, rateioProporcional, DEFAULT_ROUNDING } from "./index"
import type { TaxEngineInput } from "./types"

function simples(itens: TaxEngineInput["itens"], extra: Partial<TaxEngineInput> = {}): TaxEngineInput {
  return { regime: "SIMPLES_NACIONAL", itens, ...extra }
}

describe("tax-engine · valor cheio (Simples Nacional, sem destaque)", () => {
  it("1 item sem acessórios: total = bruto, impostos zerados", () => {
    const r = calculateTax(simples([{ quantidade: 2, valorUnitario: 10, csosn: "102" }]))
    expect(r.ok).toBe(true)
    expect(r.meta.semDestaque).toBe(true)
    const item = r.itens[0]
    expect(item.valorBruto).toBe(20)
    expect(item.valorTributavel).toBe(20)
    expect(item.icms.valor).toBe(0)
    expect(item.icms.situacao).toBe("nao_destacado")
    expect(item.icms.codigo).toBe("102")
    expect(item.pis.valor).toBe(0)
    expect(item.cofins.valor).toBe(0)
    expect(r.totais.valorProdutos).toBe(20)
    expect(r.totais.valorTotalTributos).toBe(0)
    expect(r.totais.valorTotalNota).toBe(20)
  })

  it("CSOSN ausente assume 102 (default Simples)", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 50 }]))
    expect(r.ok).toBe(true)
    expect(r.itens[0].icms.codigo).toBe("102")
  })
})

describe("tax-engine · descontos", () => {
  it("desconto no item: líquido e total refletem o abatimento", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 100, descontoValor: 10, csosn: "102" }]))
    expect(r.itens[0].valorLiquido).toBe(90)
    expect(r.itens[0].valorTributavel).toBe(90)
    expect(r.totais.valorDesconto).toBe(10)
    expect(r.totais.valorTotalNota).toBe(90)
  })

  it("desconto da nota é rateado proporcionalmente ao bruto", () => {
    const r = calculateTax(
      simples(
        [
          { quantidade: 1, valorUnitario: 100, csosn: "102" },
          { quantidade: 1, valorUnitario: 300, csosn: "102" },
        ],
        { descontoTotal: 40 },
      ),
    )
    expect(r.itens[0].desconto).toBe(10) // 40 × 100/400
    expect(r.itens[1].desconto).toBe(30) // 40 × 300/400
    expect(r.totais.valorDesconto).toBe(40)
    expect(r.totais.valorTotalNota).toBe(360) // 400 − 40
  })
})

describe("tax-engine · frete, seguro, outras despesas", () => {
  it("frete no item entra no valor tributável e no total da nota", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 100, freteValor: 15, csosn: "102" }]))
    expect(r.itens[0].frete).toBe(15)
    expect(r.itens[0].valorTributavel).toBe(115)
    expect(r.totais.valorFrete).toBe(15)
    expect(r.totais.valorTotalNota).toBe(115)
  })

  it("seguro + outras despesas da nota são rateados e somados ao total", () => {
    const r = calculateTax(
      simples(
        [
          { quantidade: 1, valorUnitario: 100, csosn: "102" },
          { quantidade: 1, valorUnitario: 100, csosn: "102" },
        ],
        { seguroTotal: 20, outrasDespesasTotal: 10 },
      ),
    )
    expect(r.itens[0].seguro).toBe(10)
    expect(r.itens[1].seguro).toBe(10)
    expect(r.totais.valorSeguro).toBe(20)
    expect(r.totais.valorOutrasDespesas).toBe(10)
    expect(r.totais.valorTotalNota).toBe(230) // 200 + 20 + 10
  })

  it("acessório no item tem precedência: total da nota é ignorado quando há valor por item", () => {
    const r = calculateTax(
      simples(
        [
          { quantidade: 1, valorUnitario: 100, freteValor: 5, csosn: "102" },
          { quantidade: 1, valorUnitario: 100, csosn: "102" },
        ],
        { freteTotal: 999 }, // ignorado porque o item 1 trouxe freteValor
      ),
    )
    expect(r.itens[0].frete).toBe(5)
    expect(r.itens[1].frete).toBe(0)
    expect(r.totais.valorFrete).toBe(5)
  })
})

describe("tax-engine · arredondamentos", () => {
  it("rateio com dízima fecha exatamente (resíduo no maior peso)", () => {
    const r = calculateTax(
      simples(
        [
          { quantidade: 1, valorUnitario: 10, csosn: "102" },
          { quantidade: 1, valorUnitario: 10, csosn: "102" },
          { quantidade: 1, valorUnitario: 10, csosn: "102" },
        ],
        { freteTotal: 10 },
      ),
    )
    expect(r.itens.map((i) => i.frete)).toEqual([3.34, 3.33, 3.33])
    expect(r.totais.valorFrete).toBe(10) // soma exata, sem drift de centavo
    expect(r.totais.valorTotalNota).toBe(40) // 30 + 10
  })

  it("roundTo: half away from zero vs half even", () => {
    expect(roundTo(1.005, 2, "half_away_from_zero")).toBe(1.01)
    expect(roundTo(1.005, 2, "half_even")).toBe(1.0)
    expect(roundTo(2.5, 0, "half_away_from_zero")).toBe(3)
    expect(roundTo(2.5, 0, "half_even")).toBe(2)
    expect(roundTo(3.5, 0, "half_even")).toBe(4)
    expect(roundTo(-2.5, 0, "half_away_from_zero")).toBe(-3)
    expect(roundTo(2.675, 2, "half_away_from_zero")).toBe(2.68)
  })

  it("rateioProporcional soma exatamente o total", () => {
    const partes = rateioProporcional(100, [1, 1, 1], DEFAULT_ROUNDING)
    expect(partes.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it("Lei da Transparência (IBPT) aproximada é arredondada a 2 casas", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 20.1, csosn: "102", aproximadoTributosPercent: 5 }]))
    // 20.10 × 5% = 1.005 → 1.01 (half away)
    expect(r.itens[0].valorAproximadoTributos).toBe(1.01)
    expect(r.totais.valorAproximadoTributos).toBe(1.01)
    // continua sem destaque — aproximado é informativo, não compõe tributos destacados
    expect(r.totais.valorTotalTributos).toBe(0)
  })
})

describe("tax-engine · zero e bordas", () => {
  it("quantidade 0 → item zerado, nota válida", () => {
    const r = calculateTax(simples([{ quantidade: 0, valorUnitario: 100, csosn: "102" }]))
    expect(r.ok).toBe(true)
    expect(r.itens[0].valorBruto).toBe(0)
    expect(r.totais.valorTotalNota).toBe(0)
  })

  it("valor unitário 0 → bruto 0", () => {
    const r = calculateTax(simples([{ quantidade: 5, valorUnitario: 0, csosn: "102" }]))
    expect(r.ok).toBe(true)
    expect(r.itens[0].valorBruto).toBe(0)
    expect(r.totais.valorTotalNota).toBe(0)
  })
})

describe("tax-engine · múltiplos itens", () => {
  it("agrega produtos, descontos e total da nota", () => {
    const r = calculateTax(
      simples([
        { quantidade: 2, valorUnitario: 10, csosn: "102" }, // 20
        { quantidade: 1, valorUnitario: 100, descontoValor: 10, csosn: "102" }, // 100 − 10
      ]),
    )
    expect(r.itens).toHaveLength(2)
    expect(r.totais.valorProdutos).toBe(120)
    expect(r.totais.valorDesconto).toBe(10)
    expect(r.totais.valorTotalNota).toBe(110)
  })
})

describe("tax-engine · regras de CSOSN", () => {
  it("CSOSN 101 calcula crédito do Simples (informativo), ICMS próprio não destacado", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 100, csosn: "101", pCredSN: 2.5 }]))
    expect(r.ok).toBe(true)
    const icms = r.itens[0].icms
    expect(icms.situacao).toBe("com_credito_simples")
    expect(icms.valor).toBe(0) // não destaca ICMS próprio
    expect(icms.pCredSN).toBe(2.5)
    expect(icms.valorCreditoSimples).toBe(2.5) // 100 × 2.5%
    expect(r.totais.valorTotalTributos).toBe(0)
  })

  it("CSOSN 103 (isento) → situação isento, valores zerados", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 100, csosn: "103" }]))
    expect(r.ok).toBe(true)
    expect(r.itens[0].icms.situacao).toBe("isento")
    expect(r.itens[0].icms.valor).toBe(0)
  })
})

describe("tax-engine · casos inválidos (ok=false)", () => {
  it("sem itens", () => {
    const r = calculateTax(simples([]))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain("sem_itens")
  })

  it("regime normal não suportado na F2", () => {
    const r = calculateTax({ regime: "REGIME_NORMAL", itens: [{ quantidade: 1, valorUnitario: 10 }] })
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain("regime_nao_suportado")
  })

  it("flag de ST rejeitada", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 10 }], { flags: { temSubstituicaoTributaria: true } }))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain("operacao_nao_suportada")
  })

  it("CSOSN com ST (500) rejeitado", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 10, csosn: "500" }]))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain("csosn_nao_suportado")
  })

  it("CFOP interestadual (6102) rejeitado", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 10, cfop: "6102", csosn: "102" }]))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain("cfop_nao_suportado")
  })

  it("desconto maior que o bruto do item", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 10, descontoValor: 50, csosn: "102" }]))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain("desconto_maior_que_bruto")
  })

  it("quantidade negativa", () => {
    const r = calculateTax(simples([{ quantidade: -1, valorUnitario: 10, csosn: "102" }]))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain("item_invalido")
  })

  it("destino contribuinte não suportado", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 10, csosn: "102" }], { destino: "contribuinte" }))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain("destino_nao_suportado")
  })
})

describe("tax-engine · determinismo e snapshot", () => {
  const input = simples(
    [
      { quantidade: 3, valorUnitario: 19.9, csosn: "102", aproximadoTributosPercent: 8.5 },
      { quantidade: 1, valorUnitario: 250, descontoValor: 12.5, csosn: "101", pCredSN: 2.3 },
    ],
    { freteTotal: 30, seguroTotal: 5 },
  )

  it("é determinístico: mesma entrada → mesma saída", () => {
    expect(calculateTax(input)).toEqual(calculateTax(input))
  })

  it("não muta a entrada", () => {
    const copia = JSON.parse(JSON.stringify(input))
    calculateTax(input)
    expect(input).toEqual(copia)
  })

  it("snapshot dos resultados", () => {
    expect(calculateTax(input)).toMatchSnapshot()
  })
})
