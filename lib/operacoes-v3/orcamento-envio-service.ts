import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { operacaoStatusToPrismaStatus } from "@/components/operacoes/lovable/utils/os-status";
import type { EventoTimeline } from "@/types/os";
import { lerComercialV4 } from "@/lib/operacoes-v4/orcamento-pre-os";
import { montarOrcamentoClienteViewV4 } from "@/lib/operacoes-v4/orcamento-cliente-view";
import { montarMensagemOrcamentoV4 } from "@/lib/operacoes-v4/orcamento-mensagem";
import { conteudoOrcamentoV3 } from "./formalizacao-aprovacao-model";
import { mutarPayloadOSV3, type OSPayloadV3 } from "./os-payload-lock";
import { computeTotaisV3, montarEventoEnvioOrcamentoV3, orcamentoRealV3, recalcOrcamentoV3, VALIDADE_PADRAO_DIAS, type CanalEnvioOrcamentoV3 } from "./orcamento-model";
import { compartilhamentosOrcamentoV3, type CompartilhamentoOrcamentoV3, type ConfirmacaoEnvioManualV3 } from "./orcamento-envio-model";
import { fimDoDiaLojaIsoV3, hojeNaLojaV3, somarDiasCivisV3 } from "./datas-operacionais-model";
import { projetarStatusV2, statusOSAposEnviarOrcamento } from "./status-machine";
import { emitirEventoOperacaoV3 } from "./event-publisher";

export async function autorizarEnvioOrcamentoV3(storeId: string, osId: string, api = false) {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para registrar o envio do orçamento.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs && (!api || p.hubs.whatsapp), "Sem permissão para esta ação do orçamento nesta loja.");
  if (!guard.ok) throw new Error(guard.error);
  return { sid, id, operador: { id: session.user.id, nome: (session.user.name || session.user.email || session.user.id).trim() } };
}
type Alvo = Awaited<ReturnType<typeof autorizarEnvioOrcamentoV3>>;

function orcamentoCompartilhavel(payload: OSPayloadV3) {
  const orc = orcamentoRealV3(payload);
  if (!orc) throw new Error("Esta OS ainda não tem orçamento materializado.");
  if (orc.status !== "rascunho" && orc.status !== "enviado") throw new Error(`Não é possível compartilhar um orçamento com status "${orc.status}".`);
  return orc;
}

function conteudoHash(payload: OSPayloadV3): string {
  const orc = orcamentoRealV3(payload)!;
  return createHash("sha256").update(JSON.stringify([
    orc.id, conteudoOrcamentoV3(orc), orc.observacao, orc.validoAte,
    payload.cliente, payload.equipamento?.marca, payload.equipamento?.modelo, payload.equipamento?.defeitoRelatado,
  ])).digest("hex");
}

function evento(alvo: Alvo, conteudo: string, metadata: Record<string, unknown>, enviado = false): EventoTimeline {
  return { id: randomUUID(), tipo: enviado ? "orcamento_enviado" : "observacao", autor: alvo.operador.nome, autorTipo: "usuario", criadoEm: new Date().toISOString(), conteudo, metadata };
}

/** Falha de cache após commit nunca transforma confirmação gravada em tentativa de envio. */
export function revalidarEnvioOrcamentoV3(): boolean {
  try {
    revalidatePath("/dashboard/operacoes-v3");
    revalidatePath("/dashboard/operacoes-v4-preview");
    return false;
  } catch { return true; }
}

