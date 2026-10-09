import type { OrdemServico } from "@/types/os";
import { normalizeReceberStatus, RECEBER_STATUS } from "@/lib/financeiro/contracts/status";
import {
  autorizadaParaEntregaFinanceiraV3,
  projetarEntregaFinanceiraV3,
  reconciliarRecebimentosFinanceirosV3,
  reconciliarTotaisFinanceirosV3,
  type EntregaFinanceiraDecisaoV3,
  type ProjetarEntregaFinanceiraInputV3,
} from "@/lib/operacoes-v3/delivery-financial-guard";
import { formaLabelRecebimentoV3, localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import { computeTotaisV3, orcamentoRealV3, statusEfetivoOrcamentoV3 } from "@/lib/operacoes-v3/orcamento-model";

export type FinancialStatusV4 =
  | "UNKNOWN"
  | "NO_PRICE"
  | "PRICE_DEFINED"
  | "CHARGE_NOT_CREATED"
  | "OPEN"
  | "PARTIAL"
  | "PAID"
  | "AUTHORIZED_CREDIT"
  | "AUTHORIZED_NO_CHARGE"
  | "INCONSISTENT"
  | "CANCELLED"
  | "REVERSED";

export type FinancialConsistencyStatusV4 = "CONSISTENT" | "INCOMPLETE" | "INCONSISTENT" | "UNKNOWN";
export type FinancialEventSourceV4 = "RECEIVABLE" | "OS_TIMELINE";

export interface FinancialPaymentMethodV4 {
  code: string;
  label: string;
  amount: number | null;
  source: "RECEIVABLE_HISTORY" | "PDV_SPLIT" | "PAYMENT_SNAPSHOT" | "LEGACY";
}

export interface FinancialInstallmentV4 {
  number: string;
  dueAt: string | null;
  amount: number | null;
  status: string | null;
}

/** Pagamento VIGENTE (não estornado) do título, na ordem do histórico. */
export interface FinancialPaymentV4 {
  amount: number;
  /**
   * Identidade da operação gravada pelo writer: `loteId` (= `operacaoId`) da baixa ou,
   * na baixa do recebimento misto, a `operacaoId` do marcador gravado com ela. `null` =
   * baixa sem identidade (ex.: feita pelo Financeiro).
   */
  operationId: string | null;
}

export interface FinancialEventV4 {
  eventId: string;
  source: FinancialEventSourceV4;
  type: string;
  amount: number | null;
  paymentMethod: string | null;
  occurredAt: string | null;
  actor: string | null;
  description: string;
}

// ----------------------------------------------------------------------------
// GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — três dimensões ADITIVAS.
// Fatos do título, situação comercial e ações possíveis, ao lado dos campos
// legados (que seguem idênticos: matriz de equivalência). Nenhuma decisão nova:
// `acoes` espelha `canReceive`/`canDeliver` e só NOMEIA o motivo do bloqueio que
// o guard já decidiu. Fatos só com vínculo, histórico e status verificáveis;
// senão `null` (nunca zero) e motivo estruturado. Opcionais no tipo: leitores e
// fixtures anteriores seguem válidos sem elas.
// ----------------------------------------------------------------------------

export type ImpedimentoCodigoV4 =
  | "APROVACAO_COMERCIAL_PENDENTE"
  | "ORCAMENTO_RECUSADO"
  | "ORCAMENTO_EXPIRADO"
  | "PRECO_AUSENTE"
  | "SEM_COBRANCA_EXIGE_AUTORIZACAO"
  | "VALORES_DIVERGENTES"
  | "TITULO_NAO_VINCULADO"
  | "HISTORICO_INVALIDO"
  | "ESTORNO_AMBIGUO"
  | "RECEBIDO_ACIMA_DO_TITULO"
  | "FALHA_LEITURA"
  | "COBRANCA_NAO_FORMALIZADA"
  | "SALDO_EM_ABERTO"
  | "COBRANCA_CANCELADA"
  | "PAGAMENTO_ESTORNADO";

export type DestinoImpedimentoV4 = "comercial" | "financeiro" | "entrega" | "recarregar";

export interface ImpedimentoOSV4 {
  codigo: ImpedimentoCodigoV4;
  destino: DestinoImpedimentoV4;
}

/** Meio de um pagamento VIGENTE, ligado a ele pela identidade da operação ou pela própria baixa. */
export interface MeioRegistradoV4 {
  label: string;
  valor: number | null;
  operacaoId: string | null;
  fonte: "RECEIVABLE_HISTORY" | "OS_TIMELINE";
}

export interface FatosFinanceirosOSV4 {
  /** Existe Conta a Receber na chave canônica da OS (vínculo conferido ou não). */
  tituloEncontrado: boolean;
  /** Vínculo, histórico, estornos e status conferem — só então há valores. */
  verificavel: boolean;
  /** Por que não é verificável (`null` quando é, ou quando não há título). */
  motivo: ImpedimentoCodigoV4 | null;
  tituloId: string | null;
  valorTitulo: number | null;
  recebidoBruto: number | null;
  estornado: number | null;
  recebidoLiquido: number | null;
  saldoTitulo: number | null;
  /** Verificável, saldo zero e status "pago". Não significa OS liberada. */
  liquidado: boolean;
  /** O histórico do título traz lançamento de pagamento (mesmo sem verificação). */
  temRegistroDePagamento: boolean;
  pagamentosVigentes: FinancialPaymentV4[] | null;
  meios: MeioRegistradoV4[];
  /** Parte vigente cujo meio não se identifica com segurança (ex.: baixa feita fora da OS). */
  semMeioIdentificado: number | null;
}

export type EstadoOrcamentoComercialV4 =
  | "ausente"
  | "previa"
  | "rascunho"
  | "enviado"
  | "aprovado"
  | "recusado"
  | "expirado"
  | "desconhecido";

export interface DivergenciaComercialV4 {
  /** `ORCAMENTO_ILEGIVEL`: linhas do orçamento fora do formato — total comercial desconhecido. */
  codigo: "FONTES_DE_PRECO" | "ORCAMENTO_X_TITULO" | "ORCAMENTO_ILEGIVEL";
  detalhe: string;
}

export interface ComercialOSV4 {
  orcamento: EstadoOrcamentoComercialV4;
  /** Total calculado do orçamento real (qualquer status); `null` sem orçamento real ou total inválido. */
  totalOrcamento: number | null;
  /** Total do orçamento APROVADO usado pelo guard; `null` sem aprovação. */
  totalAprovado: number | null;
  /** Orçamento real × valor do título vinculado; `null` quando um dos dois falta. */
  confereComTitulo: boolean | null;
  divergencias: DivergenciaComercialV4[];
}

export interface AcoesOSV4 {
  /** Igual a `canReceive` (decisão legada, sem mudança). */
  podeReceber: boolean;
  /** Igual a `canDeliver` (decisão legada, sem mudança). */
  podeEntregar: boolean;
  /** Motivo estruturado do bloqueio da entrega e onde ele se resolve. */
  impedimento: ImpedimentoOSV4 | null;
}

/** Histórico de recebimentos para EXIBIÇÃO: a mesma operação comprovada em duas fontes vira um item. */
export interface RegistroHistoricoFinanceiroV4 {
  id: string;
  /** Identidade comprovada da operação (`null` = sem identidade: item isolado). */
  operacaoId: string | null;
  tipo: string;
  descricao: string;
  valor: number | null;
  meio: string | null;
  ocorridoEm: string | null;
  autor: string | null;
  fontes: FinancialEventSourceV4[];
  eventIds: string[];
  estorno: boolean;
}

export interface FinancialProjectionOSV4 {
  version: 1;
  storeId: string;
  osId: string;
  osCode: string;
  operationalStatus: string;

  expectedTotal: number | null;
  expectedTotalSource: string[];
  approvedBudgetTotal: number | null;
  osColumnTotal: number | null;
  legacyTotal: number | null;
  billingSnapshotTotal: number | null;

  receivableFound: boolean;
  receivableId: string | null;
  receivableTotal: number | null;
  receivableStatus: string | null;
  receivedTotal: number | null;
  reversedTotal: number | null;
  balance: number | null;

  financialStatus: FinancialStatusV4;
  consistencyStatus: FinancialConsistencyStatusV4;
  consistencyIssues: string[];

  paymentMethods: FinancialPaymentMethodV4[];
  collectionMode: string | null;
  installments: FinancialInstallmentV4[];

  authorizedCredit: boolean;
  authorizedNoCharge: boolean;
  noChargeCategory: string | null;
  noChargeReason: string | null;

  financialEvents: FinancialEventV4[];
  /**
   * GOAL OPS-V4-FLUXO-CURTO-006: pagamentos vigentes do título (pagamento/liquidação
   * menos os estornados, pela referência `refHistoricoIndex`), na ordem. `[]` = sem
   * pagamento; `null` = histórico ilegível (nada se conclui sobre comprovantes).
   */
  receivablePayments?: FinancialPaymentV4[] | null;
  canReceive: boolean;
  canDeliver: boolean;
  deliveryDecision: EntregaFinanceiraDecisaoV3;

  loadedAt: string;
  errorCode: string | null;

  /** GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — dimensões aditivas (ver acima). */
  fatos?: FatosFinanceirosOSV4;
  comercial?: ComercialOSV4;
  acoes?: AcoesOSV4;
  historico?: RegistroHistoricoFinanceiroV4[];
}

export interface ProjectFinancialOSV4Input extends ProjetarEntregaFinanceiraInputV3 {
  osCode?: string | null;
  operationalStatus?: string | null;
  loadedAt: string;
  errorCode?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function sourceAmount(
  sources: ReturnType<typeof reconciliarTotaisFinanceirosV3>["fontes"],
  source: string,
): number | null {
  const match = sources.find((item) => item.origem === source);
  return match ? match.centavos / 100 : null;
}

const METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Débito",
  débito: "Débito",
  credito: "Crédito",
  crédito: "Crédito",
  cartao_debito: "Débito",
  cartao_credito: "Crédito",
};

function method(codeValue: unknown, amount: unknown, source: FinancialPaymentMethodV4["source"]): FinancialPaymentMethodV4 | null {
  const raw = text(codeValue);
  if (!raw) return null;
  const code = raw.toLocaleLowerCase("pt-BR").replace(/\s+/g, "_");
  const known = METHOD_LABELS[code];
  const label = known ?? formaLabelRecebimentoV3(code).replace(/^PIX$/, "Pix");
  return { code, label: label || raw, amount: money(amount), source };
}

function methodsFromRecord(record: Record<string, unknown>, source: FinancialPaymentMethodV4["source"]): FinancialPaymentMethodV4[] {
  const lines = Array.isArray(record.linhas) ? record.linhas : Array.isArray(record.split) ? record.split : [];
  const fromLines = lines.flatMap((line) => {
    if (!isRecord(line)) return [];
    const item = method(line.forma ?? line.formaPagamento ?? line.paymentMethod, line.valor ?? line.amount, source);
    return item ? [item] : [];
  });
  if (fromLines.length) return fromLines;
  const single = method(record.formaPagamento ?? record.forma ?? record.paymentMethod, record.valor ?? record.amount, source);
  return single ? [single] : [];
}

function uniqueMethods(items: FinancialPaymentMethodV4[]): FinancialPaymentMethodV4[] {
  const out: FinancialPaymentMethodV4[] = [];
  for (const item of items) {
    const previous = out.find((candidate) => candidate.code === item.code);
    if (!previous) out.push({ ...item });
    else if (previous.amount != null && item.amount != null) previous.amount = Math.round((previous.amount + item.amount) * 100) / 100;
  }
  return out;
}

function readPaymentMethods(payload: OrdemServico & Record<string, unknown>, titlePayload: unknown): FinancialPaymentMethodV4[] {
  const titleHistory = isRecord(titlePayload) && Array.isArray(titlePayload.historico) ? titlePayload.historico : [];
  const structuredTitle = uniqueMethods(titleHistory.flatMap((entry) => (isRecord(entry) ? methodsFromRecord(entry, "RECEIVABLE_HISTORY") : [])));
  if (structuredTitle.length) return structuredTitle;

  const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
  const pdvSplit = uniqueMethods(timeline.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const type = text(entry.tipo).toLowerCase();
    if (!type.includes("financeir") && !type.includes("cobranca") && !type.includes("pagamento")) return [];
    const metadata = isRecord(entry.metadata) ? entry.metadata : {};
    return methodsFromRecord(metadata, "PDV_SPLIT");
  }));
  if (pdvSplit.length) return pdvSplit;

  const paymentSnapshot = isRecord(payload.pagamentoV3) ? payload.pagamentoV3 : null;
  const lastMethod = text(paymentSnapshot?.ultimaForma);
  if (lastMethod) {
    return uniqueMethods(lastMethod.split(/\s*\+\s*/).flatMap((part) => {
      const item = method(part, null, "PAYMENT_SNAPSHOT");
      return item ? [item] : [];
    }));
  }

  const legacy = method(payload.faturamentoFormaPagamento, null, "LEGACY");
  return legacy ? [legacy] : [];
}

