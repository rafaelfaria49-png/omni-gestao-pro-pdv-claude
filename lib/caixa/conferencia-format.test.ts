import { describe, expect, it } from "vitest"
import { dataHoraConferencia, formaPagamentoLabel, numeroVendaCurto } from "./conferencia-format"

describe("numeroVendaCurto", () => {
  it("encurta o número com código de terminal para a sequência final", () => {
    expect(numeroVendaCurto("VDA-L01-2026-000407")).toBe("#000407")
  })

  it("encurta o formato legado sem código de terminal", () => {
    expect(numeroVendaCurto("VDA-2026-0590")).toBe("#0590")
  })

  it("preserva os zeros à esquerda da sequência", () => {
    expect(numeroVendaCurto("VDA-RC02-2026-000012")).toBe("#000012")
  })

  it("devolve inalterado um id fora do padrão (legado / cuid)", () => {
    expect(numeroVendaCurto("cmf3k9x2a0001")).toBe("cmf3k9x2a0001")
    expect(numeroVendaCurto("sale-12")).toBe("sale-12")
  })

  it("ignora espaços nas bordas", () => {
    expect(numeroVendaCurto("  VDA-2026-0591 ")).toBe("#0591")
  })
})

describe("formaPagamentoLabel", () => {
  it("traduz as chaves conhecidas", () => {
    expect(formaPagamentoLabel("dinheiro")).toBe("Dinheiro")
    expect(formaPagamentoLabel("pix")).toBe("PIX")
    expect(formaPagamentoLabel("cartao_debito")).toBe("Débito")
    expect(formaPagamentoLabel("cartao_credito")).toBe("Crédito")
    expect(formaPagamentoLabel("multiplo")).toBe("Múltiplas formas")
  })

  it("devolve null sem forma e o valor original quando desconhecida", () => {
    expect(formaPagamentoLabel(null)).toBeNull()
    expect(formaPagamentoLabel("  ")).toBeNull()
    expect(formaPagamentoLabel("boleto")).toBe("boleto")
  })
})

describe("dataHoraConferencia", () => {
  it("separa data e hora no formato brasileiro", () => {
    const at = new Date(2026, 8, 12, 17, 10).toISOString()
    expect(dataHoraConferencia(at)).toEqual({ data: "12/09/2026", hora: "17:10" })
  })

  it("devolve null para data inválida", () => {
    expect(dataHoraConferencia("não-é-data")).toBeNull()
  })
})
