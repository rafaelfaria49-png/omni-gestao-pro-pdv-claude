// ============================================================================
// Operações V3 — SPRINT_3D.1 · Ponte oficial OS → Estoque (sem caminho paralelo)
// ----------------------------------------------------------------------------
// REUTILIZA o adapter oficial `lib/operacoes/adapters/os-estoque` — exatamente o
// mesmo que o Operações V2 usa. NÃO reimplementa baixa/restauração de estoque:
// apenas decide QUANDO chamar (entregue → consumir; cancelada → restaurar) e
// registra um evento de erro na timeline quando o adapter falha (best-effort).
//
// Idempotência, validação anti-parcial, livro-razão (MovimentacaoEstoque) e os
// eventos `estoque_consumido`/`estoque_item_consumido`/`estoque_restaurado` são
// responsabilidade do adapter (flags `estoqueConsumido`/`estoqueRestaurado` no
// payload). Aqui não há SQL de estoque nem segunda fonte de verdade.
//
// Plain module (não "use server"): chamado apenas por Server Actions da V3
// (entrega-actions / status-actions), como o próprio adapter oficial.
// ============================================================================

import type { EventoTimeline, OrdemServico } from "@/types/os";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { consumeEstoqueFromOS, restoreEstoqueFromOS } from "@/lib/operacoes/adapters/os-estoque";

function nowIso(): string {
  return new Date().toISOString();
}
function evId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `ev_${crypto.randomUUID()}` : `ev_${Date.now()}`;
}

/** Anexa um evento `estoque_sync_erro` à timeline da OS (best-effort, nunca lança). */
async function registrarErroEstoqueV3(
  storeId: string,
  osId: string,
  conteudo: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const row = await prisma.ordemServico.findFirst({ where: { id: osId, storeId }, select: { payload: true } });
    if (!row) return;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
    const ev: EventoTimeline = {
      id: evId(),
      tipo: "estoque_sync_erro",
      autor: "Sistema",
      autorTipo: "sistema",
      conteudo,
      metadata,
      criadoEm: nowIso(),
    };
    await prisma.ordemServico.update({
      where: { id: osId },
      data: { payload: { ...payload, timeline: [...timeline, ev] } as unknown as Prisma.InputJsonValue },
    });
  } catch (e) {
    console.error("[estoque-sync-v3] falha ao registrar erro na timeline (ignorado):", e instanceof Error ? e.message : e);
  }
}

export interface ConsumoEstoqueV3Result {
  /** `consumed` baixou · `already_consumed` idempotente · `nothing_to_consume` sem peça vinculada · `error`. */
  status: "consumed" | "already_consumed" | "nothing_to_consume" | "error";
  /** Quantidade de movimentos (produtos) baixados nesta chamada. */
  itens: number;
  error?: string;
}

/**
 * Baixa real de estoque ao ENTREGAR a OS — via adapter oficial. Idempotente
 * (não baixa duas vezes a mesma OS) e best-effort (falha NÃO quebra a entrega:
 * vira evento `estoque_sync_erro` na timeline). Peças sem produto vinculado
 * (sem `produtoId`/`id`/`sku` que case com um `Produto`) são ignoradas com
 * segurança pelo adapter (`nothing_to_consume`).
 */
export async function consumirEstoqueOSV3(params: {
  storeId: string;
  osId: string;
  osPayload?: OrdemServico;
  operador?: string | null;
}): Promise<ConsumoEstoqueV3Result> {
  const sid = (params.storeId ?? "").trim();
  const id = (params.osId ?? "").trim();
  if (!sid || !id) return { status: "error", itens: 0, error: "Parâmetros inválidos." };

  const r = await consumeEstoqueFromOS({ storeId: sid, osId: id, osPayload: params.osPayload, operador: params.operador ?? null });
  if (!r.ok) {
    await registrarErroEstoqueV3(sid, id, `Falha ao baixar estoque da OS: ${r.error}`, { fase: "consumo", error: r.error });
    return { status: "error", itens: 0, error: r.error };
  }
  return { status: r.status, itens: r.movimentos.length };
}

export interface RestauroEstoqueV3Result {
  /** `restored` (idempotente: no-op se a OS não consumiu) · `error`. */
  status: string;
  error?: string;
}

/**
 * Restauração de estoque ao CANCELAR a OS — via adapter oficial. Idempotente:
 * se a OS nunca consumiu (`estoqueConsumido !== true`) ou já restaurou, é no-op
 * dentro do adapter. Best-effort (falha vira `estoque_sync_erro`).
 */
export async function restaurarEstoqueOSV3(params: {
  storeId: string;
  osId: string;
  operador?: string | null;
}): Promise<RestauroEstoqueV3Result> {
  const sid = (params.storeId ?? "").trim();
  const id = (params.osId ?? "").trim();
  if (!sid || !id) return { status: "error", error: "Parâmetros inválidos." };

  const r = await restoreEstoqueFromOS({ storeId: sid, osId: id, motivo: "automatico", operador: params.operador ?? null });
  if (!r.ok) {
    await registrarErroEstoqueV3(sid, id, `Falha ao restaurar estoque da OS: ${r.error}`, { fase: "restauro", error: r.error });
    return { status: "error", error: r.error };
  }
  return { status: r.status };
}
