// ============================================================================
// Operações V3 — Fase 1C · MODELO de orçamento (puro, fonte de verdade)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React) — importável por cliente e servidor.
// Enriquece o `Orcamento` do V2 SEM tocar `@/types/os`: os campos extras da V3
// (kind de linha, custo de serviço, histórico de versões) vivem como
// propriedades adicionais dentro do `payload` (JSONB) e sobrevivem à hidratação
// pelo spread do payload — mesma disciplina do `operacaoStatusV3` (Fase 1B).
//
// Brindes (item cobrado / brinde / interno):
//   • cobrado → impacta custo E valor ao cliente.
//   • brinde  → impacta custo, NÃO impacta valor ao cliente (exibido ao cliente).
//   • interno → impacta custo, NÃO impacta valor ao cliente (uso interno/oculto).
// O total ao cliente NUNCA inclui brinde/interno. Custo e lucro incluem todos.
// ============================================================================

import type { Orcamento, OrcamentoStatus, PecaUsada, Servico } from "@/types/os";

export type OrcamentoLinhaKindV3 = "cobrado" | "brinde" | "interno";

/** Linhas com a extensão V3 (campos extras persistidos no JSONB). */
export type PecaV3 = PecaUsada & { kindV3?: OrcamentoLinhaKindV3 };
export type ServicoV3 = Servico & { kindV3?: OrcamentoLinhaKindV3; custoV3?: number };

/** Orçamento na visão V3 (mesmo objeto persistido, com as linhas tipadas em V3). */
export type OrcamentoV3 = Omit<Orcamento, "pecas" | "servicos"> & {
  pecas: PecaV3[];
  servicos: ServicoV3[];
};

export interface OrcamentoVersaoV3 {
  versao: number;
  status: OrcamentoStatus;
  total: number;
  desconto: number;
  registradoEm: string;
  registradoPor: string;
  /** Cópia do orçamento ANTES desta alteração (para visualizar versões anteriores). */
  snapshot: OrcamentoV3;
}

/** Entrada de edição do orçamento (usada pela action `salvarOrcamentoV3` e pelo hook). */
export interface SalvarOrcamentoV3Input {
  servicos: ServicoV3[];
  pecas: PecaV3[];
  desconto: number;
  observacao?: string;
}

export interface TotaisOrcamentoV3 {
  /** Soma do valor ao cliente das linhas cobradas (antes do desconto geral). */
  subtotal: number;
  /** Desconto geral do orçamento (R$). */
  desconto: number;
  /** Total final ao cliente = subtotal − desconto (≥ 0). */
  total: number;
  /** Custo interno = soma dos custos de todas as linhas (inclui brindes/internos). */
  custo: number;
  /** Lucro estimado = total − custo (pode ser negativo). */
  lucro: number;
}

// ----------------------------------------------------------------------------
// Kind helpers
// ----------------------------------------------------------------------------

export function linhaKind(l: { kindV3?: OrcamentoLinhaKindV3 } | null | undefined): OrcamentoLinhaKindV3 {
  const k = l?.kindV3;
  return k === "brinde" || k === "interno" ? k : "cobrado";
}

export const KIND_META_V3: Record<OrcamentoLinhaKindV3, { label: string; cobravel: boolean; visivelCliente: boolean }> = {
  cobrado: { label: "Cobrado", cobravel: true, visivelCliente: true },
  brinde: { label: "Brinde", cobravel: false, visivelCliente: true },
  interno: { label: "Interno", cobravel: false, visivelCliente: false },
};

// ----------------------------------------------------------------------------
// Valor ao cliente × custo por linha
// ----------------------------------------------------------------------------

export function pecaValorCliente(p: PecaV3): number {
  if (linhaKind(p) !== "cobrado") return 0;
  return Math.max(0, (p.quantidade || 0) * (p.valorUnitario || 0) - (p.desconto ?? 0));
}

export function pecaCusto(p: PecaV3): number {
  return Math.max(0, (p.quantidade || 0) * (p.custoUnitario ?? 0));
}

export function servicoValorCliente(s: ServicoV3): number {
  if (linhaKind(s) !== "cobrado") return 0;
  return Math.max(0, (s.valor || 0) - (s.desconto ?? 0));
}

