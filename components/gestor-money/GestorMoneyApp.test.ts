// @vitest-environment jsdom
import * as React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { GestorMoneyApp } from "@/components/gestor-money/GestorMoneyApp"
import {
  createRealBoundaryGateway,
  createSyntheticGestorMoneyGateway,
  type GestorMoneyGateway,
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

describe("GestorMoneyApp — UI Integration & Visual Contract Regression", () => {
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

  it("navega por todos os módulos (incluindo Comprovantes), preserva barra mobile e mantém WhatsApp honestamente desabilitado (G007)", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    render(React.createElement(GestorMoneyApp, { mode: "synthetic", customGateway: gw }))

    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-dashboard")).toBeTruthy()
    })

    // Layout mobile + tema preservados
    expect(screen.getByTestId("mobile-bottom-nav")).toBeTruthy()
    expect(screen.getByTestId("theme-toggle-desktop")).toBeTruthy()
    expect(screen.getByTestId("theme-toggle-mobile")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-dividas"))
    expect(screen.getByTestId("gestor-money-dividas")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-cartoes"))
    expect(screen.getByTestId("gestor-money-cartoes")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-contas"))
    expect(screen.getByTestId("gestor-money-contas")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-categorias"))
    expect(screen.getByTestId("gestor-money-categorias")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-comprovantes"))
    expect(screen.getByTestId("gestor-money-comprovantes")).toBeTruthy()
    expect(screen.getByTestId("storage-g003-status-card")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-relatorios"))
    expect(screen.getByTestId("gestor-money-relatorios")).toBeTruthy()

    fireEvent.click(screen.getByTestId("nav-assistente"))
    expect(screen.getByTestId("gestor-money-assistente")).toBeTruthy()
    expect(screen.getByTestId("assistant-g007-alignment")).toBeTruthy()
    const connectBtn = screen.getByTestId("btn-conectar-whatsapp-disabled") as HTMLButtonElement
    expect(connectBtn.disabled).toBe(true)
    expect(screen.getByTestId("whatsapp-real-status-badge").textContent).toContain("Aguardando G007")
  }, 15_000)

  it("nunca exibe R$ 0,00 como limite real quando limiteCentavos é null e usa percentual canônico do backend sem recálculo", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    const origSnap = gw.obterSnapshot.bind(gw)
    vi.spyOn(gw, "obterSnapshot").mockImplementation(async (sel, per) => {
      const snap = await origSnap(sel, per)
      if (!snap) return null
      return {
        ...snap,
        cartoes: snap.cartoes.map((c, idx) =>
          idx === 0
            ? {
                ...c,
                limiteCentavos: null,
                disponivelCentavos: null,
                limiteExcedidoCentavos: null,
                limiteComprometidoPercentual: null,
              }
            : {
                ...c,
                // Valor canônico distinto para provar que o frontend exibe o percentual vindo do backend sem recalcular
                limiteComprometidoPercentual: 42.37,
              }
        ),
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
    const cardNull = screen.getByTestId("credit-card-card-p-nubank")
    expect(cardNull.textContent).toContain("Limite não informado")
    expect(cardNull.textContent).not.toContain("Limite R$ 0,00")

    // Seleciona o 2º cartão e valida uso do percentual exato fornecido pelo backend (42.37%)
    fireEvent.click(screen.getByTestId("credit-card-card-p-inter"))
    await waitFor(() => {
      expect(screen.getByTestId("active-card-limit-pct").textContent).toContain("42.37%")
    })
  }, 15_000)

  it("permite editar limite do cartão, exibe histórico de alterações e trata limite insuficiente com alerta acionável", async () => {
    const gw = createSyntheticGestorMoneyGateway()
    render(React.createElement(GestorMoneyApp, { mode: "synthetic", customGateway: gw }))

    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-dashboard")).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId("nav-cartoes"))
    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-cartoes")).toBeTruthy()
    })

    // Editar limite para R$ 15.000,00 com motivo
    fireEvent.click(screen.getByTestId("btn-editar-limite-cartao"))
    await waitFor(() => {
      expect(screen.getByTestId("dialog-editar-cartao")).toBeTruthy()
    })
    fireEvent.change(screen.getByTestId("input-editar-limite"), { target: { value: "15.000,00" } })
    fireEvent.change(screen.getByTestId("input-editar-limite-motivo"), {
      target: { value: "Revisão de limite 2026" },
    })
    fireEvent.click(screen.getByTestId("btn-submit-editar-cartao"))

    await waitFor(() => {
      expect(screen.getByTestId("active-card-limit-summary").textContent).toContain("15.000,00")
    })

    // Tentar compra acima do limite disponível -> exibe alerta de limite insuficiente
    fireEvent.click(screen.getByTestId("btn-nova-compra-cartao"))
    await waitFor(() => {
      expect(screen.getByTestId("dialog-nova-compra-cartao")).toBeTruthy()
    })
    fireEvent.change(screen.getByTestId("input-compra-descricao"), { target: { value: "Servidor Rack" } })
    fireEvent.change(screen.getByTestId("input-compra-estabelecimento"), { target: { value: "Dell" } })
    fireEvent.change(screen.getByTestId("input-compra-valor"), { target: { value: "25.000,00" } })
    fireEvent.change(screen.getByTestId("input-compra-parcelas"), { target: { value: "6" } })
    expect(screen.getByTestId("card-limit-precheck-warning")).toBeTruthy()

    fireEvent.click(screen.getByTestId("btn-submit-compra-cartao"))
    await waitFor(() => {
      expect(screen.getByTestId("card-insufficient-limit-alert")).toBeTruthy()
    })
  }, 15_000)

  it("em modo real com G003-STORAGE bloqueado exibe estado honesto e bloqueia upload e download de comprovantes", async () => {
    const synth = createSyntheticGestorMoneyGateway()
    const baseSnap = (await synth.obterSnapshot({ tipo: "PESSOAL", perfilId: "perfil-pessoal-sintetico" }))!
    const perfis = await synth.listarPerfis()
    const assist = await synth.obterAssistenteConfig({ tipo: "PESSOAL", perfilId: "perfil-pessoal-sintetico" })

    const realBlockedGw: GestorMoneyGateway = {
      ...synth,
      mode: "real",
      async obterReadiness() {
        return {
          mode: "real",
          state: "READY",
          moduleEnabled: true,
          foundationMerged: true,
          mensagem: "Pronto",
          contratos: [],
        }
      },
      async listarPerfis() {
        return perfis
      },
      async obterSnapshot() {
        return {
          ...baseSnap,
          proveniencia: "REAL",
          storageDiagnostico: {
            gate: "G003-STORAGE",
            runtimeLiberado: false,
            bloqueioCodigo: "privacidade_bucket_nao_comprovada",
            flagHabilitada: true,
            providerDeclaradoValido: true,
            configR2Completa: true,
            variaveisObrigatorias: ["GESTOR_MONEY_STORAGE_G003_ENABLED"],
            variaveisFaltando: [],
            privacidadeComprovadaNoRuntime: false,
            reutilizaAdapter: "lib/contador/documentos/storage-r2.ts",
            liberadoNoMotorG003: false,
            variaveisR2Presentes: true,
            motivo:
              "Privacidade real do bucket R2 ainda não comprovada neste runtime (fail-closed).",
          },
        }
      },
      async obterAssistenteConfig() {
        return assist
      },
    }

    render(React.createElement(GestorMoneyApp, { mode: "real", customGateway: realBlockedGw }))
    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-dashboard")).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId("nav-comprovantes"))
    await waitFor(() => {
      expect(screen.getByTestId("gestor-money-comprovantes")).toBeTruthy()
    })

    expect(screen.getByTestId("storage-g003-status-badge").textContent).toContain(
      "privacidade_bucket_nao_comprovada"
    )
    expect(screen.getByTestId("receipt-storage-blocked-notice")).toBeTruthy()
    expect((screen.getByTestId("btn-upload-comprovante") as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId("download-receipt-doc-p-01") as HTMLButtonElement).disabled).toBe(true)
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