export async function prepararCompartilhamentoV3(storeId: string, osId: string, canal: CanalEnvioOrcamentoV3) {
  const alvo = await autorizarEnvioOrcamentoV3(storeId, osId);
  if (!["whatsapp", "impresso", "presencial", "outro"].includes(canal)) throw new Error("Canal de compartilhamento inválido.");
  const result = await mutarPayloadOSV3({ storeId: alvo.sid, osId: alvo.id, mutate: ({ payload }) => {
    const orc = orcamentoCompartilhavel(payload);
    const view = montarOrcamentoClienteViewV4(payload);
    if (!view || (!view.itensFixosVisiveis.length && !view.grupos.length)) throw new Error("Adicione itens visíveis ao orçamento antes de compartilhar.");
    const mensagem = montarMensagemOrcamentoV4(view);
    const envios = compartilhamentosOrcamentoV3(orc);
    if (envios.some((e) => e.estado === "api_em_andamento")) throw new Error("Há um envio pela API sem resultado confirmado. Confira o WhatsApp antes de reenviar.");
    const hash = conteudoHash(payload);
    const existente = envios.find((e) => e.estado === "preparado" && e.canal === canal && e.conteudoHash === hash);
    if (existente) return { payload: null, resultado: { tentativaId: existente.id, mensagem, os: payload } };
    const tentativa: CompartilhamentoOrcamentoV3 = { id: randomUUID(), canal, conteudoHash: hash, totalSnapshot: computeTotaisV3(orc).total, iniciadoEm: new Date().toISOString(), iniciadoPor: alvo.operador, estado: "preparado" };
    const next = { ...payload, orcamento: { ...orc, compartilhamentosV3: [...envios, tentativa] }, timeline: [...(payload.timeline ?? []), evento(alvo, "Compartilhamento do orçamento iniciado; envio ainda não confirmado.", { evento: "orcamento_compartilhamento_iniciado", tentativaId: tentativa.id, canal })] };
    return { payload: next, resultado: { tentativaId: tentativa.id, mensagem, os: next } };
  } });
  revalidarEnvioOrcamentoV3();
  return result;
}

/** Reserva durável ANTES do transporte. Nenhum retry, timeout ou chave nova libera outro envio. */
export async function reservarEnvioApiV3(alvo: Alvo, tentativaId: string, mensagem: string) {
  return mutarPayloadOSV3({ storeId: alvo.sid, osId: alvo.id, mutate: ({ payload }) => {
    const orc = orcamentoCompartilhavel(payload);
    const envios = compartilhamentosOrcamentoV3(orc);
    const tentativa = envios.find((e) => e.id === tentativaId);
    if (!tentativa || tentativa.canal !== "whatsapp" || tentativa.estado !== "preparado") throw new Error("Tentativa já processada ou indisponível. Confira o registro antes de reenviar.");
    if (envios.some((e) => e.estado === "api_em_andamento")) throw new Error("Já existe envio pela API em conferência. Não repita o envio.");
    if (tentativa.conteudoHash !== conteudoHash(payload)) throw new Error("O orçamento mudou. Prepare novamente o compartilhamento.");
    if (montarMensagemOrcamentoV4(montarOrcamentoClienteViewV4(payload)!) !== mensagem) throw new Error("A mensagem mudou. Prepare novamente o compartilhamento.");
    const next = { ...payload, orcamento: { ...orc, compartilhamentosV3: envios.map((e) => e.id === tentativaId ? { ...e, estado: "api_em_andamento" as const } : e) } };
    return { payload: next, resultado: next };
  } });
}

