"use client"

import * as React from "react"
import { GestorMoneyApp } from "./GestorMoneyApp"
import {
  MultimodalAnalyzerProvider,
  type MultimodalAnalyzerFn,
} from "./MultimodalAssistantPanel"
import { createSyntheticGestorMoneyGateway, type GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import {
  createSyntheticWhatsAppPairingActions,
  createUnavailableWhatsAppPairingActions,
} from "@/lib/gestor-money/whatsapp-pairing"
import type {
  AnaliseMultimodalResultado,
  DiagnosticoMultimodalUI,
  EstadoVinculoWhatsApp,
} from "@/lib/gestor-money/contracts"
import { hojeSaoPaulo } from "@/lib/gestor-money/money"

function criarDiagnosticoMultimodalPreview(
  multimodalAtivo: boolean,
  canalAtivo: boolean
): DiagnosticoMultimodalUI {
  if (!multimodalAtivo) {
    return {
      audioG009: {
        providerId: "INDISPONIVEL",
        providerConfigurado: false,
        processamentoDisponivel: false,
        homologacaoConcluida: false,
        canalOficialDisponivel: canalAtivo,
        motivoIndisponivel:
          "Provider de transcrição (G009) indisponível neste modo de pré-visualização.",
      },
      documentoG010: {
        providerId: "INDISPONIVEL",
        providerConfigurado: false,
        processamentoDisponivel: false,
        homologacaoConcluida: false,
        canalOficialDisponivel: canalAtivo,
        motivoIndisponivel:
          "Provider de leitura de documentos (G010) indisponível neste modo de pré-visualização.",
      },
      storagePermanenteG003: {
        disponivel: false,
        privacidadeComprovada: false,
        motivo:
          "Ambiente sintético isolado: processamento temporário apenas; storage permanente privado G003-STORAGE bloqueado.",
      },
    }
  }

  return {
    audioG009: {
      providerId: "SIMULADO",
      providerConfigurado: true,
      processamentoDisponivel: true,
      homologacaoConcluida: false,
      canalOficialDisponivel: canalAtivo,
    },
    documentoG010: {
      providerId: "SIMULADO",
      providerConfigurado: true,
      processamentoDisponivel: true,
      homologacaoConcluida: false,
      canalOficialDisponivel: canalAtivo,
    },
    storagePermanenteG003: {
      disponivel: false,
      privacidadeComprovada: false,
      motivo:
        "Ambiente sintético isolado: arquivos são processados temporariamente sem arquivamento permanente no R2 (G003-STORAGE bloqueado).",
    },
  }
}

function criarAnalisadorPreviewDeterministico(): MultimodalAnalyzerFn {
  return async ({ tipo, file, legenda }): Promise<AnaliseMultimodalResultado> => {
    const lower = file.name.toLowerCase()
    const hoje = hojeSaoPaulo()

    if (lower.includes("erro") || lower.includes("falha")) {
      throw new Error(
        "Falha simulada no provedor multimodal (preview). Tente novamente ou informe manualmente."
      )
    }

    if (tipo === "audio") {
      return {
        tipo: "audio",
        provedor: "SIMULADO",
        homologado: false,
        sha256: "preview-audio-sha256",
        mimeReal: file.type || "audio/ogg",
        tamanhoBytes: file.size || 2048,
        duracaoSegundos: 9,
        transcricao:
          legenda?.trim() || "Paguei 185 reais no mercado pelo Pix no Nubank hoje.",
        resumoTranscricao:
          legenda?.trim() || "Paguei 185 reais no mercado pelo Pix no Nubank hoje.",
        baixaConfianca: false,
        avisoHonestidade:
          "Transcrição simulada em ambiente isolado — nada foi registrado automaticamente no financeiro.",
        avisosAdicionais: [
          "Áudio processado temporariamente em memória; armazenamento permanente (G003-STORAGE) bloqueado.",
        ],
        proposta: {
          naturezaSugerida: "DESPESA",
          descricao: "Supermercado (áudio)",
          valorCentavos: "18500",
          data: hoje,
          vencimento: null,
          formaPagamento: "pix",
          contraparte: "Supermercado Central",
          contaSugeridaNome: "Nubank",
          categoriaSugeridaNome: "Supermercado",
        },
        candidatosDuplicidade: [],
        storagePermanenteDisponivel: false,
        storagePermanenteMotivo:
          "Ambiente sintético isolado: G003-STORAGE indisponível para arquivamento permanente.",
      }
    }

    const ehDuplicado = lower.includes("dup")
    const ehBoleto = lower.includes("boleto") || file.type === "application/pdf"

    return {
      tipo: "documento",
      provedor: "SIMULADO",
      homologado: false,
      sha256: ehDuplicado ? "preview-doc-dup-sha256" : "preview-doc-sha256",
      mimeReal: file.type || "image/png",
      tamanhoBytes: file.size || 4096,
      ...(file.type === "application/pdf" ? { paginasPdf: 1 } : {}),
      tipoDocumento: ehBoleto ? "BOLETO" : "COMPROVANTE_PIX",
      efeitoFinanceiro: ehBoleto ? "OBRIGACAO_NAO_PAGA" : "COMPROVANTE_PAGAMENTO_DECLARADO",
      legibilidade: "LEGIVEL",
      textoResumo: ehBoleto
        ? "Boleto Fornecedor Peças Express no valor de R$ 420,00."
        : "Comprovante Pix de R$ 249,90 para Distribuidora Tech.",
      avisoHonestidade: ehBoleto
        ? "Identifiquei um boleto/conta a pagar — este documento representa uma obrigação e não comprova pagamento."
        : "Identifiquei um comprovante de pagamento (Pix/recibo/bancário) — confira os dados; um comprovante sozinho não substitui confirmação bancária autenticada.",
      avisosAdicionais: [
        "Processamento temporário apenas: o arquivo não foi arquivado permanentemente (G003-STORAGE bloqueado).",
      ],
      proposta: {
        naturezaSugerida: ehBoleto ? "DIVIDA" : "DESPESA",
        descricao: ehBoleto ? "Boleto Fornecedor Peças Express" : "Pix Distribuidora Tech",
        valorCentavos: ehBoleto ? "42000" : "24990",
        data: hoje,
        vencimento: ehBoleto ? hoje : null,
        formaPagamento: ehBoleto ? "boleto" : "pix",
        contraparte: ehBoleto ? "Peças Express" : "Distribuidora Tech",
        contaSugeridaNome: "Nubank",
        categoriaSugeridaNome: "Fornecedores",
      },
      candidatosDuplicidade: ehDuplicado
        ? [
            {
              alvoTipo: "MOVIMENTACAO",
              alvoId: "mov-preview-dup-1",
              descricao: "Pix Distribuidora Tech",
              valorCentavos: "24990",
              data: hoje,
              contraparte: "Distribuidora Tech",
              motivo: "CORRESPONDENCIA_APROXIMADA",
              correspondenciaExata: false,
            },
          ]
        : [],
      storagePermanenteDisponivel: false,
      storagePermanenteMotivo:
        "Ambiente sintético isolado: G003-STORAGE indisponível para arquivamento permanente.",
    }
  }
}

/**
 * Wrapper exclusivo para `/gestor-money/preview` (não-produção, opt-in `GESTOR_MONEY_ISOLATED_PREVIEW=1`).
 * Permite validar visualmente tanto o estado padrão (canal desligado) quanto os estados de pareamento G007/G008
 * e o fluxo multimodal G009/G010 (`?multimodal=ativo|indisponivel`).
 */
export function IsolatedPreviewClient({
  whatsappMode,
  multimodalMode = "indisponivel",
}: {
  whatsappMode?: "desligado" | "ativo" | "vinculado" | "expirado" | "bloqueado" | "canal_inativo"
  multimodalMode?: "ativo" | "indisponivel"
}) {
  const multimodalAtivo = multimodalMode === "ativo"

  const { gateway, pairingActions, previewAnalyzer } = React.useMemo(() => {
    const base = createSyntheticGestorMoneyGateway()
    const analyzer = multimodalAtivo ? criarAnalisadorPreviewDeterministico() : null

    if (!whatsappMode || whatsappMode === "desligado") {
      const wrappedBase: GestorMoneyGateway = {
        ...base,
        async obterAssistenteConfig(seletor) {
          const cfg = await base.obterAssistenteConfig(seletor)
          return {
            ...cfg,
            multimodal: criarDiagnosticoMultimodalPreview(multimodalAtivo, false),
          }
        },
      }
      return {
        gateway: wrappedBase,
        pairingActions: createUnavailableWhatsAppPairingActions(),
        previewAnalyzer: analyzer,
      }
    }

    const estadoInicial: EstadoVinculoWhatsApp =
      whatsappMode === "vinculado"
        ? "VINCULADO"
        : whatsappMode === "expirado"
          ? "EXPIRADO"
          : whatsappMode === "bloqueado"
            ? "BLOQUEADO"
            : "SEM_VINCULO"

    const pairing = createSyntheticWhatsAppPairingActions({
      estadoInicial,
      numeroAssistente: "+5511999990001",
      telefoneVinculadoInicial: "+5511988887777",
    })

    const canalAtivo = whatsappMode !== "canal_inativo"
    const wrappedGateway: GestorMoneyGateway = {
      ...base,
      async obterAssistenteConfig(seletor) {
        const cfg = await base.obterAssistenteConfig(seletor)
        const sit = await pairing.consultarSituacao()
        const dados = sit.ok ? sit.dados : null
        const conectado = canalAtivo && dados?.estado === "VINCULADO"
        return {
          ...cfg,
          canalAtivo,
          canalFlagLigada: true,
          workerFilaAtivo: canalAtivo,
          podeAlterarConexaoReal: canalAtivo,
          estadoConexao: !canalAtivo
            ? "CANAL_INATIVO"
            : conectado
              ? "ATIVO"
              : "AGUARDANDO_VINCULO",
          estadoDescricao: !canalAtivo
            ? "Canal oficial WhatsApp GESTAO indisponível em whatsapp_canais (simulação isolada)."
            : conectado
              ? `WhatsApp vinculado e conectado no canal oficial GESTAO (${dados?.vinculado?.telefoneMascarado ?? ""}).`
              : "Canal oficial WhatsApp GESTAO ativo (ambiente sintético isolado). Informe seu telefone e aceite o consentimento para testar o fluxo de pareamento.",
          numeroVinculadoMascarado: dados?.vinculado?.telefoneMascarado ?? null,
          motivoConexaoIndisponivel: canalAtivo
            ? null
            : "Canal oficial WhatsApp GESTAO inativo em whatsapp_canais.",
          situacaoVinculoInicial: dados,
          alinhamentoG007: {
            principalAutorizadoAtual: conectado ? "VINCULO_TELEFONE_G007" : "SESSAO_WEB",
            verificadorVinculoDisponivel: true,
            canalGestaoRegistrado: canalAtivo,
            canalVersao: canalAtivo ? 1 : null,
            motorConversacionalPr417: canalAtivo ? "ATIVO" : "DORMENTE_PR_417",
            homologacoes: {
              whatsappOficial: canalAtivo,
              audioStt: false,
              imagemOcr: false,
            },
          },
          multimodal: criarDiagnosticoMultimodalPreview(multimodalAtivo, canalAtivo),
        }
      },
    }

    return { gateway: wrappedGateway, pairingActions: pairing, previewAnalyzer: analyzer }
  }, [whatsappMode, multimodalAtivo])

  return (
    <MultimodalAnalyzerProvider analyzer={previewAnalyzer}>
      <GestorMoneyApp mode="synthetic" customGateway={gateway} pairingActions={pairingActions} />
    </MultimodalAnalyzerProvider>
  )
}
