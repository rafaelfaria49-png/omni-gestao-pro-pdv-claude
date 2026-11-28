// @vitest-environment jsdom
import * as React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  MultimodalAssistantPanel,
  type MultimodalAnalyzerFn,
} from "@/components/gestor-money/MultimodalAssistantPanel"
import type {
  AnaliseMultimodalResultado,
  AssistenteWhatsAppConfig,
} from "@/lib/gestor-money/contracts"
import { createSyntheticGestorMoneyGateway } from "@/lib/gestor-money/gateway"

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
  vi.restoreAllMocks()
})

async function buildFixtures(configOverride?: Partial<AssistenteWhatsAppConfig>) {
  const gateway = createSyntheticGestorMoneyGateway()
  const perfis = await gateway.listarPerfis()
  const pessoal = perfis.find((p) => p.tipo === "PESSOAL")!
  const seletor = { tipo: "PESSOAL" as const, perfilId: pessoal.perfilId }
  const snapshot = (await gateway.obterSnapshot(seletor))!
  const baseConfig = await gateway.obterAssistenteConfig(seletor)
  const config: AssistenteWhatsAppConfig = {
    ...baseConfig,
    multimodal: {
      audioG009: {
        providerId: "OPENAI_WHISPER",
        providerConfigurado: true,
        processamentoDisponivel: true,
        homologacaoConcluida: false,
        canalOficialDisponivel: false,
      },
      documentoG010: {
        providerId: "OPENAI_VISION",
        providerConfigurado: true,
        processamentoDisponivel: true,
        homologacaoConcluida: false,
        canalOficialDisponivel: false,
      },
      storagePermanenteG003: {
        disponivel: false,
        privacidadeComprovada: false,
        motivo:
          "Gate G003-STORAGE desligado neste ambiente. Processamento temporário apenas.",
      },
    },
    ...configOverride,
  }
  return { gateway, snapshot, config }
}

