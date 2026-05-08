"use server";

import { prisma, withPrismaSafe } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import type {
  EventoTimeline,
  Garantia,
  Orcamento,
  OrdemServico,
  OSStatus,
  PecaUsada,
  Servico,
} from "@/types/os";
import type { Venda, VendaStatus, VendaOrigem } from "@/types/venda";
import { snapshotGarantia } from "@/lib/os/garantia";
import { cancelContaReceberFromOS, upsertContaReceberFromOS } from "@/lib/financeiro/adapters/os-faturamento";
import { asOperacoesPayload, nowIso } from "@/lib/operacoes/services/os-helpers";
import { hydrateOSRows } from "@/lib/operacoes/services/hydration-service";
import { mergePayload, computeEffectiveOperacaoStatus, validatePatchIdentifiers } from "@/lib/operacoes/services/payload-service";
import { syncFinanceiroAfterOSPayloadUpdate } from "@/lib/operacoes/services/financeiro-sync-service";
import { appendTimelineEvent, makeTimelineEvent } from "@/lib/operacoes/services/timeline-service";
import { toPrismaStatus } from "@/lib/operacoes/services/status-service";
import { applyApprovedBudgetPolicy } from "@/lib/operacoes/services/orcamento-policy-service";
import { applyEstoqueDelta, consumeEstoqueFromOS, restoreEstoqueFromOS } from "@/lib/operacoes/adapters/os-estoque";
import {
  normalizeOperacaoStatus,
  prismaStatusToOperacaoStatus,
} from "@/components/operacoes/lovable/utils/os-status";

export type OSPrioridade = "baixa" | "media" | "alta" | "critica";

export type OperacoesClienteSnapshot = {
  id: string;
  nome: string;
  documento?: string;
  telefone?: string;
  email?: string;
  whatsapp?: string;
  cidade?: string;
};

export type OperacoesTecnicoSnapshot = {
  id: string;
  nome: string;
  especialidades?: string[];
  cargo?: string;
};

export type OperacoesEquipamentoSnapshot = {
  id: string;
  tipo: string;
  marca: string;
  modelo: string;
  numeroSerie?: string;
  acessorios?: string[];
  defeitoRelatado: string;
  defeitosComuns?: string[];
  checklistRecomendado?: string[];
};

export type OperacoesServicoLinha = {
  servicoId: string;
  descricao: string;
  custoInterno: number;
  valorVenda: number;
  prazoGarantiaDias: number;
  termoGarantia: string;
};

export type OperacoesOSPayload = OrdemServico & {
  /**
   * Status granular do Operações HUB (preservado no payload).
   * `status` continua sendo o status operacional do hub; `ordens_servico.status` (Prisma enum) permanece colapsado.
   */
  operacaoStatus?: OSStatus;
};

async function nextCodigo(storeId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await withPrismaSafe(
    (db) => db.ordemServico.count({ where: { storeId } }),
    0
  );
  const seq = String(count + 1).padStart(5, "0");
  return `OS-${year}-${seq}`;
}

