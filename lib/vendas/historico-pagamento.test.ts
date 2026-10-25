import { describe, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma"
import {
  buildHistoricoPagamentoWhere,
  HISTORICO_PAGAMENTO_KEYS,
  historicoFormasPagamentoLabel,
  parseHistoricoPagamento,
} from "./historico-pagamento"

describe("parseHistoricoPagamento", () => {
  it("aceita só as 7 chaves canônicas; vazio = sem filtro", () => {
    expect(HISTORICO_PAGAMENTO_KEYS).toEqual(["dinheiro", "pix", "cartaoDebito", "cartaoCredito", "carne", "aPrazo", "creditoVale"])
    for (const key of HISTORICO_PAGAMENTO_KEYS) expect(parseHistoricoPagamento(key)).toEqual({ ok: true, key })
    expect(parseHistoricoPagamento(null)).toEqual({ ok: true, key: null })
    expect(parseHistoricoPagamento("   ")).toEqual({ ok: true, key: null })
    expect(parseHistoricoPagamento(" pix ")).toEqual({ ok: true, key: "pix" })
    for (const bad of ["PIX", "boleto", "__proto__", "constructor", "pix,dinheiro"]) {
      expect(parseHistoricoPagamento(bad).ok).toBe(false)
    }
  })
})

describe("buildHistoricoPagamentoWhere", () => {
  it("moderno: número JSON > 0 no caminho da chave; legado só sem breakdown", () => {
    expect(buildHistoricoPagamentoWhere("pix")).toEqual({
      OR: [
        { payload: { path: ["paymentBreakdown", "pix"], gt: 0 } },
        {
          AND: [
            { payload: { path: ["paymentBreakdown"], equals: Prisma.AnyNull } },
            { OR: [{ payload: { path: ["formaPagamento"], equals: "PIX" } }] },
          ],
        },
      ],
    })
  })

  it("forma sem rótulo legado não ganha fallback", () => {
    expect(buildHistoricoPagamentoWhere("aPrazo")).toEqual({ payload: { path: ["paymentBreakdown", "aPrazo"], gt: 0 } })
    expect(buildHistoricoPagamentoWhere("creditoVale")).toEqual({ payload: { path: ["paymentBreakdown", "creditoVale"], gt: 0 } })
  })
})

describe("historicoFormasPagamentoLabel", () => {
  it("lista todas as formas positivas na ordem canônica", () => {
    expect(historicoFormasPagamentoLabel({ paymentBreakdown: { pix: 40, dinheiro: 60, cartaoCredito: 0 } })).toBe("Dinheiro + Pix")
    expect(historicoFormasPagamentoLabel({ paymentBreakdown: { cartaoDebito: 10 } })).toBe("Débito")
  })

  it("venda importada mostra o rótulo gravado; sem informação → —", () => {
    expect(historicoFormasPagamentoLabel({ formaPagamento: " Cartão de Crédito " })).toBe("Cartão de Crédito")
    expect(historicoFormasPagamentoLabel({ formaPagamento: null })).toBe("—")
    expect(historicoFormasPagamentoLabel({ paymentBreakdown: { pix: "10", dinheiro: 0 } })).toBe("—")
    expect(historicoFormasPagamentoLabel(null)).toBe("—")
    expect(historicoFormasPagamentoLabel([])).toBe("—")
  })
})
