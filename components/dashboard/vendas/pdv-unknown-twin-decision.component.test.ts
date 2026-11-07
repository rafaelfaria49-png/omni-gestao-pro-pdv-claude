// @vitest-environment jsdom
/** PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001 — "É outra venda" é decisão explícita, por botão. */
import React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"

const CS = "cs_" + "9".repeat(32)
const h = vi.hoisted(() => ({
  prompt: null as null | { key: string; saleId: string; clientSaleId?: string; at: string; total: number },
  resolve: vi.fn(async () => null as unknown),
  sales: [] as SaleRecord[],
}))
vi.mock("@/lib/operations-store", () => ({
  useOperationsStore: () => ({
    sales: h.sales, devolucoes: [], pendingCaixaOperations: [], retrySyncSale: vi.fn(),
    quarantineReviewKeys: new Set<string>(), syncConnectivity: "servidor_inacessivel", saleSyncPhases: {},
    localQueueHealthy: true, unknownTwinPrompt: h.prompt, resolveUnknownTwin: h.resolve,
  }),
}))
import { PdvPendingSyncBadge } from "./pdv-pending-sync-badge"

beforeEach(() => {
  h.sales = [{
    id: "PEND-" + CS, clientSaleId: CS, at: "2026-11-03T10:00:00.000Z", lines: [], total: 12.5,
    paymentBreakdown: { dinheiro: 12.5, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 },
    syncPending: true, syncNetworkError: true, syncResultUnknown: true, syncAttemptCount: 1,
  }]
  h.prompt = { key: CS, saleId: "PEND-" + CS, clientSaleId: CS, at: "2026-11-03T10:00:00.000Z", total: 12.5 }
  h.resolve.mockClear()
})
afterEach(cleanup)

it("mostra a decisão e só libera venda nova no clique 'É outra venda'", async () => {
  render(React.createElement(PdvPendingSyncBadge))
  const dialog = await screen.findByTestId("pdv-unknown-twin-dialog")
  expect(dialog.textContent).toContain("pode já estar gravada")
  expect(dialog.textContent).toMatch(/R\$\s?12,50/)
  expect(h.resolve).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "É outra venda" })) })
  expect(h.resolve).toHaveBeenCalledWith("outra")
  expect(screen.getByTestId("pdv-unknown-twin-note").textContent).toContain("A anterior continua na fila")
})

it("'Verificar a venda anterior' e 'Voltar' não liberam venda nova", async () => {
  render(React.createElement(PdvPendingSyncBadge))
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Verificar a venda anterior" })) })
  expect(h.resolve).toHaveBeenLastCalledWith("verificar")
  cleanup()
  render(React.createElement(PdvPendingSyncBadge))
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Voltar" })) })
  expect(h.resolve).toHaveBeenLastCalledWith("cancelar")
  expect(h.resolve).not.toHaveBeenCalledWith("outra")
})
