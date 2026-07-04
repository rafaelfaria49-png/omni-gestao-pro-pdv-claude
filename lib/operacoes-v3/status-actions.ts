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
// Aqui é status + timeline. Estoque/Garantia entram em fase posterior (1C/2).
// Não toca schema, V2, PDV, WhatsApp, Marketplace, BL-07.
//
// GOAL OPS-V3-CANCELAR-OS-CONTRATO-SEGURO-019 — cancelamento (to==="cancelada")
// exige `opts.motivo` (mín. 5 caracteres) e BLOQUEIA se houver qualquer valor já
// recebido (`lerPagamentoOSV3`, fonte autoritativa — não o espelho do payload):
// nesse caso lança erro orientando a estornar primeiro (`estornarRecebimentoOSV3`).
// O cancelamento da Conta a Receber acontece ANTES do write de status (não
// depois, como antes) e o retorno NUNCA é ignorado: se `cancelContaReceber`
// falhar por um motivo que não seja "título inexistente" (ex.: título pago/
// estornado), o cancelamento inteiro é abortado — a OS NÃO muda de status.
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
import { lerPagamentoOSV3 } from "./pdv-servico-actions";
import { emitirEventoOperacaoV3 } from "./event-publisher";
import { statusV3ParaEvento } from "./event-model";
import { restaurarEstoqueOSV3 } from "./estoque-sync";
import { registrarEntregaV3 } from "./entrega-actions";
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

export interface AplicarTransicaoStatusOptsV3 {
  /** Obrigatório (mín. 5 caracteres) quando `to === "cancelada"`. Ignorado nas demais transições. */
  motivo?: string;
}

/**
 * Aplica uma transição de status da OS pela máquina única da V3.
 * Lança Error com mensagem amigável quando a transição é inválida ou sem permissão.
 * Retorna o payload atualizado (mesmo shape que `getOrdem` hidrata).
 *
 * Cancelamento (`to === "cancelada"`) exige `opts.motivo` e é bloqueado se a OS
 * tiver qualquer valor recebido — ver cabeçalho do módulo.
 */
export async function aplicarTransicaoStatusV3(
  storeId: string,
  osId: string,
  to: OperacaoStatusV3,
  opts?: AplicarTransicaoStatusOptsV3,
): Promise<OrdemServico> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  // ENTREGA UNIFICADA (SPRINT_3D.2 · bug B1): "entregue" tem UM ÚNICO caminho
  // canônico — `registrarEntregaV3` — que registra a entrega formal (entregaV3 +
  // retirada + entregueEm), INICIA a garantia (derivada de entregaV3), baixa o
  // estoque (adapter oficial) e emite `os_entregue`, tudo de forma idempotente.
  // Nenhum write-path finaliza a entrega "status-only". Toda superfície (Kanban,
  // Command Bar, Bancada, Workspace, PDV de Serviço, ações rápidas) chega aqui via
  // `mudarStatus` e é roteada para o fluxo oficial — sem duplicar efeitos. O
  // próprio `registrarEntregaV3` faz auth (`entregarOs`) e valida o estado de
  // origem (Pronta/Recebida), então a delegação acontece antes do resto.
  if (to === "entregue") {
    return registrarEntregaV3(sid, id);
  }

  // Auth — mesma política do HUB, sem importar o guard privado do V2.
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para alterar o status da OS.");
  const guard = await requireEnterpriseWith(
    sid,
    // "entregue" já foi delegado a registrarEntregaV3 (que faz seu próprio guard
    // `entregarOs`), então aqui só restam cancelamento e demais transições.
    (p) => (to === "cancelada" ? p.operacoes.cancelarOs : p.operacoes.editarOs),
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

  // ---- Cancelamento seguro (GOAL OPS-V3-CANCELAR-OS-CONTRATO-SEGURO-019) ----
  // Motivo obrigatório + bloqueio por pagamento ANTES de qualquer write. A leitura
  // de pagamento é sempre a autoritativa (mesma fonte do estorno/recebimento),
  // nunca o espelho `payload.pagamentoV3`. O cancelamento do CR também acontece
  // aqui (antes do status) e seu retorno é verificado — "not_found" (OS nunca
  // cobrada) é o caso comum e seguro; qualquer outra falha aborta tudo.
  let motivoCancelamento: string | undefined;
  if (to === "cancelada") {
    const motivo = (opts?.motivo ?? "").trim();
    if (motivo.length < 5) {
      throw new Error("Informe o motivo do cancelamento (mín. 5 caracteres).");
    }
    motivoCancelamento = motivo;

    const pagamento = await lerPagamentoOSV3(sid, id);
    if (pagamento.recebido > 0) {
      throw new Error("Esta OS possui pagamento recebido. Estorne o recebimento antes de cancelar.");
    }

    const resCr = await cancelContaReceber({
      storeId: sid,
      localKey: localKeyContaReceberOSV3(sid, id),
      motivo: motivoCancelamento,
      userLabel: operadorLabel(session),
    });
    if (!resCr.ok && resCr.reason !== "not_found") {
      throw new Error(
        resCr.reason === "titulo_pago_nao_cancela_aqui"
          ? "Esta OS possui pagamento recebido. Estorne o recebimento antes de cancelar."
          : `Não foi possível cancelar o financeiro desta OS (${resCr.reason}). Cancelamento abortado.`,
      );
    }
  }

  const statusV2 = projetarStatusV2(to);
  const evento: EventoTimeline = {
    id: eventId(),
    tipo: "mudanca_status",
    autor: operadorLabel(session),
    autorTipo: "usuario",
    conteudo:
      to === "cancelada"
        ? `Status alterado para "${statusMetaV3(to).label}". Motivo: ${motivoCancelamento}`
        : `Status alterado para "${statusMetaV3(to).label}".`,
    metadata: { de: from, para: to, engine: "operacoes-v3", ...(motivoCancelamento ? { motivo: motivoCancelamento } : {}) },
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

  // SPRINT_3D.1 — restauração REAL de estoque ao CANCELAR, via adapter oficial.
  // Idempotente e best-effort: a falha NÃO desfaz a transição (vira
  // `estoque_sync_erro` na timeline). Quando a OS não chegou a consumir, é no-op
  // no adapter. (A BAIXA em "entregue" vive só no fluxo canônico `registrarEntregaV3`,
  // para onde a transição "entregue" é delegada acima — sem duplicar efeitos.)
  let estoqueStatus: string | undefined;
  if (to === "cancelada") {
    const r = await restaurarEstoqueOSV3({ storeId: sid, osId: id, operador: operadorLabel(session) });
    estoqueStatus = r.status;
  }

  // Espinha de eventos (3C.0): só os status com evento de negócio dedicado
  // (pronta / aguardando_peca / entregue) anunciam. O `status` do evento sai do
  // próprio `nextPayload`, garantindo coerência com a timeline recém-escrita.
  const tipoEvento = statusV3ParaEvento(to);
  if (tipoEvento) {
    emitirEventoOperacaoV3({
      tipo: tipoEvento,
      os: nextPayload as unknown as OrdemServico,
      storeId: sid,
      origem: "status-machine",
      metadata: { de: from, para: to, ...(estoqueStatus ? { estoque: estoqueStatus } : {}) },
    });
  }

  revalidatePath("/dashboard/operacoes-v3");
  return nextPayload as unknown as OrdemServico;
}