export async function listOS(storeId: string): Promise<OperacoesOSPayload[]> {
  try {
    const rows = await prisma.ordemServico.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    return hydrateOSRows<OperacoesOSPayload>(
      rows.map((r) => ({
        id: r.id,
        storeId: r.storeId,
        numero: r.numero ?? null,
        clienteId: r.clienteId ?? null,
        defeito: r.defeito ?? "",
        status: r.status,
        payload: r.payload as unknown,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    );
  } catch (err) {
    console.error("[listOS] erro ao buscar ordens:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function createOS(
  storeId: string,
  input: Omit<OperacoesOSPayload, "id" | "codigo" | "criadoEm" | "atualizadoEm">
): Promise<OperacoesOSPayload> {
  try {
    const codigo = await nextCodigo(storeId);
    const createdAtIso = nowIso();
    const payload: OperacoesOSPayload = {
      ...(input as unknown as OperacoesOSPayload),
      operacaoStatus: normalizeOperacaoStatus((input as unknown as OperacoesOSPayload).operacaoStatus ?? input.status),
      id: "", // preenchido após create
      codigo,
      storeId,
      criadoEm: createdAtIso,
      atualizadoEm: createdAtIso,
    };

    const created = await prisma.ordemServico.create({
      data: {
        storeId,
        numero: codigo,
        clienteId: input.clienteId || null,
        equipamento: `${input.equipamento.marca} ${input.equipamento.modelo}`.trim(),
        defeito: input.equipamento.defeitoRelatado,
        valorBase: 0,
        valorTotal: Number(
          (input.servicosCatalogo ?? []).reduce((acc, s) => acc + Number(s.valorVenda || 0), 0)
        ),
        status: toPrismaStatus(input.status),
        payload: {} as Prisma.InputJsonValue, // atualizado abaixo com id
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });

    payload.id = created.id;
    payload.criadoEm = created.createdAt.toISOString();
    payload.atualizadoEm = created.updatedAt.toISOString();

    await prisma.ordemServico.update({
      where: { id: created.id },
      data: { payload: payload as unknown as Prisma.InputJsonValue },
    });

    revalidatePath("/dashboard/operacoes-v2");
    return payload;
  } catch (err) {
    console.error("[createOS] erro ao criar OS:", err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error("Falha ao criar Ordem de Serviço. Tente novamente.");
  }
}

export async function updateOSStatus(
  storeId: string,
  osId: string,
  status: OSStatus
): Promise<OperacoesOSPayload> {
  try {
    const existing = await prisma.ordemServico.findFirst({
      where: { id: osId, storeId },
      select: { id: true, payload: true, createdAt: true },
    });
    if (!existing) throw new Error("OS não encontrada");

    const current = asOperacoesPayload<OperacoesOSPayload>(existing.payload as unknown);
    if (!current) throw new Error("OS sem payload (incompatível)");

    const effective = normalizeOperacaoStatus(status);
    const next: OperacoesOSPayload = {
      ...(current as OperacoesOSPayload),
      status: effective,
      operacaoStatus: effective,
      atualizadoEm: nowIso(),
    };
    if (status === "entregue") {
      const entregueEm = next.entregueEm ?? nowIso();
      next.entregueEm = entregueEm;

      const snap = snapshotGarantia(next, entregueEm);
      if (snap?.prazoDias && snap.prazoDias > 0) {
        next.garantia = snap;

        const ev: EventoTimeline = {
          id: `ev_${Date.now()}`,
          tipo: "garantia_acionada",
          autor: "Sistema",
          autorTipo: "sistema",
          conteudo: `Garantia vinculada (${snap.prazoDias} dias).`,
          criadoEm: nowIso(),
        };
        next.timeline = [...(next.timeline ?? []), ev];
      }
    }

    await prisma.ordemServico.update({
      where: { id: osId },
      data: { status: toPrismaStatus(effective), payload: next as unknown as Prisma.InputJsonValue },
    });

    // Restauração automática do estoque quando a OS sai de "entregue" ou é cancelada.
    // Importante: falhas NÃO podem quebrar a transição de status.
    if ((current as OperacoesOSPayload).status === "entregue" && effective !== "entregue") {
      const r = await restoreEstoqueFromOS({ storeId, osId, motivo: "automatico" });
      if (!r.ok) {
        await appendTimelineEvent<OperacoesOSPayload>(prisma, {
          storeId,
          osId,
          ev: makeTimelineEvent("estoque_sync_erro", "Falha ao restaurar estoque automaticamente ao reabrir/cancelar a OS.", { error: r.error }),
        });
      }
    } else if (effective === "cancelada") {
      const r = await restoreEstoqueFromOS({ storeId, osId, motivo: "automatico" });
      if (!r.ok) {
        await appendTimelineEvent<OperacoesOSPayload>(prisma, {
          storeId,
          osId,
          ev: makeTimelineEvent("estoque_sync_erro", "Falha ao restaurar estoque automaticamente ao cancelar a OS.", { error: r.error }),
        });
      }
    }

    // Consumo real de estoque (idempotente) apenas quando a OS vira entregue.
    // Importante: falhas NÃO podem quebrar a transição de status.
    if (status === "entregue") {
      const r = await consumeEstoqueFromOS({ storeId, osId, osPayload: next as unknown as OrdemServico });
      if (!r.ok) {
        await appendTimelineEvent<OperacoesOSPayload>(prisma, {
          storeId,
          osId,
          ev: makeTimelineEvent("estoque_sync_erro", "Falha ao consumir estoque real ao finalizar a OS.", { error: r.error }),
        });
      }
    }

    revalidatePath("/dashboard/operacoes-v2");
    return next as unknown as OperacoesOSPayload;
  } catch (err) {
    console.error("[updateOSStatus] erro:", err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error("Falha ao atualizar status da OS. Tente novamente.");
  }
}

export async function updateOSPayload(
  storeId: string,
  osId: string,
  patch: Partial<OperacoesOSPayload>
): Promise<OperacoesOSPayload> {
  try {
    const existing = await prisma.ordemServico.findFirst({
      where: { id: osId, storeId },
      select: { id: true, payload: true },
    });
    if (!existing) throw new Error("OS não encontrada");
    const current = asOperacoesPayload<OperacoesOSPayload>(existing.payload as unknown);
    if (!current) throw new Error("OS sem payload (incompatível)");
    validatePatchIdentifiers({ storeId, osId, patch });
    const effectiveOperacao = computeEffectiveOperacaoStatus(patch);
    const next = mergePayload<OperacoesOSPayload>({
      current: current as unknown as OperacoesOSPayload,
      patch,
      storeId,
      osId,
      effectiveOperacao,
    }) satisfies OperacoesOSPayload;
    const nextWithPolicy = applyApprovedBudgetPolicy<OperacoesOSPayload>({
      current: current as unknown as OperacoesOSPayload,
      next,
      makeTimelineEvent,
    });

    await prisma.ordemServico.update({
      where: { id: osId },
      data: { payload: nextWithPolicy as unknown as Prisma.InputJsonValue },
    });

    // Delta de estoque após revisão de orçamento aprovado (se já consumiu estoque real e ainda não restaurou).
    // Importante: falhas NÃO podem quebrar o update do payload.
    const revisaoKey = (nextWithPolicy as any)?.orcamentoRevisaoAtual?.revisadoEm as string | undefined;
    if (typeof revisaoKey === "string" && revisaoKey) {
      const r = await applyEstoqueDelta({ storeId, osId, osPayload: nextWithPolicy as unknown as OrdemServico, revisaoKey });
      if (!r.ok) {
        await appendTimelineEvent<OperacoesOSPayload>(prisma, {
          storeId,
          osId,
          ev: makeTimelineEvent("estoque_delta_erro", "Falha ao aplicar delta de estoque após revisão de orçamento.", { error: r.error }),
        });
      }
    }

    await syncFinanceiroAfterOSPayloadUpdate({
      storeId,
      osId,
      patch,
      next: nextWithPolicy,
      upsertContaReceberFromOS,
      cancelContaReceberFromOS,
      makeTimelineEvent,
      appendTimelineEvent: ({ storeId: s, osId: o, ev }) => appendTimelineEvent<OperacoesOSPayload>(prisma, { storeId: s, osId: o, ev }),
    });

    revalidatePath("/dashboard/operacoes-v2");
    return nextWithPolicy;
  } catch (err) {
    console.error("[updateOSPayload] erro:", err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error("Falha ao salvar alterações da OS. Tente novamente.");
  }
}

// ── Vendas (para o HUB de Operações) ─────────────────────────────────────────

function safePayloadObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function listVendasHub(storeId: string): Promise<Venda[]> {
  try {
    const rows = await prisma.venda.findMany({
      where: { storeId },
      include: { itens: true },
      orderBy: { at: "desc" },
      take: 200,
    });
    return rows.map((r) => {
      const pl = safePayloadObj(r.payload);
      const itens: PecaUsada[] = Array.isArray(pl?.itens)
        ? (pl!.itens as PecaUsada[])
        : r.itens.map((i) => ({
            id: i.inventoryId ?? i.id,
            nome: i.nome,
            quantidade: i.quantidade,
            valorUnitario: i.precoUnitario,
          }));
      const servicos: Servico[] = Array.isArray(pl?.servicos) ? (pl!.servicos as Servico[]) : [];
      return {
        id: r.id,
        storeId: r.storeId,
        numero: r.pedidoId,
        clienteId: (pl?.clienteId as string) ?? "",
        origem: ((pl?.origem as VendaOrigem | undefined) ?? "balcao") as VendaOrigem,
        origemRefId: (pl?.origemRefId as string | undefined),
        itens,
        servicos,
        desconto: typeof pl?.desconto === "number" ? pl.desconto : 0,
        total: r.total,
        status: ((pl?.status as VendaStatus | undefined) ?? "emitida") as VendaStatus,
        criadoEm: r.at.toISOString(),
        pagoEm: (pl?.pagoEm as string | undefined),
      };
    });
  } catch (err) {
    console.error("[listVendasHub] erro ao buscar vendas:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function criarVendaDeOSAction(os: OrdemServico): Promise<Venda> {
  try {
    if (!os.orcamento) throw new Error("OS sem orçamento — impossível faturar");
    const year = new Date().getFullYear();
    const count = await prisma.venda.count({ where: { storeId: os.storeId } });
    const pedidoId = `VND-${year}-${(count + 1).toString().padStart(5, "0")}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      clienteId: os.clienteId,
      origem: "os",
      origemRefId: os.id,
      itens: os.orcamento.pecas,
      servicos: os.orcamento.servicos,
      desconto: os.orcamento.desconto,
      status: "emitida",
    };
    const venda = await prisma.venda.create({
      data: {
        storeId: os.storeId,
        pedidoId,
        total: os.orcamento.total,
        clienteNome: os.clienteId,
        payload,
        itens: {
          create: os.orcamento.pecas.map((p) => ({
            inventoryId: p.produtoId ?? p.id,
            nome: p.nome,
            quantidade: p.quantidade,
            precoUnitario: p.valorUnitario ?? 0,
            lineTotal: p.quantidade * (p.valorUnitario ?? 0),
          })),
        },
      },
    });
    return {
      id: venda.id,
      storeId: venda.storeId,
      numero: pedidoId,
      clienteId: os.clienteId,
      origem: "os",
      origemRefId: os.id,
      itens: os.orcamento.pecas,
      servicos: os.orcamento.servicos,
      desconto: os.orcamento.desconto,
      total: os.orcamento.total,
      status: "emitida",
      criadoEm: venda.at.toISOString(),
    };
  } catch (err) {
    console.error("[criarVendaDeOSAction] erro:", err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error("Falha ao criar venda a partir da OS. Tente novamente.");
  }
}
