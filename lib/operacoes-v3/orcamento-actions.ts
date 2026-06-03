"use server";

// ============================================================================
// Operações V3 — Fase 1C · write-path de ORÇAMENTO (side-effect-free)
// ----------------------------------------------------------------------------
// Grava SOMENTE estrutura de orçamento + status do orçamento + status da OS
// (via máquina única) + timeline + histórico de versões. NÃO toca Financeiro
// (Conta a Receber), estoque, garantia, WhatsApp. Não usa `approveOrcamento`/
// `rejectOrcamento` do V2 (que materializam/cancelam cobrança).
//
//   • gerarOrcamentoDaOS  — REUSO do @/api/os (materializa rascunho; seguro).
//   • salvarOrcamentoV3   — edita itens/desconto/brindes + histórico de versão.
//   • enviarOrcamentoV3   — rascunho/enviado → enviado (+ OS → aguardando_aprovacao).
//   • aprovarOrcamentoV3  — → aprovado (+ OS → aprovado pela máquina). Sem financeiro.
//   • recusarOrcamentoV3  — → recusado (+ timeline). Sem outros efeitos.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, EventoTipo, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { operacaoStatusToPrismaStatus } from "@/components/operacoes/lovable/utils/os-status";
import {
  projetarStatusV2,
  statusOSAposAprovarOrcamento,
  statusOSAposEnviarOrcamento,
  type OperacaoStatusV3,
} from "./status-machine";
import { gerarOrcamentoDaOS as gerarOrcamentoDaOSImpl } from "@/api/os";
import {
  computeTotaisV3,
  recalcOrcamentoV3,
  type OrcamentoV3,
  type OrcamentoVersaoV3,
  type SalvarOrcamentoV3Input,
} from "./orcamento-model";

/** Materializa o rascunho a partir dos itens da OS (reuso seguro do @/api/os). */
export async function gerarOrcamentoDaOS(storeId: string, osId: string): Promise<OrdemServico> {
  return gerarOrcamentoDaOSImpl(storeId, osId);
}

const VALIDADE_PADRAO_DIAS = 7;