/** Somente código do servidor chama este contrato com o recibo obtido do transporte oficial. */
export async function concluirEnvioOrcamentoV3(alvo: Alvo, tentativaId: string, api?: CompartilhamentoOrcamentoV3["api"], canal?: CanalEnvioOrcamentoV3) {
  const result = await mutarPayloadOSV3({ storeId: alvo.sid, osId: alvo.id, mutate: ({ payload }) => {
    const orc = orcamentoRealV3(payload);
    if (!orc) throw new Error("Orçamento não encontrado.");
    const envios = compartilhamentosOrcamentoV3(orc);
    const tentativa = envios.find((e) => e.id === tentativaId);
    if (!tentativa) throw new Error("Prepare o compartilhamento antes de confirmar o envio.");
    if (canal && tentativa.canal !== canal) throw new Error("Canal diferente do compartilhamento preparado.");
    if (tentativa.estado === "informado_operador" || tentativa.estado === "aceito_api") {
      if (api && tentativa.api?.wamid !== api.wamid) throw new Error("Evidência de API divergente para esta tentativa.");
      return { payload: null, resultado: { os: payload, reenvio: !!tentativa.reenvio, repetido: true, versaoAlterada: false, statusAlterado: false } };
    }
    if (api && (!api.wamid || tentativa.estado !== "api_em_andamento")) throw new Error("Aceite da API sem tentativa reservada.");
    if (!api && tentativa.estado !== "preparado") throw new Error("Envio pela API pendente de conferência. Não registre outra tentativa.");
    if (!api && envios.some((e) => e.estado === "api_em_andamento" && e.id !== tentativaId)) {
      throw new Error("Há outro envio pela API pendente de conferência. Confira o WhatsApp antes de registrar outra tentativa.");
    }
    const versaoAlterada = tentativa.conteudoHash !== conteudoHash(payload);
    if (!api) {
      orcamentoCompartilhavel(payload);
      if (versaoAlterada) throw new Error("O orçamento mudou. Prepare novamente o compartilhamento.");
    }
    const em = api?.aceitoEm ?? new Date().toISOString();
    const reenvio = orc.status === "enviado";
    const evidencia: CompartilhamentoOrcamentoV3 = {
      ...tentativa, estado: api ? "aceito_api" : "informado_operador", confirmadoEm: em,
      confirmadoPor: alvo.operador, natureza: api ? "aceite_api_oficial" : "declaracao_manual", reenvio,
      versaoAlterada,
      ...(api ? { api } : {}),
    };
    const mudaStatus = !versaoAlterada && (orc.status === "rascunho" || orc.status === "enviado");
    const orcamento = recalcOrcamentoV3({ ...orc, compartilhamentosV3: envios.map((e) => e.id === tentativaId ? evidencia : e),
      ...(mudaStatus ? { status: "enviado", enviadoEm: orc.enviadoEm ?? em, validoAte: orc.validoAte ?? fimDoDiaLojaIsoV3(somarDiasCivisV3(hojeNaLojaV3(), VALIDADE_PADRAO_DIAS)) } : {}),
    });
    const comercial = lerComercialV4(payload);
    const proximoStatus = mudaStatus ? statusOSAposEnviarOrcamento(payload.status) : null;
    const statusV2 = proximoStatus ? projetarStatusV2(proximoStatus) : null;
    const next = { ...payload, orcamento, atualizadoEm: em,
      ...(mudaStatus && comercial?.tipo === "orcamento_pre_os" && comercial.statusComercial !== "convertido" ? { comercialV4: { ...comercial, statusComercial: "enviado" } } : {}),
      ...(statusV2 ? { status: statusV2, operacaoStatus: statusV2, operacaoStatusV3: proximoStatus! } : {}),
      timeline: [...(payload.timeline ?? []), evento(alvo, api
        ? `Envio do orçamento aceito pela API oficial.${versaoAlterada ? " Evidência de uma versão anterior; proposta atual preservada." : ""}`
        : "Envio do orçamento informado pelo operador (declaração manual).", {
        ...montarEventoEnvioOrcamentoV3(tentativa.canal, tentativa.totalSnapshot).metadata,
        evento: "orcamento_envio_confirmado", tentativaId, canal: tentativa.canal, natureza: evidencia.natureza,
        operadorId: alvo.operador.id, confirmadoEm: em, reenvio, entregaConfirmada: false,
        ...(api ? { wamid: api.wamid, conversaId: api.conversaId, versaoAlterada } : {}),
      }, true)],
    } as OSPayloadV3;
    return { payload: next, colunas: { valorTotal: orcamento.total, ...(statusV2 ? { status: operacaoStatusToPrismaStatus(statusV2) } : {}) }, resultado: { os: next, reenvio, repetido: false, versaoAlterada, statusAlterado: mudaStatus } };
  } });
  if (result.statusAlterado) emitirEventoOperacaoV3({ tipo: "os_orcamento_criado", os: result.os, storeId: alvo.sid, origem: "orcamento", metadata: { reenvio: result.reenvio, total: result.os.orcamento?.total, validoAte: result.os.orcamento?.validoAte, natureza: api ? "aceite_api_oficial" : "declaracao_manual" } });
  return { ok: true as const, ...result, avisoRegistro: revalidarEnvioOrcamentoV3() };
}

export async function confirmarEnvioManualV3(storeId: string, osId: string, input?: ConfirmacaoEnvioManualV3, canal?: CanalEnvioOrcamentoV3) {
  const alvo = await autorizarEnvioOrcamentoV3(storeId, osId);
  if (input?.confirmado !== true || typeof input.tentativaId !== "string" || !input.tentativaId.trim()) throw new Error("Confirme explicitamente que o envio manual já foi realizado.");
  return concluirEnvioOrcamentoV3(alvo, input.tentativaId, undefined, canal);
}