export function servicoCusto(s: ServicoV3): number {
  return Math.max(0, s.custoV3 ?? 0);
}

// ----------------------------------------------------------------------------
// Totais
// ----------------------------------------------------------------------------

export function computeTotaisV3(orc: Pick<OrcamentoV3, "pecas" | "servicos" | "desconto">): TotaisOrcamentoV3 {
  const pecas = Array.isArray(orc.pecas) ? orc.pecas : [];
  const servicos = Array.isArray(orc.servicos) ? orc.servicos : [];
  const subtotal =
    pecas.reduce((acc, p) => acc + pecaValorCliente(p), 0) +
    servicos.reduce((acc, s) => acc + servicoValorCliente(s), 0);
  const desconto = Math.max(0, orc.desconto ?? 0);
  const total = Math.max(0, subtotal - desconto);
  const custo =
    pecas.reduce((acc, p) => acc + pecaCusto(p), 0) +
    servicos.reduce((acc, s) => acc + servicoCusto(s), 0);
  const lucro = total - custo;
  return { subtotal, desconto, total, custo, lucro };
}

/** Recalcula e fixa o campo `total` do orçamento de forma consistente com a regra de brindes. */
export function recalcOrcamentoV3(orc: OrcamentoV3): OrcamentoV3 {
  const { total } = computeTotaisV3(orc);
  return { ...orc, total };
}

// ----------------------------------------------------------------------------
// Estados do orçamento (badge + status efetivo com EXPIRADO derivado por data)
// ----------------------------------------------------------------------------

export type ToneOrcV3 = "neutral" | "info" | "warning" | "success" | "danger";

export const ORCAMENTO_STATUS_META_V3: Record<OrcamentoStatus, { label: string; tone: ToneOrcV3 }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  enviado: { label: "Enviado", tone: "info" },
  aprovado: { label: "Aprovado", tone: "success" },
  recusado: { label: "Recusado", tone: "danger" },
  expirado: { label: "Expirado", tone: "warning" },
};

/**
 * Status efetivo para exibição: um orçamento "enviado" cujo `validoAte` já passou
 * é mostrado como "expirado" (sem reescrever o persistido).
 */
export function statusEfetivoOrcamentoV3(orc: Pick<Orcamento, "status" | "validoAte">, now = Date.now()): OrcamentoStatus {
  if (orc.status === "enviado" && orc.validoAte) {
    const t = Date.parse(orc.validoAte);
    if (Number.isFinite(t) && t < now) return "expirado";
  }
  return orc.status;
}

// ----------------------------------------------------------------------------
// Leitura de campos extras V3 no payload da OS
// ----------------------------------------------------------------------------

type OSOrcamentoSource = {
  orcamento?: unknown;
  orcamentoVersoesV3?: unknown;
};

/** Orçamento real (não sintetizado) na visão V3, ou null. */
export function orcamentoRealV3(os: OSOrcamentoSource | null | undefined): OrcamentoV3 | null {
  const orc = os?.orcamento as (Orcamento & { sintetizado?: boolean }) | undefined;
  if (!orc || typeof orc !== "object") return null;
  if (orc.sintetizado === true) return null;
  return orc as unknown as OrcamentoV3;
}

export function lerVersoesV3(os: OSOrcamentoSource | null | undefined): OrcamentoVersaoV3[] {
  const v = os?.orcamentoVersoesV3;
  return Array.isArray(v) ? (v as OrcamentoVersaoV3[]) : [];
}

// ----------------------------------------------------------------------------
// Métricas para o Dashboard (item 12) — conta orçamentos REAIS por status efetivo.
// ----------------------------------------------------------------------------

export function contarOrcamentosPorStatusV3(
  ordens: OSOrcamentoSource[],
  now = Date.now(),
): Record<OrcamentoStatus, number> {
  const acc: Record<OrcamentoStatus, number> = {
    rascunho: 0,
    enviado: 0,
    aprovado: 0,
    recusado: 0,
    expirado: 0,
  };
  for (const os of ordens) {
    const orc = orcamentoRealV3(os);
    if (!orc) continue;
    acc[statusEfetivoOrcamentoV3(orc, now)] += 1;
  }
  return acc;
}