function nowIso(): string {
  return new Date().toISOString();
}
function eventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ev_${Date.now()}`;
}
function operadorLabel(session: Session | null): string {
  const u = session?.user;
  return (u?.name || u?.email || "Você").trim() || "Você";
}
function makeEvento(tipo: EventoTipo, autor: string, conteudo: string, metadata?: Record<string, unknown>): EventoTimeline {
  return { id: eventId(), tipo, autor, autorTipo: "usuario", conteudo, metadata, criadoEm: nowIso() };
}

type OSPayloadFull = OrdemServico & Record<string, unknown>;

async function carregar(storeId: string, osId: string): Promise<{ sid: string; id: string; session: Session | null; payload: OSPayloadFull }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para editar o orçamento.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para editar o orçamento desta OS.");
  if (!guard.ok) throw new Error(guard.error);

  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  return { sid, id, session, payload };
}

function orcamentoEditavel(payload: OSPayloadFull): OrcamentoV3 {
  const orc = payload.orcamento as (OrcamentoV3 & { sintetizado?: boolean }) | undefined;
  if (!orc || typeof orc !== "object") throw new Error("Esta OS ainda não tem orçamento. Gere o orçamento da OS primeiro.");
  if (orc.sintetizado === true) throw new Error("O orçamento ainda é uma prévia. Gere o orçamento da OS para materializá-lo.");
  return orc;
}

function assertStatus(orc: OrcamentoV3, permitidos: OrcamentoV3["status"][], acao: string): void {
  if (!permitidos.includes(orc.status)) {
    throw new Error(`Não é possível ${acao} um orçamento com status "${orc.status}".`);
  }
}

async function gravar(
  sid: string,
  id: string,
  payload: OSPayloadFull,
  next: { orcamento: OrcamentoV3; eventos: EventoTimeline[]; statusOS?: OperacaoStatusV3 | null; versoes?: OrcamentoVersaoV3[] },
): Promise<OrdemServico> {
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const nextPayload: OSPayloadFull = {
    ...payload,
    orcamento: next.orcamento,
    timeline: [...timeline, ...next.eventos],
    atualizadoEm: nowIso(),
  };
  if (next.versoes) nextPayload.orcamentoVersoesV3 = next.versoes;

  const data: Prisma.OrdemServicoUpdateInput = { payload: nextPayload as unknown as Prisma.InputJsonValue };
  if (next.statusOS) {
    const statusV2 = projetarStatusV2(next.statusOS);
    nextPayload.status = statusV2;
    nextPayload.operacaoStatus = statusV2;
    nextPayload.operacaoStatusV3 = next.statusOS;
    data.payload = nextPayload as unknown as Prisma.InputJsonValue;
    data.status = operacaoStatusToPrismaStatus(statusV2);
  }
  // total da OS reflete o total ao cliente do orçamento.
  const totalCliente = computeTotaisV3(next.orcamento).total;
  if (Number.isFinite(totalCliente)) data.valorTotal = totalCliente;

  await prisma.ordemServico.update({ where: { id }, data });
  revalidatePath("/dashboard/operacoes-v3");
  return nextPayload as unknown as OrdemServico;
}

// ----------------------------------------------------------------------------
// Edição de itens / desconto / brindes (+ histórico de versão)
// ----------------------------------------------------------------------------

export async function salvarOrcamentoV3(storeId: string, osId: string, input: SalvarOrcamentoV3Input): Promise<OrdemServico> {
  const { sid, id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);
  assertStatus(atual, ["rascunho", "enviado"], "editar");

  const versoesAtuais = Array.isArray(payload.orcamentoVersoesV3) ? (payload.orcamentoVersoesV3 as OrcamentoVersaoV3[]) : [];
  const versao: OrcamentoVersaoV3 = {
    versao: versoesAtuais.length + 1,
    status: atual.status,
    total: atual.total,
    desconto: atual.desconto ?? 0,
    registradoEm: nowIso(),
    registradoPor: operadorLabel(session),
    snapshot: atual,
  };

  const editado = recalcOrcamentoV3({
    ...atual,
    servicos: Array.isArray(input.servicos) ? input.servicos : [],
    pecas: Array.isArray(input.pecas) ? input.pecas : [],
    desconto: Math.max(0, Number(input.desconto) || 0),
    observacao: input.observacao ?? atual.observacao,
    atualizadoEm: nowIso(),
  });

  return gravar(sid, id, payload, {
    orcamento: editado,
    eventos: [makeEvento("orcamento_atualizado", operadorLabel(session), "Orçamento atualizado.", { versao: versao.versao })],
    versoes: [...versoesAtuais, versao],
  });
}

// ----------------------------------------------------------------------------
// Enviar / Aprovar / Recusar
// ----------------------------------------------------------------------------

export async function enviarOrcamentoV3(storeId: string, osId: string): Promise<OrdemServico> {
  const { sid, id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);
  assertStatus(atual, ["rascunho", "enviado"], "enviar");

  const enviado = recalcOrcamentoV3({
    ...atual,
    status: "enviado",
    enviadoEm: atual.enviadoEm ?? nowIso(),
    validoAte: new Date(Date.now() + VALIDADE_PADRAO_DIAS * 86400000).toISOString(),
    atualizadoEm: nowIso(),
  });
  const reenvio = atual.status === "enviado";
  return gravar(sid, id, payload, {
    orcamento: enviado,
    statusOS: statusOSAposEnviarOrcamento(payload.status),
    eventos: [makeEvento("orcamento_enviado", operadorLabel(session), reenvio ? "Orçamento reenviado ao cliente." : "Orçamento enviado ao cliente.")],
  });
}

export async function aprovarOrcamentoV3(storeId: string, osId: string): Promise<OrdemServico> {
  const { sid, id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);
  assertStatus(atual, ["rascunho", "enviado"], "aprovar");

  const aprovado = recalcOrcamentoV3({
    ...atual,
    status: "aprovado",
    respondidoEm: nowIso(),
    atualizadoEm: nowIso(),
  });
  return gravar(sid, id, payload, {
    orcamento: aprovado,
    statusOS: statusOSAposAprovarOrcamento(payload.status),
    eventos: [makeEvento("orcamento_aprovado", operadorLabel(session), "Orçamento aprovado.")],
  });
}

export async function recusarOrcamentoV3(storeId: string, osId: string, motivo?: string): Promise<OrdemServico> {
  const { sid, id, session, payload } = await carregar(storeId, osId);
  const atual = orcamentoEditavel(payload);
  assertStatus(atual, ["rascunho", "enviado"], "recusar");

  const recusado = recalcOrcamentoV3({
    ...atual,
    status: "recusado",
    respondidoEm: nowIso(),
    atualizadoEm: nowIso(),
  });
  const motivoLimpo = (motivo ?? "").trim();
  return gravar(sid, id, payload, {
    orcamento: recusado,
    eventos: [makeEvento("orcamento_recusado", operadorLabel(session), motivoLimpo ? `Orçamento recusado: ${motivoLimpo}` : "Orçamento recusado.")],
  });
}
