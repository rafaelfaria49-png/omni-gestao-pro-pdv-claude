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
//
// GOAL OPS-V4-RECEBIMENTO-A-PRAZO-MINIMO-006: `lancarOSAPrazoV3` é uma action
// SEPARADA para "a prazo" — NÃO é recebimento (nunca liquida o título, nunca
// movimenta caixa, nunca exige caixa aberto); só formaliza o saldo como Conta a
// Receber PENDENTE com vencimento, autorizando a entrega.
//
// GOAL OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001: `registrarRecebimentoMistoOSV3`
// combina, numa ÚNICA confirmação e numa ÚNICA transação, pagamento imediato +
// saldo restante a prazo no MESMO título (ver `recebimento-misto-service.ts`).
// TODOS os writers de pagamento da OS (`receberOSV3`, `estornarRecebimentoOSV3`,
// `lancarOSAPrazoV3` e o misto) rodam numa transação sob a MESMA trava por OS
// (advisory lock → sessão → OS → título, nessa ordem): nenhum deles lê o título ou
// o payload antes de a operação concorrente commitar — sem lost update entre eles.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { normalizeReceberStatus, RECEBER_STATUS } from "@/lib/financeiro/contracts/status";
import {
  getContaReceberByLocalKey,
  buildContaReceberAuditTrail,
  liquidarContaReceber,
  registrarPagamentoParcial,
  estornarContaReceber,
  upsertContaReceber,
  sumPagamentosFromHistoricoPayload,
} from "@/lib/financeiro/services/contas-receber-service";
import { createMovimentacaoEntradaFromReceber } from "@/lib/financeiro/services/movimentacoes-service";
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service";
import { recebimentoLoteAdvisoryLock } from "@/lib/financeiro/services/recebimento-lote-service";
import {
  descreverSplitV3,
  formaLabelRecebimentoV3,
  formaSuportadaV3,
  aPrazoVisivelV3,
  localKeyContaReceberOSV3,
  montarAPrazoMirrorV3,
  montarComprovanteReciboV3,
  montarPagamentoMirrorV3,
  reconciliarAPrazoAposBaixaV3,
  rotuloIntencaoV3,
  somaSplitV3,
  statusTituloAPrazoV3,
  totalCobravelV3,
  validarSplitV3,
  type APrazoV3,
  type ComprovanteReciboV3,
  type FormaRecebimentoV3,
  type PagamentoV3,
  type RecebimentoIntencaoV3,
  type SplitLinhaV3,
} from "./payment-model";
import {
  gerarOperacaoIdV3,
  hojeLojaV3,
  normalizarRecebimentoMistoV3,
  OPERACAO_ID_PATTERN_V3,
  type RecebimentoMistoErroCodigoV3,
  type RecebimentoMistoInputV3,
} from "./recebimento-misto-model";
import {
  chaveLockRecebimentoMistoV3,
  decidirRecebimentoMistoOSV3,
  fingerprintRecebimentoCanonicoV3,
  garantirTituloOSTravadoV3,
  isRecebimentoMistoErroV3,
  travarOS,
  travarSessaoCaixa,
  travarTitulo,
  type ResultadoRecebimentoMistoV3,
} from "./recebimento-misto-service";

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
function isRecordV3(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Transação curta dos writers de pagamento (pooler em modo transação; mesmos limites do lote). */
const TX_PAGAMENTO_OS_V3 = { maxWait: 5_000, timeout: 15_000 } as const;

/** "Hoje" para normalizar só a IDENTIDADE de uma confirmação (aceita qualquer vencimento real). */
const DATA_MINIMA_REPLAY_V3 = "0000-01-01";

/** OS travada (FOR UPDATE) e relida dentro da transação, já sob a trava por OS. */
async function lerOSTravadaV3(tx: Prisma.TransactionClient, storeId: string, osId: string): Promise<{ rowId: string; payload: OSPayloadFull; os: OrdemServico }> {
  if (!(await travarOS(tx, storeId, osId))) throw new Error("OS não encontrada.");
  const row = await tx.ordemServico.findFirst({
    where: { id: osId, storeId },
    select: { id: true, payload: true, valorTotal: true, valorBase: true },
  });
  const payload = row?.payload as unknown as OSPayloadFull | null;
  if (!row || !payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  // Mesma fonte de total do seletor/Workspace: orçamento REAL no payload, senão a coluna Prisma.
  const os = {
    ...payload,
    prismaValorTotal: Number(row.valorTotal ?? 0) || 0,
    prismaValorBase: Number(row.valorBase ?? 0) || 0,
  } as unknown as OrdemServico;
  return { rowId: row.id, payload, os };
}

/** Pós-commit: atualizar a tela nunca pode desfazer nem repetir a operação. */
function revalidarOperacoesV3(origem: string): void {
  try {
    revalidatePath("/dashboard/operacoes-v3");
  } catch (e) {
    console.error(`[${origem} revalidatePath]`, e);
  }
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

interface OSCarregadaV3 {
  id: string;
  payload: OSPayloadFull;
  /** Valor monetário da OS na COLUNA Prisma (não no JSONB) — fallback de total. */
  prismaValorTotal: number;
  prismaValorBase: number;
}

async function carregarOS(storeId: string, osId: string): Promise<OSCarregadaV3> {
  // Inclui `valorTotal`/`valorBase` (colunas Prisma) além do payload JSONB: o valor
  // cobrável de muitas OS vive na COLUNA, não no JSON. O cliente já enxerga isso via
  // hidratação (`prismaValorTotal`); aqui alinhamos a leitura do servidor à mesma fonte.
  const row = await prisma.ordemServico.findFirst({
    where: { id: osId, storeId },
    select: { id: true, payload: true, valorTotal: true, valorBase: true },
  });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  return {
    id: row.id,
    payload,
    prismaValorTotal: Number(row.valorTotal ?? 0) || 0,
    prismaValorBase: Number(row.valorBase ?? 0) || 0,
  };
}

interface TituloOSResolvido {
  localKey: string;
  total: number;
  recebido: number;
  saldo: number;
}

// Correção 2A.1: CHAVE ÚNICA por OS (idêntica à do adapter V2, `os-faturamento:*`).
// Se o título já existe — criado pelo faturamento V2 OU por um recebimento V3 anterior —
// ele é REAPROVEITADO; nunca se cria um segundo título para a mesma OS. Esta é a LEITURA
// (PDV abrindo a OS): sem título, só deriva do orçamento. A criação acontece apenas nos
// writers, dentro da transação e sob a trava da OS (`garantirTituloOSTravadoV3`).
async function resolverTituloOS(storeId: string, osId: string, loaded: OSCarregadaV3): Promise<TituloOSResolvido> {
  const { payload, prismaValorTotal, prismaValorBase } = loaded;
  // Mesma fonte de verdade do seletor/Workspace: orçamento REAL no payload (se houver),
  // senão a coluna Prisma `valorTotal` (exposta como `prismaValorTotal`). Sem esse
  // fallback, OS cujo valor mora só na coluna apareciam com Total R$ 0 no PDV de Serviço.
  const os = { ...payload, prismaValorTotal, prismaValorBase } as unknown as OrdemServico;
  const total = totalCobravelV3(os);
  const localKey = localKeyContaReceberOSV3(storeId, osId);

  const titulo = await getContaReceberByLocalKey(storeId, localKey);
  if (!titulo) return { localKey, total, recebido: 0, saldo: total };
  const recebido = sumPagamentosFromHistoricoPayload(titulo.payload);
  return { localKey, total: money(titulo.valor), recebido, saldo: Math.max(0, money(titulo.valor) - recebido) };
}

/** Estado de pagamento atual da OS (com o título já garantido). Leitura para a tela do PDV. */
export async function lerPagamentoOSV3(
  storeId: string,
  osId: string,
): Promise<PagamentoV3 & { sessao: CaixaSessaoV3; aPrazo: APrazoV3 | null }> {
  const sid = (storeId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  const loaded = await carregarOS(sid, osId);
  const t = await resolverTituloOS(sid, osId, loaded);
  const sessao = await getCaixaSessaoAbertaV3(sid);
  const mirror = montarPagamentoMirrorV3({ total: t.total, recebido: t.recebido, tituloLocalKey: t.localKey });
  // Saldo a prazo PERSISTIDO (reabrir a OS mostra valor/vencimento); sem saldo, não há o que
  // exibir. O valor exibido nunca passa do saldo real: baixas posteriores feitas por outro
  // caminho (ex.: Financeiro) não atualizam o espelho da OS.
  return { ...mirror, sessao, aPrazo: aPrazoVisivelV3(loaded.payload, mirror.saldo) };
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
  /**
   * Identidade desta confirmação, gerada pela tela e ESTÁVEL entre reenvios: repetir a
   * mesma operação (resposta perdida, reenvio) devolve o que já foi gravado — nunca baixa,
   * movimenta ou lança caixa em dobro. Ausente (chamada interna), o servidor gera uma.
   */
  operacaoId?: string;
  /**
   * Saldo que o operador VIU ao confirmar (concorrência otimista). Se o saldo real for outro
   * — outro recebimento no meio, inclusive uma tentativa cuja resposta se perdeu —, nada é
   * gravado. Ausente (chamada interna), não é conferido.
   */
  saldoEsperado?: number;
}

export interface ReceberOSResultV3 {
  os: OrdemServico;
  pagamento: PagamentoV3;
  valorRecebido: number;
  op: "liquidar" | "parcial";
  /** Dados para o comprovante imprimível deste recebimento. */
  recibo: ComprovanteReciboV3;
  operacaoId?: string;
  /** `true` = esta confirmação já estava gravada; nada foi lançado de novo. */
  jaRegistrado?: boolean;
}

/**
 * Replay de um recebimento canônico já gravado (âncora: as operações de caixa da operação,
 * mesma família do recebimento em lote). Devolve o que foi lançado, sem lançar de novo;
 * a mesma `operacaoId` com outro conteúdo é conflito.
 */
async function replayRecebimentoOSV3(
  tx: Prisma.TransactionClient,
  p: {
    storeId: string;
    osId: string;
    operacaoId: string;
    requestFingerprint: string;
    gravadas: Array<{ valor: number; payload: Prisma.JsonValue }>;
    operador: string;
    dataHora: string;
  },
): Promise<ReceberOSResultV3> {
  const primeira = isRecordV3(p.gravadas[0]?.payload) ? (p.gravadas[0]!.payload as Record<string, unknown>) : {};
  if (primeira.requestFingerprint !== p.requestFingerprint) {
    throw new Error("Esta confirmação já foi registrada com outros valores. Atualize a OS antes de lançar outro recebimento.");
  }
  const linhas: SplitLinhaV3[] = p.gravadas.map((g) => ({
    forma: (isRecordV3(g.payload) ? g.payload.formaPagamento : "") as FormaRecebimentoV3,
    valor: money(g.valor),
  }));
  const valorRecebido = somaSplitV3(linhas);
  const localKey = localKeyContaReceberOSV3(p.storeId, p.osId);
  const titulo = await getContaReceberByLocalKey(p.storeId, localKey, tx);
  const osRow = await tx.ordemServico.findFirst({ where: { id: p.osId, storeId: p.storeId }, select: { payload: true } });
  const payload = (isRecordV3(osRow?.payload) ? osRow!.payload : {}) as unknown as OSPayloadFull;
  const pagamento = montarPagamentoMirrorV3({
    total: money(titulo?.valor),
    recebido: titulo ? sumPagamentosFromHistoricoPayload(titulo.payload) : 0,
    ultimaForma: linhas.map((l) => formaLabelRecebimentoV3(l.forma)).join(" + "),
    tituloLocalKey: localKey,
    now: p.dataHora,
  });
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const metadataDaOperacao = timeline
    .map((e) => (isRecordV3(e?.metadata) ? (e.metadata as Record<string, unknown>) : null))
    .find((m) => m?.operacaoId === p.operacaoId && isRecordV3(m.comprovante));
  const recibo =
    (metadataDaOperacao?.comprovante as ComprovanteReciboV3 | undefined) ??
    montarComprovanteReciboV3({
      os: payload,
      linhas,
      valorPago: valorRecebido,
      pagamento,
      intencaoLabel: typeof primeira.intencao === "string" ? primeira.intencao : "Recebimento",
      operador: p.operador,
      dataHora: p.dataHora,
    });
  return {
    os: payload,
    pagamento,
    valorRecebido,
    op: primeira.op === "liquidar" ? "liquidar" : "parcial",
    recibo,
    operacaoId: p.operacaoId,
    jaRegistrado: true,
  };
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

  const operacaoId = (input.operacaoId ?? "").trim() || gerarOperacaoIdV3();
  if (!OPERACAO_ID_PATTERN_V3.test(operacaoId)) throw new Error("Identificador da operação inválido.");

  // Período financeiro fechado?
  const lock = await verificarPeriodoFechado(sid, new Date());
  if (lock.fechado) throw new Error("Período financeiro fechado. Reabra o fechamento para receber.");

  const sessaoId = (input.sessaoId ?? "").trim();
  const operador = operadorLabel(session);
  const total = somaSplitV3(linhas);
  const obsBase = (input.observacao ?? "").trim();
  const requestFingerprint = fingerprintRecebimentoCanonicoV3({ storeId: sid, osId: id, sessaoId, linhas });
  const dataHora = nowIso();

  // UMA transação sob a MESMA trava por OS de todos os writers de pagamento da V3 (misto,
  // estorno, a prazo): nada é lido antes dela, e baixa, movimentação, caixa e espelho da
  // OS entram juntos ou não entram.
  const resultado = await prisma.$transaction(async (tx): Promise<ReceberOSResultV3> => {
    // 1) Serialização por OS — PRIMEIRA instrução, antes de qualquer leitura de estado.
    await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(sid, id));

    // 2) Replay: esta confirmação já foi gravada (resposta perdida, reenvio)? Identidade =
    // (sessão de caixa, operacaoId) — mesma família do recebimento em lote, cujo `localId`
    // também carrega a sessão; a sessão entra no fingerprint. Vem antes da checagem da
    // sessão: repetir uma operação já gravada continua válido com o caixa fechado.
    const gravadas = sessaoId
      ? await tx.caixaOperacao.findMany({
          where: { storeId: sid, sessaoId, tipo: "recebimento_cr", payload: { path: ["operacaoId"], equals: operacaoId } },
          orderBy: { at: "asc" },
          select: { valor: true, payload: true },
        })
      : [];
    if (gravadas.length > 0) {
      return replayRecebimentoOSV3(tx, { storeId: sid, osId: id, operacaoId, requestFingerprint, gravadas, operador, dataHora });
    }

    // 3) Sessão de caixa ABERTA da loja, travada: o fechamento do caixa espera este recebimento.
    const sessao = sessaoId ? await travarSessaoCaixa(tx, sid, sessaoId) : null;
    if (!sessao || sessao.status !== "ABERTA") throw new Error("Caixa fechado: abra o caixa no PDV antes de receber.");

    // 4) OS travada, com o payload MAIS RECENTE.
    const { rowId, payload, os } = await lerOSTravadaV3(tx, sid, id);
    const codigo = os.codigo ?? id;

    // 5) Título ÚNICO da OS, travado e relido (criado se ausente) — fornece o token CAS.
    const tituloSnapshot = await garantirTituloOSTravadoV3(tx, {
      storeId: sid,
      osId: id,
      codigo,
      cliente: os.cliente?.nome ?? "",
      total: totalCobravelV3(os),
      vencimento: ((payload.aberturaV3 as { pagamentoPrevisto?: { vencimentoPrevisto?: string } } | undefined)?.pagamentoPrevisto?.vencimentoPrevisto) || dataHora,
    });
    if (!tituloSnapshot) throw new Error("Esta OS não tem valor a cobrar. Gere/aprove o orçamento antes de receber.");
    const localKey = localKeyContaReceberOSV3(sid, id);

    // Valida a SOMA do split contra o saldo REAL (proteção contra valor > saldo no motor único).
    const saldoSnapshot = buildContaReceberAuditTrail([tituloSnapshot])[0]?.saldoAberto ?? 0;
    // Concorrência otimista: só grava contra o saldo que o operador viu. Um segundo
    // recebimento sobre um saldo que ele não viu (ex.: a tentativa anterior gravou e a
    // resposta se perdeu) é recusado antes de qualquer escrita — com ou sem a mesma chave.
    if (input.saldoEsperado !== undefined && input.saldoEsperado !== null) {
      const esperadoCentavos = Math.round(Number(input.saldoEsperado) * 100);
      if (!Number.isFinite(esperadoCentavos) || esperadoCentavos !== Math.round(saldoSnapshot * 100)) {
        throw new Error(`O saldo desta OS mudou (agora R$ ${saldoSnapshot.toFixed(2)}). Atualize e confirme de novo.`);
      }
    }
    const veredito = validarSplitV3(linhas, saldoSnapshot);
    if (!veredito.ok) throw new Error(veredito.motivo ?? "Recebimento inválido.");
    const op: "liquidar" | "parcial" = veredito.op ?? "parcial";

    const splitDesc = descreverSplitV3(linhas);
    const intencaoLabel = rotuloIntencaoV3(input.intencao, op === "liquidar");
    const obs = `${obsBase ? obsBase + " · " : ""}OS ${codigo} · PDV Serviço · ${intencaoLabel} · ${splitDesc}`;

    // 6) Baixa do título sobre o snapshot TRAVADO (token CAS). `loteId` carimba no histórico
    // a identidade desta operação — o mesmo campo que o recebimento em lote usa para isso.
    const baixa = op === "liquidar"
      ? await liquidarContaReceber({
          storeId: sid,
          localKey,
          observacao: obs,
          userLabel: operador,
          loteId: operacaoId,
          tituloSnapshot,
          db: tx,
        })
      : await registrarPagamentoParcial({
          storeId: sid,
          localKey,
          valorPago: total,
          observacao: obs,
          userLabel: operador,
          loteId: operacaoId,
          tituloSnapshot,
          db: tx,
        });
    if (!baixa.ok) {
      const prefixo = op === "liquidar" ? "quitar" : "registrar o pagamento";
      throw new Error(`Não foi possível ${prefixo} (${baixa.reason}).`);
    }
    const tituloRow = baixa.data;
    const recebidoTotal = sumPagamentosFromHistoricoPayload(tituloRow.payload);

    // 7) Movimentação financeira: UMA por baixa gravada. A identidade é desta operação
    // (trava + `operacaoId` com replay acima), por isso a heurística de soma do helper fica
    // desligada — ela suprimia um recebimento parcial legítimo menor que os anteriores
    // (ex.: R$ 20 depois de R$ 350). Falha aborta a transação inteira.
    const mov = await createMovimentacaoEntradaFromReceber(
      { id: tituloRow.id, storeId: tituloRow.storeId, descricao: tituloRow.descricao, cliente: tituloRow.cliente },
      total,
      { parcial: op === "parcial", db: tx, idempotenciaDoChamador: true },
    );
    if (!mov.ok) throw new Error(`Falha ao lançar a movimentação financeira (${mov.reason}).`);

    // 8) Operação de caixa POR FORMA → fechamento separa por forma; dinheiro entra na gaveta.
    for (const [indice, l] of linhas.entries()) {
      await tx.caixaOperacao.create({
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
            localKey,
            formaPagamento: l.forma,
            intencao: intencaoLabel,
            op: op,
            operacaoId,
            requestFingerprint,
            localId: `ops-v3-receber:${sid}:${id}:${operacaoId}:${indice}`,
          } as Prisma.InputJsonValue,
        },
      });
    }

    // 9) Espelho + timeline + comprovante sobre o payload TRAVADO (mais recente). O espelho
    // sai do título recém-baixado e o "a prazo" é reconciliado: quitado o saldo, deixa de
    // ser cobrança pendente.
    const formasLabel = linhas.map((l) => formaLabelRecebimentoV3(l.forma)).join(" + ");
    const mirror = montarPagamentoMirrorV3({ total: money(tituloRow.valor), recebido: recebidoTotal, ultimaForma: formasLabel, tituloLocalKey: localKey, now: dataHora });
    const recibo = montarComprovanteReciboV3({
      os,
      linhas,
      valorPago: total,
      pagamento: mirror,
      intencaoLabel,
      operador,
      dataHora,
      observacao: obsBase || undefined,
    });
    const evento: EventoTimeline = {
      id: eventId(),
      tipo: "operacao_cobranca_gerada",
      autor: operador,
      autorTipo: "usuario",
      conteudo: `${intencaoLabel}: ${splitDesc} (total R$ ${total.toFixed(2)}) · saldo R$ ${mirror.saldo.toFixed(2)} (${mirror.status}).`,
      metadata: {
        intencao: input.intencao ?? (op === "liquidar" ? "quitacao" : "parcial"),
        intencaoLabel,
        total,
        linhas,
        op,
        saldo: mirror.saldo,
        status: mirror.status,
        sessaoId: sessao.id,
        operacaoId,
        comprovante: recibo,
      },
      criadoEm: dataHora,
    };
    const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
    const aPrazoV3 = reconciliarAPrazoAposBaixaV3(payload.aPrazoV3, mirror.saldo, dataHora);
    const nextPayload = {
      ...payload,
      pagamentoV3: mirror,
      ...(aPrazoV3 !== undefined ? { aPrazoV3 } : {}),
      timeline: [...timeline, evento],
      atualizadoEm: dataHora,
    } as OSPayloadFull;
    await tx.ordemServico.update({ where: { id: rowId }, data: { payload: nextPayload as unknown as Prisma.InputJsonValue } });

    return { os: nextPayload as unknown as OrdemServico, pagamento: mirror, valorRecebido: total, op: op, recibo, operacaoId, jaRegistrado: false };
  }, TX_PAGAMENTO_OS_V3);

  revalidarOperacoesV3("receberOSV3");
  return resultado;
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

  const sessaoId = (input.sessaoId ?? "").trim();
  const operador = operadorLabel(session);
  const dataHora = nowIso();

  // UMA transação sob a trava por OS: o título é lido DEPOIS de qualquer recebimento
  // concorrente (misto/canônico) ter commitado — o estorno nunca reverte com base num
  // snapshot velho nem sobrescreve uma baixa gravada no meio do caminho.
  const resultado = await prisma.$transaction(async (tx): Promise<EstornarRecebimentoResultV3> => {
    await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(sid, id));
    const sessao = sessaoId ? await travarSessaoCaixa(tx, sid, sessaoId) : null;
    if (!sessao || sessao.status !== "ABERTA") throw new Error("Caixa fechado: abra o caixa para estornar o recebimento.");
    const { rowId, payload, os } = await lerOSTravadaV3(tx, sid, id);

    const localKey = localKeyContaReceberOSV3(sid, id);
    await travarTitulo(tx, sid, localKey);
    const titulo = await getContaReceberByLocalKey(sid, localKey, tx);
    const recebidoAntes = titulo ? sumPagamentosFromHistoricoPayload(titulo.payload) : 0;
    if (!titulo || recebidoAntes <= 0) throw new Error("Não há recebimento para estornar nesta OS.");

    const res = await estornarContaReceber({
      storeId: sid,
      localKey,
      modo: "ultimo_pagamento",
      motivo: input.motivo || "Estorno de recebimento (Operações V3).",
      userLabel: operador,
      db: tx,
    });
    if (!res.ok) throw new Error(`Não foi possível estornar (${res.reason}).`);
    const recebidoDepois = sumPagamentosFromHistoricoPayload(res.data.payload);
    const estornado = Math.max(0, money(recebidoAntes - recebidoDepois));

    // Caixa: registra o estorno para AUDITORIA da sessão. (O fechamento agrega
    // hoje só sangria/suprimento/recebimento_cr; a baixa deste estorno na gaveta é
    // follow-up — ver relatório. Não modificamos o helper de caixa/PDV.)
    await tx.caixaOperacao.create({
      data: {
        sessaoId: sessao.id,
        storeId: sid,
        tipo: "estorno_recebimento_cr",
        valor: estornado,
        motivo: `Estorno OS ${os.codigo ?? id}${input.motivo ? " — " + input.motivo : ""}`,
        operador,
        payload: {
          origem: "operacoes-v3-os",
          ordemServicoId: id,
          tituloId: res.data.id,
          localKey,
        } as Prisma.InputJsonValue,
      },
    });

    // Espelho + timeline sobre o payload TRAVADO. O "a prazo" NÃO é tocado: estorno reverte
    // só dinheiro; uma autorização menor que o novo saldo deixa de valer no guard de entrega,
    // sem ser ampliada.
    const mirror = montarPagamentoMirrorV3({ total: money(res.data.valor), recebido: recebidoDepois, ultimaForma: "Estorno", tituloLocalKey: localKey, now: dataHora });
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
    const nextPayload = { ...payload, pagamentoV3: mirror, timeline: [...timeline, evento], atualizadoEm: dataHora } as OSPayloadFull;
    await tx.ordemServico.update({ where: { id: rowId }, data: { payload: nextPayload as unknown as Prisma.InputJsonValue } });
    return { os: nextPayload as unknown as OrdemServico, pagamento: mirror, estornado };
  }, TX_PAGAMENTO_OS_V3);

  revalidarOperacoesV3("estornarRecebimentoOSV3");
  return resultado;
}

