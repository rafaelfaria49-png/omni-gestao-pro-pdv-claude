// @vitest-environment jsdom
import * as React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { GestorMoneyApp } from "@/components/gestor-money/GestorMoneyApp"
import {
  createRealBoundaryGateway,
  createSyntheticGestorMoneyGateway,
} from "@/lib/gestor-money/gateway"

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
})

describe("GestorMoneyApp — UI Integration", () => {
  it("exibe banner sintético inequívoco e alterna escopo PESSOAL ↔ EMPRESA com dados isolados", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    render(React.createElement(GestorMoneyApp, { mode: "synthetic", customGateway: gw }))

    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-dashboard")).toBeTruthy()
    })

    expect(screen.getByTestId("synthetic-mode-banner").textContent).toContain("DADOS SINTÉTICOS")
    expect(screen.getByTestId("gestor-money-root").getAttribute("data-profile-scope")).toBe("PESSOAL")

    const saldoPessoal = screen.getByTestId("kpi-saldo").textContent

    fireEvent.click(screen.getAllByTestId("profile-switch-empresa")[0])
    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-root").getAttribute("data-profile-scope")).toBe("EMPRESA")
    })

    const saldoEmpresa = screen.getByTestId("kpi-saldo").textContent
    expect(saldoEmpresa).not.toBe(saldoPessoal)
  }, 15_000)

  it("navega por todos os módulos e mantém botão de vínculo WhatsApp honestamente desabilitado (G007)", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    render(React.createElement(GestorMoneyApp, { mode: "synthetic", customGateway: gw }))

    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-dashboard")).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId("nav-dividas"))
    expect(screen.getByTestId("gestor-money-dividas")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-cartoes"))
    expect(screen.getByTestId("gestor-money-cartoes")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-contas"))
    expect(screen.getByTestId("gestor-money-contas")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-categorias"))
    expect(screen.getByTestId("gestor-money-categorias")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-relatorios"))
    expect(screen.getByTestId("gestor-money-relatorios")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-assistente"))
    expect(screen.getByTestId("gestor-money-assistente")).toBeTruthy()
    expect(screen.getByTestId("assistant-g007-alignment")).toBeTruthy()
    const connectBtn = screen.getByTestId("btn-conectar-whatsapp-disabled") as HTMLButtonElement
    expect(connectBtn.disabled).toBe(true)
    expect(screen.getByTestId("whatsapp-real-status-badge").textContent).toContain("Aguardando G007")
  }, 15_000)

  it("nunca exibe R$ 0,00 como limite real quando limiteCentavos é null", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    const origSnap = gw.obterSnapshot.bind(gw)
    vi.spyOn(gw, "obterSnapshot").mockImplementation(async (sel, per) => {
      const snap = await origSnap(sel, per)
      if (!snap) return null
      return {
        ...snap,
        cartoes: snap.cartoes.map((c) => ({
          ...c,
          limiteCentavos: null,
          disponivelCentavos: null,
          limitePersistenciaDisponivel: false,
        })),
      }
    })

    render(React.createElement(GestorMoneyApp, { mode: "synthetic", customGateway: gw }))
    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-dashboard")).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId("nav-cartoes"))
    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-cartoes")).toBeTruthy()
    })
    const cardEl = screen.getByTestId("credit-card-card-p-nubank")
    expect(cardEl.textContent).toContain("Limite não informado")
    expect(cardEl.textContent).not.toContain("Limite R$ 0,00")
  }, 15_000)

  it("no modo real exibe painel honesto de fundação pendente (PR #405) sem dados simulados", async () => {
    const realGw = createRealBoundaryGateway()
    vi.spyOn(realGw, "obterReadiness").mockResolvedValue({
      mode: "real",
      state: "FOUNDATION_PENDING_PR405",
      moduleEnabled: false,
      foundationMerged: false,
      mensagem: "Fundação G001–G006 pendente de reconciliação na PR #405.",
      contratos: [
        {
          id: "G001",
          nome: "Perfis & Autorização",
          disponivelNoRuntime: false,
          origem: "PR #405",
          detalhe: "Pendente",
        },
      ],
    })

    render(React.createElement(GestorMoneyApp, { mode: "real", customGateway: realGw }))

    await waitFor(() => {
      expect(screen.getByTestId("real-boundary-pending-panel")).toBeTruthy()
    })
    expect(screen.queryByTestId("synthetic-mode-banner")).toBeNull()
    expect(screen.queryByTestId("gestor-money-dashboard")).toBeNull()
    expect((screen.getByTestId("desktop-quick-entry-btn") as HTMLButtonElement).disabled).toBe(true)
  })
})
