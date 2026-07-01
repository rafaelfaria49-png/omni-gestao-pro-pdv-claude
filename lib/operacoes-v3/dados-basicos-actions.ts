"use server";

// ============================================================================
// Operações V3 — write-path dos DADOS BÁSICOS da OS (side-effect-free) · slice 3B
// ----------------------------------------------------------------------------
// Grava SOMENTE dados operacionais básicos no `payload` (JSONB) + a coluna
// denormalizada `defeito` (busca/fallback de hidratação) + um evento de timeline
// (auditoria). Mesma disciplina de `workspace-actions` / `prova-entrada-actions`:
// grava payload DIRETO via Prisma — deliberadamente SEM `updateOSPayload` do V2
// (que sincroniza Financeiro). NÃO muda status, orçamento, diagnóstico, valor,
// estoque, caixa, garantia, WhatsApp. Nada de automação.
//
// Campos: defeito relatado · prioridade · recebido por · localização física ·
// previsão/SLA · origem · observações internas. Reusa os contratos/validadores
// puros de `dados-basicos-model`.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import {
  collapseOrigemV3,
  isLocalFisicoV3,
  isOrigemV3,
  isPrioridadeV3,
  type SalvarDadosBasicosInputV3,
} from "./dados-basicos-model";

type OSPayloadFull = OrdemServico & Record<string, unknown>;

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
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function makeEvento(autor: string, conteudo: string, metadata?: Record<string, unknown>): EventoTimeline {
  return { id: eventId(), tipo: "observacao", autor, autorTipo: "usuario", conteudo, metadata, criadoEm: nowIso() };
}

async function carregar(
  storeId: string,
  osId: string,
): Promise<{ id: string; session: Session | null; payload: OSPayloadFull }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para editar a OS.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para editar esta OS.");
  if (!guard.ok) throw new Error(guard.error);

  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  return { id, session, payload };
}

/**
 * Salva os dados básicos da OS (recepção). NÃO altera status/orçamento/diagnóstico/
 * financeiro/estoque/caixa. Retorna o payload atualizado (mesmo shape que `getOrdem`).
 */
export async function salvarDadosBasicosOSV3(
  storeId: string,
  osId: string,
  input: SalvarDadosBasicosInputV3,
): Promise<OrdemServico> {
  const { id, session, payload } = await carregar(storeId, osId);
  const operador = operadorLabel(session);

  // Sanitização/validação com os contratos puros (defaults seguros).
  const defeito = str(input?.defeitoRelatado);
  const prioridade = isPrioridadeV3(input?.prioridade) ? input.prioridade : "media";
  const origem = isOrigemV3(input?.origem) ? input.origem : "balcao";
  const localFisico = isLocalFisicoV3(input?.localFisico) ? input.localFisico : "balcao";
  const recebidoPor = str(input?.recebidoPor);
  const observacoes = str(input?.observacoes);
  const previsao = str(input?.previsaoEntrega); // ISO ou "" (vazio = manter previsão atual)

  // Espelhos/estruturas atuais (aberturaV3 e recepcao viajam soltos no payload).
  const aberturaAtual =
    payload.aberturaV3 && typeof payload.aberturaV3 === "object"
      ? (payload.aberturaV3 as Record<string, unknown>)
      : {};
  const recepcaoAtual =
    aberturaAtual.recepcao && typeof aberturaAtual.recepcao === "object"
      ? (aberturaAtual.recepcao as Record<string, unknown>)
      : {};
  const slaAtual =
    payload.sla && typeof payload.sla === "object" ? (payload.sla as unknown as Record<string, unknown>) : {};

  // Previsão/SLA: só atualiza quando veio ISO; vazio mantém o prazo operacional atual.
  const previsaoFinal = previsao || str(recepcaoAtual.previsaoEntrega) || str(slaAtual.prazo);
  const sla = previsao ? { ...slaAtual, prazo: previsao } : slaAtual;

  const equipamento = { ...(payload.equipamento ?? {}), defeitoRelatado: defeito };

  const aberturaV3 = {
    ...aberturaAtual,
    recepcao: {
      ...recepcaoAtual,
      dataEntrada: str(recepcaoAtual.dataEntrada) || str(payload.criadoEm) || nowIso(),
      origem,
      recebidoPor: recebidoPor || undefined,
      prioridade,
      localFisico,
      previsaoEntrega: previsaoFinal || undefined,
    },
    observacoesInternas: observacoes || undefined,
  };

  const evento = makeEvento(operador, "Dados básicos da OS atualizados (recepção).", {
    evento: "dados_basicos_atualizados",
  });
  const timeline: EventoTimeline[] = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];

  const next: OSPayloadFull = {
    ...payload,
    equipamento: equipamento as OSPayloadFull["equipamento"],
    prioridade,
    origem: collapseOrigemV3(origem),
    sla: sla as unknown as OSPayloadFull["sla"],
    aberturaV3,
    timeline: [...timeline, evento],
    atualizadoEm: nowIso(),
  } as OSPayloadFull;

  // Escreve o payload + a coluna denormalizada `defeito` (usada em busca e como
  // fallback de hidratação). NÃO toca status/valorBase/valorTotal nem qualquer
  // outra coluna. Sem `updateOSPayload` do V2 → sem sync de Financeiro.
  const data: Prisma.OrdemServicoUpdateInput = {
    payload: next as unknown as Prisma.InputJsonValue,
    defeito,
  };
  await prisma.ordemServico.update({ where: { id }, data });
  revalidatePath("/dashboard/operacoes-v3");
  return next as unknown as OrdemServico;
}
