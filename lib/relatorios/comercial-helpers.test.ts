import { describe, it, expect } from "vitest"
import { centavosParaReais, custoTotalUnidadeCentavos, diasEntre, margemHistorica } from "./comercial-helpers"

describe("relatório comercial — helpers puros", () => {
  it("custo desconhecido não vira zero", () => {
    expect(centavosParaReais(null)).toBeNull()
    expect(centavosParaReais(12345)).toBe(123.45)
    expect(custoTotalUnidadeCentavos({ aquisicaoCentavos: null, despesasCentavos: 0, aplicadoCentavos: 0, desconhecidos: 0 })).toBeNull()
    expect(custoTotalUnidadeCentavos({ aquisicaoCentavos: 1000, despesasCentavos: 0, aplicadoCentavos: 0, desconhecidos: 1 })).toBeNull()
    expect(custoTotalUnidadeCentavos({ aquisicaoCentavos: 1000, despesasCentavos: 200, aplicadoCentavos: 300, desconhecidos: 0 })).toBe(1500)
  })
  it("margem só com custo completo", () => {
    expect(margemHistorica(2000, 1500, true)).toEqual({ valor: 5, percentual: 25 })
    expect(margemHistorica(2000, null, false)).toBeNull()
    expect(margemHistorica(2000, 1500, false)).toBeNull()
  })
  it("dias entre datas", () => {
    expect(diasEntre(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-04T12:00:00Z"))).toBe(3.5)
    expect(diasEntre(null, new Date())).toBeNull()
    expect(diasEntre(new Date("2026-11-05T00:00:00Z"), new Date("2026-11-01T00:00:00Z"))).toBeNull()
  })
})
