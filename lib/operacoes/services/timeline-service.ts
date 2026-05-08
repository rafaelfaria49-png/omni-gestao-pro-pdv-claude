import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline } from "@/types/os";
import { asOperacoesPayload, nowIso } from "@/lib/operacoes/services/os-helpers";

export function makeTimelineEvent(tipo: EventoTimeline["tipo"], conteudo: string, metadata?: Record<string, unknown>): EventoTimeline {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto as Crypto).randomUUID() : `ev_${Date.now()}`;
  return {
    id,
    tipo,
    autor: "Sistema",
    autorTipo: "sistema",
    conteudo,
    metadata,
    criadoEm: nowIso(),
  };
}

/**
 * Acrescenta um evento na timeline da OS sem chamar Server Actions recursivamente.
 * IMPORTANT: não altera comportamento; apenas encapsula a lógica existente.
 */
export async function appendTimelineEvent<T extends { id: string; storeId: string; timeline?: unknown; atualizadoEm?: string }>(
  prismaClient: { ordemServico: { findFirst: any; update: any } },
  params: {
    storeId: string;
    osId: string;
    ev: EventoTimeline;
  }
): Promise<void> {
  const existing = await prismaClient.ordemServico.findFirst({
    where: { id: params.osId, storeId: params.storeId },
    select: { payload: true },
  });
  if (!existing) return;
  const current = asOperacoesPayload<T & { codigo: string }>(existing.payload as unknown);
  if (!current) return;
  const timeline = Array.isArray((current as { timeline?: unknown }).timeline) ? ((current as { timeline?: unknown }).timeline as EventoTimeline[]) : [];
  const next = { ...(current as T), timeline: [...timeline, params.ev], atualizadoEm: nowIso() };

  await prismaClient.ordemServico.update({
    where: { id: params.osId },
    data: { payload: next as unknown as Prisma.InputJsonValue },
  });
}

