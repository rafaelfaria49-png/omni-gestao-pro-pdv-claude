// ============================================================================
// Operações V3 — Dados básicos da OS · reader PURO + contratos (side-effect-free)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem next-auth, sem Prisma, sem React). Concentra a leitura
// e os tipos dos "dados básicos" da recepção da OS que ainda não tinham um caminho
// de edição seguro na V3 (ficaram pendentes do slice de Entrada 003):
//   defeito relatado · prioridade · recebido por · localização física ·
//   previsão/SLA · origem · observações internas.
//
// Fonte no payload (JSONB), sem coluna Prisma dedicada (exceto `defeito`, coluna
// denormalizada só de busca/fallback):
//   • defeitoRelatado  → payload.equipamento.defeitoRelatado (+ coluna `defeito`)
//   • prioridade       → payload.prioridade            (espelho: aberturaV3.recepcao.prioridade)
//   • recebidoPor      → payload.aberturaV3.recepcao.recebidoPor
//   • localFisico      → payload.aberturaV3.recepcao.localFisico   (nome real na V3)
//   • previsaoEntrega  → payload.sla.prazo             (espelho: aberturaV3.recepcao.previsaoEntrega)
//   • origem           → payload.aberturaV3.recepcao.origem (rico) · payload.origem (colapsado)
//   • observacoes      → payload.aberturaV3.observacoesInternas
//
// O reader é HONESTO: devolve "" quando o dado não existe (o form aplica defaults;
// o adapter da V4 mostra "Não informado"). NÃO inventa valor.
// ============================================================================

import type { OrdemServico, OSOrigem, OSPrioridade } from "@/types/os";
import {
  LOCAL_FISICO_V3,
  ORIGEM_V3,
  PRIORIDADE_V3,
  type NovaOSLocalFisicoV3,
  type NovaOSOrigemV3,
} from "./nova-os-model";

// Reexporta as opções/tipos canônicos da V3 para a UI/adapter da V4 (fonte única).
export { LOCAL_FISICO_V3, ORIGEM_V3, PRIORIDADE_V3 };
export type { NovaOSLocalFisicoV3, NovaOSOrigemV3, OSOrigem, OSPrioridade };

/** Leitura honesta dos dados básicos (strings vazias quando ausente). */
export interface DadosBasicosOSV3 {
  defeitoRelatado: string;
  /** "" quando não há prioridade válida. */
  prioridade: OSPrioridade | "";
  recebidoPor: string;
  /** "" quando não há localização válida. */
  localFisico: NovaOSLocalFisicoV3 | "";
  /** ISO da previsão/SLA; "" quando ausente. */
  previsaoEntrega: string;
  /** "" quando não há origem rica válida. */
  origem: NovaOSOrigemV3 | "";
  observacoes: string;
}

/** Input sanitizado consumido pela action `salvarDadosBasicosOSV3`. */
export interface SalvarDadosBasicosInputV3 {
  defeitoRelatado: string;
  prioridade: OSPrioridade;
  recebidoPor: string;
  localFisico: NovaOSLocalFisicoV3;
  /** ISO (ou "" para manter a previsão atual). */
  previsaoEntrega: string;
  origem: NovaOSOrigemV3;
  observacoes: string;
}

// ---- Rótulos e guardas derivados das opções canônicas ----------------------

export const PRIORIDADE_LABEL_V3: Record<string, string> = Object.fromEntries(
  PRIORIDADE_V3.map((p) => [p.value, p.label]),
);
export const ORIGEM_LABEL_V3: Record<string, string> = Object.fromEntries(ORIGEM_V3.map((o) => [o.value, o.label]));
export const LOCAL_FISICO_LABEL_V3: Record<string, string> = Object.fromEntries(
  LOCAL_FISICO_V3.map((l) => [l.value, l.label]),
);

const PRIORIDADE_SET = new Set<string>(PRIORIDADE_V3.map((p) => p.value));
const ORIGEM_SET = new Set<string>(ORIGEM_V3.map((o) => o.value));
const LOCAL_SET = new Set<string>(LOCAL_FISICO_V3.map((l) => l.value));

export function isPrioridadeV3(v: unknown): v is OSPrioridade {
  return typeof v === "string" && PRIORIDADE_SET.has(v);
}
export function isOrigemV3(v: unknown): v is NovaOSOrigemV3 {
  return typeof v === "string" && ORIGEM_SET.has(v);
}
export function isLocalFisicoV3(v: unknown): v is NovaOSLocalFisicoV3 {
  return typeof v === "string" && LOCAL_SET.has(v);
}

/** Colapsa a origem rica (V3) para a `OSOrigem` do V2 (projeção legada, sem perda no aberturaV3). */
export function collapseOrigemV3(origem: NovaOSOrigemV3): OSOrigem {
  return origem === "whatsapp" ? "whatsapp" : "balcao";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Formas soltas (aberturaV3/recepcao viajam no payload, fora do tipo OrdemServico).
type RecepcaoLoose = {
  recebidoPor?: unknown;
  localFisico?: unknown;
  previsaoEntrega?: unknown;
  origem?: unknown;
  prioridade?: unknown;
};
type OSLoose = OrdemServico & {
  aberturaV3?: { recepcao?: RecepcaoLoose; observacoesInternas?: unknown };
  origem?: unknown;
};

/** Lê os dados básicos reais da OS (honesto — "" quando ausente). */
export function lerDadosBasicosV3(os: OrdemServico | null | undefined): DadosBasicosOSV3 {
  const o = (os ?? {}) as OSLoose;
  const recepcao = o.aberturaV3?.recepcao ?? {};

  const prioridade: OSPrioridade | "" = isPrioridadeV3(o.prioridade)
    ? o.prioridade
    : isPrioridadeV3(recepcao.prioridade)
      ? recepcao.prioridade
      : "";

  // Origem rica prevalece; cai para o top-level SÓ quando ele já é uma origem V3 válida
  // (balcao/whatsapp). Origens exclusivas do V2 (manual/site/telefone/email) → "".
  const origem: NovaOSOrigemV3 | "" = isOrigemV3(recepcao.origem)
    ? recepcao.origem
    : isOrigemV3(o.origem)
      ? o.origem
      : "";

  const localFisico: NovaOSLocalFisicoV3 | "" = isLocalFisicoV3(recepcao.localFisico) ? recepcao.localFisico : "";

  return {
    defeitoRelatado: str(o.equipamento?.defeitoRelatado),
    prioridade,
    recebidoPor: str(recepcao.recebidoPor),
    localFisico,
    previsaoEntrega: str(o.sla?.prazo) || str(recepcao.previsaoEntrega),
    origem,
    observacoes: str(o.aberturaV3?.observacoesInternas),
  };
}
