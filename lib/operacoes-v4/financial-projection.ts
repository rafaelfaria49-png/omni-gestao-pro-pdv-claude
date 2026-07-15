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
import { formaLabelRecebimentoV3 } from "@/lib/operacoes-v3/payment-model";

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
  canReceive: boolean;
  canDeliver: boolean;
  deliveryDecision: EntregaFinanceiraDecisaoV3;

  loadedAt: string;
  errorCode: string | null;
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

function readInstallments(titlePayload: unknown, payload: Record<string, unknown>): FinancialInstallmentV4[] {
  const persisted = isRecord(titlePayload) && Array.isArray(titlePayload.parcelas)
    ? titlePayload.parcelas
    : Array.isArray(payload.faturamentoParcelas)
      ? payload.faturamentoParcelas
      : [];
  const aPrazo = isRecord(payload.aPrazoV3) ? payload.aPrazoV3 : null;
  const raw = persisted.length > 0
    ? persisted
    : aPrazo
      ? [{ numero: "1", vencimento: aPrazo.vencimento, valor: aPrazo.valor, status: aPrazo.status }]
      : [];
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

export function projectFinancialOSV4(input: ProjectFinancialOSV4Input): FinancialProjectionOSV4 {
  const totals = reconciliarTotaisFinanceirosV3(input);
  const guard = projetarEntregaFinanceiraV3(input);
  const receipts = reconciliarRecebimentosFinanceirosV3(input.titulo?.payload);
  const rawReceivableStatus = input.titulo ? text(input.titulo.status) || null : null;
  const status = financialStatus(guard, rawReceivableStatus);
  const consistency = consistencyStatus(guard);
  const noCharge = isRecord(input.payload.entregaSemCobrancaV3) ? input.payload.entregaSemCobrancaV3 : {};
  const aPrazo = isRecord(input.payload.aPrazoV3) ? input.payload.aPrazoV3 : {};
  const canReceive =
    (status === "OPEN" || status === "PARTIAL" || status === "AUTHORIZED_CREDIT") &&
    consistency === "CONSISTENT" &&
    guard.tituloEncontrado &&
    guard.saldo != null &&
    guard.saldo > 0;

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
    collectionMode: text(aPrazo.modo ?? input.payload.faturamentoModoCobranca ?? input.payload.modoCobranca) || null,
    installments: readInstallments(input.titulo?.payload, input.payload),
    authorizedCredit: guard.autorizacaoAPrazo,
    authorizedNoCharge: guard.autorizacaoSemCobranca,
    noChargeCategory: guard.autorizacaoSemCobranca ? text(noCharge.categoria) || null : null,
    noChargeReason: guard.autorizacaoSemCobranca ? text(noCharge.motivo) || null : null,
    financialEvents: readFinancialEvents(input.payload, input.titulo?.payload),
    canReceive,
    canDeliver: autorizadaParaEntregaFinanceiraV3(guard.decisao),
    deliveryDecision: guard.decisao,
    loadedAt: input.loadedAt,
    errorCode: input.errorCode ?? (guard.decisao === "BLOCK_UNKNOWN" ? "FINANCIAL_STATE_UNKNOWN" : null),
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
    canReceive: false,
    canDeliver: false,
    deliveryDecision: "BLOCK_UNKNOWN",
    loadedAt: input.loadedAt,
    errorCode: input.errorCode,
  };
}
