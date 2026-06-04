"use server";

// ============================================================================
// Operações V3 — Fase 2A · PDV de Serviço (recebimento REAL da OS)
// ----------------------------------------------------------------------------
// Recebe o pagamento de uma OS REUSANDO os serviços financeiros existentes
// (sem motor duplicado, sem tocar PDV de vendas, V2 ou schema):
//   1. exige SESSÃO DE CAIXA ABERTA + período não fechado;
//   2. garante o título de Conta a Receber da OS (idempotente por localKey);
//   3. baixa total/parcial via `liquidarContaReceber` / `registrarPagamentoParcial`
//      (que já protegem contra valor > saldo e duplicidade);
//   4. lança a movimentação (`createMovimentacaoEntradaFromReceber`);
//   5. registra a operação na sessão de caixa (`caixaOperacao` recebimento_cr) —
//      entra no caixa do dia / fechamento;
//   6. espelha o status em `payload.pagamentoV3` + evento na timeline da OS.
// NÃO baixa estoque, NÃO gera garantia, NÃO mexe na V2.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import {
  getContaReceberByLocalKey,
  liquidarContaReceber,
  registrarPagamentoParcial,
  upsertContaReceber,
  sumPagamentosFromHistoricoPayload,
} from "@/lib/financeiro/services/contas-receber-service";
import { createMovimentacaoEntradaFromReceber } from "@/lib/financeiro/services/movimentacoes-service";
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service";
import {
  formaLabelRecebimentoV3,
  formaSuportadaV3,
  localKeyContaReceberOSV3,
  montarPagamentoMirrorV3,
  totalCobravelV3,
  validarRecebimentoV3,
  type FormaRecebimentoV3,
  type PagamentoV3,
} from "./payment-model";

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
function money(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// ----------------------------------------------------------------------------
// Leitura: sessão de caixa aberta
// ----------------------------------------------------------------------------

export interface CaixaSessaoV3 {
  aberta: boolean;
  sessaoId?: string;
  operador?: string;
  abertaEm?: string;
}

export async function getCaixaSessaoAbertaV3(storeId: string): Promise<CaixaSessaoV3> {
  const sid = (storeId ?? "").trim();
  if (!sid) return { aberta: false };
  const sessao = await prisma.sessaoCaixa.findFirst({
    where: { storeId: sid, status: "ABERTA" },
    orderBy: { abertaEm: "desc" },
    select: { id: true, operador: true, abertaEm: true },
  });
  if (!sessao) return { aberta: false };
  return { aberta: true, sessaoId: sessao.id, operador: sessao.operador, abertaEm: sessao.abertaEm.toISOString() };
}

// ----------------------------------------------------------------------------
// Garantir título de Conta a Receber da OS (idempotente)
// ----------------------------------------------------------------------------

async function carregarOS(storeId: string, osId: string): Promise<{ id: string; payload: OSPayloadFull }> {
  const row = await prisma.ordemServico.findFirst({ where: { id: osId, storeId }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  return { id: row.id, payload };
}

interface TituloOSResolvido {
  localKey: string;
  total: number;
  recebido: number;
  saldo: number;
}

// Correção 2A.1: CHAVE ÚNICA por OS (idêntica à do adapter V2, `os-faturamento:*`).
// Se o título já existe — criado pelo faturamento V2 OU por um recebimento V3 anterior —
// ele é REAPROVEITADO; nunca se cria um segundo título para a mesma OS.
async function resolverTituloOS(storeId: string, osId: string, payload: OSPayloadFull, opts: { create: boolean }): Promise<TituloOSResolvido> {
  const os = payload as unknown as OrdemServico;
  const total = totalCobravelV3(os);
  const localKey = localKeyContaReceberOSV3(storeId, osId);

  let titulo = await getContaReceberByLocalKey(storeId, localKey);
  if (!titulo) {
    // Leitura (PDV abrindo a OS): NÃO cria título — só deriva do orçamento.
    if (!opts.create) return { localKey, total, recebido: 0, saldo: total };
    if (total <= 0) throw new Error("Esta OS não tem valor a cobrar. Gere/aprove o orçamento antes de receber.");
    titulo = await upsertContaReceber({
      storeId,
      localKey,
      descricao: `OS ${os.codigo ?? osId}`,
      cliente: os.cliente?.nome ?? "",
      valor: total,
      vencimento: ((payload.aberturaV3 as { pagamentoPrevisto?: { vencimentoPrevisto?: string } } | undefined)?.pagamentoPrevisto?.vencimentoPrevisto) || nowIso(),
      status: "pendente",
      payloadPatch: { origem: "operacoes-v3", ordemServicoId: osId, codigo: os.codigo },
    });
  }
  const recebido = sumPagamentosFromHistoricoPayload(titulo.payload);
  return { localKey, total: money(titulo.valor), recebido, saldo: Math.max(0, money(titulo.valor) - recebido) };
}

/** Estado de pagamento atual da OS (com o título já garantido). Leitura para a tela do PDV. */
export async function lerPagamentoOSV3(storeId: string, osId: string): Promise<PagamentoV3 & { sessao: CaixaSessaoV3 }> {
  const sid = (storeId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  const { payload } = await carregarOS(sid, osId);
  const t = await resolverTituloOS(sid, osId, payload, { create: false });
  const sessao = await getCaixaSessaoAbertaV3(sid);
  return { ...montarPagamentoMirrorV3({ total: t.total, recebido: t.recebido, tituloLocalKey: t.localKey }), sessao };
}

// ----------------------------------------------------------------------------
// Recebimento real
// ----------------------------------------------------------------------------

export interface ReceberOSInputV3 {
  valor: number;
  forma: FormaRecebimentoV3;
  sessaoId: string;
  observacao?: string;
}

export interface ReceberOSResultV3 {
  os: OrdemServico;
  pagamento: PagamentoV3;
  valorRecebido: number;
  op: "liquidar" | "parcial";
}

export async function receberOSV3(storeId: string, osId: string, input: ReceberOSInputV3): Promise<ReceberOSResultV3> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para receber a OS.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para receber esta OS.");
  if (!guard.ok) throw new Error(guard.error);

  const forma = input.forma;
  if (!formaSuportadaV3(forma)) throw new Error(`Forma "${formaLabelRecebimentoV3(forma)}" ainda não suportada para recebimento real.`);

  // Período financeiro fechado?
  const lock = await verificarPeriodoFechado(sid, new Date());
  if (lock.fechado) throw new Error("Período financeiro fechado. Reabra o fechamento para receber.");

  // Sessão de caixa ABERTA (exigida).
  const sessao = await prisma.sessaoCaixa.findFirst({ where: { id: input.sessaoId, storeId: sid, status: "ABERTA" }, select: { id: true } });
  if (!sessao) throw new Error("Caixa fechado: abra o caixa no PDV antes de receber.");

  const { id: osRowId, payload } = await carregarOS(sid, id);
  const titulo = await resolverTituloOS(sid, id, payload, { create: true });

  const veredito = validarRecebimentoV3(input.valor, titulo.saldo);
  if (!veredito.ok) throw new Error(veredito.motivo ?? "Recebimento inválido.");
  const op: "liquidar" | "parcial" = veredito.op ?? "parcial";
  const valor = money(input.valor);
  const operador = operadorLabel(session);
  const obs = `${(input.observacao ?? "").trim() ? input.observacao!.trim() + " · " : ""}OS ${(payload as unknown as OrdemServico).codigo ?? id} · PDV Serviço · ${formaLabelRecebimentoV3(forma)}`;

  // 3) Baixa (idempotência e proteção dentro do service).
  let recebidoTotal: number;
  if (op === "liquidar") {
    const res = await liquidarContaReceber({ storeId: sid, localKey: titulo.localKey, observacao: obs, userLabel: operador });
    if (!res.ok) throw new Error(`Não foi possível quitar (${res.reason}).`);
    recebidoTotal = money(res.data.valor);
  } else {
    const res = await registrarPagamentoParcial({ storeId: sid, localKey: titulo.localKey, valorPago: valor, observacao: obs, userLabel: operador });
    if (!res.ok) throw new Error(`Não foi possível registrar o pagamento (${res.reason}).`);
    recebidoTotal = sumPagamentosFromHistoricoPayload(res.data.payload);
  }

  // 4) Movimentação financeira (best-effort, idempotente no service).
  const tituloRow = await getContaReceberByLocalKey(sid, titulo.localKey);
  if (tituloRow) {
    await createMovimentacaoEntradaFromReceber(
      { id: tituloRow.id, storeId: tituloRow.storeId, descricao: tituloRow.descricao, cliente: tituloRow.cliente },
      valor,
      { parcial: op === "parcial" },
    ).catch((e) => console.error("[receberOSV3 mov]", e));

    // 5) Operação na sessão de caixa → entra no caixa/fechamento (separado de venda de produto).
    await prisma.caixaOperacao
      .create({
        data: {
          sessaoId: sessao.id,
          storeId: sid,
          tipo: "recebimento_cr",
          valor,
          motivo: `Serviço/OS ${(payload as unknown as OrdemServico).codigo ?? id} — ${tituloRow.cliente || ""} (${formaLabelRecebimentoV3(forma)})`,
          operador,
          payload: {
            origem: "operacoes-v3-os",
            ordemServicoId: id,
            tituloId: tituloRow.id,
            localKey: titulo.localKey,
            formaPagamento: forma,
            op: op,
          } as Prisma.InputJsonValue,
        },
      })
      .catch((e) => console.error("[receberOSV3 caixaOperacao]", e));
  }

  // 6) Espelho no payload da OS + timeline.
  const mirror = montarPagamentoMirrorV3({ total: titulo.total, recebido: recebidoTotal, ultimaForma: forma, tituloLocalKey: titulo.localKey });
  const evento: EventoTimeline = {
    id: eventId(),
    tipo: "operacao_cobranca_gerada",
    autor: operador,
    autorTipo: "usuario",
    conteudo: `Pagamento registrado: ${formaLabelRecebimentoV3(forma)} ${valor.toFixed(2)} · saldo ${mirror.saldo.toFixed(2)} (${mirror.status}).`,
    metadata: { valor, forma, op: op, saldo: mirror.saldo, status: mirror.status, sessaoId: sessao.id },
    criadoEm: nowIso(),
  };
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const nextPayload: OSPayloadFull = { ...payload, pagamentoV3: mirror, timeline: [...timeline, evento], atualizadoEm: nowIso() } as OSPayloadFull;
  await prisma.ordemServico.update({ where: { id: osRowId }, data: { payload: nextPayload as unknown as Prisma.InputJsonValue } });

  revalidatePath("/dashboard/operacoes-v3");
  return { os: nextPayload as unknown as OrdemServico, pagamento: mirror, valorRecebido: valor, op: op };
}
