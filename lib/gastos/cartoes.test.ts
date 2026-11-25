import { describe, expect, it } from "vitest"
import { hashOperacaoGasto, normalizarPropostaGasto } from "./operacao-schema"

const compra = { tipo: "COMPRA_CREDITO", descricao: "Compra", valorCentavos: "9000", dataGasto: "2026-10-21" }
describe("G004 cartões", () => {
  it("exige ciclo explícito ou parcelamento completo, sem inventar 1/1", () => {
    expect(() => normalizarPropostaGasto(compra)).toThrow()
    expect(normalizarPropostaGasto({ ...compra, cicloId: "C" })).not.toHaveProperty("parcelas")
    expect(() => normalizarPropostaGasto({ ...compra, cicloId: "C", parcelas: [{ cicloId: "C", numero: 1, total: 1, valorCentavos: 9000 }] })).toThrow()
  })
  it("valida soma, número e total de todas as parcelas", () => {
    const parcelas = [{ cicloId: "C1", numero: 1, total: 2, valorCentavos: "4500" }, { cicloId: "C2", numero: 2, total: 2, valorCentavos: "4500" }]
    expect(normalizarPropostaGasto({ ...compra, parcelas }).tipo).toBe("COMPRA_CREDITO")
    expect(() => normalizarPropostaGasto({ ...compra, parcelas: [parcelas[0]] })).toThrow()
    expect(() => normalizarPropostaGasto({ ...compra, parcelas: [parcelas[0], { ...parcelas[1], valorCentavos: 4501 }] })).toThrow()
  })
  it("normaliza alocações de fatura e recusa duplicadas", () => {
    const f = { tipo: "PAGAR_FATURA", cicloId: "C", carteiraId: "B", formaPagamento: "pix", dataPagamento: "2026-10-22T12:00:00Z" }
    const alocacoes = [{ tituloId: "Z", valorCentavos: 10 }, { tituloId: "A", valorCentavos: 10 }]
    expect(hashOperacaoGasto(normalizarPropostaGasto({ ...f, alocacoes }))).toBe(hashOperacaoGasto(normalizarPropostaGasto({ ...f, alocacoes: [...alocacoes].reverse() })))
    expect(() => normalizarPropostaGasto({ ...f, alocacoes: [alocacoes[0], alocacoes[0]] })).toThrow()
  })
})
