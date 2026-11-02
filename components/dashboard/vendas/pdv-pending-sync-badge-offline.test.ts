/** PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001 — painel de sincronização: conexão, fase e honestidade. */
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"

const h = vi.hoisted(() => ({
  sales: [] as SaleRecord[],
  connectivity: "online" as string,
  phases: {} as Record<string, string>,
  healthy: true,
}))

vi.mock("@/lib/operations-store", () => ({
  useOperationsStore: () => ({
    sales: h.sales,
    devolucoes: [],
    pendingCaixaOperations: [],
    retrySyncSale: vi.fn(),
    quarantineReviewKeys: new Set<string>(),
    syncConnectivity: h.connectivity,
    saleSyncPhases: h.phases,
    localQueueHealthy: h.healthy,
  }),
}))

import { PdvPendingSyncBadge } from "./pdv-pending-sync-badge"

const CS = "cs_" + "c".repeat(32)
function pending(over: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: "PEND-" + CS, clientSaleId: CS, at: "2026-11-02T14:00:00.000Z", lines: [], total: 10,
    paymentBreakdown: { dinheiro: 0, pix: 10, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 },
    syncPending: true, ...over,
  }
}
const render = () => renderToStaticMarkup(React.createElement(PdvPendingSyncBadge))

beforeEach(() => {
  h.sales = []
  h.connectivity = "online"
  h.phases = {}
  h.healthy = true
})

describe("PdvPendingSyncBadge — conexão e fases", () => {
  it("sem pendência e online: nada", () => {
    expect(render()).toBe("")
  })
  it("sem pendência e offline: avisa que vendas ficam só no terminal e quais meios estão bloqueados", () => {
    h.connectivity = "offline"
    const html = render()
    expect(html).toContain("Sem internet")
    expect(html).toContain("registradas só neste terminal")
    expect(html).toContain("Crédito/vale, a prazo e carnê ficam bloqueados")
  })
  it("armazenamento falhou: aviso explícito mesmo sem pendência", () => {
    h.healthy = false
    expect(render()).toContain("Armazenamento do navegador falhou")
  })
  it("pendência offline mostra conexão e contagens por estado, sem afirmar sincronização", () => {
    h.connectivity = "offline"
    h.sales = [pending(), pending({ id: "PEND-x", clientSaleId: "cs_" + "d".repeat(32), syncBlockedCode: "ESTOQUE_INSUFICIENTE", syncHttpStatus: 409, syncAttemptCount: 1 })]
    const html = render()
    expect(html).toContain("<strong>2</strong>")
    expect(html).toContain("Sem internet")
    expect(html).toContain("Aguardando: 1")
    expect(html).toContain("Exigem correção: 1")
    expect(html).not.toMatch(/sincronizada/i)
  })
  it("tentativa em curso: o botão mostra a fase e fica desabilitado (nunca inerte)", () => {
    h.sales = [pending()]
    h.phases = { [CS]: "verificando" }
    expect(render()).toContain("Verificando venda…")
    h.phases = { [CS]: "enviando" }
    const html = render()
    expect(html).toContain("Enviando…")
    expect(html).toMatch(/disabled=""[^>]*>[\s\S]*Enviando…/)
    expect(html).toContain("Em envio: 1")
  })
  it("servidor inacessível com navegador 'online'", () => {
    h.connectivity = "servidor_inacessivel"
    h.sales = [pending({ syncNetworkError: true, syncAttemptCount: 1, syncLastAttemptAt: "2026-11-02T14:01:00.000Z" })]
    expect(render()).toContain("Servidor não responde")
  })
})