/**
 * O espelho `aPrazoV3` só vira parcela/cobrança enquanto a autorização a prazo VALE contra
 * o saldo autoritativo do título (guard de entrega). Quitado o saldo — ou com a autorização
 * menor que o saldo após estorno — ele é histórico, nunca parcela pendente. O valor exibido
 * nunca passa do saldo real.
 */
function aPrazoVigente(
  payload: Record<string, unknown>,
  guard: ReturnType<typeof projetarEntregaFinanceiraV3>,
): Record<string, unknown> | null {
  if (!guard.autorizacaoAPrazo || guard.saldo == null || !isRecord(payload.aPrazoV3)) return null;
  const valor = money(payload.aPrazoV3.valor);
  return { ...payload.aPrazoV3, valor: valor == null ? null : Math.min(valor, guard.saldo) };
}

/**
 * Parcela é cobrança A VENCER: só existe enquanto o título tem saldo em aberto conhecido.
 * Quitado (ou saldo indeterminável), parcelas persistidas são histórico — nunca "Vencimento"
 * pendente. Com a prazo vigente, ele (já reconciliado com o saldo real) prevalece sobre o
 * plano persistido no título/faturamento.
 */
function readInstallments(
  titlePayload: unknown,
  payload: Record<string, unknown>,
  aPrazo: Record<string, unknown> | null,
  saldoEmAberto: boolean,
): FinancialInstallmentV4[] {
  if (!saldoEmAberto) return [];
  const persisted = isRecord(titlePayload) && Array.isArray(titlePayload.parcelas)
    ? titlePayload.parcelas
    : Array.isArray(payload.faturamentoParcelas)
      ? payload.faturamentoParcelas
      : [];
  const raw = aPrazo
    ? [{ numero: "1", vencimento: aPrazo.vencimento, valor: aPrazo.valor, status: aPrazo.status }]
    : persisted;
  return raw.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    return [{
      number: text(entry.numero ?? entry.parcela) || String(index + 1),
      dueAt: text(entry.vencimento ?? entry.dueAt) || null,
      amount: money(entry.valor ?? entry.amount),
      status: text(entry.status) || null,
    }];
  });
}