// ----------------------------------------------------------------------------
// GOAL OPS-V4-RECEBIMENTO-A-PRAZO-MINIMO-006 — lançamento "a prazo" (NÃO é
// recebimento)
// ----------------------------------------------------------------------------
// Formaliza o saldo em aberto da OS como Conta a Receber pendente/parcial com
// vencimento futuro, autorizando a entrega sem dinheiro entrar agora. Action
// SEPARADA de `receberOSV3` — não é um branch dela: nunca chama
// `liquidarContaReceber`/`registrarPagamentoParcial` (nunca "pago"), nunca cria
// `caixaOperacao`, nunca chama `createMovimentacaoEntradaFromReceber`, e nunca
// exige sessão de caixa aberta. O status gravado preserva a classificação real
// do título: "parcial" quando já havia recebimento anterior (ex.: sinal),
// "pendente" só quando nunca houve recebimento — nunca regride um título
// parcial para pendente (isso apagaria o sinal recebido de qualquer relatório
// que leia o status canônico). O único lançamento no histórico do título é um
// marcador de auditoria (`tipo: "a_prazo_autorizado"`) — `sumPagamentosFromHistoricoPayload`
// só soma "pagamento"/"liquidacao"/"estorno_pagamento", então este marcador NUNCA
// conta como dinheiro recebido. Reusa o MESMO título único da OS (`garantirTituloOSTravadoV3`/
// `localKeyContaReceberOSV3`) — nunca cria um segundo título. Quando o cliente
// pagar de verdade, a baixa segue pelo fluxo normal (`receberOSV3`).

