import type { OrdemServico } from "@/types/os";
import type { EventoTimeline } from "@/types/os";

export type OperacoesSyncPatch = {
  faturamentoPendente?: boolean;
  faturamentoStatus?: "pendente" | "cancelado";
  faturamentoTotal?: number;
  faturamentoCriadoEm?: string;
  faturamentoReferencia?: string;
  faturamentoModoCobranca?: string;
  faturamentoParcelas?: unknown;
  faturamentoFormaPagamento?: string;
  orcamento?: unknown;
};

export type OperacoesSyncNext = OperacoesSyncPatch & {
  timeline?: unknown;
};

export function shouldSyncFinanceiroFromPatch(patch: Partial<OperacoesSyncPatch>): boolean {
  return (
    patch.faturamentoPendente !== undefined ||
    patch.faturamentoStatus !== undefined ||
    patch.faturamentoTotal !== undefined ||
    patch.faturamentoCriadoEm !== undefined ||
    patch.faturamentoReferencia !== undefined ||
    patch.faturamentoModoCobranca !== undefined ||
    patch.faturamentoParcelas !== undefined ||
    patch.faturamentoFormaPagamento !== undefined ||
    patch.orcamento !== undefined
  );
}

export async function syncFinanceiroAfterOSPayloadUpdate(params: {
  storeId: string;
  osId: string;
  patch: Partial<OperacoesSyncPatch>;
  next: OperacoesSyncNext;
  upsertContaReceberFromOS: (os: OrdemServico) => Promise<
    | { ok: true; action: "created" | "updated"; id: string; localKey: string }
    | { ok: false; reason: string; localKey?: string }
  >;
  cancelContaReceberFromOS: (input: { storeId: string; ordemServicoId: string; motivo?: string }) => Promise<
    | { ok: true; action: "cancelled" | "noop_not_found"; id?: string; localKey: string }
    | { ok: false; reason: string; localKey?: string }
  >;
  makeTimelineEvent: (tipo: EventoTimeline["tipo"], conteudo: string, metadata?: Record<string, unknown>) => any;
  appendTimelineEvent: (input: { storeId: string; osId: string; ev: any }) => Promise<void>;
}): Promise<void> {
  if (!shouldSyncFinanceiroFromPatch(params.patch)) return;

  try {
    if (
      params.next.faturamentoPendente === true &&
      params.next.faturamentoStatus === "pendente" &&
      (params.next.faturamentoTotal ?? 0) > 0
    ) {
      const r = await params.upsertContaReceberFromOS(params.next as unknown as OrdemServico);
      if (r.ok) {
        await params.appendTimelineEvent({
          storeId: params.storeId,
          osId: params.osId,
          ev: params.makeTimelineEvent(
            r.action === "created" ? "financeiro_conta_receber_criada" : "financeiro_conta_receber_atualizada",
            r.action === "created"
              ? "Conta a receber criada a partir do faturamento da OS."
              : "Conta a receber atualizada a partir do faturamento da OS.",
            { contaReceberTituloId: r.id, localKey: r.localKey }
          ),
        });
      }
      return;
    }

    if (params.next.faturamentoStatus === "cancelado" || params.next.faturamentoPendente === false) {
      const r = await params.cancelContaReceberFromOS({
        storeId: params.storeId,
        ordemServicoId: params.osId,
        motivo: "Faturamento cancelado/recusado na OS.",
      });
      if (r.ok && r.action === "cancelled") {
        await params.appendTimelineEvent({
          storeId: params.storeId,
          osId: params.osId,
          ev: params.makeTimelineEvent("financeiro_conta_receber_cancelada", "Conta a receber cancelada a partir da OS.", {
            contaReceberTituloId: r.id,
            localKey: r.localKey,
          }),
        });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await params.appendTimelineEvent({
      storeId: params.storeId,
      osId: params.osId,
      ev: params.makeTimelineEvent("financeiro_sync_erro", "Falha ao sincronizar Conta a Receber a partir da OS.", {
        error: msg,
      }),
    });
  }
}

