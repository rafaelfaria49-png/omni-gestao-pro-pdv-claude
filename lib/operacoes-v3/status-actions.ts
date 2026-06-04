"use server";

// ============================================================================
// Operações V3 — Fase 1B · ÚNICO write-path de status da V3
// ----------------------------------------------------------------------------
// Persiste UMA transição validada pela máquina única (`status-machine.ts`).
// Efeito restrito a: payload.status (projeção V2) + payload.operacaoStatusV3
// (autoritativo) + payload.timeline (evento) + coluna Prisma colapsada.
//
// PROPOSITALMENTE NÃO chama os write-paths do V2 (`updateOSStatus`/
// `updateOSPayload`) porque eles disparam efeitos fora do escopo desta fase:
//   • entregue → consumo de estoque + criação de garantia + evento Omni Agent
//   • cancelada/reabertura → restauração de estoque
//   • qualquer patch → sync de Financeiro (Conta a Receber)
// Aqui é status + timeline. EXCEÇÃO (Correção 2A.1): ao CANCELAR, faz um
// best-effort de cancelar a Conta a Receber ÚNICA da OS (mesma chave do PDV de
// Serviço / adapter V2) para não deixar título órfão — não materializa nada novo,
// não toca estoque/garantia, não bloqueia a transição se o financeiro falhar.
// Estoque/Garantia entram em fase posterior (1C/2). Não toca schema, V2, PDV,
// WhatsApp, Marketplace, BL-07.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { cancelContaReceber } from "@/lib/financeiro/services/contas-receber-service";
import { localKeyContaReceberOSV3 } from "./payment-model";
import { operacaoStatusToPrismaStatus } from "@/components/operacoes/lovable/utils/os-status";
import {
  type OperacaoStatusV3,
  podeTransicionarV3,
  projetarStatusV2,
  statusMetaV3,
  statusV3FromOS,
} from "./status-machine";

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

/**
 * Aplica uma transição de status da OS pela máquina única da V3.
 * Lança Error com mensagem amigável quando a transição é inválida ou sem permissão.
 * Retorna o payload atualizado (mesmo shape que `getOrdem` hidrata).
 */
export async function aplicarTransicaoStatusV3(
  storeId: string,
  osId: string,
  to: OperacaoStatusV3,
): Promise<OrdemServico> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  // Auth — mesma política do HUB, sem importar o guard privado do V2.
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para alterar o status da OS.");
  const guard = await requireEnterpriseWith(
    sid,
    (p) => (to === "entregue" ? p.operacoes.entregarOs : to === "cancelada" ? p.operacoes.cancelarOs : p.operacoes.editarOs),
    "Sem permissão para alterar o status desta OS.",
  );
  if (!guard.ok) throw new Error(guard.error);

  const existing = await prisma.ordemServico.findFirst({
    where: { id, storeId: sid },
    select: { id: true, payload: true },
  });
  if (!existing) throw new Error("OS não encontrada.");

  const payload = existing.payload as unknown as (OrdemServico & Record<string, unknown>) | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");

  const from = statusV3FromOS(payload);
  const veredito = podeTransicionarV3(from, to);
  if (!veredito.ok) throw new Error(veredito.motivo ?? "Transição de status não permitida.");

  const statusV2 = projetarStatusV2(to);
  const evento: EventoTimeline = {
    id: eventId(),
    tipo: "mudanca_status",
    autor: operadorLabel(session),
    autorTipo: "usuario",
    conteudo: `Status alterado para "${statusMetaV3(to).label}".`,
    metadata: { de: from, para: to, engine: "operacoes-v3" },
    criadoEm: nowIso(),
  };
  const timeline: EventoTimeline[] = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];

  const nextPayload = {
    ...payload,
    status: statusV2,
    operacaoStatus: statusV2,
    operacaoStatusV3: to,
    timeline: [...timeline, evento],
    atualizadoEm: nowIso(),
  };

  await prisma.ordemServico.update({
    where: { id },
    data: {
      status: operacaoStatusToPrismaStatus(statusV2),
      payload: nextPayload as unknown as Prisma.InputJsonValue,
    },
  });

  // Correção 2A.1 — proteção de cancelamento: cancela a Conta a Receber ÚNICA da OS
  // (mesma chave do PDV de Serviço / adapter V2) para não deixar título órfão em
  // aberto. Best-effort e idempotente: título inexistente é no-op; título já pago/
  // estornado é preservado pelo próprio serviço. Falha financeira NÃO desfaz o status.
  if (to === "cancelada") {
    try {
      await cancelContaReceber({
        storeId: sid,
        localKey: localKeyContaReceberOSV3(sid, id),
        motivo: "OS cancelada (Operações V3).",
        userLabel: operadorLabel(session),
      });
    } catch (e) {
      console.error("[aplicarTransicaoStatusV3 cancelCR]", e);
    }
  }

  revalidatePath("/dashboard/operacoes-v3");
  return nextPayload as unknown as OrdemServico;
}
