"use server";

// ============================================================================
// Operações V3 — Fase 3A · ENTREGA da OS (finalização PRONTA/RECEBIDA → ENTREGUE)
// ----------------------------------------------------------------------------
// Registra a entrega formal do equipamento: data/hora + operador + observação +
// quem retirou. Grava SOMENTE o payload (status entregue + entregaV3 + retirada +
// timeline). NÃO baixa estoque, NÃO toca Financeiro/V2/schema.
//
// Usa a MÁQUINA ÚNICA (status-machine) como fonte das REGRAS de status. A entrega
// aceita "pronta" ou "recebida" e finaliza em "entregue"; quando vem de "pronta",
// registra na timeline a passagem implícita por "recebida" (PRONTA→RECEBIDA→ENTREGUE).
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { operacaoStatusToPrismaStatus } from "@/components/operacoes/lovable/utils/os-status";
import { projetarStatusV2, statusV3FromOS } from "./status-machine";

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

export interface RegistrarEntregaInputV3 {
  /** Quem retirou o aparelho (cliente/portador). Default: nome do cliente. */
  recebidoPor?: string;
  observacao?: string;
}

export async function registrarEntregaV3(storeId: string, osId: string, input: RegistrarEntregaInputV3 = {}): Promise<OrdemServico> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para registrar a entrega.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.entregarOs, "Sem permissão para entregar esta OS.");
  if (!guard.ok) throw new Error(guard.error);

  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");

  const from = statusV3FromOS(payload);
  if (from === "entregue") throw new Error("Esta OS já foi entregue.");
  if (from !== "pronta" && from !== "recebida") {
    throw new Error("A OS precisa estar Pronta ou Recebida para registrar a entrega.");
  }

  const operador = operadorLabel(session);
  const recebidoPor = (input.recebidoPor ?? "").trim() || (payload as unknown as OrdemServico).cliente?.nome || "Cliente";
  const observacao = (input.observacao ?? "").trim() || undefined;
  const now = nowIso();

  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const eventos: EventoTimeline[] = [];
  // Passagem implícita por RECEBIDA quando a entrega parte de PRONTA (auditável).
  if (from === "pronta") {
    eventos.push(makeEvento("mudanca_status", operador, 'Status alterado para "Recebida".', { de: "pronta", para: "recebida", engine: "operacoes-v3", origem: "entrega" }));
  }
  eventos.push(
    makeEvento("entrega_cliente", operador, `Equipamento entregue a ${recebidoPor}.${observacao ? " Obs.: " + observacao : ""}`, {
      de: from === "pronta" ? "recebida" : from,
      para: "entregue",
      recebidoPor,
      observacao,
    }),
  );

  const next: OSPayloadFull = {
    ...payload,
    operacaoStatusV3: "entregue",
    operacaoStatus: projetarStatusV2("entregue"),
    status: projetarStatusV2("entregue"),
    entregueEm: now,
    retirada: { confirmado: true, retiradoPor: recebidoPor, retiradoEm: now, observacao },
    entregaV3: { entregueEm: now, entreguePor: operador, recebidoPor, observacao },
    timeline: [...timeline, ...eventos],
    atualizadoEm: now,
  } as OSPayloadFull;

  await prisma.ordemServico.update({
    where: { id },
    data: {
      status: operacaoStatusToPrismaStatus(projetarStatusV2("entregue")),
      payload: next as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/dashboard/operacoes-v3");
  return next as unknown as OrdemServico;
}
