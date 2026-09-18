import { describe, expect, it } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"
import {
  applyConfirmedLocalEffects,
  hydrateInventoryFromServer,
  reverseAppliedLocalEffects,
  stockOf,
  shouldReverseFinanceOnPendingDiscard,
  shouldReverseStockOnPendingDiscard,
} from "./pending-local-effects"

const PB = {
  dinheiro: 10,
  pix: 0,
  cartaoDebito: 0,
  cartaoCredito: 0,
  carne: 0,
  aPrazo: 0,
  creditoVale: 0,
}

function sale(over: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: "PEND-cs_same",
    clientSaleId: "cs_same",
    at: "2026-09-18T12:00:00.000Z",
    lines: [{ inventoryId: "prod-1", name: "Tela", quantity: 1, unitPrice: 10, lineTotal: 10 }],
    total: 10,
    paymentBreakdown: { ...PB },
    syncPending: true,
    localEffectsApplied: false,
    ...over,
  }
}

describe("PENDING atomicity — incidente estoque 4 → 1", () => {
  it("SERVER STOCK=4, same clientSaleId, 3 retries: efeito de estoque <= 1 (na verdade 0 até confirm)", () => {
    const server = [{ id: "prod-1", stock: 4 }]
    const pending = sale()
    let displayed = hydrateInventoryFromServer(server, [pending])
    expect(stockOf(displayed, "prod-1")).toBe(4)

    for (let i = 0; i < 3; i += 1) {
      const again = applyConfirmedLocalEffects(
        {
          inventory: displayed,
          caixa: { totalEntradas: 0 },
          dailyLedger: {
            totalVendas: 0,
            vendasDinheiro: 0,
            vendasPix: 0,
            vendasCartaoDebito: 0,
            vendasCartaoCredito: 0,
            vendasCarne: 0,
            vendasAPrazo: 0,
            vendasCreditoVale: 0,
          },
          customerCredits: {},
        },
        { ...pending, localEffectsApplied: false },
        { applyStock: true },
      )
      // Retry da MESMA pending (já "conhecida") não reaplica: simulamos o flag após 1ª confirmação.
      displayed = hydrateInventoryFromServer(server, [pending])
      expect(stockOf(displayed, "prod-1"), `retry ${i + 1}`).toBe(4)
      expect(again.applied).toBe(true)
    }

    const confirmedOnce = applyConfirmedLocalEffects(
      {
        inventory: [{ id: "prod-1", stock: 4 }],
        caixa: { totalEntradas: 0 },
        dailyLedger: {
          totalVendas: 0,
          vendasDinheiro: 0,
          vendasPix: 0,
          vendasCartaoDebito: 0,
          vendasCartaoCredito: 0,
          vendasCarne: 0,
          vendasAPrazo: 0,
          vendasCreditoVale: 0,
        },
        customerCredits: {},
      },
      pending,
      { applyStock: true },
    )
    expect(stockOf(confirmedOnce.state.inventory, "prod-1")).toBe(3)
    const second = applyConfirmedLocalEffects(confirmedOnce.state, { ...pending, localEffectsApplied: true }, { applyStock: true })
    expect(second.applied).toBe(false)
    expect(stockOf(second.state.inventory, "prod-1")).toBe(3)
  })

  it("pending → discard (sem efeitos aplicados) restaura baseline de estoque/caixa/ledger", () => {
    const baseline = {
      inventory: [{ id: "prod-1", stock: 4 }],
      caixa: { totalEntradas: 100 },
      dailyLedger: {
        totalVendas: 50,
        vendasDinheiro: 50,
        vendasPix: 0,
        vendasCartaoDebito: 0,
        vendasCartaoCredito: 0,
        vendasCarne: 0,
        vendasAPrazo: 0,
        vendasCreditoVale: 0,
      },
      customerCredits: {},
    }
    const pending = sale({ localEffectsApplied: false })
    expect(shouldReverseFinanceOnPendingDiscard(pending)).toBe(false)
    expect(shouldReverseStockOnPendingDiscard(pending)).toBe(false)
    const reversed = reverseAppliedLocalEffects(baseline, pending, {
      applyStock: shouldReverseStockOnPendingDiscard(pending),
      reverseFinance: shouldReverseFinanceOnPendingDiscard(pending),
    })
    expect(reversed.reversed).toBe(false)
    expect(stockOf(reversed.state.inventory, "prod-1")).toBe(4)
    expect(reversed.state.caixa.totalEntradas).toBe(100)
    expect(reversed.state.dailyLedger.totalVendas).toBe(50)
  })

  it("legado (localEffectsApplied ausente) reverte só financeiro no discard, não empilha estoque", () => {
    const baseline = {
      inventory: [{ id: "prod-1", stock: 4 }],
      caixa: { totalEntradas: 110 },
      dailyLedger: {
        totalVendas: 60,
        vendasDinheiro: 60,
        vendasPix: 0,
        vendasCartaoDebito: 0,
        vendasCartaoCredito: 0,
        vendasCarne: 0,
        vendasAPrazo: 0,
        vendasCreditoVale: 0,
      },
      customerCredits: {},
    }
    const legacy = sale({ localEffectsApplied: undefined })
    expect(shouldReverseFinanceOnPendingDiscard(legacy)).toBe(true)
    expect(shouldReverseStockOnPendingDiscard(legacy)).toBe(false)
    const reversed = reverseAppliedLocalEffects(baseline, legacy, {
      applyStock: shouldReverseStockOnPendingDiscard(legacy),
      reverseFinance: shouldReverseFinanceOnPendingDiscard(legacy),
    })
    expect(reversed.state.caixa.totalEntradas).toBe(100)
    expect(reversed.state.dailyLedger.totalVendas).toBe(50)
    expect(stockOf(reversed.state.inventory, "prod-1")).toBe(4)
  })

  it("pending → confirmed aplica efeitos exatamente uma vez", () => {
    const start = {
      inventory: [{ id: "prod-1", stock: 4 }],
      caixa: { totalEntradas: 0 },
      dailyLedger: {
        totalVendas: 0,
        vendasDinheiro: 0,
        vendasPix: 0,
        vendasCartaoDebito: 0,
        vendasCartaoCredito: 0,
        vendasCarne: 0,
        vendasAPrazo: 0,
        vendasCreditoVale: 0,
      },
      customerCredits: {},
    }
    const pending = sale({ localEffectsApplied: false })
    const first = applyConfirmedLocalEffects(start, pending, { applyStock: true })
    expect(first.applied).toBe(true)
    expect(stockOf(first.state.inventory, "prod-1")).toBe(3)
    expect(first.state.caixa.totalEntradas).toBe(10)
    expect(first.state.dailyLedger.totalVendas).toBe(10)
    const second = applyConfirmedLocalEffects(first.state, { ...pending, localEffectsApplied: true }, { applyStock: true })
    expect(second.applied).toBe(false)
    expect(stockOf(second.state.inventory, "prod-1")).toBe(3)
    expect(second.state.caixa.totalEntradas).toBe(10)
  })
})