const EVENT_DESCRIPTIONS: Record<string, string> = {
  pagamento: "Pagamento registrado",
  liquidacao: "Liquidação registrada",
  estorno_pagamento: "Pagamento estornado",
  estorno_titulo: "Título estornado",
  a_prazo_autorizado: "Entrega autorizada a prazo",
};

/**
 * Identidade de uma baixa que o recebimento misto (`registrarRecebimentoMistoOSV3`)
 * grava sem `loteId`: na MESMA transação, sob a trava do título, o writer grava logo
 * em seguida o marcador `a_prazo_autorizado` com a `operacaoId` e o `recebidoAgora`
 * da operação. Só esse vínculo explícito (entrada imediatamente seguinte, mesmo valor
 * recebido) identifica a baixa. Baixa sem marcador (ex.: feita pelo Financeiro) segue
 * sem identidade — nunca se deduz identidade por valor e ordem.
 */
function mixedReceiptOperationId(next: unknown, amount: number): string | null {
  if (!isRecord(next) || text(next.tipo).toLowerCase() !== "a_prazo_autorizado") return null;
  const operationId = text(next.operacaoId);
  const receivedNow = typeof next.recebidoAgora === "number" ? money(next.recebidoAgora) : null;
  if (!operationId || receivedNow == null || receivedNow <= 0) return null;
  return Math.round(receivedNow * 100) === Math.round(amount * 100) ? operationId : null;
}

/**
 * Pagamentos vigentes do histórico do título. Estorno com `refHistoricoIndex`
 * remove exatamente o pagamento referido; sem referência, o último vigente (mesma
 * regra do serviço de estorno). Referência a pagamento inexistente ou já estornado
 * torna o histórico ilegível para este fim (`null`) — fail-closed.
 */
function readValidPayments(titlePayload: unknown): FinancialPaymentV4[] | null {
  const entries = readValidPaymentEntries(titlePayload);
  return entries ? entries.map(({ amount, operationId }) => ({ amount, operationId })) : null;
}

/** Mesma leitura de `readValidPayments`, com o índice da baixa no histórico do título. */
function readValidPaymentEntries(titlePayload: unknown): Array<FinancialPaymentV4 & { index: number }> | null {
  if (!isRecord(titlePayload) || titlePayload.historico == null) return [];
  if (!Array.isArray(titlePayload.historico)) return null;
  const vigentes: Array<FinancialPaymentV4 & { index: number }> = [];
  const historico: unknown[] = titlePayload.historico;
  for (let index = 0; index < historico.length; index++) {
    const entry = historico[index];
    if (!isRecord(entry)) continue;
    const type = text(entry.tipo).toLowerCase();
    if (type === "pagamento" || type === "liquidacao") {
      const amount = money(entry.valor);
      if (amount == null) return null;
      vigentes.push({ index, amount, operationId: text(entry.loteId) || mixedReceiptOperationId(historico[index + 1], amount) });
      continue;
    }
    if (type !== "estorno_pagamento") continue;
    const ref = typeof entry.refHistoricoIndex === "number" ? entry.refHistoricoIndex : null;
    const pos = ref == null ? vigentes.length - 1 : vigentes.findIndex((item) => item.index === ref);
    if (pos < 0) return null;
    vigentes.splice(pos, 1);
  }
  return vigentes;
}

