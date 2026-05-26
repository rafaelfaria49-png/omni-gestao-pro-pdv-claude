import { describe, expect, it } from "vitest"
import {
  buildAssistenciaPayMethods,
  defaultFormasPagamento,
  getActiveFormasPagamento,
  getFormasForPaymentModal,
  normalizeFormasPagamento,
  toPaymentMethodType,
} from "./pdv-formas-pagamento"

describe("pdv-formas-pagamento", () => {
  it("retorna defaults completos quando persistência ausente", () => {
    const formas = normalizeFormasPagamento(undefined)
    expect(formas).toHaveLength(9)
    expect(formas.every((f) => f.ativo)).toBe(true)
  })

  it("desativa forma e mantém ordem", () => {
    const raw = defaultFormasPagamento().map((f) =>
      f.id === "pix" ? { ...f, ativo: false, ordem: 0 } : f,
    )
    const formas = normalizeFormasPagamento(raw)
    const pix = formas.find((f) => f.id === "pix")
    expect(pix?.ativo).toBe(false)
    expect(getActiveFormasPagamento(formas).some((f) => f.id === "pix")).toBe(false)
  })

  it("mapeia boleto para runtime carne", () => {
    expect(toPaymentMethodType("boleto")).toBe("carne")
    expect(toPaymentMethodType("multiplo")).toBeNull()
  })

  it("exclui multiplo do payment modal", () => {
    const modal = getFormasForPaymentModal(defaultFormasPagamento())
    expect(modal.some((f) => f.id === "multiplo")).toBe(false)
    expect(modal.some((f) => f.id === "dinheiro")).toBe(true)
  })

  it("gera botões do PDV assistência a partir da config", () => {
    const formas = defaultFormasPagamento().map((f) =>
      f.id === "cartao_credito" ? { ...f, ativo: false } : f,
    )
    const methods = buildAssistenciaPayMethods(formas)
    expect(methods.some((m) => m.id === "credito")).toBe(false)
    expect(methods.some((m) => m.id === "dinheiro")).toBe(true)
    expect(methods.some((m) => m.id === "multiplo")).toBe(true)
  })
})