export interface LancarAPrazoInputV3 {
  vencimento: string;
  observacao?: string;
}

export interface LancarAPrazoResultV3 {
  os: OrdemServico;
  aPrazo: APrazoV3;
  valorFormalizado: number;
}

export async function lancarOSAPrazoV3(storeId: string, osId: string, input: LancarAPrazoInputV3): Promise<LancarAPrazoResultV3> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const vencimento = (input.vencimento ?? "").trim();
  if (!vencimento) throw new Error("Informe o vencimento para lançar a prazo.");
  if (Number.isNaN(new Date(vencimento).getTime())) throw new Error("Vencimento inválido.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para lançar a prazo.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para lançar a prazo nesta OS.");
  if (!guard.ok) throw new Error(guard.error);

  // Mesmo lock de período financeiro que o recebimento imediato respeita — criar/
  // atualizar um título em aberto também é uma operação financeira (não precisa de
  // caixa, mas precisa respeitar o fechamento do período).
  const lock = await verificarPeriodoFechado(sid, new Date());
  if (lock.fechado) throw new Error("Período financeiro fechado. Reabra o fechamento para lançar a prazo.");

  const operador = operadorLabel(session);
  const obs = (input.observacao ?? "").trim();
  const dataHora = nowIso();

  // UMA transação sob a MESMA trava por OS dos recebimentos: saldo e status saem do título
  // relido DEPOIS de qualquer baixa concorrente — a formalização nunca grava sobre um
  // snapshot velho (o que apagaria uma baixa commitada no meio do caminho).
  const resultado = await prisma.$transaction(async (tx): Promise<LancarAPrazoResultV3> => {
    await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(sid, id));
    const { rowId, payload, os } = await lerOSTravadaV3(tx, sid, id);
    const codigo = os.codigo ?? id;

    // MESMO título único da OS (localKey canônica), travado e relido — criado se ausente.
    const tituloRow = await garantirTituloOSTravadoV3(tx, {
      storeId: sid,
      osId: id,
      codigo,
      cliente: os.cliente?.nome ?? "",
      total: totalCobravelV3(os),
      vencimento,
    });
    if (!tituloRow) throw new Error("Esta OS não tem valor a cobrar. Gere/aprove o orçamento antes de lançar a prazo.");
    const statusAtual = normalizeReceberStatus(tituloRow.status);
    if (statusAtual === RECEBER_STATUS.CANCELADO || statusAtual === RECEBER_STATUS.ESTORNADO) {
      throw new Error("O título desta OS está cancelado/estornado — não há saldo para lançar a prazo.");
    }
    const titulo = {
      localKey: localKeyContaReceberOSV3(sid, id),
      recebido: sumPagamentosFromHistoricoPayload(tituloRow.payload),
      saldo: buildContaReceberAuditTrail([tituloRow])[0]?.saldoAberto ?? 0,
    };
    if (titulo.saldo <= 0) throw new Error("Esta OS já está quitada — não há saldo para lançar a prazo.");

    // Preserva a classificação real do título (ver `statusTituloAPrazoV3`, pura em
    // payment-model.ts) — nunca regride um título "parcial" para "pendente".
    const statusTituloAPrazo = statusTituloAPrazoV3(titulo.recebido);

    // Só atualiza vencimento/observação/status do MESMO título — NUNCA liquida/paga.
    // Linha travada acima: o upsert lê e grava sem ninguém no meio.
    await upsertContaReceber({
      storeId: sid,
      localKey: titulo.localKey,
      vencimento,
      status: statusTituloAPrazo,
      historicoEntrada: {
        tipo: "a_prazo_autorizado",
        valor: titulo.saldo,
        vencimento,
        observacao: obs || undefined,
        userLabel: operador,
      },
      db: tx,
    });

    const aPrazo = montarAPrazoMirrorV3({
      valor: titulo.saldo,
      vencimento,
      tituloLocalKey: titulo.localKey,
      autorizadoPor: operador,
      observacao: obs || undefined,
      now: dataHora,
    });

    const evento: EventoTimeline = {
      id: eventId(),
      tipo: "financeiro_conta_receber_criada",
      autor: operador,
      autorTipo: "usuario",
      conteudo: `Entrega autorizada a prazo (OS ${codigo}): R$ ${titulo.saldo.toFixed(2)} · vencimento ${vencimento}. Nenhum valor recebido — não movimenta caixa.`,
      metadata: { modo: "a_prazo", valor: titulo.saldo, vencimento, tituloLocalKey: titulo.localKey, autorizadoEntrega: true },
      criadoEm: dataHora,
    };
    const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
    const nextPayload = { ...payload, aPrazoV3: aPrazo, timeline: [...timeline, evento], atualizadoEm: dataHora } as OSPayloadFull;
    await tx.ordemServico.update({ where: { id: rowId }, data: { payload: nextPayload as unknown as Prisma.InputJsonValue } });
    return { os: nextPayload as unknown as OrdemServico, aPrazo, valorFormalizado: titulo.saldo };
  }, TX_PAGAMENTO_OS_V3);

  revalidarOperacoesV3("lancarOSAPrazoV3");
  return resultado;
}