function readFinancialEvents(payload: Record<string, unknown>, titlePayload: unknown): FinancialEventV4[] {
  const titleHistory = isRecord(titlePayload) && Array.isArray(titlePayload.historico) ? titlePayload.historico : [];
  const fromTitle = titleHistory.flatMap((entry, index): FinancialEventV4[] => {
    if (!isRecord(entry)) return [];
    const type = text(entry.tipo).toLowerCase();
    if (!type) return [];
    const occurredAt = text(entry.at ?? entry.criadoEm) || null;
    const methods = methodsFromRecord(entry, "RECEIVABLE_HISTORY");
    return [{
      eventId: `RECEIVABLE:${text(entry.id) || `${type}:${occurredAt ?? "undated"}:${index}`}`,
      source: "RECEIVABLE",
      type,
      amount: money(entry.valor),
      paymentMethod: methods.map((item) => item.label).join(" + ") || null,
      occurredAt,
      actor: text(entry.userLabel ?? entry.autor) || null,
      description: EVENT_DESCRIPTIONS[type] ?? "Evento financeiro do título",
    }];
  });

  const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
  const fromOS = timeline.flatMap((entry, index): FinancialEventV4[] => {
    if (!isRecord(entry)) return [];
    const type = text(entry.tipo).toLowerCase();
    const metadata = isRecord(entry.metadata) ? entry.metadata : {};
    const metadataEvent = text(metadata.evento).toLowerCase();
    const financial = type.includes("financeir") || type.includes("cobranca") || type.includes("pagamento") || metadataEvent.includes("cobranca");
    if (!financial) return [];
    const occurredAt = text(entry.criadoEm ?? entry.at) || null;
    const methods = methodsFromRecord(metadata, "PDV_SPLIT");
    return [{
      eventId: `OS_TIMELINE:${text(entry.id) || `${type}:${occurredAt ?? "undated"}:${index}`}`,
      source: "OS_TIMELINE",
      type: metadataEvent || type,
      amount: money(metadata.total ?? metadata.valor),
      paymentMethod: methods.map((item) => item.label).join(" + ") || null,
      occurredAt,
      actor: text(entry.autor) || null,
      description: text(entry.conteudo) || EVENT_DESCRIPTIONS[metadataEvent || type] || "Evento financeiro da OS",
    }];
  });

  return [...fromTitle, ...fromOS].sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
}

function financialStatus(
  guard: ReturnType<typeof projetarEntregaFinanceiraV3>,
  rawReceivableStatus: string | null,
): FinancialStatusV4 {
  const normalized = normalizeReceberStatus(rawReceivableStatus);
  if (normalized === RECEBER_STATUS.CANCELADO) return "CANCELLED";
  if (normalized === RECEBER_STATUS.ESTORNADO) return "REVERSED";
  if (guard.decisao === "BLOCK_INCONSISTENT") return "INCONSISTENT";
  if (guard.decisao === "BLOCK_UNKNOWN") return "UNKNOWN";
  if (guard.decisao === "BLOCK_CHARGE_NOT_CREATED") return "CHARGE_NOT_CREATED";
  if (guard.decisao === "BLOCK_NO_CHARGE_AUTH_REQUIRED") return "NO_PRICE";
  if (guard.decisao === "ALLOW_PAID") return "PAID";
  if (guard.decisao === "ALLOW_AUTHORIZED_CREDIT") return "AUTHORIZED_CREDIT";
  if (guard.decisao === "ALLOW_AUTHORIZED_NO_CHARGE") return "AUTHORIZED_NO_CHARGE";
  if (guard.saldo != null && guard.saldo > 0) return (guard.totalRecebido ?? 0) > 0 ? "PARTIAL" : "OPEN";
  return guard.totalEsperado != null ? "PRICE_DEFINED" : "UNKNOWN";
}

function consistencyStatus(guard: ReturnType<typeof projetarEntregaFinanceiraV3>): FinancialConsistencyStatusV4 {
  if (guard.decisao === "BLOCK_INCONSISTENT") return "INCONSISTENT";
  if (guard.decisao === "BLOCK_UNKNOWN") return "UNKNOWN";
  if (guard.decisao === "BLOCK_CHARGE_NOT_CREATED" || guard.decisao === "BLOCK_NO_CHARGE_AUTH_REQUIRED") return "INCOMPLETE";
  return "CONSISTENT";
}

// ---- GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — dimensões aditivas ----

const TOLERANCIA_CENTAVOS = 1;

/**
 * Valor monetário dos FATOS: só número finito e não negativo — o que todos os
 * writers gravam (e o `Float` do Prisma devolve). Nada de coerção: `[420]`, `true`,
 * texto ou objeto não comprovam pagamento. A leitura legada segue com a sua regra.
 */
function cents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

function temLancamentoDePagamento(titlePayload: unknown): boolean {
  if (!isRecord(titlePayload) || !Array.isArray(titlePayload.historico)) return false;
  return titlePayload.historico.some((entry) => {
    if (!isRecord(entry)) return false;
    const type = text(entry.tipo).toLowerCase();
    return type === "pagamento" || type === "liquidacao";
  });
}

/** Evento de RECEBIMENTO gravado pelos writers da OS para a operação (`receberOSV3` / misto). */
function eventoDeRecebimentoDaOperacao(payload: Record<string, unknown>, operacaoId: string, valorCentavos: number): Record<string, unknown> | null {
  const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
  for (const entry of timeline) {
    if (!isRecord(entry) || text(entry.tipo) !== "operacao_cobranca_gerada" || !isRecord(entry.metadata)) continue;
    if (text(entry.metadata.operacaoId) !== operacaoId) continue;
    if (cents(entry.metadata.total ?? entry.metadata.valor) !== valorCentavos) continue;
    return entry;
  }
  return null;
}

/** Rótulo de forma dos FATOS: só texto não vazio (nada de coerção de número/objeto). */
function rotuloMeioEstrito(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return method(value, null, "RECEIVABLE_HISTORY")?.label ?? null;
}

/**
 * Partes de um registro com meio: `linhas`/`split` (cada linha com forma em texto e
 * valor estritamente numérico e positivo) ou, sem linhas, a forma única do registro.
 * Linha malformada não vira valor — a parte dela fica sem meio identificado.
 * `null` = o registro não informa meio algum.
 */
function partesDoMeioV4(record: Record<string, unknown>, valorUnico: unknown): Array<{ label: string; centavos: number }> | null {
  const lines = Array.isArray(record.linhas) ? record.linhas : Array.isArray(record.split) ? record.split : null;
  if (lines && lines.length > 0) {
    return lines.flatMap((line) => {
      if (!isRecord(line)) return [];
      const label = rotuloMeioEstrito(line.forma ?? line.formaPagamento ?? line.paymentMethod);
      const centavos = cents(line.valor ?? line.amount);
      return label && centavos != null && centavos > 0 ? [{ label, centavos }] : [];
    });
  }
  const label = rotuloMeioEstrito(record.formaPagamento ?? record.forma ?? record.paymentMethod);
  if (!label) return null;
  const centavos = cents(valorUnico);
  return centavos != null && centavos > 0 ? [{ label, centavos }] : [];
}

