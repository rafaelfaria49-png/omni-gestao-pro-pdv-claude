// ============================================================
// Testes PUROS do preparo de gravação de Contas a Receber Smart.
// Cobre as regras de negócio (sem DB) — garante que o fix de performance
// (batching) NÃO alterou a materialização dos títulos.
// ============================================================

import { describe, it, expect } from "vitest"
import { construirIntentsContas } from "./persistir"
import type { SmartContaReceberNormalizada } from "./tipos"

function conta(p: Partial<SmartContaReceberNormalizada>): SmartContaReceberNormalizada {
  return {
    linha: 1,
    codigoLegado: "",
    cliente: "CLIENTE X",
    telefone: "",
    menorVencimento: "2025-04-21",
    emAtraso: 0,
    aVencer: 0,
    total: 0,
    reaj: 0,
    totalReaj: 0,
    ...p,
  }
}

describe("construirIntentsContas — regras de negócio", () => {
  it("cria 2 títulos quando há atraso E a vencer", () => {
    const r = construirIntentsContas("loja-x", [
      conta({ codigoLegado: "74", cliente: "APARECIDA", emAtraso: 19.9, aVencer: 12 }),
    ])
    expect(r).toHaveLength(2)
    const atraso = r.find((i) => i.tipo === "atraso")!
    const avencer = r.find((i) => i.tipo === "avencer")!
    expect(atraso.valor).toBe(19.9)
    expect(atraso.status).toBe("vencido")
    expect(atraso.descricao).toBe("SALDO MIGRADO SMARTGENIUS - EM ATRASO")
    expect(avencer.valor).toBe(12)
    expect(avencer.status).toBe("pendente")
    expect(avencer.descricao).toBe("SALDO MIGRADO SMARTGENIUS - A VENCER")
  })

  it("valor zero não gera título", () => {
    const soAtraso = construirIntentsContas("loja-x", [conta({ emAtraso: 199.9, aVencer: 0 })])
    expect(soAtraso).toHaveLength(1)
    expect(soAtraso[0]!.tipo).toBe("atraso")

    const soVencer = construirIntentsContas("loja-x", [conta({ emAtraso: 0, aVencer: 149.8 })])
    expect(soVencer).toHaveLength(1)
    expect(soVencer[0]!.tipo).toBe("avencer")

    const nenhum = construirIntentsContas("loja-x", [conta({ emAtraso: 0, aVencer: 0 })])
    expect(nenhum).toHaveLength(0)
  })

  it("localKey é estável por (storeId, código, tipo) — idempotência", () => {
    const r = construirIntentsContas("loja-1", [
      conta({ codigoLegado: "46", cliente: "ADRIANA", emAtraso: 199.9 }),
    ])
    expect(r[0]!.localKey).toBe("imp-smart:loja-1:cr:46:atraso")
  })

  it("sem código legado, usa slug do nome na localKey", () => {
    const r = construirIntentsContas("loja-1", [
      conta({ codigoLegado: "", cliente: "João da Silva", aVencer: 50 }),
    ])
    expect(r[0]!.localKey).toBe("imp-smart:loja-1:cr:joao-da-silva:avencer")
  })

  it("dedupe por localKey dentro do arquivo (mantém o primeiro)", () => {
    const r = construirIntentsContas("loja-1", [
      conta({ codigoLegado: "46", cliente: "ADRIANA", emAtraso: 199.9 }),
      conta({ codigoLegado: "46", cliente: "ADRIANA DUP", emAtraso: 999 }),
    ])
    const atraso = r.filter((i) => i.tipo === "atraso")
    expect(atraso).toHaveLength(1)
    expect(atraso[0]!.valor).toBe(199.9) // primeiro vence
  })

  it("não incorpora Reaj no valor (principal puro)", () => {
    const r = construirIntentsContas("loja-1", [
      conta({ codigoLegado: "46", emAtraso: 199.9, reaj: 51.97, total: 199.9, totalReaj: 251.87 }),
    ])
    expect(r[0]!.valor).toBe(199.9) // nunca 251.87
  })
})
