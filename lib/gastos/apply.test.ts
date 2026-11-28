import { describe, expect, it } from "vitest"
import { diaSaoPaulo, hashOperacaoGasto, meioCompensacaoGasto, normalizarPropostaGasto } from "./operacao-schema"

const pago = { tipo: "GASTO_PAGO", descricao: "Fixture", valorCentavos: "36501", moeda: "BRL",
  dataGasto: "2026-10-21", carteiraId: "conta", formaPagamento: "debito", dataPagamento: "2026-11-01T01:59:00Z" }
describe("G004 contratos puros", () => {
  it("compensação conserva meio conhecido e não inventa meio legado ausente", () => {
    expect(meioCompensacaoGasto("pix")).toBe("pix")
    for (const valor of [null, undefined, "", "cartao_legado"]) expect(meioCompensacaoGasto(valor)).toBe("nao_informado")
    expect(() => normalizarPropostaGasto({ ...pago, formaPagamento: "nao_informado" })).toThrow()
  })
  it.each([0, -1, NaN, Infinity, 0.1, "1.5", "9000000000001", "", null])("recusa centavos inválidos %s", value => {
    expect(() => normalizarPropostaGasto({ ...pago, valorCentavos: value })).toThrow()
  })
  it("normaliza centavos, offset e ordem do payload antes do hash", () => {
    const a = normalizarPropostaGasto({ ...pago, valorCentavos: 36501 })
    const b = normalizarPropostaGasto({ ...pago, valorCentavos: "00036501", dataPagamento: "2026-10-31T22:59:00-03:00" })
    expect(hashOperacaoGasto(a)).toBe(hashOperacaoGasto(b))
    expect(hashOperacaoGasto(a)).not.toBe(hashOperacaoGasto({ ...a, valorCentavos: "36502" }))
  })
  it.each(["2026-02-30", "0000-01-01", "21/10/2026"])("recusa data civil %s", dataGasto => {
    expect(() => normalizarPropostaGasto({ ...pago, dataGasto })).toThrow()
  })
  it("separa dia bancário de instante UTC na fronteira mensal", () => {
    expect(diaSaoPaulo("2026-11-01T02:59:59Z")).toBe("2026-10-31")
    expect(diaSaoPaulo("2026-11-01T03:00:00Z")).toBe("2026-11-01")
  })
  it("rejeita moeda, propriedade de autoridade e ausência de valor/quitação", () => {
    for (const patch of [{ moeda: "USD" }, { perfilId: "outro" }, { ownerAdminUserId: "outro" }]) {
      expect(() => normalizarPropostaGasto({ ...pago, ...patch })).toThrow()
    }
    const p = { tipo: "PAGAR_TITULO", tituloId: "T", carteiraId: "C", formaPagamento: "pix", dataPagamento: pago.dataPagamento }
    expect(() => normalizarPropostaGasto(p)).toThrow()
    expect(() => normalizarPropostaGasto({ ...p, quitar: true, valorCentavos: 1 })).toThrow()
    expect(normalizarPropostaGasto({ ...p, quitar: true }).tipo).toBe("PAGAR_TITULO")
  })
})
