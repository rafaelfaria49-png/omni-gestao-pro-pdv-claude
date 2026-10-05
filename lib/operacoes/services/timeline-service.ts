import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline } from "@/types/os";
import { asOperacoesPayload, nowIso } from "@/lib/operacoes/services/os-helpers";
import { lerOSTravadaV3 } from "@/lib/operacoes-v3/os-payload-lock";

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
 * Numa transação, sob a trava da linha da OS: o evento entra no payload MAIS RECENTE
 * (nunca regrava um snapshot anterior por cima de outro writer).
 */
export async function appendTimelineEvent<T extends { id: string; storeId: string; timeline?: unknown; atualizadoEm?: string }>(
  prismaClient: { $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<void>, opts?: { maxWait?: number; timeout?: number }) => Promise<void> },
  params: {
    storeId: string;
    osId: string;
    ev: EventoTimeline;
  }
): Promise<void> {
  await prismaClient.$transaction(async (tx) => {
    const os = await lerOSTravadaV3(tx, params.storeId, params.osId);
    if (!os) return;
    const current = asOperacoesPayload<T & { codigo: string }>(os.payloadValido ? os.payload : null);
    if (!current) return;
    const timeline = Array.isArray((current as { timeline?: unknown }).timeline) ? ((current as { timeline?: unknown }).timeline as EventoTimeline[]) : [];
    const next = { ...(current as T), timeline: [...timeline, params.ev], atualizadoEm: nowIso() };

    await tx.ordemServico.update({
      where: { id: params.osId },
      data: { payload: next as unknown as Prisma.InputJsonValue },
    });
  }, { maxWait: 5_000, timeout: 15_000 });
}

