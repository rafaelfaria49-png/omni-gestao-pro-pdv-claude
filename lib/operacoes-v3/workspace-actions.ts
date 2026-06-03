"use server";

// ============================================================================
// Operações V3 — OS Workspace Enterprise · write-paths do prontuário
// ----------------------------------------------------------------------------
// Persistem SOMENTE campos operacionais no `payload` (JSONB) + um evento de
// timeline (auditoria). NÃO mudam status, NÃO tocam valorTotal, NÃO disparam
// Financeiro/estoque/garantia/WhatsApp. Gravam payload direto via Prisma —
// deliberadamente SEM usar `updateOSPayload` do V2 (que sincroniza Financeiro).
//
//   • salvarChecklistEntradaV3 — payload.checklist + evento checklist_finalizado
//   • salvarSenhaAcessoriosV3  — senhaEquipamento/Tipo + equipamento.acessorios
//   • salvarDiagnosticoV3      — payload.diagnosticoV3 + evento diagnostico_registrado
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, EventoTipo, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import type { ChecklistEntradaItemV3, ChecklistEstadoV3, DiagnosticoTecnicoV3, SenhaTipoV3 } from "./workspace-model";

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
function makeEvento(tipo: EventoTipo, autor: string, conteudo: string, metadata?: Record<string, unknown>): EventoTimeline {
  return { id: eventId(), tipo, autor, autorTipo: "usuario", conteudo, metadata, criadoEm: nowIso() };
}

async function carregar(
  storeId: string,
  osId: string,
): Promise<{ sid: string; id: string; session: Session | null; payload: OSPayloadFull }> {
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
  return { sid, id, session, payload };
}

/** Grava o payload (com evento anexado) sem mexer em status/valor/colunas Prisma. */
async function gravar(id: string, next: OSPayloadFull): Promise<OrdemServico> {
  const data: Prisma.OrdemServicoUpdateInput = { payload: next as unknown as Prisma.InputJsonValue };
  await prisma.ordemServico.update({ where: { id }, data });
  revalidatePath("/dashboard/operacoes-v3");
  return next as unknown as OrdemServico;
}

function appendTimeline(payload: OSPayloadFull, evento: EventoTimeline): EventoTimeline[] {
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  return [...timeline, evento];
}

// ----------------------------------------------------------------------------

export async function salvarChecklistEntradaV3(
  storeId: string,
  osId: string,
  itens: ChecklistEntradaItemV3[],
): Promise<OrdemServico> {
  const { id, session, payload } = await carregar(storeId, osId);
  const checklist = (Array.isArray(itens) ? itens : []).map((i) => {
    const estado: ChecklistEstadoV3 = i.estado === "ok" || i.estado === "ruim" ? i.estado : "nao_testado";
    return { id: String(i.id), label: String(i.label), estado };
  });
  const okCount = checklist.filter((c) => c.estado === "ok").length;
  const ruimCount = checklist.filter((c) => c.estado === "ruim").length;
  const evento = makeEvento("checklist_finalizado", operadorLabel(session), `Checklist de entrada atualizado (${okCount} OK · ${ruimCount} ruim).`);

  const next: OSPayloadFull = { ...payload, checklist, timeline: appendTimeline(payload, evento), atualizadoEm: nowIso() };
  return gravar(id, next);
}

export async function salvarSenhaAcessoriosV3(
  storeId: string,
  osId: string,
  input: { senha: string; senhaTipo: SenhaTipoV3; acessorios: string[] },
): Promise<OrdemServico> {
  const { id, session, payload } = await carregar(storeId, osId);
  const senha = (input.senha ?? "").trim();
  const senhaTipo: SenhaTipoV3 = input.senhaTipo === "texto" || input.senhaTipo === "padrao" ? input.senhaTipo : "numerica";
  const acessorios = (Array.isArray(input.acessorios) ? input.acessorios : []).map((a) => String(a).trim()).filter(Boolean);

  const equipamento = { ...(payload.equipamento ?? {}), acessorios };
  const evento = makeEvento("observacao", operadorLabel(session), `Senha e acessórios atualizados (${acessorios.length} acessório(s)).`);

  const next: OSPayloadFull = {
    ...payload,
    equipamento: equipamento as OSPayloadFull["equipamento"],
    senhaEquipamento: senha || undefined,
    senhaEquipamentoTipo: senha ? senhaTipo : undefined,
    timeline: appendTimeline(payload, evento),
    atualizadoEm: nowIso(),
  };
  return gravar(id, next);
}

export async function salvarDiagnosticoV3(
  storeId: string,
  osId: string,
  input: { inicial: string; final: string; causa: string; solucao: string },
): Promise<OrdemServico> {
  const { id, session, payload } = await carregar(storeId, osId);
  const operador = operadorLabel(session);
  const diagnosticoV3: DiagnosticoTecnicoV3 = {
    inicial: (input.inicial ?? "").trim(),
    final: (input.final ?? "").trim(),
    causa: (input.causa ?? "").trim(),
    solucao: (input.solucao ?? "").trim(),
    atualizadoEm: nowIso(),
    atualizadoPor: operador,
  };
  const evento = makeEvento("diagnostico_registrado", operador, "Diagnóstico técnico atualizado.");

  const next: OSPayloadFull = {
    ...payload,
    diagnosticoV3,
    timeline: appendTimeline(payload, evento),
    atualizadoEm: nowIso(),
  } as OSPayloadFull;
  return gravar(id, next);
}
