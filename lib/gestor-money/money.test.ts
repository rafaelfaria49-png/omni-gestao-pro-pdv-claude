import { describe, expect, it } from "vitest"
import {
  centavosParaReais,
  diasEntreDatasCivil,
  formatarCentavosBRL,
  formatarDataBR,
  normalizarNomeCategoria,
  parseBRLParaCentavos,
  percentualCentavos,
  somarCentavos,
  subtrairCentavos,
  variacaoPercentual,
} from "@/lib/gestor-money/money"

describe("lib/gestor-money/money (precisão exata em centavos)", () => {
  it("soma e subtrai centavos sem erro de ponto flutuante", () => {
    expect(somarCentavos(["10", "20"])).toBe("30")
    expect(somarCentavos(["1999", "2501", "5000"])).toBe("9500")
    expect(subtrairCentavos("10000", "3333")).toBe("6667")
    expect(centavosParaReais("123456")).toBe(1234.56)
  })

  it("converte strings BRL pt-BR para centavos inteiros", () => {
    expect(parseBRLParaCentavos("1.250,90")).toBe("125090")
    expect(parseBRLParaCentavos("R$ 45,5")).toBe("4550")
    expect(parseBRLParaCentavos("120")).toBe("12000")
    expect(parseBRLParaCentavos("0,01")).toBe("1")
    expect(parseBRLParaCentavos("")).toBeNull()
    expect(parseBRLParaCentavos("abc")).toBeNull()
    expect(parseBRLParaCentavos("-10,00")).toBeNull()
  })

  it("formata moeda BRL e datas civis corretamente", () => {
    expect(formatarCentavosBRL("123456").replace(/\u00a0/g, " ")).toBe("R$ 1.234,56")
    expect(formatarDataBR("2026-11-27")).toBe("27/11/2026")
    expect(diasEntreDatasCivil("2026-11-27", "2026-12-02")).toBe(5)
    expect(diasEntreDatasCivil("2026-11-27", "2026-11-25")).toBe(-2)
  })

  it("normaliza nomes de categoria seguindo regra NFKC pt-BR (G002)", () => {
    expect(normalizarNomeCategoria("  Alimentação   Diária ")).toBe("alimentação diária")
    expect(normalizarNomeCategoria("SUPERMERCADO")).toBe("supermercado")
  })

  it("calcula percentuais e variações com segurança", () => {
    expect(percentualCentavos("2500", "10000")).toBe(25)
    expect(percentualCentavos("0", "0")).toBe(0)
    expect(variacaoPercentual("12000", "10000")).toBe(20)
    expect(variacaoPercentual("8000", "10000")).toBe(-20)
    expect(variacaoPercentual("5000", "0")).toBeNull()
  })
})
