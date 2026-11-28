import { describe, expect, it } from "vitest"
import { hashOperacaoGasto, normalizarPropostaGasto } from "./operacao-schema"
import {
  calcularResumoLimiteCartao,
  normalizarLimiteCentavosInput,
  POLITICA_COMPROMETIMENTO_LIMITE_CARTAO,
  verificarLimiteDisponivelParaCompra,
} from "./cartoes-calculo"

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

describe("G004 limites de cartões (centavos exatos)", () => {
  it("limite não informado permanece null e nunca vira 0", () => {
    const r = calcularResumoLimiteCartao(null, BigInt(45000))
    expect(r).toEqual({
      politicaComprometimento: POLITICA_COMPROMETIMENTO_LIMITE_CARTAO,
      limiteCentavos: null,
      limiteUtilizadoCentavos: "45000",
      limiteDisponivelCentavos: null,
      limiteExcedidoCentavos: null,
      limiteComprometidoPercentual: null,
    })
  })

  it("calcula limite total, utilizado, disponível, percentual e excesso após redução", () => {
    const normal = calcularResumoLimiteCartao(BigInt(500000), BigInt(125000))
    expect(normal).toMatchObject({
      limiteCentavos: "500000",
      limiteUtilizadoCentavos: "125000",
      limiteDisponivelCentavos: "375000",
      limiteExcedidoCentavos: "0",
      limiteComprometidoPercentual: 25,
    })

    const reduzido = calcularResumoLimiteCartao(BigInt(100000), BigInt(125000))
    expect(reduzido).toMatchObject({
      limiteCentavos: "100000",
      limiteUtilizadoCentavos: "125000",
      limiteDisponivelCentavos: "0",
      limiteExcedidoCentavos: "25000",
      limiteComprometidoPercentual: 125,
    })
  })

  it("normaliza entradas de limite em centavos e recusa floats, negativos e strings inválidas", () => {
    expect(normalizarLimiteCentavosInput(null)).toBeNull()
    expect(normalizarLimiteCentavosInput(undefined)).toBeNull()
    expect(normalizarLimiteCentavosInput(0)).toBe("0")
    expect(normalizarLimiteCentavosInput("500000")).toBe("500000")
    expect(normalizarLimiteCentavosInput(-1)).toBe("INVALIDO")
    expect(normalizarLimiteCentavosInput(10.5)).toBe("INVALIDO")
    expect(normalizarLimiteCentavosInput("5000.00")).toBe("INVALIDO")
    expect(normalizarLimiteCentavosInput("abc")).toBe("INVALIDO")
    expect(normalizarLimiteCentavosInput("9000000000001")).toBe("INVALIDO")
  })

  it("bloqueia compra acima do limite e libera quando limite é null", () => {
    expect(verificarLimiteDisponivelParaCompra(null, BigInt(999999), BigInt(100000)).permitido).toBe(true)
    expect(verificarLimiteDisponivelParaCompra(BigInt(300000), BigInt(200000), BigInt(100000))).toMatchObject({
      permitido: true,
      disponivelAposCentavos: BigInt(0),
      excedenteCentavos: BigInt(0),
    })
    expect(verificarLimiteDisponivelParaCompra(BigInt(300000), BigInt(200000), BigInt(100001))).toMatchObject({
      permitido: false,
      disponivelAposCentavos: BigInt(0),
      excedenteCentavos: BigInt(1),
    })
  })
})
