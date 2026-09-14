import { describe, expect, it } from "vitest"
import { normalizarFormaPagamento } from "./formas-pagamento-caixa"

describe("normalizarFormaPagamento — grafias reais dos fluxos (GOAL CAIXA-FECHAMENTO-ORIGENS-PAGAMENTO-003A)", () => {
  it("débito: cartao_debito (PDV), debito (O.S.) e 'Cartão de Débito' (Financeiro) são a mesma forma", () => {
    for (const grafia of ["cartao_debito", "debito", "Cartão de Débito", "cartão de débito", "cartaoDebito", "Cartão Débito"]) {
      expect(normalizarFormaPagamento(grafia)).toBe("cartaoDebito")
    }
  })

  it("crédito: cartao_credito (PDV), credito (O.S.) e 'Cartão de Crédito' (Financeiro) são a mesma forma", () => {
    for (const grafia of ["cartao_credito", "credito", "Cartão de Crédito", "cartão de crédito", "cartaoCredito"]) {
      expect(normalizarFormaPagamento(grafia)).toBe("cartaoCredito")
    }
  })

  it("dinheiro e PIX independem de maiúsculas e espaços", () => {
    expect(normalizarFormaPagamento("Dinheiro")).toBe("dinheiro")
    expect(normalizarFormaPagamento(" dinheiro ")).toBe("dinheiro")
    expect(normalizarFormaPagamento("PIX")).toBe("pix")
  })

  it("crédito/vale e à prazo mantêm identidade própria", () => {
    for (const grafia of ["credito_vale", "vale", "creditoVale", "Crédito / Vale"]) {
      expect(normalizarFormaPagamento(grafia)).toBe("creditoVale")
    }
    for (const grafia of ["a_prazo", "aPrazo", "À prazo"]) {
      expect(normalizarFormaPagamento(grafia)).toBe("aPrazo")
    }
  })

  it("boleto e crediário seguem a regra atual do PDV (gravam como carnê)", () => {
    expect(normalizarFormaPagamento("carne")).toBe("carne")
    expect(normalizarFormaPagamento("Carnê / Crediário")).toBe("carne")
    expect(normalizarFormaPagamento("boleto")).toBe("carne")
  })

  it("forma ausente, desconhecida ou o meta 'multiplo' não viram forma inventada", () => {
    for (const grafia of [null, undefined, "", "   ", 42, "multiplo", "transferencia"]) {
      expect(normalizarFormaPagamento(grafia)).toBeNull()
    }
  })
})
