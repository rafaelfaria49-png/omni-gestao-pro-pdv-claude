"use server";

import { prisma } from "@/lib/prisma";
import type { OrdemServico } from "@/types/os";
import { CloudApiTextAcceptedError, sendCloudApiTextAndRecord } from "@/lib/whatsapp/whatsapp-service";
import { montarLinkWaV4, montarMensagemOrcamentoV4 } from "@/lib/operacoes-v4/orcamento-mensagem";
import { montarOrcamentoClienteViewV4 } from "@/lib/operacoes-v4/orcamento-cliente-view";
import { orcamentoRealV3, type CanalEnvioOrcamentoV3 } from "./orcamento-model";
import { compartilhamentosOrcamentoV3, type ConfirmacaoEnvioManualV3 } from "./orcamento-envio-model";
import { autorizarEnvioOrcamentoV3, confirmarEnvioManualV3, concluirEnvioOrcamentoV3, prepararCompartilhamentoV3, reservarEnvioApiV3 } from "./orcamento-envio-service";

export interface EnviarOrcamentoPorCanalResultV3 {
  ok: boolean;
  reenvio?: boolean;
  avisoRegistro?: boolean;
  aceitoApi?: boolean;
  pendente?: boolean;
  wamid?: string;
  aviso?: string;
  os?: OrdemServico;
}
export type EntradaEnvioOrcamentoV3 = ConfirmacaoEnvioManualV3 & { modo?: "manual" | "api" | "recuperar_api" };

/** Preparação auditada: não altera status comercial, OS, enviadoEm ou validade. */
export async function prepararCompartilhamentoOrcamentoV3(storeId: string, osId: string, canal: CanalEnvioOrcamentoV3) {
  return prepararCompartilhamentoV3(storeId, osId, canal);
}

/** A chamada antiga, sem declaração explícita, agora falha fechada. Nunca significa transporte. */
export async function enviarOrcamentoPorCanalV3(storeId: string, osId: string, canal: CanalEnvioOrcamentoV3, input?: EntradaEnvioOrcamentoV3): Promise<EnviarOrcamentoPorCanalResultV3> {
  if (!input || input.confirmado !== true || typeof input.tentativaId !== "string" || !input.tentativaId.trim()) {
    throw new Error("Confirme explicitamente o envio manual ou solicite o envio pela API oficial.");
  }
  if (input.modo !== undefined && !["manual", "api", "recuperar_api"].includes(input.modo)) throw new Error("Natureza de envio inválida.");
  const api = input.modo === "api" || input.modo === "recuperar_api";
  const alvo = await autorizarEnvioOrcamentoV3(storeId, osId, api);
  const row = await prisma.ordemServico.findFirst({ where: { id: alvo.id, storeId: alvo.sid }, select: { payload: true } });
  const os = row?.payload as unknown as OrdemServico | undefined;
  const orc = os && orcamentoRealV3(os);
  if (!orc) throw new Error("Esta OS ainda não tem orçamento materializado.");
  const tentativa = compartilhamentosOrcamentoV3(orc).find((e) => e.id === input.tentativaId);
  if (!tentativa || tentativa.canal !== canal) throw new Error("Tentativa de compartilhamento não encontrada neste canal e loja.");
  if (!api) return confirmarEnvioManualV3(alvo.sid, alvo.id, input);
  if (canal !== "whatsapp") throw new Error("A API oficial está disponível apenas para WhatsApp.");
  if (tentativa.estado === "aceito_api") {
    return { ...await concluirEnvioOrcamentoV3(alvo, tentativa.id, tentativa.api), aceitoApi: true, wamid: tentativa.api?.wamid };
  }
  if (input.modo === "recuperar_api") {
    // A evidência vem de uma linha escrita pelo transporte oficial; nunca de um wamid declarado pelo cliente.
    const mensagem = await prisma.whatsAppMessage.findFirst({ where: {
      storeId: alvo.sid, direction: "outbound",
      payload: { path: ["orcamentoV3", "tentativaId"], equals: tentativa.id },
    }, select: { externalMessageId: true, conversationId: true, payload: true } });
    const p = mensagem?.payload as { cloud?: { wamid?: string; aceitoEm?: string }; orcamentoV3?: { osId?: string } } | null;
    if (!mensagem?.externalMessageId || p?.cloud?.wamid !== mensagem.externalMessageId || p.orcamentoV3?.osId !== alvo.id || !p.cloud.aceitoEm) {
      return { ok: false, pendente: true, aviso: "Ainda não há recibo oficial recuperável. Confira a conversa antes de qualquer novo envio." };
    }
    return { ...await concluirEnvioOrcamentoV3(alvo, tentativa.id, { wamid: mensagem.externalMessageId, conversaId: mensagem.conversationId, aceitoEm: p.cloud.aceitoEm }), aceitoApi: true, wamid: mensagem.externalMessageId };
  }
  if (tentativa.estado !== "preparado") return { ok: false, pendente: true, aviso: "Tentativa já iniciada. Confira ou recupere o registro; a mensagem não será enviada novamente." };
  const view = montarOrcamentoClienteViewV4(os!);
  if (!view) throw new Error("Orçamento sem projeção para o cliente.");
  const texto = montarMensagemOrcamentoV4(view);
  const link = montarLinkWaV4(os!.cliente?.telefone || os!.cliente?.whatsapp, texto);
  if (!link.valido) throw new Error(link.motivo);
  const telefone = new URL(link.url).pathname.slice(1);
  const conversa = await prisma.whatsAppConversation.findFirst({
    where: { storeId: alvo.sid, contact: { storeId: alvo.sid, phoneDigits: telefone } },
    orderBy: { updatedAt: "desc" }, select: { id: true },
  });
  if (!conversa) throw new Error("Não há conversa deste cliente no WhatsApp da loja. Use o compartilhamento manual.");
  let reservado = false;
  let concluido: Awaited<ReturnType<typeof concluirEnvioOrcamentoV3>> | undefined;
  try {
    const res = await sendCloudApiTextAndRecord(alvo.sid, conversa.id, texto, {
      orcamento: { osId: alvo.id, tentativaId: tentativa.id },
      beforeSend: async () => { await reservarEnvioApiV3(alvo, tentativa.id, texto); reservado = true; },
      onAccepted: async (receipt) => { concluido = await concluirEnvioOrcamentoV3(alvo, tentativa.id, receipt); },
    });
    return { ...concluido!, aceitoApi: true, wamid: res.wamid,
      ...(concluido?.versaoAlterada ? { aviso: "API aceitou uma versão anterior. A proposta atual foi preservada; revise antes de compartilhar novamente." } : {}),
    };
  } catch (e) {
    if (e instanceof CloudApiTextAcceptedError) {
      if (!concluido) {
        try { concluido = await concluirEnvioOrcamentoV3(alvo, tentativa.id, e.receipt); } catch { /* Recibo retornado; reserva durável impede retry do transporte. */ }
      }
      return { ...(concluido ?? { ok: false }), aceitoApi: true, pendente: !concluido, avisoRegistro: true, wamid: e.receipt.wamid,
        aviso: concluido ? "API aceitou o envio. O histórico do WhatsApp precisa de conferência; não reenvie." : "API aceitou o envio. Guarde o identificador e recupere o registro; não reenvie." };
    }
    if (!reservado) throw e;
    return { ok: false, pendente: true, aviso: "A tentativa pela API ficou sem resultado confirmado. Confira o WhatsApp e recupere o registro antes de reenviar." };
  }
}
