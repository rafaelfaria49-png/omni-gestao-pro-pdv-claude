// ============================================================================
// Operações V3 — Fase 2A · MODELO de pagamento da OS (puro, fonte de verdade)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Calcula saldo/status e valida
// recebimentos. NÃO recebe dinheiro — quem recebe é a action `pdv-servico-actions`
// orquestrando os serviços financeiros existentes (Conta a Receber + Caixa).
//
// O status de pagamento é espelhado em `payload.pagamentoV3` (JSONB) a cada
// recebimento, para leitura barata em Header/Fila/Workspace/PDV (sem N+1).
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { computeTotaisV3, orcamentoRealV3 } from "./orcamento-model";
import { buildContaReceberLocalKey } from "@/lib/financeiro/contracts/local-key";

const EPS = 0.009;

export type PagamentoStatusV3 = "sem_cobranca" | "aberto" | "parcial" | "quitado";

export interface PagamentoV3 {
  total: number;
  recebido: number;
  saldo: number;
  status: PagamentoStatusV3;
  atualizadoEm?: string;
  ultimaForma?: string;
  /** localKey do título de Conta a Receber vinculado (idempotência). */
  tituloLocalKey?: string;
}

export const PAGAMENTO_STATUS_META_V3: Record<PagamentoStatusV3, { label: string; tone: "neutral" | "warning" | "info" | "success" }> = {
  sem_cobranca: { label: "Sem cobrança", tone: "neutral" },
  aberto: { label: "Em aberto", tone: "warning" },
  parcial: { label: "Parcial", tone: "info" },
  quitado: { label: "Quitado", tone: "success" },
};

