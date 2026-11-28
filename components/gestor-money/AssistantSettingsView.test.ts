// @vitest-environment jsdom
import * as React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { AssistantSettingsView } from "@/components/gestor-money/AssistantSettingsView"
import {
  CONSENTIMENTO_WHATSAPP_VERSAO,
  type AssistenteWhatsAppConfig,
  type WhatsAppPairingActions,
} from "@/lib/gestor-money/contracts"
import { createSyntheticGestorMoneyGateway } from "@/lib/gestor-money/gateway"
import {
  createSyntheticWhatsAppPairingActions,
  createUnavailableWhatsAppPairingActions,
} from "@/lib/gestor-money/whatsapp-pairing"

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
})

afterEach(() => {
  cleanup()
})

async function baseFixtures(configOverride?: Partial<AssistenteWhatsAppConfig>) {
  const gw = createSyntheticGestorMoneyGateway()
  const perfis = await gw.listarPerfis()
  const pessoal = perfis.find((p) => p.tipo === "PESSOAL")!
  const sel = { tipo: "PESSOAL" as const, perfilId: pessoal.perfilId }
  const snapshot = (await gw.obterSnapshot(sel))!
  const baseConfig = await gw.obterAssistenteConfig(sel)
  const config: AssistenteWhatsAppConfig = {
    ...baseConfig,
    canalAtivo: true,
    canalFlagLigada: true,
    workerFilaAtivo: true,
    podeAlterarConexaoReal: true,
    estadoConexao: "AGUARDANDO_VINCULO",
    estadoDescricao: "Canal oficial WhatsApp GESTAO ativo.",
    motivoConexaoIndisponivel: null,
    alinhamentoG007: {
      principalAutorizadoAtual: "SESSAO_WEB",
      verificadorVinculoDisponivel: true,
      canalGestaoRegistrado: true,
      canalVersao: 1,
      motorConversacionalPr417: "ATIVO",
      homologacoes: {
        whatsappOficial: true,
        audioStt: false,
        imagemOcr: false,
      },
    },
    ...configOverride,
  }
  return { gw, perfis, snapshot, config }
}

