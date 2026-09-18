import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"
import { applyRecoveryConfirmations } from "@/lib/vendas/quarantine-local-reconciliation"

const h = vi.hoisted(() => ({
  sales: [] as SaleRecord[],
  reviewKeys: new Set<string>() as ReadonlySet<string>,
  retrySyncSale: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/lib/operations-store", () => ({
  useOperationsStore: () => ({
    sales: h.sales,
    devolucoes: [],
    pendingCaixaOperations: [],
    retrySyncSale: h.retrySyncSale,
    quarantineReviewKeys: h.reviewKeys,
  }),
}))
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toast }),
}))

import { PdvPendingSyncBadge } from "./pdv-pending-sync-badge"

function pending(code?: string, over: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: "VDA-2026-0999",
    at: "2026-07-28T14:00:00.000Z",
    lines: [],
    total: 10,
    paymentBreakdown: {
      dinheiro: 10,
      pix: 0,
      cartaoDebito: 0,
      cartaoCredito: 0,
      carne: 0,
      aPrazo: 0,
      creditoVale: 0,
    },
    syncPending: true,
    syncBlockedCode: code,
    ...over,
  }
}

function render(): string {
  return renderToStaticMarkup(React.createElement(PdvPendingSyncBadge))
}

beforeEach(() => {
  h.sales = []
  h.reviewKeys = new Set()
  vi.clearAllMocks()
})

describe("PdvPendingSyncBadge — vendas preservadas", () => {
  it.each([
    "PEDIDO_ID_DE_OUTRA_LOJA",
    "PEDIDO_ID_CONFLITO_MESMA_LOJA",
  ])("venda preservada (%s) aparece como sincronização automática, sem jargão e sem Reenviar", (code) => {
    h.sales = [pending(code, { clientSaleId: "cs_attempt_aaaaaa" })]
    const html = render()
    expect(html).toContain("O sistema envia")
    expect(html).not.toMatch(/quarentena|Conflito técnico|cache/i)
    expect(html).not.toContain("revisão do administrador")
    expect(html).not.toContain(">Reenviar<")
  })

  it("só a venda que o servidor devolveu para revisão aponta o administrador", () => {
    h.sales = [
      pending("PEDIDO_ID_CONFLITO_MESMA_LOJA", { clientSaleId: "cs_attempt_aaaaaa" }),
      pending("PEDIDO_ID_DE_OUTRA_LOJA", { id: "VDA-2026-0998", clientSaleId: "cs_attempt_bbbbbb" }),
    ]
    h.reviewKeys = new Set(["cs_attempt_bbbbbb"])
    const html = render()
    expect(html).toContain("<strong>2</strong>")
    expect(html).toContain("1 venda(s) precisam de revisão do administrador")
  })

  it("mantém Reenviar para pendência comum", () => {
    h.sales = [pending("CAIXA_FECHADO")]
    expect(render()).toContain(">Reenviar<")
  })

  it("pendência de rede classifica AUTO_RETRY com copy de reenvio", () => {
    h.sales = [pending(undefined, { syncNetworkError: true })]
    const html = render()
    expect(html).toMatch(/Falha de rede/i)
    expect(html).toContain(">Reenviar<")
  })

  it("depois que as 12 vendas preservadas são reconciliadas, o aviso some", () => {
    const preservadas = Array.from({ length: 12 }, (_, index) =>
      pending("PEDIDO_ID_CONFLITO_MESMA_LOJA", {
        id: `VDA-2026-${String(400 + index).padStart(4, "0")}`,
        clientSaleId: `cs_attempt_${String(index).padStart(6, "0")}`,
      }),
    )
    h.sales = preservadas
    expect(render()).toContain("<strong>12</strong>")

    const { sales, reconciled } = applyRecoveryConfirmations(
      preservadas,
      preservadas.map((sale, index) => ({
        clientSaleId: sale.clientSaleId as string,
        pedidoId: `VDA-L02-2026-${String(700 + index).padStart(6, "0")}`,
        serverId: `venda-${index}`,
      })),
    )
    expect(reconciled).toBe(12)
    h.sales = sales
    expect(render()).toBe("")
  })
})