/**
 * Meio de cada pagamento VIGENTE: o da própria baixa no título, ou o do evento de
 * recebimento da OS com a MESMA identidade de operação e o mesmo valor. Cada meio
 * guarda o PRÓPRIO valor registrado (split Pix R$ 100 numa baixa de R$ 420 é Pix
 * R$ 100 + R$ 320 sem meio); a baixa inteira só vai a um meio quando o registro dá
 * uma forma única sem linhas. Linhas que somam mais que a baixa são contraditórias:
 * nada é atribuído. Sem vínculo o valor fica "sem meio identificado" — nunca se
 * deduz por valor/horário.
 */
function meiosDosPagamentos(
  entries: Array<FinancialPaymentV4 & { index: number }>,
  titlePayload: unknown,
  payload: Record<string, unknown>,
): { meios: MeioRegistradoV4[]; semMeioCentavos: number } {
  const historico = isRecord(titlePayload) && Array.isArray(titlePayload.historico) ? titlePayload.historico : [];
  const meios: MeioRegistradoV4[] = [];
  let semMeioCentavos = 0;
  for (const pagamento of entries) {
    const valorCentavos = Math.round(pagamento.amount * 100);
    const entry = historico[pagamento.index];
    let partes = isRecord(entry) ? partesDoMeioV4(entry, entry.valor) : null;
    let fonte: MeioRegistradoV4["fonte"] = "RECEIVABLE_HISTORY";
    if (partes == null) {
      const evento = pagamento.operationId ? eventoDeRecebimentoDaOperacao(payload, pagamento.operationId, valorCentavos) : null;
      const metadata = evento && isRecord(evento.metadata) ? evento.metadata : null;
      partes = metadata ? partesDoMeioV4(metadata, metadata.valor ?? metadata.amount) : null;
      fonte = "OS_TIMELINE";
    }
    const conhecidos = partes ? partes.reduce((acc, parte) => acc + parte.centavos, 0) : 0;
    if (!partes || conhecidos > valorCentavos) {
      semMeioCentavos += valorCentavos;
      continue;
    }
    for (const parte of partes) meios.push({ label: parte.label, valor: parte.centavos / 100, operacaoId: pagamento.operationId, fonte });
    semMeioCentavos += valorCentavos - conhecidos;
  }
  return { meios, semMeioCentavos };
}

function fatosSemValores(
  input: ProjectFinancialOSV4Input,
  tituloEncontrado: boolean,
  motivo: ImpedimentoCodigoV4 | null,
): FatosFinanceirosOSV4 {
  return {
    tituloEncontrado,
    verificavel: false,
    motivo,
    tituloId: input.titulo?.id ?? null,
    valorTitulo: null,
    recebidoBruto: null,
    estornado: null,
    recebidoLiquido: null,
    saldoTitulo: null,
    liquidado: false,
    temRegistroDePagamento: input.titulo ? temLancamentoDePagamento(input.titulo.payload) : false,
    pagamentosVigentes: null,
    meios: [],
    semMeioIdentificado: null,
  };
}

/**
 * Leitura ESTRITA do histórico do título para os fatos (mais exigente que a
 * leitura legada, que segue intacta para as decisões): toda entrada é um registro
 * com tipo; toda baixa tem valor positivo; todo estorno aponta, por
 * `refHistoricoIndex`, para uma baixa ainda vigente e de MESMO valor — exatamente
 * o que o estorno canônico (`estornarContaReceber`) grava. Qualquer outra forma é
 * ambígua: nada se conclui sobre quem continua pago.
 */
function lerPagamentosEstritosV4(titlePayload: Record<string, unknown>):
  | { ok: true; vigentes: Array<FinancialPaymentV4 & { index: number }>; brutoCentavos: number; estornadoCentavos: number }
  | { ok: false; motivo: ImpedimentoCodigoV4 } {
  const historico = titlePayload.historico;
  if (historico === undefined) return { ok: true, vigentes: [], brutoCentavos: 0, estornadoCentavos: 0 };
  if (!Array.isArray(historico)) return { ok: false, motivo: "HISTORICO_INVALIDO" };
  const vigentes: Array<FinancialPaymentV4 & { index: number; centavos: number }> = [];
  let brutoCentavos = 0;
  let estornadoCentavos = 0;
  for (let index = 0; index < historico.length; index++) {
    const entry = historico[index];
    if (!isRecord(entry)) return { ok: false, motivo: "HISTORICO_INVALIDO" };
    const type = text(entry.tipo).toLowerCase();
    if (!type) return { ok: false, motivo: "HISTORICO_INVALIDO" };
    if (type === "pagamento" || type === "liquidacao") {
      const centavos = cents(entry.valor);
      if (centavos == null || centavos <= 0) return { ok: false, motivo: "HISTORICO_INVALIDO" };
      const amount = centavos / 100;
      vigentes.push({ index, centavos, amount, operationId: text(entry.loteId) || mixedReceiptOperationId(historico[index + 1], amount) });
      brutoCentavos += centavos;
      continue;
    }
    if (type !== "estorno_pagamento") continue;
    const ref = entry.refHistoricoIndex;
    const centavos = cents(entry.valor);
    const pos = typeof ref === "number" && Number.isInteger(ref) ? vigentes.findIndex((item) => item.index === ref) : -1;
    if (pos < 0 || centavos == null || centavos !== vigentes[pos]!.centavos) return { ok: false, motivo: "ESTORNO_AMBIGUO" };
    vigentes.splice(pos, 1);
    estornadoCentavos += centavos;
  }
  return { ok: true, vigentes: vigentes.map(({ index, amount, operationId }) => ({ index, amount, operationId })), brutoCentavos, estornadoCentavos };
}

/**
 * Fatos do título, independentes do comercial. Vínculo POSITIVO (loja, chave
 * canônica e `ordemServicoId` desta OS — todo writer o grava), histórico estrito e
 * coerência histórico × status; só então há valores. Nunca depende do preço aprovado.
 */