describe("MultimodalAssistantPanel — G009 Áudio & G010 Comprovantes (honestidade + confirmação explícita)", () => {
  it("1. Estado indisponível / fail-closed: desabilita inputs e exibe os 4 eixos honestos separadamente", async () => {
    const { gateway, snapshot, config } = await buildFixtures({
      multimodal: {
        audioG009: {
          providerId: "INDISPONIVEL",
          providerConfigurado: false,
          processamentoDisponivel: false,
          homologacaoConcluida: false,
          canalOficialDisponivel: false,
          motivoIndisponivel: "OPENAI_API_KEY não configurada no ambiente.",
        },
        documentoG010: {
          providerId: "INDISPONIVEL",
          providerConfigurado: false,
          processamentoDisponivel: false,
          homologacaoConcluida: false,
          canalOficialDisponivel: false,
          motivoIndisponivel: "OPENAI_API_KEY não configurada no ambiente.",
        },
        storagePermanenteG003: {
          disponivel: false,
          privacidadeComprovada: false,
          motivo: "Gate G003-STORAGE desligado (fail-closed).",
        },
      },
    })

    render(
      React.createElement(MultimodalAssistantPanel, {
        snapshot,
        config,
        gateway,
        onSaved: vi.fn(),
      })
    )

    const audioCard = screen.getByTestId("multimodal-status-audio")
    const docCard = screen.getByTestId("multimodal-status-documento")

    for (const card of [audioCard, docCard]) {
      expect(card.textContent).toContain("Provider configurado")
      expect(card.textContent).toContain("Não")
      expect(card.textContent).toContain("Processamento disponível")
      expect(card.textContent).toContain("Indisponível")
      expect(card.textContent).toContain("Homologação concluída")
      expect(card.textContent).toContain("Não homologado")
      expect(card.textContent).toContain("Canal oficial disponível")
    }

    expect((screen.getByTestId("input-multimodal-audio") as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId("input-multimodal-documento") as HTMLInputElement).disabled).toBe(
      true
    )
    expect(screen.getByTestId("multimodal-status-storage").textContent).toContain(
      "Bloqueado · Processamento temporário"
    )
  })

  it("2. Análise de áudio -> proposta editável (ZERO escrita antes de confirmar) -> confirmação explícita invoca gateway.registrarDespesa", async () => {
    const { gateway, snapshot, config } = await buildFixtures()
    const spyDespesa = vi.spyOn(gateway, "registrarDespesa")
    const spyDivida = vi.spyOn(gateway, "registrarDivida")
    const onSaved = vi.fn()

    let resolveAnalise!: (value: AnaliseMultimodalResultado) => void
    const analisarMidia: MultimodalAnalyzerFn = vi.fn(
      () =>
        new Promise<AnaliseMultimodalResultado>((resolve) => {
          resolveAnalise = resolve
        })
    )

    render(
      React.createElement(MultimodalAssistantPanel, {
        snapshot,
        config,
        gateway,
        onSaved,
        analisarMidia,
      })
    )

    const audioFile = new File([new Uint8Array([0x4f, 0x67, 0x67, 0x53])], "gasto-mercado.ogg", {
      type: "audio/ogg",
    })
    fireEvent.change(screen.getByTestId("input-multimodal-audio"), {
      target: { files: [audioFile] },
    })

    // Indicador de processamento visível enquanto analisa
    expect(screen.getByTestId("multimodal-processing")).toBeTruthy()

    resolveAnalise({
      tipo: "audio",
      provedor: "OPENAI_WHISPER",
      homologado: false,
      sha256: "abc123",
      mimeReal: "audio/ogg",
      tamanhoBytes: 4,
      transcricao: "Gastei 180 reais no mercado pelo Pix no Nubank hoje.",
      resumoTranscricao: "Gastei 180 reais no mercado pelo Pix no Nubank hoje.",
      baixaConfianca: false,
      avisoHonestidade:
        "Transcrição de áudio concluída apenas como proposta editável — nada foi registrado automaticamente.",
      avisosAdicionais: ["Armazenamento permanente (G003-STORAGE) indisponível."],
      proposta: {
        naturezaSugerida: "DESPESA",
        descricao: "Supermercado",
        valorCentavos: "18000",
        data: "2026-11-27",
        vencimento: null,
        formaPagamento: "pix",
        contraparte: "Mercado Central",
        contaSugeridaNome: "Nubank",
        categoriaSugeridaNome: "Supermercado",
      },
      candidatosDuplicidade: [],
      storagePermanenteDisponivel: false,
      storagePermanenteMotivo: "Gate G003-STORAGE desligado.",
    })

    await waitFor(() => {
      expect(screen.getByTestId("multimodal-proposal-card")).toBeTruthy()
    })

    // Regra inegociável: análise sozinha JAMAIS executa escrita financeira!
    expect(spyDespesa).not.toHaveBeenCalled()
    expect(spyDivida).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()

    // Edita descrição e valor exato antes de confirmar explicitamente
    fireEvent.change(screen.getByTestId("input-multimodal-descricao"), {
      target: { value: "Compra semanal Supermercado" },
    })
    fireEvent.change(screen.getByTestId("input-multimodal-valor"), {
      target: { value: "189,50" },
    })

    fireEvent.click(screen.getByTestId("btn-multimodal-confirmar"))

    await waitFor(() => {
      expect(spyDespesa).toHaveBeenCalledTimes(1)
    })

    const [, payload] = spyDespesa.mock.calls[0]
    expect(payload.descricao).toBe("Compra semanal Supermercado")
    expect(payload.valorCentavos).toBe("18950")
    expect(payload.pagoAgora).toBe(true)
    expect(payload.formaPagamento).toBe("pix")
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved.mock.calls[0][0].contratoG004).toBe("GASTO_PAGO")
  })

  it("3. Comprovante com candidato de duplicidade: clicar 'Vincular ao lançamento existente' cria ZERO escrita financeira e exibe status honesto de G003-STORAGE", async () => {
    const { gateway, snapshot, config } = await buildFixtures()
    const spyDespesa = vi.spyOn(gateway, "registrarDespesa")
    const spyDivida = vi.spyOn(gateway, "registrarDivida")
    const onSaved = vi.fn()

    const createObjectURL = vi.fn(() => "blob:mock-receipt-preview")
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { writable: true, value: createObjectURL })
    Object.defineProperty(URL, "revokeObjectURL", { writable: true, value: revokeObjectURL })

    const analisarMidia: MultimodalAnalyzerFn = vi.fn(async (): Promise<AnaliseMultimodalResultado> => ({
      tipo: "documento",
      provedor: "OPENAI_VISION",
      homologado: false,
      sha256: "doc-dup-sha256",
      mimeReal: "image/png",
      tamanhoBytes: 512,
      tipoDocumento: "COMPROVANTE_PIX",
      efeitoFinanceiro: "COMPROVANTE_PAGAMENTO_DECLARADO",
      legibilidade: "LEGIVEL",
      textoResumo: "Comprovante Pix de R$ 249,90 para Distribuidora Tech.",
      avisoHonestidade:
        "Identifiquei um comprovante de pagamento (Pix) — confira os dados; um comprovante sozinho não substitui confirmação bancária autenticada.",
      avisosAdicionais: [
        "Processamento temporário apenas: G003-STORAGE bloqueado neste ambiente.",
      ],
      proposta: {
        naturezaSugerida: "DESPESA",
        descricao: "Pix Distribuidora Tech",
        valorCentavos: "24990",
        data: "2026-11-27",
        vencimento: null,
        formaPagamento: "pix",
        contraparte: "Distribuidora Tech",
        contaSugeridaNome: null,
        categoriaSugeridaNome: null,
      },
      candidatosDuplicidade: [
        {
          alvoTipo: "MOVIMENTACAO",
          alvoId: "mov-existente-01",
          descricao: "Pix Distribuidora Tech",
          valorCentavos: "24990",
          data: "2026-11-27",
          contraparte: "Distribuidora Tech",
          motivo: "MESMO_ID_TRANSACAO",
          correspondenciaExata: true,
        },
      ],
      storagePermanenteDisponivel: false,
      storagePermanenteMotivo:
        "Gate G003-STORAGE bloqueado neste ambiente (somente processamento temporário).",
    }))

    const { unmount } = render(
      React.createElement(MultimodalAssistantPanel, {
        snapshot,
        config,
        gateway,
        onSaved,
        analisarMidia,
      })
    )

    const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "pix-dup.png", {
      type: "image/png",
    })
    fireEvent.change(screen.getByTestId("input-multimodal-documento"), {
      target: { files: [pngFile] },
    })

    await waitFor(() => {
      expect(screen.getByTestId("multimodal-duplicate-alert")).toBeTruthy()
    })
    expect(screen.getByTestId("multimodal-doc-preview")).toBeTruthy()
    expect(createObjectURL).toHaveBeenCalledTimes(1)

    // Botão confirmar permanece travado enquanto duplicidade não for decidida
    expect((screen.getByTestId("btn-multimodal-confirmar") as HTMLButtonElement).disabled).toBe(
      true
    )

    fireEvent.click(screen.getByTestId("btn-multimodal-vincular"))

    await waitFor(() => {
      expect(screen.getByTestId("multimodal-linked-feedback")).toBeTruthy()
    })

    const feedbackText = screen.getByTestId("multimodal-linked-feedback").textContent ?? ""
    expect(feedbackText).toContain("sem criar despesa duplicada")
    expect(feedbackText).toContain("G003-STORAGE")

    // ZERO escrita financeira criada ao vincular!
    expect(spyDespesa).not.toHaveBeenCalled()
    expect(spyDivida).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-receipt-preview")
  })

  it("4. Falha do provedor exibe banner de erro honesto e botão 'Tentar novamente' recupera para proposta editável", async () => {
    const { gateway, snapshot, config } = await buildFixtures()
    const spyDespesa = vi.spyOn(gateway, "registrarDespesa")
    const spyDivida = vi.spyOn(gateway, "registrarDivida")

    let tentativa = 0
    const analisarMidia: MultimodalAnalyzerFn = vi.fn(async (): Promise<AnaliseMultimodalResultado> => {
      tentativa += 1
      if (tentativa === 1) {
        throw new Error("Serviço de leitura temporariamente indisponível. Nada foi registrado.")
      }
      return {
        tipo: "documento",
        provedor: "OPENAI_VISION",
        homologado: false,
        sha256: "pdf-ok-sha256",
        mimeReal: "application/pdf",
        tamanhoBytes: 1024,
        paginasPdf: 1,
        tipoDocumento: "BOLETO",
        efeitoFinanceiro: "OBRIGACAO_NAO_PAGA",
        legibilidade: "LEGIVEL",
        textoResumo: "Boleto Energia Elétrica R$ 310,00.",
        avisoHonestidade:
          "Identifiquei um boleto/conta a pagar — este documento representa uma obrigação e não comprova pagamento.",
        avisosAdicionais: [],
        proposta: {
          naturezaSugerida: "DIVIDA",
          descricao: "Boleto Energia Elétrica",
          valorCentavos: "31000",
          data: "2026-11-27",
          vencimento: "2026-12-05",
          formaPagamento: "boleto",
          contraparte: "Concessionária Energia",
          contaSugeridaNome: null,
          categoriaSugeridaNome: "Energia",
        },
        candidatosDuplicidade: [],
        storagePermanenteDisponivel: false,
        storagePermanenteMotivo: "Gate G003-STORAGE bloqueado.",
      }
    })

    const onSaved = vi.fn()
    render(
      React.createElement(MultimodalAssistantPanel, {
        snapshot,
        config,
        gateway,
        onSaved,
        analisarMidia,
      })
    )

    const pdfFile = new File(["%PDF-1.4"], "boleto-energia.pdf", {
      type: "application/pdf",
    })
    fireEvent.change(screen.getByTestId("input-multimodal-documento"), {
      target: { files: [pdfFile] },
    })

    await waitFor(() => {
      expect(screen.getByTestId("multimodal-error-banner")).toBeTruthy()
    })
    expect(screen.getByTestId("multimodal-error-banner").textContent).toContain(
      "temporariamente indisponível"
    )
    expect(spyDespesa).not.toHaveBeenCalled()
    expect(spyDivida).not.toHaveBeenCalled()

    // Clica em tentar novamente -> recupera e exibe proposta DIVIDA
    fireEvent.click(screen.getByTestId("btn-multimodal-retry"))

    await waitFor(() => {
      expect(screen.getByTestId("multimodal-proposal-card")).toBeTruthy()
    })
    expect(screen.queryByTestId("multimodal-error-banner")).toBeNull()
    expect(
      (screen.getByTestId("select-multimodal-natureza") as HTMLSelectElement).value
    ).toBe("DIVIDA")

    // Confirma explicitamente como conta a pagar / dívida (G004 CONTA_PAGAR)
    fireEvent.click(screen.getByTestId("btn-multimodal-confirmar"))
    await waitFor(() => {
      expect(spyDivida).toHaveBeenCalledTimes(1)
    })
    expect(spyDivida.mock.calls[0][1].valorOriginalCentavos).toBe("31000")
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved.mock.calls[0][0].contratoG004).toBe("CONTA_PAGAR")
  })
})
