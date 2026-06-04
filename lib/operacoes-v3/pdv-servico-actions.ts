"use server";

// ============================================================================
// Operações V3 — Fase 2A/2B · PDV de Serviço (recebimento REAL da OS)
// ----------------------------------------------------------------------------
// Recebe o pagamento de uma OS REUSANDO os serviços financeiros existentes
// (sem motor duplicado, sem tocar PDV de vendas, V2 ou schema):
//   1. exige SESSÃO DE CAIXA ABERTA + período não fechado;
//   2. garante o título de Conta a Receber ÚNICO da OS (idempotente por localKey);
//   3. baixa total/parcial via `liquidarContaReceber` / `registrarPagamentoParcial`
//      (que já protegem contra valor > saldo e duplicidade);
//   4. lança a movimentação (`createMovimentacaoEntradaFromReceber`);
//   5. registra UMA operação de caixa POR FORMA (`caixaOperacao` recebimento_cr) —
//      entra no caixa do dia / fechamento, separando por forma (dinheiro na gaveta);
//   6. espelha o status em `payload.pagamentoV3` + evento na timeline da OS.
// Fase 2B: SPLIT (várias formas num recebimento), rótulo sinal/entrada/parcial/
// quitação, COMPROVANTE de recebimento e ESTORNO auditado (`estornarRecebimentoOSV3`).
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
  estornarContaReceber,
  upsertContaReceber,
  sumPagamentosFromHistoricoPayload,
} from "@/lib/financeiro/services/contas-receber-service";
import { createMovimentacaoEntradaFromReceber } from "@/lib/financeiro/services/movimentacoes-service";
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service";
import {
  descreverSplitV3,
  formaLabelRecebimentoV3,
  formaSuportadaV3,
  localKeyContaReceberOSV3,
  montarComprovanteReciboV3,
  montarPagamentoMirrorV3,
  rotuloIntencaoV3,
  somaSplitV3,
  totalCobravelV3,
  validarSplitV3,
  type ComprovanteReciboV3,
  type FormaRecebimentoV3,
  type PagamentoV3,
  type RecebimentoIntencaoV3,
  type SplitLinhaV3,
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
  /** Forma única (compat). */
  valor?: number;
  forma?: FormaRecebimentoV3;
  /** Split: várias formas num MESMO recebimento (a soma é o valor recebido). */
  linhas?: SplitLinhaV3[];
  sessaoId: string;
  /** Rótulo do recebimento (sinal/entrada/parcial). "Quitação" é derivada do saldo. */
  intencao?: RecebimentoIntencaoV3;
  observacao?: string;
}

export interface ReceberOSResultV3 {
  os: OrdemServico;
  pagamento: PagamentoV3;
  valorRecebido: number;
  op: "liquidar" | "parcial";
  /** Dados para o comprovante imprimível deste recebimento. */
  recibo: ComprovanteReciboV3;
}