// ----------------------------------------------------------------------------
// GOAL OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001 — pagamento imediato + saldo a prazo
// ----------------------------------------------------------------------------
// Uma confirmação = UMA transação (`decidirRecebimentoMistoOSV3`): baixa só do
// dinheiro recebido agora, movimentação e caixa por forma desse valor, e o
// restante formalizado a prazo no MESMO título da OS, com vencimento. Não chama
// `receberOSV3` + `lancarOSAPrazoV3` em sequência. O resultado é TERMINAL por
// `operacaoId`: gravada (replay devolve o mesmo) ou recusada (`{ ok: false }` com
// `naoRegistrada`, a mesma recusa para sempre). Erro inesperado é relançado para a
// tela tratar como resultado DESCONHECIDO e reenviar com a MESMA `operacaoId`.

export type RegistrarRecebimentoMistoInputV3 = RecebimentoMistoInputV3;

export type RegistrarRecebimentoMistoResultV3 =
  | ({ ok: true } & ResultadoRecebimentoMistoV3)
  | {
      ok: false;
      code: RecebimentoMistoErroCodigoV3;
      mensagem: string;
      saldoAtual?: number;
      /**
       * `true` = o servidor CONFERIU que nada está gravado com esta `operacaoId` (e nada foi
       * gravado agora). Só então a tela pode abandonar a chave de uma operação incerta.
       * Ausente (sessão/permissão) = não conferido: a chave precisa ser mantida.
       */
      naoRegistrada?: true;
    };

