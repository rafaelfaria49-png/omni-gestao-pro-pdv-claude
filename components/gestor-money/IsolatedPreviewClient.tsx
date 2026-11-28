"use client"

import * as React from "react"
import { GestorMoneyApp } from "./GestorMoneyApp"
import { createSyntheticGestorMoneyGateway, type GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import { createSyntheticWhatsAppPairingActions } from "@/lib/gestor-money/whatsapp-pairing"
import type { EstadoVinculoWhatsApp } from "@/lib/gestor-money/contracts"

/**
 * Wrapper exclusivo para `/gestor-money/preview` (não-produção, opt-in `GESTOR_MONEY_ISOLATED_PREVIEW=1`).
 * Permite validar visualmente tanto o estado padrão (canal desligado) quanto os estados de pareamento G007/G008.
 */
export function IsolatedPreviewClient({
  whatsappMode,
}: {
  whatsappMode?: "desligado" | "ativo" | "vinculado" | "expirado" | "bloqueado" | "canal_inativo"
}) {
  const { gateway, pairingActions } = React.useMemo(() => {
    const base = createSyntheticGestorMoneyGateway()
    if (!whatsappMode || whatsappMode === "desligado") {
      return { gateway: base, pairingActions: createSyntheticWhatsAppPairingActions() }
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
        }
      },
    }

    return { gateway: wrappedGateway, pairingActions: pairing }
  }, [whatsappMode])

  return <GestorMoneyApp mode="synthetic" customGateway={gateway} pairingActions={pairingActions} />
}