/** Normaliza a entrada em linhas de split (forma única vira 1 linha). */
function normalizarLinhasV3(input: ReceberOSInputV3): SplitLinhaV3[] {
  if (Array.isArray(input.linhas) && input.linhas.length > 0) {
    return input.linhas.map((l) => ({ forma: l.forma, valor: money(l.valor) })).filter((l) => l.valor > 0);
  }
  if (input.forma && typeof input.valor === "number") {
    return [{ forma: input.forma, valor: money(input.valor) }];
  }
  return [];
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

  // Split (ou forma única normalizada). Todas as formas precisam ser suportadas.
  const linhas = normalizarLinhasV3(input);
  if (linhas.length === 0) throw new Error("Informe ao menos uma forma de pagamento com valor.");
  for (const l of linhas) {
    if (!formaSuportadaV3(l.forma)) throw new Error(`Forma "${formaLabelRecebimentoV3(l.forma)}" ainda não suportada para recebimento real.`);
  }

  // Período financeiro fechado?
  const lock = await verificarPeriodoFechado(sid, new Date());
  if (lock.fechado) throw new Error("Período financeiro fechado. Reabra o fechamento para receber.");

  // Sessão de caixa ABERTA (exigida).
  const sessao = await prisma.sessaoCaixa.findFirst({ where: { id: input.sessaoId, storeId: sid, status: "ABERTA" }, select: { id: true } });
  if (!sessao) throw new Error("Caixa fechado: abra o caixa no PDV antes de receber.");

  const { id: osRowId, payload } = await carregarOS(sid, id);
  const titulo = await resolverTituloOS(sid, id, payload, { create: true });

  // Valida a SOMA do split contra o saldo (proteção contra valor > saldo no motor único).
  const total = somaSplitV3(linhas);
  const veredito = validarSplitV3(linhas, titulo.saldo);
  if (!veredito.ok) throw new Error(veredito.motivo ?? "Recebimento inválido.");
  const op: "liquidar" | "parcial" = veredito.op ?? "parcial";

  const operador = operadorLabel(session);
  const splitDesc = descreverSplitV3(linhas);
  const intencaoLabel = rotuloIntencaoV3(input.intencao, op === "liquidar");
  const obsBase = (input.observacao ?? "").trim();
  const codigo = (payload as unknown as OrdemServico).codigo ?? id;
  const obs = `${obsBase ? obsBase + " · " : ""}OS ${codigo} · PDV Serviço · ${intencaoLabel} · ${splitDesc}`;

  // 3) Baixa do título: UM único lançamento do TOTAL (estorno limpo + contabilidade correta).
  let recebidoTotal: number;
  if (op === "liquidar") {
    const res = await liquidarContaReceber({ storeId: sid, localKey: titulo.localKey, observacao: obs, userLabel: operador });
    if (!res.ok) throw new Error(`Não foi possível quitar (${res.reason}).`);
    recebidoTotal = sumPagamentosFromHistoricoPayload(res.data.payload);
  } else {
    const res = await registrarPagamentoParcial({ storeId: sid, localKey: titulo.localKey, valorPago: total, observacao: obs, userLabel: operador });
    if (!res.ok) throw new Error(`Não foi possível registrar o pagamento (${res.reason}).`);
    recebidoTotal = sumPagamentosFromHistoricoPayload(res.data.payload);
  }

  // 4) Movimentação financeira (best-effort, idempotente no service).
  const tituloRow = await getContaReceberByLocalKey(sid, titulo.localKey);
  if (tituloRow) {
    await createMovimentacaoEntradaFromReceber(
      { id: tituloRow.id, storeId: tituloRow.storeId, descricao: tituloRow.descricao, cliente: tituloRow.cliente },
      total,
      { parcial: op === "parcial" },
    ).catch((e) => console.error("[receberOSV3 mov]", e));

    // 5) Operação de caixa POR FORMA → fechamento separa por forma; dinheiro entra na gaveta.
    for (const l of linhas) {
      await prisma.caixaOperacao
        .create({
          data: {
            sessaoId: sessao.id,
            storeId: sid,
            tipo: "recebimento_cr",
            valor: money(l.valor),
            motivo: `Serviço/OS ${codigo} — ${tituloRow.cliente || ""} (${formaLabelRecebimentoV3(l.forma)})`,
            operador,
            payload: {
              origem: "operacoes-v3-os",
              ordemServicoId: id,
              tituloId: tituloRow.id,
              localKey: titulo.localKey,
              formaPagamento: l.forma,
              intencao: intencaoLabel,
              op: op,
            } as Prisma.InputJsonValue,
          },
        })
        .catch((e) => console.error("[receberOSV3 caixaOperacao]", e));
    }
  }

  // 6) Espelho no payload da OS + timeline + comprovante.
  const formasLabel = linhas.map((l) => formaLabelRecebimentoV3(l.forma)).join(" + ");
  const dataHora = nowIso();
  const mirror = montarPagamentoMirrorV3({ total: titulo.total, recebido: recebidoTotal, ultimaForma: formasLabel, tituloLocalKey: titulo.localKey, now: dataHora });
  const evento: EventoTimeline = {
    id: eventId(),
    tipo: "operacao_cobranca_gerada",
    autor: operador,
    autorTipo: "usuario",
    conteudo: `${intencaoLabel}: ${splitDesc} (total R$ ${total.toFixed(2)}) · saldo R$ ${mirror.saldo.toFixed(2)} (${mirror.status}).`,
    metadata: { intencao: input.intencao ?? (op === "liquidar" ? "quitacao" : "parcial"), intencaoLabel, total, linhas, op, saldo: mirror.saldo, status: mirror.status, sessaoId: sessao.id },
    criadoEm: dataHora,
  };
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const nextPayload: OSPayloadFull = { ...payload, pagamentoV3: mirror, timeline: [...timeline, evento], atualizadoEm: dataHora } as OSPayloadFull;
  await prisma.ordemServico.update({ where: { id: osRowId }, data: { payload: nextPayload as unknown as Prisma.InputJsonValue } });

  const recibo = montarComprovanteReciboV3({
    os: nextPayload as unknown as OrdemServico,
    linhas,
    valorPago: total,
    pagamento: mirror,
    intencaoLabel,
    operador,
    dataHora,
    observacao: obsBase || undefined,
  });

  revalidatePath("/dashboard/operacoes-v3");
  return { os: nextPayload as unknown as OrdemServico, pagamento: mirror, valorRecebido: total, op: op, recibo };
}

