import { describe, it, expect } from "vitest"
import { computeParcelamentoPlan, parseDataBr } from "./correcao-parcelamento-plan"

describe("parseDataBr", () => {
  it("aceita DD/MM/AAAA", () => {
    const d = parseDataBr("15/07/2026")
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(6)
    expect(d?.getDate()).toBe(15)
  })
  it("rejeita inválido", () => {
    expect(parseDataBr("2026-07-15")).toBeNull()
    expect(parseDataBr("31/02/2026")).toBeNull()
    expect(parseDataBr("")).toBeNull()
  })
})

describe("computeParcelamentoPlan", () => {
  it("1 parcela usa localKey base (compatível com cancelamento)", () => {
    const p = computeParcelamentoPlan({ pedidoId: "VDA-1", totalAPrazo: 100, parcelas: 1, primeiroVencimento: "10/07/2026" })
    expect(p.ok).toBe(true)
    expect(p.itens).toHaveLength(1)
    expect(p.itens[0].localKey).toBe("pdv-aprazo-VDA-1")
    expect(p.itens[0].valor).toBe(100)
    expect(p.itens[0].vencimento).toBe("10/07/2026")
  })

  it("3 parcelas: última absorve arredondamento, soma = total", () => {
    const p = computeParcelamentoPlan({ pedidoId: "VDA-2", totalAPrazo: 100, parcelas: 3, primeiroVencimento: "10/07/2026", intervaloDias: 30 })
    expect(p.ok).toBe(true)
    expect(p.itens).toHaveLength(3)
    expect(p.itens[0].valor).toBe(33.33)
    expect(p.itens[1].valor).toBe(33.33)
    expect(p.itens[2].valor).toBe(33.34)
    const soma = p.itens.reduce((s, i) => s + i.valor, 0)
    expect(Math.round(soma * 100) / 100).toBe(100)
    expect(p.itens.map((i) => i.localKey)).toEqual(["pdv-aprazo-VDA-2-1", "pdv-aprazo-VDA-2-2", "pdv-aprazo-VDA-2-3"])
  })

  it("vencimentos avançam pelo intervalo", () => {
    const p = computeParcelamentoPlan({ pedidoId: "VDA-3", totalAPrazo: 300, parcelas: 3, primeiroVencimento: "01/01/2026", intervaloDias: 30 })
    expect(p.itens[0].vencimento).toBe("01/01/2026")
    expect(p.itens[1].vencimento).toBe("31/01/2026")
    expect(p.itens[2].vencimento).toBe("02/03/2026")
  })

  it("12 parcelas", () => {
    const p = computeParcelamentoPlan({ pedidoId: "VDA-4", totalAPrazo: 1200, parcelas: 12, primeiroVencimento: "10/01/2026" })
    expect(p.ok).toBe(true)
    expect(p.itens).toHaveLength(12)
    expect(p.itens.every((i) => i.valor === 100)).toBe(true)
  })

  it("valores manuais que fecham o total são respeitados", () => {
    const p = computeParcelamentoPlan({ pedidoId: "VDA-5", totalAPrazo: 100, parcelas: 2, primeiroVencimento: "10/01/2026", valoresManuais: [70, 30] })
    expect(p.itens[0].valor).toBe(70)
    expect(p.itens[1].valor).toBe(30)
  })

  it("valores manuais que NÃO fecham caem na divisão automática", () => {
    const p = computeParcelamentoPlan({ pedidoId: "VDA-6", totalAPrazo: 100, parcelas: 2, primeiroVencimento: "10/01/2026", valoresManuais: [70, 40] })
    expect(p.itens[0].valor).toBe(50)
    expect(p.itens[1].valor).toBe(50)
  })

  it("bloqueia total zero", () => {
    const p = computeParcelamentoPlan({ pedidoId: "X", totalAPrazo: 0, parcelas: 2, primeiroVencimento: "10/01/2026" })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("valor_invalido")
  })

  it("bloqueia parcelas fora de 1..24", () => {
    expect(computeParcelamentoPlan({ pedidoId: "X", totalAPrazo: 100, parcelas: 0, primeiroVencimento: "10/01/2026" }).errorCode).toBe("parcelas_invalidas")
    expect(computeParcelamentoPlan({ pedidoId: "X", totalAPrazo: 100, parcelas: 25, primeiroVencimento: "10/01/2026" }).errorCode).toBe("parcelas_invalidas")
  })

  it("bloqueia vencimento inválido", () => {
    const p = computeParcelamentoPlan({ pedidoId: "X", totalAPrazo: 100, parcelas: 2, primeiroVencimento: "31/02/2026" })
    expect(p.ok).toBe(false)
    expect(p.errorCode).toBe("vencimento_invalido")
  })
})
