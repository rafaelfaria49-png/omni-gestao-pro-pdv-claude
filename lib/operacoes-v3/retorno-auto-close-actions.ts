"use server";

// ============================================================================
// Auto-finaliza o retorno da OS original quando a OS vinculada é entregue.
// Chamado só por `registrarEntregaV3`. Sem schema, sem Financeiro/PDV/Caixa.
// Cada OS (original, depois filha) é mutada na SUA transação, sob a trava da sua
// linha e sobre o payload mais recente — nunca duas OS travadas ao mesmo tempo.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { OrdemServico } from "@/types/os";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { lerVinculoRetornoV3 } from "./pos-venda-model";
import { emitirEventoOperacaoV3 } from "./event-publisher";
import {
  aplicarAuditoriaFilhaAutoCloseV3,
  aplicarAutoCloseOriginalV3,
  resolverRetornoParaAutoCloseV3,
} from "./retorno-auto-close";
import { mutarPayloadOSV3 } from "./os-payload-lock";

export type AutoCloseStatusV3 = "skipped" | "closed" | "already";

export interface FinalizarRetornoPorEntregaResultV3 {
  status: AutoCloseStatusV3;
  motivo?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function finalizarRetornoPorEntregaVinculadaV3(input: {
  storeId: string;
  osFilha: OrdemServico;
  operador: string;
}): Promise<FinalizarRetornoPorEntregaResultV3> {
  const sid = (input.storeId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  const filha = input.osFilha;
  const filhaId = (filha?.id ?? "").trim();
  const vinculo = lerVinculoRetornoV3(filha);
  if (!filhaId || !vinculo?.osOrigemId?.trim() || !vinculo.retornoId?.trim()) {
    return { status: "skipped", motivo: "sem_vinculo" };
  }

  const origemId = vinculo.osOrigemId.trim();
  const agora = nowIso();
  const operador = (input.operador ?? "").trim() || "Sistema";

  // OS original: resolução e auto-close sobre o payload MAIS RECENTE, sob a trava da linha.
  type PassoOriginal =
    | { ok: false; motivo: string }
    | {
        ok: true;
        original: OrdemServico;
        resolucao: Extract<ReturnType<typeof resolverRetornoParaAutoCloseV3>, { ok: true }>;
        originalAplicado: ReturnType<typeof aplicarAutoCloseOriginalV3>;
      };
  const passoOriginal = await mutarPayloadOSV3<PassoOriginal>({
    storeId: sid,
    osId: origemId,
    aceitarPayloadVazio: true,
    aoAusente: () => ({ ok: false, motivo: "retorno_ausente" }),
    mutate: ({ id: rowId, payload, payloadValido }) => {
      if (!payloadValido) return { payload: null, resultado: { ok: false, motivo: "retorno_ausente" } };
      const original = { ...(payload as unknown as OrdemServico), id: rowId };
      const resolucao = resolverRetornoParaAutoCloseV3({ ...filha, id: filhaId }, original);
      if (!resolucao.ok) return { payload: null, resultado: { ok: false, motivo: resolucao.motivo } };
      const originalAplicado = aplicarAutoCloseOriginalV3(original, { ...filha, id: filhaId }, { operador, agora });
      return {
        payload: originalAplicado.changed ? (originalAplicado.next as unknown as typeof payload) : null,
        resultado: { ok: true, original, resolucao, originalAplicado },
      };
    },
  });
  if (!passoOriginal.ok) return { status: "skipped", motivo: passoOriginal.motivo };
  const { original, resolucao, originalAplicado } = passoOriginal;

  if (originalAplicado.changed) {
    emitirEventoOperacaoV3({
      tipo: "os_retorno_finalizado",
      os: originalAplicado.next,
      storeId: sid,
      origem: "retorno",
      metadata: {
        retornoId: resolucao.retorno.id,
        motivo: resolucao.retorno.motivo,
        origem: "entrega_vinculada",
        osRetornoId: filhaId,
        osRetornoCodigo: filha.codigo,
      },
    });
  }

  // OS filha: auditoria sobre o payload MAIS RECENTE da filha, sob a trava da linha dela.
  const filhaAplicada = await mutarPayloadOSV3<{ changed: boolean }>({
    storeId: sid,
    osId: filhaId,
    aceitarPayloadVazio: true,
    aoAusente: () => ({ changed: false }),
    mutate: ({ id: rowId, payload, payloadValido }) => {
      const filhaAtual = payloadValido
        ? ({ ...(payload as unknown as OrdemServico), id: rowId } as OrdemServico)
        : ({ ...filha, id: filhaId } as OrdemServico);
      const aplicada = aplicarAuditoriaFilhaAutoCloseV3(filhaAtual, {
        osOrigemId: origemId,
        osOrigemCodigo: resolucao.vinculo.osOrigemCodigo || original.codigo,
        retornoId: resolucao.retorno.id,
        operador,
        agora,
      });
      return { payload: aplicada.changed ? (aplicada.next as unknown as typeof payload) : null, resultado: { changed: aplicada.changed } };
    },
  });

  if (originalAplicado.changed || filhaAplicada.changed) {
    revalidatePath("/dashboard/operacoes-v3");
    revalidatePath("/dashboard/operacoes-v4-preview");
  }

  if (originalAplicado.changed) return { status: "closed" };
  if (resolucao.jaFinalizado) return { status: "already" };
  return { status: "already" };
}