// ----------------------------------------------------------------------------
// Estorno auditado do ÚLTIMO recebimento (correção)
// ----------------------------------------------------------------------------
// Reusa o serviço financeiro existente `estornarContaReceber` (modo
// "ultimo_pagamento"): reverte o último lançamento de pagamento/liquidação do
// título ÚNICO da OS, registrando estorno no histórico (auditável). Atualiza o
// espelho + timeline. Exige caixa aberto + período não fechado.

export interface EstornarRecebimentoInputV3 {
  sessaoId: string;
  motivo?: string;
}

export interface EstornarRecebimentoResultV3 {
  os: OrdemServico;
  pagamento: PagamentoV3;
  estornado: number;
}

export async function estornarRecebimentoOSV3(storeId: string, osId: string, input: EstornarRecebimentoInputV3): Promise<EstornarRecebimentoResultV3> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para estornar.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para estornar recebimento.");
  if (!guard.ok) throw new Error(guard.error);

  const lock = await verificarPeriodoFechado(sid, new Date());
  if (lock.fechado) throw new Error("Período financeiro fechado. Reabra o fechamento para estornar.");
  const sessao = await prisma.sessaoCaixa.findFirst({ where: { id: input.sessaoId, storeId: sid, status: "ABERTA" }, select: { id: true } });
  if (!sessao) throw new Error("Caixa fechado: abra o caixa para estornar o recebimento.");

  const { id: osRowId, payload } = await carregarOS(sid, id);
  const titulo = await resolverTituloOS(sid, id, payload, { create: false });
  if (titulo.recebido <= 0) throw new Error("Não há recebimento para estornar nesta OS.");
  const recebidoAntes = titulo.recebido;

  const operador = operadorLabel(session);
  const res = await estornarContaReceber({
    storeId: sid,
    localKey: titulo.localKey,
    modo: "ultimo_pagamento",
    motivo: input.motivo || "Estorno de recebimento (Operações V3).",
    userLabel: operador,
  });
  if (!res.ok) throw new Error(`Não foi possível estornar (${res.reason}).`);
  const recebidoDepois = sumPagamentosFromHistoricoPayload(res.data.payload);
  const estornado = Math.max(0, money(recebidoAntes - recebidoDepois));

  // Caixa: registra o estorno para AUDITORIA da sessão. (O fechamento agrega
  // hoje só sangria/suprimento/recebimento_cr; a baixa deste estorno na gaveta é
  // follow-up — ver relatório. Não modificamos o helper de caixa/PDV.)
  await prisma.caixaOperacao
    .create({
      data: {
        sessaoId: sessao.id,
        storeId: sid,
        tipo: "estorno_recebimento_cr",
        valor: estornado,
        motivo: `Estorno OS ${(payload as unknown as OrdemServico).codigo ?? id}${input.motivo ? " — " + input.motivo : ""}`,
        operador,
        payload: {
          origem: "operacoes-v3-os",
          ordemServicoId: id,
          tituloId: res.data.id,
          localKey: titulo.localKey,
        } as Prisma.InputJsonValue,
      },
    })
    .catch((e) => console.error("[estornarRecebimentoOSV3 caixaOperacao]", e));

  const dataHora = nowIso();
  const mirror = montarPagamentoMirrorV3({ total: titulo.total, recebido: recebidoDepois, ultimaForma: "Estorno", tituloLocalKey: titulo.localKey, now: dataHora });
  const evento: EventoTimeline = {
    id: eventId(),
    tipo: "financeiro_conta_receber_atualizada",
    autor: operador,
    autorTipo: "usuario",
    conteudo: `Estorno de recebimento: R$ ${estornado.toFixed(2)} · saldo R$ ${mirror.saldo.toFixed(2)} (${mirror.status}).${input.motivo ? " Motivo: " + input.motivo : ""}`,
    metadata: { estornado, saldo: mirror.saldo, status: mirror.status, sessaoId: sessao.id, modo: "ultimo_pagamento" },
    criadoEm: dataHora,
  };
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const nextPayload: OSPayloadFull = { ...payload, pagamentoV3: mirror, timeline: [...timeline, evento], atualizadoEm: dataHora } as OSPayloadFull;
  await prisma.ordemServico.update({ where: { id: osRowId }, data: { payload: nextPayload as unknown as Prisma.InputJsonValue } });

  revalidatePath("/dashboard/operacoes-v3");
  return { os: nextPayload as unknown as OrdemServico, pagamento: mirror, estornado };
}