describe("AssistantSettingsView — Integração WhatsApp G007/G008 (PR #417 -> #418)", () => {
  it("1. Telefone sem vínculo -> pareamento pendente (código temporário, instruções, contagem regressiva) -> cancelamento -> volta para SEM_VINCULO", async () => {
    const { gw, perfis, snapshot, config } = await baseFixtures()
    const pairing = createSyntheticWhatsAppPairingActions({
      estadoInicial: "SEM_VINCULO",
      numeroAssistente: "+5511999990001",
    })

    render(
      React.createElement(AssistantSettingsView, {
        snapshot,
        perfisAutorizados: perfis,
        config,
        gateway: gw,
        pairingActions: pairing,
        onSaved: vi.fn(),
        pollingIntervalMs: 60_000,
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-pairing-form")).toBeTruthy()
    })
    expect(screen.getByTestId("whatsapp-real-status-badge").textContent).toContain("Sem vínculo")

    // Sem consentimento -> exibe erro e não gera código
    fireEvent.change(screen.getByTestId("input-whatsapp-telefone"), {
      target: { value: "+5511988881111" },
    })
    fireEvent.click(screen.getByTestId("btn-iniciar-pareamento"))
    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-pairing-error").textContent).toContain("aceitar os termos")
    })

    // Aceita consentimento e inicia pareamento
    fireEvent.click(screen.getByTestId("checkbox-whatsapp-consentimento"))
    fireEvent.click(screen.getByTestId("btn-iniciar-pareamento"))

    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-pending-panel")).toBeTruthy()
    })
    expect(screen.getByTestId("whatsapp-pairing-code-card")).toBeTruthy()
    expect(screen.getByTestId("whatsapp-pairing-code-value").textContent).toMatch(/^\d{3} \d{3}$/)
    expect(screen.getByTestId("whatsapp-pairing-countdown").textContent).toMatch(/Validade: \d{2}:\d{2}/)
    expect(screen.getByTestId("whatsapp-assistant-number").textContent).toBe("+5511999990001")
    expect(screen.getByTestId("whatsapp-pending-phone").textContent).toBe("+*********1111")
    expect(screen.getByTestId("whatsapp-pending-attempts").textContent).toBe("5")

    // Cancelar pareamento -> limpa código e volta para SEM_VINCULO
    fireEvent.click(screen.getByTestId("btn-cancelar-pareamento"))
    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-pairing-form")).toBeTruthy()
    })
    expect(screen.queryByTestId("whatsapp-pairing-code-card")).toBeNull()
  })

  it("2. Código inválido decrementa tentativas até BLOQUEADO e oferece gerar novo código", async () => {
    const { gw, perfis, snapshot, config } = await baseFixtures()
    const pairing = createSyntheticWhatsAppPairingActions({ estadoInicial: "SEM_VINCULO" })

    render(
      React.createElement(AssistantSettingsView, {
        snapshot,
        perfisAutorizados: perfis,
        config,
        gateway: gw,
        pairingActions: pairing,
        onSaved: vi.fn(),
        pollingIntervalMs: 60_000,
      })
    )

    await waitFor(() => expect(screen.getByTestId("whatsapp-pairing-form")).toBeTruthy())
    fireEvent.change(screen.getByTestId("input-whatsapp-telefone"), {
      target: { value: "+5511988882222" },
    })
    fireEvent.click(screen.getByTestId("checkbox-whatsapp-consentimento"))
    fireEvent.click(screen.getByTestId("btn-iniciar-pareamento"))

    await waitFor(() => expect(screen.getByTestId("whatsapp-pending-panel")).toBeTruthy())

    // Simula 3 códigos inválidos pelo WhatsApp -> tentativas restantes cai para 2
    pairing.simularConfirmacaoWhatsApp("000000")
    pairing.simularConfirmacaoWhatsApp("000000")
    pairing.simularConfirmacaoWhatsApp("000000")
    fireEvent.click(screen.getByTestId("btn-atualizar-status-whatsapp"))

    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-pending-attempts").textContent).toBe("2")
    })

    // Mais 2 erros -> BLOQUEADO
    pairing.simularConfirmacaoWhatsApp("000000")
    pairing.simularConfirmacaoWhatsApp("000000")
    fireEvent.click(screen.getByTestId("btn-atualizar-status-whatsapp"))

    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-state-bloqueado")).toBeTruthy()
    })
    expect(screen.getByTestId("btn-iniciar-pareamento").textContent).toContain("Gerar novo código")
  })

  it("3. Código expirado transita para EXPIRADO e oferece gerar novo código", async () => {
    const { gw, perfis, snapshot, config } = await baseFixtures()
    const pairing = createSyntheticWhatsAppPairingActions({ estadoInicial: "SEM_VINCULO" })

    render(
      React.createElement(AssistantSettingsView, {
        snapshot,
        perfisAutorizados: perfis,
        config,
        gateway: gw,
        pairingActions: pairing,
        onSaved: vi.fn(),
        pollingIntervalMs: 60_000,
      })
    )

    await waitFor(() => expect(screen.getByTestId("whatsapp-pairing-form")).toBeTruthy())
    fireEvent.change(screen.getByTestId("input-whatsapp-telefone"), {
      target: { value: "+5511988883333" },
    })
    fireEvent.click(screen.getByTestId("checkbox-whatsapp-consentimento"))
    fireEvent.click(screen.getByTestId("btn-iniciar-pareamento"))
    await waitFor(() => expect(screen.getByTestId("whatsapp-pending-panel")).toBeTruthy())

    // Simula vencimento de 10 minutos
    pairing.simularExpiracao()
    fireEvent.click(screen.getByTestId("btn-atualizar-status-whatsapp"))

    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-state-expirado")).toBeTruthy()
    })
    expect(screen.queryByTestId("whatsapp-pairing-code-card")).toBeNull()
    expect(screen.getByTestId("btn-iniciar-pareamento").textContent).toContain("Gerar novo código")
  })

  it("4. Telefone já vinculado a outra conta permanece PENDENTE na tela (recusado pelo WhatsApp sem sequestro)", async () => {
    const { gw, perfis, snapshot, config } = await baseFixtures()
    const pairing = createSyntheticWhatsAppPairingActions({
      estadoInicial: "SEM_VINCULO",
      telefonesDeOutrasContas: ["+5511977779999"],
    })

    render(
      React.createElement(AssistantSettingsView, {
        snapshot,
        perfisAutorizados: perfis,
        config,
        gateway: gw,
        pairingActions: pairing,
        onSaved: vi.fn(),
        pollingIntervalMs: 60_000,
      })
    )

    await waitFor(() => expect(screen.getByTestId("whatsapp-pairing-form")).toBeTruthy())
    fireEvent.change(screen.getByTestId("input-whatsapp-telefone"), {
      target: { value: "+5511977779999" },
    })
    fireEvent.click(screen.getByTestId("checkbox-whatsapp-consentimento"))
    fireEvent.click(screen.getByTestId("btn-iniciar-pareamento"))
    await waitFor(() => expect(screen.getByTestId("whatsapp-pairing-code-value")).toBeTruthy())

    const codigo = screen.getByTestId("whatsapp-pairing-code-value").textContent!.replace(/\s+/g, "")
    const respWa = pairing.simularConfirmacaoWhatsApp(codigo)
    expect(respWa.ok).toBe(false)
    expect(respWa.mensagem).toContain("já está vinculado a outra conta")

    fireEvent.click(screen.getByTestId("btn-atualizar-status-whatsapp"))
    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-pending-panel")).toBeTruthy()
    })
    expect(screen.queryByTestId("whatsapp-linked-card")).toBeNull()
  })

  it("5. Vínculo confirmado (telefone mascarado) -> novo pareamento -> revogação com diálogo de confirmação", async () => {
    const { gw, perfis, snapshot, config } = await baseFixtures()
    const pairing = createSyntheticWhatsAppPairingActions({ estadoInicial: "SEM_VINCULO" })
    const onPairingChanged = vi.fn()

    render(
      React.createElement(AssistantSettingsView, {
        snapshot,
        perfisAutorizados: perfis,
        config,
        gateway: gw,
        pairingActions: pairing,
        onSaved: vi.fn(),
        onPairingChanged,
        pollingIntervalMs: 60_000,
      })
    )

    await waitFor(() => expect(screen.getByTestId("whatsapp-pairing-form")).toBeTruthy())
    fireEvent.change(screen.getByTestId("input-whatsapp-telefone"), {
      target: { value: "+5511988884444" },
    })
    fireEvent.click(screen.getByTestId("checkbox-whatsapp-consentimento"))
    fireEvent.click(screen.getByTestId("btn-iniciar-pareamento"))
    await waitFor(() => expect(screen.getByTestId("whatsapp-pairing-code-value")).toBeTruthy())

    const codigo1 = screen.getByTestId("whatsapp-pairing-code-value").textContent!.replace(/\s+/g, "")
    expect(pairing.simularConfirmacaoWhatsApp(codigo1).ok).toBe(true)

    fireEvent.click(screen.getByTestId("btn-atualizar-status-whatsapp"))
    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-linked-card")).toBeTruthy()
    })
    // Exibe apenas telefone mascarado (nunca E.164 completo)
    expect(screen.getByTestId("whatsapp-linked-phone").textContent).toBe("+*********4444")
    expect(screen.getByTestId("whatsapp-linked-card").textContent).not.toContain("+5511988884444")
    expect(screen.getByTestId("whatsapp-real-status-badge").textContent).toContain("WhatsApp conectado")

    // Novo pareamento para trocar número
    fireEvent.click(screen.getByTestId("btn-novo-pareamento"))
    await waitFor(() => expect(screen.getByTestId("whatsapp-pairing-form")).toBeTruthy())
    fireEvent.change(screen.getByTestId("input-whatsapp-telefone"), {
      target: { value: "+5511988885555" },
    })
    fireEvent.click(screen.getByTestId("btn-iniciar-pareamento"))
    await waitFor(() => expect(screen.getByTestId("whatsapp-pending-panel")).toBeTruthy())
    const codigo2 = screen.getByTestId("whatsapp-pairing-code-value").textContent!.replace(/\s+/g, "")
    expect(pairing.simularConfirmacaoWhatsApp(codigo2).ok).toBe(true)

    fireEvent.click(screen.getByTestId("btn-atualizar-status-whatsapp"))
    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-linked-phone").textContent).toBe("+*********5555")
    })

    // Revogação definitiva
    fireEvent.click(screen.getByTestId("btn-revogar-vinculo"))
    await waitFor(() => expect(screen.getByTestId("dialog-confirmar-revogacao")).toBeTruthy())
    fireEvent.click(screen.getByTestId("btn-confirmar-revogacao"))

    await waitFor(() => {
      expect(screen.queryByTestId("whatsapp-linked-card")).toBeNull()
      expect(screen.getByTestId("whatsapp-pairing-form")).toBeTruthy()
    })
    expect(screen.getByTestId("whatsapp-real-status-badge").textContent).not.toContain("WhatsApp conectado")
  })

  it("6. Falha de comunicação exibe alerta honesto com botão tentar novamente e nunca finge conexão", async () => {
    const { gw, perfis, snapshot, config } = await baseFixtures()
    const failingActions: WhatsAppPairingActions = {
      async gerarCodigo() {
        throw new Error("Network failure")
      },
      async consultarSituacao() {
        throw new Error("Network failure")
      },
      async cancelarPareamento() {
        throw new Error("Network failure")
      },
      async revogarVinculo() {
        throw new Error("Network failure")
      },
    }

    render(
      React.createElement(AssistantSettingsView, {
        snapshot,
        perfisAutorizados: perfis,
        config,
        gateway: gw,
        pairingActions: failingActions,
        onSaved: vi.fn(),
        pollingIntervalMs: 60_000,
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId("whatsapp-comm-error")).toBeTruthy()
    })
    expect(screen.getByTestId("btn-retry-whatsapp")).toBeTruthy()
    expect(screen.getByTestId("whatsapp-real-status-badge").textContent).not.toContain("WhatsApp conectado")
  })

  it("7. Canal oficial indisponível: NUNCA mostra WhatsApp conectado mesmo se existir vínculo salvo no banco", async () => {
    const { gw, perfis, snapshot, config } = await baseFixtures({
      canalAtivo: false,
      canalFlagLigada: true,
      podeAlterarConexaoReal: false,
      estadoConexao: "CANAL_INATIVO",
      numeroVinculadoMascarado: "+********9000",
      motivoConexaoIndisponivel: "Canal oficial WhatsApp GESTAO inativo em whatsapp_canais.",
      situacaoVinculoInicial: {
        estado: "VINCULADO",
        vinculado: { telefoneMascarado: "+********9000", desde: "2026-11-27T12:00:00.000Z" },
        pendente: null,
        consentimentoVersao: CONSENTIMENTO_WHATSAPP_VERSAO,
        numeroAssistente: null,
      },
    })

    const unavailable = createUnavailableWhatsAppPairingActions("Indisponível.")
    await act(async () => {
      render(
        React.createElement(AssistantSettingsView, {
          snapshot,
          perfisAutorizados: perfis,
          config,
          gateway: gw,
          pairingActions: unavailable,
          onSaved: vi.fn(),
          pollingIntervalMs: 60_000,
        })
      )
    })

    expect(screen.getByTestId("whatsapp-channel-unavailable-banner")).toBeTruthy()
    expect(screen.getByTestId("whatsapp-real-status-badge").textContent).toContain("Canal oficial indisponível")
    expect(screen.getByTestId("whatsapp-real-status-badge").textContent).not.toContain("WhatsApp conectado")
    expect((screen.getByTestId("btn-conectar-whatsapp-disabled") as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByTestId("whatsapp-pairing-form")).toBeNull()
  })
})