export function lerFatosFinanceirosV4(input: ProjectFinancialOSV4Input): FatosFinanceirosOSV4 {
  const titulo = input.titulo;
  if (input.falhaLeituraTitulo) return fatosSemValores(input, false, "FALHA_LEITURA");
  if (!titulo) return fatosSemValores(input, false, null);
  const valor = cents(titulo.valor);
  if (
    titulo.storeId !== input.storeId ||
    titulo.localKey !== localKeyContaReceberOSV3(input.storeId, input.osId) ||
    valor == null
  ) {
    return fatosSemValores(input, true, "TITULO_NAO_VINCULADO");
  }
  if (!isRecord(titulo.payload)) return fatosSemValores(input, true, "HISTORICO_INVALIDO");
  if (titulo.payload.ordemServicoId !== input.osId) return fatosSemValores(input, true, "TITULO_NAO_VINCULADO");
  const estrito = lerPagamentosEstritosV4(titulo.payload);
  if (!estrito.ok) return fatosSemValores(input, true, estrito.motivo);
  const recebimentos = reconciliarRecebimentosFinanceirosV3(titulo.payload);
  const liquidoCentavos = estrito.brutoCentavos - estrito.estornadoCentavos;
  // A leitura legada (por valor) tem de concordar com a estrita; senão, ambíguo.
  if (!recebimentos.valido || recebimentos.centavos !== liquidoCentavos) return fatosSemValores(input, true, "ESTORNO_AMBIGUO");
  const entries = estrito.vigentes;
  if (recebimentos.centavos > valor + TOLERANCIA_CENTAVOS) return fatosSemValores(input, true, "RECEBIDO_ACIMA_DO_TITULO");
  const status = normalizeReceberStatus(titulo.status);
  if (status === RECEBER_STATUS.CANCELADO) return fatosSemValores(input, true, "COBRANCA_CANCELADA");
  if (status === RECEBER_STATUS.ESTORNADO) return fatosSemValores(input, true, "PAGAMENTO_ESTORNADO");
  const saldo = Math.max(0, valor - recebimentos.centavos);
  const coerente =
    !!status &&
    (saldo <= TOLERANCIA_CENTAVOS
      ? status === RECEBER_STATUS.PAGO && recebimentos.centavos + TOLERANCIA_CENTAVOS >= valor
      : status === RECEBER_STATUS.VENCIDO ||
        (recebimentos.centavos <= TOLERANCIA_CENTAVOS && status === RECEBER_STATUS.PENDENTE) ||
        (recebimentos.centavos > TOLERANCIA_CENTAVOS && status === RECEBER_STATUS.PARCIAL));
  if (!coerente) return fatosSemValores(input, true, "HISTORICO_INVALIDO");
  const { meios, semMeioCentavos } = meiosDosPagamentos(entries, titulo.payload, input.payload);
  return {
    tituloEncontrado: true,
    verificavel: true,
    motivo: null,
    tituloId: titulo.id,
    valorTitulo: valor / 100,
    recebidoBruto: estrito.brutoCentavos / 100,
    estornado: estrito.estornadoCentavos / 100,
    recebidoLiquido: recebimentos.centavos / 100,
    saldoTitulo: saldo / 100,
    liquidado: saldo <= TOLERANCIA_CENTAVOS && status === RECEBER_STATUS.PAGO,
    temRegistroDePagamento: temLancamentoDePagamento(titulo.payload),
    pagamentosVigentes: entries.map(({ amount, operationId }) => ({ amount, operationId })),
    meios,
    semMeioIdentificado: semMeioCentavos / 100,
  };
}

const ESTADOS_ORCAMENTO: readonly EstadoOrcamentoComercialV4[] = ["rascunho", "enviado", "aprovado", "recusado", "expirado"];

/**
 * Linhas do orçamento legíveis para o total COMERCIAL aditivo: ausentes, ou lista de
 * registros com `grupoId` ausente ou em texto (o que o cálculo de totais lê). Fora disso
 * o total comercial fica desconhecido, com diagnóstico — nunca uma exceção que derrube
 * esta projeção ou o lote das outras OS. A leitura legada (decisões) não passa por aqui.
 */
function linhasDoOrcamentoLegiveisV4(linhas: unknown): boolean {
  if (linhas === undefined || linhas === null) return true;
  return Array.isArray(linhas) && linhas.every((linha) =>
    isRecord(linha) && (linha.grupoId === undefined || linha.grupoId === null || typeof linha.grupoId === "string"));
}

export function lerComercialV4(
  input: ProjectFinancialOSV4Input,
  totals: ReturnType<typeof reconciliarTotaisFinanceirosV3>,
  fatos: FatosFinanceirosOSV4,
): ComercialOSV4 {
  const real = orcamentoRealV3(input.payload);
  let orcamento: EstadoOrcamentoComercialV4;
  if (!isRecord(input.payload.orcamento)) orcamento = "ausente";
  else if (!real) orcamento = "previa";
  else {
    const agora = Date.parse(input.loadedAt);
    const efetivo = Number.isFinite(agora) ? statusEfetivoOrcamentoV3(real, agora) : real.status;
    orcamento = (ESTADOS_ORCAMENTO as readonly string[]).includes(efetivo) ? (efetivo as EstadoOrcamentoComercialV4) : "desconhecido";
  }
  const orcamentoIlegivel = !!real && (!linhasDoOrcamentoLegiveisV4(real.servicos) || !linhasDoOrcamentoLegiveisV4(real.pecas));
  const totalOrcamentoCentavos = real && !orcamentoIlegivel
    ? cents(computeTotaisV3({ servicos: real.servicos, pecas: real.pecas, desconto: real.desconto }).total)
    : null;
  const vinculado = !!input.titulo && fatos.tituloEncontrado && fatos.motivo !== "TITULO_NAO_VINCULADO";
  const valorTituloCentavos = vinculado ? cents(input.titulo!.valor) : null;
  const confereComTitulo =
    totalOrcamentoCentavos != null && valorTituloCentavos != null
      ? Math.abs(totalOrcamentoCentavos - valorTituloCentavos) <= TOLERANCIA_CENTAVOS
      : null;
  const divergencias: DivergenciaComercialV4[] = [];
  if (orcamentoIlegivel) divergencias.push({ codigo: "ORCAMENTO_ILEGIVEL", detalhe: "Linhas do orçamento fora do formato esperado: total comercial desconhecido." });
  if (totals.inconsistencia) divergencias.push({ codigo: "FONTES_DE_PRECO", detalhe: totals.inconsistencia });
  if (confereComTitulo === false) {
    divergencias.push({
      codigo: "ORCAMENTO_X_TITULO",
      detalhe: `Orçamento R$ ${(totalOrcamentoCentavos! / 100).toFixed(2)} × título R$ ${(valorTituloCentavos! / 100).toFixed(2)}.`,
    });
  }
  return {
    orcamento,
    totalOrcamento: totalOrcamentoCentavos == null ? null : totalOrcamentoCentavos / 100,
    totalAprovado: sourceAmount(totals.fontes, "orcamento_aprovado"),
    confereComTitulo,
    divergencias,
  };
}