function falhaMistaV3(code: RecebimentoMistoErroCodigoV3, mensagem: string, saldoAtual?: number): RegistrarRecebimentoMistoResultV3 {
  return saldoAtual === undefined ? { ok: false, code, mensagem } : { ok: false, code, mensagem, saldoAtual };
}

/** Recusa depois de conferir a identidade: nada gravado com esta chave. */
function falhaMistaConferidaV3(code: RecebimentoMistoErroCodigoV3, mensagem: string, saldoAtual?: number): RegistrarRecebimentoMistoResultV3 {
  return { ...(falhaMistaV3(code, mensagem, saldoAtual) as Extract<RegistrarRecebimentoMistoResultV3, { ok: false }>), naoRegistrada: true };
}

/** Conflito de escrita concorrente detectado pelo banco (título criado em paralelo, deadlock). */
function conflitoConcorrenteV3(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "P2002" || code === "P2034";
}

export async function registrarRecebimentoMistoOSV3(
  storeId: string,
  osId: string,
  input: RegistrarRecebimentoMistoInputV3,
): Promise<RegistrarRecebimentoMistoResultV3> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  if (!sid) return falhaMistaV3("entrada_invalida", "Selecione uma unidade ativa para continuar (Operações V3).");
  if (!id) return falhaMistaV3("entrada_invalida", "OS não informada.");

  // Sessão e permissão ANTES de qualquer leitura — inclusive da conferência de replay.
  const session = await auth();
  if (!session?.user?.id) return falhaMistaV3("nao_autenticado", "Faça login para registrar o recebimento.");
  // A prazo é formalização de crédito ao cliente: além de editar a OS, exige a
  // permissão canônica de gerar cobrança. Nunca vale só porque o browser pediu.
  const guard = await requireEnterpriseWith(
    sid,
    (p) => p.operacoes.editarOs && p.operacoes.gerarCobranca,
    "Sem permissão para registrar recebimento a prazo nesta OS.",
  );
  if (!guard.ok) return falhaMistaV3("sem_permissao", guard.error);

  const ctx = { storeId: sid, osId: id, operador: operadorLabel(session), operadorId: session.user.id, agora: nowIso() };
  // Identidade da confirmação: a data de hoje não importa para ela (só valida vencimento ≥ hoje).
  const identidade = normalizarRecebimentoMistoV3(input, DATA_MINIMA_REPLAY_V3);
  // Malformada: nada jamais pode ser gravado com ela — recusa terminal por construção.
  if (!identidade.ok) return falhaMistaConferidaV3(identidade.code, identidade.mensagem);
  const normal = normalizarRecebimentoMistoV3(input, hojeLojaV3());
  const periodo = await verificarPeriodoFechado(sid, new Date());
  // O que barraria uma operação NOVA (vencimento passado, período fechado). Não é decidido
  // aqui: sob a trava da OS, depois do replay — reenviar uma confirmação já gravada continua
  // devolvendo o gravado — e então gravado como o resultado terminal da chave.
  const recusaPrevia = !normal.ok
    ? { code: normal.code, mensagem: normal.mensagem }
    : periodo.fechado
      ? { code: "periodo_fechado" as const, mensagem: "Período financeiro fechado. Reabra o fechamento para registrar o recebimento." }
      : null;

  try {
    const decisao = await prisma.$transaction(
      (tx) => decidirRecebimentoMistoOSV3(tx, ctx, identidade.valor, recusaPrevia),
      TX_PAGAMENTO_OS_V3,
    );
    // Recusa decidida sob a trava e gravada como terminal: a chave nunca mais grava.
    if (decisao.tipo === "recusada") return falhaMistaConferidaV3(decisao.recusa.code, decisao.recusa.mensagem, decisao.recusa.saldoAtual);
    revalidarOperacoesV3("registrarRecebimentoMistoOSV3");
    return { ok: true, ...decisao.resultado };
  } catch (e) {
    // Mesma chave já usada com outro conteúdo: este conteúdo nunca foi gravado com ela.
    if (isRecebimentoMistoErroV3(e)) return falhaMistaConferidaV3(e.code, e.message, e.saldoAtual);
    // Conflito transitório do banco: nada desta tentativa ficou gravado, mas a chave segue
    // em aberto (não conferida) — a tela mantém a pendência e reenvia a MESMA operação.
    if (conflitoConcorrenteV3(e)) {
      return falhaMistaV3("titulo_alterado", "A OS foi alterada por outra operação ao mesmo tempo. Atualize o saldo e confirme de novo.");
    }
    throw e;
  }
}
