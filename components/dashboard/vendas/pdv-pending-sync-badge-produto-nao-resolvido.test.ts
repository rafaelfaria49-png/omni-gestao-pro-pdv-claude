/**
 * PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001 — banner da pendência.
 *
 * O operador precisa ver QUAL venda está pendente e QUAL linha falhou, a partir da
 * própria venda pendente (o carrinho atual não identifica a pendência).
 */
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"

const h = vi.hoisted(() => ({
  sales: [] as SaleRecord[],
  retrySyncSale: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/lib/operations-store", () => ({
  useOperationsStore: () => ({
    sales: h.sales,
    devolucoes: [],
    pendingCaixaOperations: [],
    retrySyncSale: h.retrySyncSale,
    quarantineReviewKeys: new Set<string>(),
  }),
}))
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}))

import { PdvPendingSyncBadge } from "./pdv-pending-sync-badge"

function pendente(over: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: "PEND-cs_attempt_abc123",
    clientSaleId: "cs_attempt_abc123",
    at: "2026-11-01T15:03:17.000Z",
    lines: [
      { inventoryId: "PEL-ANTIGO", name: "PELÍCULA", quantity: 2, unitPrice: 4, lineTotal: 8 },
    ],
    total: 8,
    paymentBreakdown: { dinheiro: 8, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 },
    syncPending: true,
    syncBlockedCode: "PRODUTO_NAO_RESOLVIDO",
    syncHttpStatus: 409,
    ...over,
  }
}

function render(): string {
  return renderToStaticMarkup(React.createElement(PdvPendingSyncBadge))
}

beforeEach(() => {
  h.sales = []
  vi.clearAllMocks()
})

describe("PdvPendingSyncBadge — PRODUTO_NAO_RESOLVIDO", () => {
  it("identifica a venda pendente e a linha devolvida pelo servidor", () => {
    h.sales = [pendente({ syncUnresolvedInventoryIds: ["PEL-ANTIGO"] })]
    const html = render()
    expect(html).toContain("Venda PEND-cs_attempt_abc123 de ")
    expect(html).toContain("PELÍCULA (código PEL-ANTIGO)")
    expect(html).toContain("não foi gravada no servidor")
    expect(html).toContain("Reenviar")
  })

  it("pendência anterior ao fix (sem referência) não inventa linha e orienta a reenviar", () => {
    h.sales = [pendente()]
    const html = render()
    expect(html).toContain("Produto não resolvido")
    expect(html).toContain("identificar o item")
    expect(html).not.toContain("código PEL-ANTIGO")
  })

  it("não expõe dados do cliente da venda pendente", () => {
    h.sales = [pendente({ customerName: "Fulano de Tal", customerCpf: "12345678909", syncUnresolvedInventoryIds: ["PEL-ANTIGO"] })]
    const html = render()
    expect(html).not.toContain("Fulano")
    expect(html).not.toContain("12345678909")
  })
})