/** Só NOMEIA o motivo do bloqueio já decidido pelo guard; nunca libera nada. */
export function lerImpedimentoV4(
  input: ProjectFinancialOSV4Input,
  guard: ReturnType<typeof projetarEntregaFinanceiraV3>,
  fatos: FatosFinanceirosOSV4,
  comercial: ComercialOSV4,
): ImpedimentoOSV4 | null {
  if (autorizadaParaEntregaFinanceiraV3(guard.decisao)) return null;
  switch (guard.decisao) {
    case "BLOCK_PENDING_BALANCE":
      return { codigo: "SALDO_EM_ABERTO", destino: "financeiro" };
    case "BLOCK_CHARGE_NOT_CREATED":
      return { codigo: "COBRANCA_NAO_FORMALIZADA", destino: "financeiro" };
    case "BLOCK_NO_CHARGE_AUTH_REQUIRED":
      return { codigo: "SEM_COBRANCA_EXIGE_AUTORIZACAO", destino: "entrega" };
    case "BLOCK_UNKNOWN":
      if (input.falhaLeituraTitulo || input.errorCode) return { codigo: "FALHA_LEITURA", destino: "recarregar" };
      if (comercial.orcamento === "rascunho" || comercial.orcamento === "enviado" || comercial.orcamento === "desconhecido") {
        return { codigo: "APROVACAO_COMERCIAL_PENDENTE", destino: "comercial" };
      }
      if (comercial.orcamento === "recusado") return { codigo: "ORCAMENTO_RECUSADO", destino: "comercial" };
      if (comercial.orcamento === "expirado") return { codigo: "ORCAMENTO_EXPIRADO", destino: "comercial" };
      return { codigo: "PRECO_AUSENTE", destino: "comercial" };
    case "BLOCK_INCONSISTENT":
      if (fatos.tituloEncontrado && fatos.motivo) return { codigo: fatos.motivo, destino: "financeiro" };
      return { codigo: "VALORES_DIVERGENTES", destino: "financeiro" };
    default:
      return null;
  }
}

/**
 * Histórico para EXIBIÇÃO. A baixa do título e o evento de recebimento da OS viram
 * UM item só quando a MESMA operação está provada dos dois lados (identidade
 * gravada + evento de recebimento + mesmo valor). Sem isso, cada fonte aparece
 * rotulada e separada. Nenhum evento some e nada é somado aqui.
 */
export function agruparHistoricoFinanceiroV4(
  payload: Record<string, unknown>,
  titlePayload: unknown,
  events: FinancialEventV4[],
): RegistroHistoricoFinanceiroV4[] {
  const historico = isRecord(titlePayload) && Array.isArray(titlePayload.historico) ? titlePayload.historico : [];
  const identidadeTitulo = new Map<string, string>();
  historico.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const type = text(entry.tipo).toLowerCase();
    if (type !== "pagamento" && type !== "liquidacao") return;
    const amount = money(entry.valor);
    const operationId = text(entry.loteId) || (amount == null ? null : mixedReceiptOperationId(historico[index + 1], amount));
    if (!operationId) return;
    const occurredAt = text(entry.at ?? entry.criadoEm) || null;
    identidadeTitulo.set(`RECEIVABLE:${text(entry.id) || `${type}:${occurredAt ?? "undated"}:${index}`}`, operationId);
  });
  const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
  const identidadeOS = new Map<string, string>();
  timeline.forEach((entry, index) => {
    if (!isRecord(entry) || text(entry.tipo) !== "operacao_cobranca_gerada" || !isRecord(entry.metadata)) return;
    const operationId = text(entry.metadata.operacaoId);
    if (!operationId) return;
    const occurredAt = text(entry.criadoEm ?? entry.at) || null;
    const type = text(entry.tipo).toLowerCase();
    identidadeOS.set(`OS_TIMELINE:${text(entry.id) || `${type}:${occurredAt ?? "undated"}:${index}`}`, operationId);
  });

  const usados = new Set<string>();
  const registros: RegistroHistoricoFinanceiroV4[] = [];
  const isolado = (event: FinancialEventV4, operacaoId: string | null): RegistroHistoricoFinanceiroV4 => ({
    id: event.eventId,
    operacaoId,
    tipo: event.type,
    descricao: event.description,
    valor: event.amount,
    meio: event.paymentMethod,
    ocorridoEm: event.occurredAt,
    autor: event.actor,
    fontes: [event.source],
    eventIds: [event.eventId],
    estorno: event.type.includes("estorno"),
  });
  for (const event of events) {
    if (usados.has(event.eventId)) continue;
    const operacaoId = identidadeTitulo.get(event.eventId) ?? identidadeOS.get(event.eventId) ?? null;
    const par = operacaoId
      ? events.find((other) =>
          other.eventId !== event.eventId &&
          !usados.has(other.eventId) &&
          other.source !== event.source &&
          (identidadeTitulo.get(other.eventId) ?? identidadeOS.get(other.eventId)) === operacaoId &&
          other.amount != null && event.amount != null &&
          Math.round(other.amount * 100) === Math.round(event.amount * 100))
      : undefined;
    if (!par) {
      usados.add(event.eventId);
      registros.push(isolado(event, operacaoId));
      continue;
    }
    const daOS = event.source === "OS_TIMELINE" ? event : par;
    const doTitulo = event.source === "RECEIVABLE" ? event : par;
    usados.add(event.eventId);
    usados.add(par.eventId);
    registros.push({
      id: daOS.eventId,
      operacaoId,
      tipo: daOS.type,
      descricao: daOS.description,
      valor: daOS.amount,
      meio: daOS.paymentMethod ?? doTitulo.paymentMethod,
      ocorridoEm: daOS.occurredAt ?? doTitulo.occurredAt,
      autor: daOS.actor ?? doTitulo.actor,
      fontes: ["OS_TIMELINE", "RECEIVABLE"],
      eventIds: [daOS.eventId, doTitulo.eventId],
      estorno: false,
    });
  }
  return registros;
}