export function money(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Calcula recebido (clamp), saldo e status a partir do total e do recebido. */
export function computeSaldoV3(total: number, recebido: number): { total: number; recebido: number; saldo: number; status: PagamentoStatusV3 } {
  const t = Math.max(0, money(total));
  const r = Math.min(Math.max(0, money(recebido)), t);
  const saldo = Math.max(0, money(t - r));
  let status: PagamentoStatusV3;
  if (t <= EPS) status = "sem_cobranca";
  else if (r <= EPS) status = "aberto";
  else if (r + EPS >= t) status = "quitado";
  else status = "parcial";
  return { total: t, recebido: r, saldo, status };
}

/** Total cobrável da OS (orçamento real; fallback para valorTotal/pag). */
export function totalCobravelV3(os: OrdemServico): number {
  const orc = orcamentoRealV3(os);
  if (orc) return money(computeTotaisV3({ servicos: orc.servicos, pecas: orc.pecas, desconto: orc.desconto }).total);
  const vt = (os as { prismaValorTotal?: number; valorTotal?: number }).valorTotal ?? (os as { prismaValorTotal?: number }).prismaValorTotal;
  return money(typeof vt === "number" ? vt : 0);
}

/** Lê o estado de pagamento da OS. Prefere o espelho `payload.pagamentoV3`; senão deriva (recebido 0). */
export function lerPagamentoV3(os: OrdemServico | null | undefined): PagamentoV3 {
  const mirror = (os as { pagamentoV3?: Partial<PagamentoV3> } | null | undefined)?.pagamentoV3;
  if (mirror && typeof mirror === "object" && typeof mirror.total === "number") {
    const base = computeSaldoV3(mirror.total, mirror.recebido ?? 0);
    return {
      ...base,
      atualizadoEm: typeof mirror.atualizadoEm === "string" ? mirror.atualizadoEm : undefined,
      ultimaForma: typeof mirror.ultimaForma === "string" ? mirror.ultimaForma : undefined,
      tituloLocalKey: typeof mirror.tituloLocalKey === "string" ? mirror.tituloLocalKey : undefined,
    };
  }
  const total = os ? totalCobravelV3(os) : 0;
  return { ...computeSaldoV3(total, 0) };
}

// ----------------------------------------------------------------------------
// Validação de recebimento (proteção contra valor > saldo)
// ----------------------------------------------------------------------------

export interface RecebimentoVeredito {
  ok: boolean;
  motivo?: string;
  /** "liquidar" quando o valor cobre o saldo; senão "parcial". */
  op?: "liquidar" | "parcial";
}

export function validarRecebimentoV3(valor: number, saldo: number): RecebimentoVeredito {
  const v = money(valor);
  const s = money(saldo);
  if (s <= EPS) return { ok: false, motivo: "Esta OS já está quitada (sem saldo a receber)." };
  if (!(v > EPS)) return { ok: false, motivo: "Informe um valor maior que zero." };
  if (v > s + EPS) return { ok: false, motivo: `Valor acima do saldo a receber (${s.toFixed(2)}).` };
  return { ok: true, op: v + EPS >= s ? "liquidar" : "parcial" };
}

// ----------------------------------------------------------------------------
// Formas de pagamento (recebimento real x "a conectar")
// ----------------------------------------------------------------------------

export type FormaRecebimentoV3 = "dinheiro" | "pix" | "debito" | "credito" | "parcelado" | "crediario" | "carteira";

export const FORMAS_RECEBIMENTO_V3: { value: FormaRecebimentoV3; label: string; suportada: boolean }[] = [
  { value: "dinheiro", label: "Dinheiro", suportada: true },
  { value: "pix", label: "PIX", suportada: true },
  { value: "debito", label: "Débito", suportada: true },
  { value: "credito", label: "Crédito", suportada: true },
  { value: "parcelado", label: "Parcelado", suportada: false },
  { value: "crediario", label: "Crediário", suportada: false },
  { value: "carteira", label: "Carteira / crédito do cliente", suportada: false },
];

export function formaSuportadaV3(forma: string): boolean {
  return FORMAS_RECEBIMENTO_V3.find((f) => f.value === forma)?.suportada ?? false;
}
export function formaLabelRecebimentoV3(forma: string): string {
  return FORMAS_RECEBIMENTO_V3.find((f) => f.value === forma)?.label ?? forma;
}

// ----------------------------------------------------------------------------
// Split de pagamento (várias formas num recebimento) — validação de soma
// ----------------------------------------------------------------------------

export interface SplitLinhaV3 {
  forma: FormaRecebimentoV3;
  valor: number;
}

export function somaSplitV3(linhas: SplitLinhaV3[]): number {
  return money((Array.isArray(linhas) ? linhas : []).reduce((acc, l) => acc + Math.max(0, money(l.valor)), 0));
}

/** Valida um split contra o saldo: soma > 0, ≤ saldo, todas as formas suportadas. */
export function validarSplitV3(linhas: SplitLinhaV3[], saldo: number): RecebimentoVeredito {
  const linhasValidas = (Array.isArray(linhas) ? linhas : []).filter((l) => money(l.valor) > EPS);
  if (linhasValidas.length === 0) return { ok: false, motivo: "Adicione ao menos uma forma com valor." };
  for (const l of linhasValidas) {
    if (!formaSuportadaV3(l.forma)) return { ok: false, motivo: `Forma "${formaLabelRecebimentoV3(l.forma)}" ainda não suportada para recebimento.` };
  }
  return validarRecebimentoV3(somaSplitV3(linhasValidas), saldo);
}

/** Descrição humana do split: "PIX R$ 100,00 + Dinheiro R$ 50,00 + Crédito R$ 200,00". */
export function descreverSplitV3(linhas: SplitLinhaV3[]): string {
  return (Array.isArray(linhas) ? linhas : [])
    .filter((l) => money(l.valor) > EPS)
    .map((l) => `${formaLabelRecebimentoV3(l.forma)} R$ ${money(l.valor).toFixed(2).replace(".", ",")}`)
    .join(" + ");
}

// ----------------------------------------------------------------------------
// Fase 2B — Intenção do recebimento (rótulo na timeline/comprovante)
// ----------------------------------------------------------------------------
// Todos usam o MESMO motor de recebimento; "intenção" é só o rótulo operacional.
// "quitacao" é DERIVADA (quando o recebimento zera o saldo), não escolhida.

export type RecebimentoIntencaoV3 = "sinal" | "entrada" | "parcial" | "quitacao";

/** Rótulos selecionáveis no PDV (quitação é automática quando zera o saldo). */
export const INTENCOES_RECEBIMENTO_V3: { value: RecebimentoIntencaoV3; label: string }[] = [
  { value: "sinal", label: "Sinal" },
  { value: "entrada", label: "Entrada" },
  { value: "parcial", label: "Pagamento parcial" },
];

const INTENCAO_LABEL_V3: Record<RecebimentoIntencaoV3, string> = {
  sinal: "Sinal",
  entrada: "Entrada",
  parcial: "Pagamento parcial",
  quitacao: "Quitação",
};

/** Rótulo efetivo: se o recebimento quitou, é sempre "Quitação"; senão usa a intenção escolhida. */
export function rotuloIntencaoV3(intencao: RecebimentoIntencaoV3 | undefined, quitou: boolean): string {
  if (quitou) return INTENCAO_LABEL_V3.quitacao;
  return INTENCAO_LABEL_V3[intencao ?? "parcial"];
}

// ----------------------------------------------------------------------------
// Correção 2A.1 — CHAVE ÚNICA da Conta a Receber da OS
// ----------------------------------------------------------------------------
// V2 (adapter `lib/financeiro/adapters/os-faturamento.ts`) e V3 (PDV de Serviço)
// compartilham a MESMA localKey por OS. Como `ContaReceberTitulo` é unique por
// `(storeId, localKey)`, o banco passa a garantir UM ÚNICO título por OS —
// eliminando a possibilidade de duas Contas a Receber simultâneas para a mesma OS.
//
// Delegamos ao contrato oficial (`buildContaReceberLocalKey` kind
// `adapter_os_faturamento` = `os-faturamento:{storeId}:{osId}`) em vez de montar a
// string à mão, para não duplicar o contrato nem sofrer drift silencioso.
export function localKeyContaReceberOSV3(storeId: string, osId: string): string {
  return buildContaReceberLocalKey({ kind: "adapter_os_faturamento", storeId, ordemServicoId: osId });
}

/** Monta o espelho a gravar no payload da OS após um recebimento. */
export function montarPagamentoMirrorV3(input: {
  total: number;
  recebido: number;
  ultimaForma?: string;
  tituloLocalKey?: string;
  now?: string;
}): PagamentoV3 {
  const base = computeSaldoV3(input.total, input.recebido);
  return {
    ...base,
    atualizadoEm: input.now ?? new Date().toISOString(),
    ultimaForma: input.ultimaForma,
    tituloLocalKey: input.tituloLocalKey,
  };
}

// ----------------------------------------------------------------------------
// GOAL OPS-V4-RECEBIMENTO-A-PRAZO-MINIMO-006 — "a prazo" NÃO é recebimento
// ----------------------------------------------------------------------------
// Formaliza o saldo em aberto como dívida (Conta a Receber PENDENTE, vencimento
// futuro) autorizando a entrega SEM dinheiro entrando agora. Espelho separado de
// `pagamentoV3` (que representa dinheiro efetivamente recebido) — nunca os dois
// se misturam: "a prazo" nunca altera `pagamentoV3.recebido`/`saldo`. A baixa real
// (quando o cliente pagar) segue pelo fluxo normal (`receberOSV3`), sem relação
// direta com este espelho.

export type APrazoStatusV3 = "pendente" | "cancelado";

/**
 * Status canônico a gravar no `ContaReceberTitulo` ao lançar "a prazo": preserva
 * "parcial" quando já havia recebimento anterior (ex.: sinal) — nunca regride um
 * título parcial para "pendente" (isso apagaria o sinal recebido de qualquer
 * relatório/tela que leia o status canônico do título, ex. `buildContaReceberSummary`).
 * Só título sem nenhum recebimento anterior nasce/permanece "pendente".
 */
export function statusTituloAPrazoV3(recebido: number): "pendente" | "parcial" {
  return recebido > 0 ? "parcial" : "pendente";
}

export interface APrazoV3 {
  modo: "a_prazo";
  status: APrazoStatusV3;
  valor: number;
  vencimento: string;
  tituloLocalKey?: string;
  autorizadoEntrega: boolean;
  autorizadoEm?: string;
  autorizadoPor?: string;
  observacao?: string;
}

/** Monta o espelho "a prazo" a gravar no payload da OS (sem tocar `pagamentoV3`). */
export function montarAPrazoMirrorV3(input: {
  valor: number;
  vencimento: string;
  tituloLocalKey?: string;
  autorizadoPor?: string;
  observacao?: string;
  now?: string;
}): APrazoV3 {
  return {
    modo: "a_prazo",
    status: "pendente",
    valor: money(input.valor),
    vencimento: input.vencimento,
    tituloLocalKey: input.tituloLocalKey,
    autorizadoEntrega: true,
    autorizadoEm: input.now ?? new Date().toISOString(),
    autorizadoPor: input.autorizadoPor,
    observacao: input.observacao?.trim() || undefined,
  };
}

/** Lê o espelho "a prazo" da OS (`payload.aPrazoV3`). Null quando ausente/não pendente. */
export function lerAPrazoV3(os: OrdemServico | null | undefined): APrazoV3 | null {
  const mirror = (os as { aPrazoV3?: Partial<APrazoV3> } | null | undefined)?.aPrazoV3;
  if (!mirror || typeof mirror !== "object" || mirror.modo !== "a_prazo" || mirror.status !== "pendente") return null;
  return {
    modo: "a_prazo",
    status: "pendente",
    valor: money(mirror.valor ?? 0),
    vencimento: typeof mirror.vencimento === "string" ? mirror.vencimento : "",
    tituloLocalKey: typeof mirror.tituloLocalKey === "string" ? mirror.tituloLocalKey : undefined,
    autorizadoEntrega: mirror.autorizadoEntrega === true,
    autorizadoEm: typeof mirror.autorizadoEm === "string" ? mirror.autorizadoEm : undefined,
    autorizadoPor: typeof mirror.autorizadoPor === "string" ? mirror.autorizadoPor : undefined,
    observacao: typeof mirror.observacao === "string" ? mirror.observacao : undefined,
  };
}

// ----------------------------------------------------------------------------
// Fase 2B — Comprovante de recebimento (modelo puro p/ impressão simples)
// ----------------------------------------------------------------------------
// NÃO é a impressão da OS (essa fica intacta). É um recibo do recebimento real.

export interface ComprovanteFormaV3 {
  forma: string;
  label: string;
  valor: number;
}

export interface ComprovanteReciboV3 {
  numeroOS: string;
  cliente: string;
  equipamento: string;
  formas: ComprovanteFormaV3[];
  intencaoLabel: string;
  valorPago: number;
  totalOS: number;
  recebidoAcumulado: number;
  saldoRestante: number;
  statusPagamento: PagamentoStatusV3;
  statusLabel: string;
  dataHora: string;
  operador: string;
  observacao?: string;
}

/** Monta o comprovante a partir da OS + linhas + estado de pagamento (após o recebimento). */
export function montarComprovanteReciboV3(input: {
  os: OrdemServico;
  linhas: SplitLinhaV3[];
  valorPago: number;
  pagamento: PagamentoV3;
  intencaoLabel: string;
  operador: string;
  dataHora: string;
  observacao?: string;
}): ComprovanteReciboV3 {
  const { os, linhas, valorPago, pagamento, intencaoLabel, operador, dataHora, observacao } = input;
  const equipamento =
    [os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ").trim() ||
    os.equipamento?.tipo ||
    "—";
  return {
    numeroOS: os.codigo ?? os.id ?? "—",
    cliente: os.cliente?.nome ?? "—",
    equipamento,
    formas: (Array.isArray(linhas) ? linhas : [])
      .filter((l) => money(l.valor) > EPS)
      .map((l) => ({ forma: l.forma, label: formaLabelRecebimentoV3(l.forma), valor: money(l.valor) })),
    intencaoLabel,
    valorPago: money(valorPago),
    totalOS: money(pagamento.total),
    recebidoAcumulado: money(pagamento.recebido),
    saldoRestante: money(pagamento.saldo),
    statusPagamento: pagamento.status,
    statusLabel: PAGAMENTO_STATUS_META_V3[pagamento.status].label,
    dataHora,
    operador,
    observacao: observacao?.trim() || undefined,
  };
}
