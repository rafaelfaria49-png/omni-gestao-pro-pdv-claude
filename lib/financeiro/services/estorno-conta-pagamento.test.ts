import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { carteiraDoPagamentoEstornado } from "./movimentacoes-service"

const historico = (alvo: number) => [
  { tipo: "criacao" },
  { tipo: "pagamento", valor: 100 },  // 1 → conta A
  { tipo: "pagamento", valor: 50 },   // 2 → conta B
  { tipo: "estorno_pagamento", valor: alvo === 1 ? 100 : 50, refHistoricoIndex: alvo },
]
const originais = [{ carteiraId: "A", valor: 100 }, { carteiraId: "B", valor: 50 }]

describe("estorno por identidade do pagamento — conta do pagamento estornado", () => {
  it("estorno do 1º pagamento usa a conta do 1º (não a mais recente)", () => {
    expect(carteiraDoPagamentoEstornado(historico(1), originais, 100)).toBe("A")
  })
  it("estorno do 2º usa a conta do 2º", () => {
    expect(carteiraDoPagamentoEstornado(historico(2), originais, 50)).toBe("B")
  })
  it("ledger legado com movimento ausente: não arrisca (mantém a regra anterior)", () => {
    expect(carteiraDoPagamentoEstornado(historico(1), [originais[1]!], 100)).toBeUndefined()
  })
  it("valor que não confere ou estorno sem alvo: mantém a regra anterior", () => {
    expect(carteiraDoPagamentoEstornado(historico(1), [{ carteiraId: "A", valor: 99 }, originais[1]!], 100)).toBeUndefined()
    expect(carteiraDoPagamentoEstornado([{ tipo: "pagamento", valor: 10 }], [{ carteiraId: "A", valor: 10 }], 10)).toBeUndefined()
  })
  it("pagamento original sem conta: devolve null (sem conta), não a mais recente", () => {
    expect(carteiraDoPagamentoEstornado(historico(1), [{ carteiraId: null, valor: 100 }, originais[1]!], 100)).toBeNull()
  })
})