export function projectFinancialOSV4(input: ProjectFinancialOSV4Input): FinancialProjectionOSV4 {
  const totals = reconciliarTotaisFinanceirosV3(input);
  const guard = projetarEntregaFinanceiraV3(input);
  const receipts = reconciliarRecebimentosFinanceirosV3(input.titulo?.payload);
  const rawReceivableStatus = input.titulo ? text(input.titulo.status) || null : null;
  const status = financialStatus(guard, rawReceivableStatus);
  const consistency = consistencyStatus(guard);
  const noCharge = isRecord(input.payload.entregaSemCobrancaV3) ? input.payload.entregaSemCobrancaV3 : {};
  const aPrazoAtual = aPrazoVigente(input.payload, guard);
  const aPrazo = aPrazoAtual ?? {};
  // Modo de cobrança e parcelas descrevem dívida EM ABERTO: sem saldo conhecido > 0, somem.
  const saldoEmAberto = guard.saldo != null && guard.saldo > 0;
  const canReceive =
    (status === "OPEN" || status === "PARTIAL" || status === "AUTHORIZED_CREDIT") &&
    consistency === "CONSISTENT" &&
    guard.tituloEncontrado &&
    guard.saldo != null &&
    guard.saldo > 0;
  const canDeliver = autorizadaParaEntregaFinanceiraV3(guard.decisao);
  const fatos = lerFatosFinanceirosV4(input);
  const comercial = lerComercialV4(input, totals, fatos);
  const impedimento = lerImpedimentoV4(input, guard, fatos, comercial);
  // Divergência que só o guard enxerga (título × coluna/legado): registrada com o
  // motivo dele, para a tela nunca mostrar "confere" sem ressalva.
  if (impedimento?.codigo === "VALORES_DIVERGENTES" && !comercial.divergencias.some((d) => d.codigo !== "ORCAMENTO_ILEGIVEL") && guard.motivoBloqueio) {
    comercial.divergencias.push({ codigo: "FONTES_DE_PRECO", detalhe: guard.motivoBloqueio });
  }
  const financialEvents = readFinancialEvents(input.payload, input.titulo?.payload);

  return {
    version: 1,
    storeId: input.storeId,
    osId: input.osId,
    osCode: text(input.osCode ?? input.payload.codigo) || input.osId,
    operationalStatus: text(input.operationalStatus ?? input.payload.operacaoStatusV3 ?? input.payload.status) || "unknown",
    expectedTotal: guard.totalEsperado,
    expectedTotalSource: guard.origensTotal,
    approvedBudgetTotal: sourceAmount(totals.fontes, "orcamento_aprovado"),
    osColumnTotal: sourceAmount(totals.fontes, "ordem_servico.valor_total"),
    legacyTotal: sourceAmount(totals.fontes, "payload.valorTotal"),
    billingSnapshotTotal: sourceAmount(totals.fontes, "payload.faturamentoTotal"),
    receivableFound: guard.tituloEncontrado,
    receivableId: input.titulo?.id ?? null,
    receivableTotal: guard.valorTitulo,
    receivableStatus: rawReceivableStatus,
    receivedTotal: guard.totalRecebido,
    reversedTotal: input.titulo && receipts.valido ? receipts.estornadoCentavos / 100 : null,
    balance: guard.saldo,
    financialStatus: status,
    consistencyStatus: consistency,
    consistencyIssues: guard.motivoBloqueio ? [guard.motivoBloqueio] : [],
    paymentMethods: readPaymentMethods(input.payload, input.titulo?.payload),
    collectionMode: saldoEmAberto ? text(aPrazo.modo ?? input.payload.faturamentoModoCobranca ?? input.payload.modoCobranca) || null : null,
    installments: readInstallments(input.titulo?.payload, input.payload, aPrazoAtual, saldoEmAberto),
    authorizedCredit: guard.autorizacaoAPrazo,
    authorizedNoCharge: guard.autorizacaoSemCobranca,
    noChargeCategory: guard.autorizacaoSemCobranca ? text(noCharge.categoria) || null : null,
    noChargeReason: guard.autorizacaoSemCobranca ? text(noCharge.motivo) || null : null,
    financialEvents,
    receivablePayments: input.titulo ? readValidPayments(input.titulo.payload) : [],
    canReceive,
    canDeliver,
    deliveryDecision: guard.decisao,
    loadedAt: input.loadedAt,
    errorCode: input.errorCode ?? (guard.decisao === "BLOCK_UNKNOWN" ? "FINANCIAL_STATE_UNKNOWN" : null),
    fatos,
    comercial,
    acoes: { podeReceber: canReceive, podeEntregar: canDeliver, impedimento },
    historico: agruparHistoricoFinanceiroV4(input.payload, input.titulo?.payload, financialEvents),
  };
}

export function unknownFinancialProjectionOSV4(input: {
  storeId: string;
  osId: string;
  osCode?: string | null;
  operationalStatus?: string | null;
  loadedAt: string;
  errorCode: string;
}): FinancialProjectionOSV4 {
  return {
    version: 1,
    storeId: input.storeId,
    osId: input.osId,
    osCode: text(input.osCode) || input.osId,
    operationalStatus: text(input.operationalStatus) || "unknown",
    expectedTotal: null,
    expectedTotalSource: [],
    approvedBudgetTotal: null,
    osColumnTotal: null,
    legacyTotal: null,
    billingSnapshotTotal: null,
    receivableFound: false,
    receivableId: null,
    receivableTotal: null,
    receivableStatus: null,
    receivedTotal: null,
    reversedTotal: null,
    balance: null,
    financialStatus: "UNKNOWN",
    consistencyStatus: "UNKNOWN",
    consistencyIssues: ["Não foi possível determinar a situação financeira da OS."],
    paymentMethods: [],
    collectionMode: null,
    installments: [],
    authorizedCredit: false,
    authorizedNoCharge: false,
    noChargeCategory: null,
    noChargeReason: null,
    financialEvents: [],
    receivablePayments: null,
    canReceive: false,
    canDeliver: false,
    deliveryDecision: "BLOCK_UNKNOWN",
    loadedAt: input.loadedAt,
    errorCode: input.errorCode,
    fatos: {
      tituloEncontrado: false,
      verificavel: false,
      motivo: "FALHA_LEITURA",
      tituloId: null,
      valorTitulo: null,
      recebidoBruto: null,
      estornado: null,
      recebidoLiquido: null,
      saldoTitulo: null,
      liquidado: false,
      temRegistroDePagamento: false,
      pagamentosVigentes: null,
      meios: [],
      semMeioIdentificado: null,
    },
    comercial: { orcamento: "desconhecido", totalOrcamento: null, totalAprovado: null, confereComTitulo: null, divergencias: [] },
    acoes: { podeReceber: false, podeEntregar: false, impedimento: { codigo: "FALHA_LEITURA", destino: "recarregar" } },
    historico: [],
  };
}
