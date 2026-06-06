"use server";

// ============================================================================
// Operações V3 — Fase 3B · write-paths de PRODUÇÃO (técnico + prioridade)
// ----------------------------------------------------------------------------
// Gravam SOMENTE o payload (técnico / prioridade) + timeline. NÃO mudam status
// (isso é da máquina única, `status-actions`), NÃO tocam Financeiro/estoque/V2/
// schema. `os.tecnico` é lido por toda a UI a partir de `payload.tecnico`.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, OrdemServico, Tecnico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { PRIORIDADE_META_V3, isPrioridadeV3, lerPrioridadeV3, tecnicoIdFromNomeV3, type PrioridadeV3 } from "./producao-model";

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
function makeEvento(tipo: EventoTimeline["tipo"], autor: string, conteudo: string, metadata?: Record<string, unknown>): EventoTimeline {
  return { id: eventId(), tipo, autor, autorTipo: "usuario", conteudo, metadata, criadoEm: nowIso() };
}

async function carregar(storeId: string, osId: string): Promise<{ id: string; session: Session | null; payload: OSPayloadFull }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para alterar a produção da OS.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para alterar esta OS.");
  if (!guard.ok) throw new Error(guard.error);
  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  return { id, session, payload };
}

async function gravar(id: string, next: OSPayloadFull): Promise<OrdemServico> {
  await prisma.ordemServico.update({ where: { id }, data: { payload: next as unknown as Prisma.InputJsonValue } });
  revalidatePath("/dashboard/operacoes-v3");
  return next as unknown as OrdemServico;
}

function appendTimeline(payload: OSPayloadFull, evento: EventoTimeline): EventoTimeline[] {
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  return [...timeline, evento];
}

/**
 * Atribui / altera / remove o técnico responsável.
 * `input = null` remove o técnico. `input.nome` define/altera (id derivado do nome se não vier).
 */
export async function atribuirTecnicoV3(
  storeId: string,
  osId: string,
  input: { id?: string; nome: string } | null,
): Promise<OrdemServico> {
  const { id, session, payload } = await carregar(storeId, osId);
  const operador = operadorLabel(session);
  const anterior = (payload as unknown as OrdemServico).tecnico;

  // Remoção
  if (input === null) {
    if (!anterior) throw new Error("Esta OS não tem técnico atribuído.");
    const evento = makeEvento("atribuicao_tecnico", operador, `Técnico removido (era ${anterior.nome ?? "—"}).`, { de: anterior.nome ?? null, para: null });
    const next: OSPayloadFull = { ...payload, timeline: appendTimeline(payload, evento), atualizadoEm: nowIso() } as OSPayloadFull;
    delete (next as Record<string, unknown>).tecnico;
    return gravar(id, next);
  }

  const nome = (input.nome ?? "").trim();
  if (!nome) throw new Error("Informe o nome do técnico.");
  const tecnicoId = (input.id ?? "").trim() || tecnicoIdFromNomeV3(nome);

  // Sem mudança real
  if (anterior?.id === tecnicoId && anterior?.nome === nome) return payload as unknown as OrdemServico;

  const tecnico: Tecnico = {
    id: tecnicoId,
    nome,
    especialidades: Array.isArray(anterior?.especialidades) ? anterior!.especialidades : [],
    online: anterior?.online ?? false,
    ...(anterior?.avatarUrl ? { avatarUrl: anterior.avatarUrl } : {}),
  };

  const alterada = !!anterior?.id;
  const evento = makeEvento(
    "atribuicao_tecnico",
    operador,
    alterada ? `Técnico alterado para ${nome} (era ${anterior?.nome ?? "—"}).` : `Técnico atribuído: ${nome}.`,
    { de: anterior?.nome ?? null, para: nome, tecnicoId },
  );

  const next: OSPayloadFull = { ...payload, tecnico, timeline: appendTimeline(payload, evento), atualizadoEm: nowIso() } as OSPayloadFull;
  return gravar(id, next);
}

/** Define a prioridade V3 da OS (baixa/normal/alta/urgente/garantia). */
export async function definirPrioridadeV3(storeId: string, osId: string, prioridade: PrioridadeV3): Promise<OrdemServico> {
  if (!isPrioridadeV3(prioridade)) throw new Error("Prioridade inválida.");
  const { id, session, payload } = await carregar(storeId, osId);
  const operador = operadorLabel(session);
  const anterior = lerPrioridadeV3(payload as unknown as OrdemServico);
  if (anterior === prioridade) return payload as unknown as OrdemServico;

  const evento = makeEvento(
    "observacao",
    operador,
    `Prioridade alterada para "${PRIORIDADE_META_V3[prioridade].label}" (era "${PRIORIDADE_META_V3[anterior].label}").`,
    { evento: "prioridade_alterada", de: anterior, para: prioridade },
  );

  const next: OSPayloadFull = { ...payload, prioridadeV3: prioridade, timeline: appendTimeline(payload, evento), atualizadoEm: nowIso() } as OSPayloadFull;
  return gravar(id, next);
}
