// @vitest-environment jsdom
/**
 * PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001 (T49) — fechamento de caixa com vendas da sessão ainda
 * NÃO confirmadas pelo servidor: o modal real avisa quantas/quanto e só fecha com ciência explícita.
 */
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"

const h = vi.hoisted(() => ({ sales: [] as SaleRecord[], toast: vi.fn() }))
const abertura = new Date("2026-11-02T08:00:00.000Z")

vi.mock("@/lib/operations-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/operations-store")>()),
  useOperationsStore: () => ({ sales: h.sales, dailyLedger: undefined, refreshSalesFromServer: async () => {} }),
}))
vi.mock("./caixa-provider", () => ({
  useCaixa: () => ({
    caixa: { isOpen: true, saldoInicial: 0, dataAbertura: abertura, totalEntradas: 0, totalSaidas: 0 },
    fecharCaixa: vi.fn(),
    sessaoId: "sess-1",
  }),
}))
vi.mock("@/lib/loja-ativa", () => ({
  useLojaAtiva: () => ({ lojaAtivaId: "loja-1", empresaDocumentos: { nomeFantasia: "Loja sintética" }, getEnderecoDocumentos: () => "" }),
}))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }))
vi.mock("@/lib/pdv-operador-nome", () => ({ usePdvOperadorNome: () => "Operador" }))
vi.mock("@/lib/pdv-terminal", () => ({ useTerminalAtivo: () => ({ terminal: null }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))
vi.mock("./conferencia-caixa", () => ({ ConferenciaCaixa: () => null }))
vi.mock("./fechamento-pos-fechamento-dialog", () => ({ FechamentoPosFechamentoDialog: () => null }))

import { FechamentoCaixaModal } from "./fechamento-caixa-modal"

const pb = { dinheiro: 25, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 }
const sale = (over: Partial<SaleRecord>): SaleRecord => ({
  id: "VDA-1", at: "2026-11-02T09:00:00.000Z", lines: [], total: 25, paymentBreakdown: pb, sessaoId: "sess-1", syncPending: false, ...over,
})
const fechar = () => (fetch as unknown as { mock: { calls: Array<[string]> } }).mock.calls.filter(([u]) => String(u).includes("/api/ops/caixa/fechar"))

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 })))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  h.toast.mockReset()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("com venda da sessão pendente, o fechamento avisa e não chama o servidor sem ciência; com ciência, segue", async () => {
  h.sales = [sale({}), sale({ id: "PEND-cs_1", clientSaleId: "cs_" + "1".repeat(32), syncPending: true, total: 30 })]
  render(React.createElement(FechamentoCaixaModal, { isOpen: true, onClose: () => {} }))
  const aviso = await screen.findByTestId("fechamento-pendentes-sync")
  expect(aviso.textContent).toContain("1 venda(s) desta sessão")
  expect(aviso.textContent).toMatch(/R\$\s?30,00/)
  expect(aviso.textContent).toContain("NÃO foram confirmadas pelo servidor")
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Confirmar Fechamento/ })) })
  expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: expect.stringMatching(/sem confirmação do servidor/) }))
  expect(fechar()).toHaveLength(0)
  await act(async () => { fireEvent.click(screen.getByRole("checkbox")) })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Confirmar Fechamento/ })) })
  await waitFor(() => expect(fechar().length).toBeGreaterThan(0))
})

it("sem pendência, nenhum aviso e o fechamento segue direto", async () => {
  h.sales = [sale({})]
  render(React.createElement(FechamentoCaixaModal, { isOpen: true, onClose: () => {} }))
  await screen.findByRole("button", { name: /Confirmar Fechamento/ })
  expect(screen.queryByTestId("fechamento-pendentes-sync")).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Confirmar Fechamento/ })) })
  await waitFor(() => expect(fechar().length).toBeGreaterThan(0))
})
