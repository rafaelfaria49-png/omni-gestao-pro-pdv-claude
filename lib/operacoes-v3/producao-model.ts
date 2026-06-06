// ============================================================================
// Operações V3 — Fase 3B · MODELO de PRODUÇÃO / BANCADA (puro, fonte de verdade)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Lê técnico, prioridade, SLA e
// status da OS a partir do que JÁ existe + extras no `payload` (JSONB):
//   • técnico   → `os.tecnico` (gravado em `payload.tecnico`)
//   • prioridade→ `payload.prioridadeV3` (5 níveis V3; fallback do `os.prioridade` V2)
//   • SLA       → `os.sla` (prazo/status) + previsão da recepção (Nova OS)
// Reaproveita a MÁQUINA ÚNICA de status (status-machine) para "próxima ação".
// Nada aqui escreve; nada inventa KPI.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { acaoPrimariaV3, statusV3FromOS, type AcaoStatusV3, type OperacaoStatusV3 } from "./status-machine";
import { lerRecepcaoV3 } from "./workspace-model";
import { lerEntregaV3 } from "./pos-venda-model";

const HORA_MS = 3600000;
const SEM_TECNICO = "__sem_tecnico__";

function parseIso(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function slug(nome: string): string {
  return (nome ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function ativa(os: OrdemServico): boolean {
  const st = statusV3FromOS(os);
  return st !== "entregue" && st !== "cancelada";
}

// ----------------------------------------------------------------------------
// Prioridade (item 5) — 5 níveis V3 persistidos em `payload.prioridadeV3`
// ----------------------------------------------------------------------------

export type PrioridadeV3 = "baixa" | "normal" | "alta" | "urgente" | "garantia";

export const PRIORIDADE_META_V3: Record<PrioridadeV3, { label: string; tone: "neutral" | "info" | "warning" | "danger" | "success"; order: number }> = {
  baixa: { label: "Baixa", tone: "neutral", order: 1 },
  normal: { label: "Normal", tone: "neutral", order: 2 },
  alta: { label: "Alta", tone: "warning", order: 3 },
  garantia: { label: "Garantia/Retorno", tone: "info", order: 4 },
  urgente: { label: "Urgente", tone: "danger", order: 5 },
};

export const PRIORIDADES_V3: PrioridadeV3[] = ["baixa", "normal", "alta", "urgente", "garantia"];

export function isPrioridadeV3(v: unknown): v is PrioridadeV3 {
  return v === "baixa" || v === "normal" || v === "alta" || v === "urgente" || v === "garantia";
}

/** Lê a prioridade V3 (payload.prioridadeV3); fallback do `os.prioridade` (V2) ou "normal". */
export function lerPrioridadeV3(os: OrdemServico | null | undefined): PrioridadeV3 {
  const v3 = (os as { prioridadeV3?: unknown } | null | undefined)?.prioridadeV3;
  if (isPrioridadeV3(v3)) return v3;
  switch (os?.prioridade) {
    case "critica":
      return "urgente";
    case "alta":
      return "alta";
    case "baixa":
      return "baixa";
    case "media":
      return "normal";
    default:
      return "normal";
  }
}

export function prioridadeOrderV3(os: OrdemServico): number {
  return PRIORIDADE_META_V3[lerPrioridadeV3(os)].order;
}

// ----------------------------------------------------------------------------
// SLA simples (item 6) — no prazo / em risco / atrasada
// ----------------------------------------------------------------------------

export type SlaSituacaoV3 = "no_prazo" | "em_risco" | "atrasada" | "sem_prazo";

export const SLA_SITUACAO_META_V3: Record<SlaSituacaoV3, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  no_prazo: { label: "No prazo", tone: "success" },
  em_risco: { label: "Em risco", tone: "warning" },
  atrasada: { label: "Atrasada", tone: "danger" },
  sem_prazo: { label: "Sem prazo", tone: "neutral" },
};

export interface SlaV3View {
  situacao: SlaSituacaoV3;
  prazo?: string;
  /** ms restantes até o prazo (negativo = vencido). */
  restanteMs?: number;
}

export function lerSlaV3(os: OrdemServico | null | undefined, now: Date = new Date()): SlaV3View {
  if (!os) return { situacao: "sem_prazo" };
  const finalizada = !ativa(os);
  const prazoIso = os.sla?.prazo || lerRecepcaoV3(os).previsaoEntrega;
  const prazo = parseIso(prazoIso);

  if (!prazo) {
    if (!finalizada && os.sla?.status === "estourado") return { situacao: "atrasada" };
    if (!finalizada && os.sla?.status === "atencao") return { situacao: "em_risco" };
    return { situacao: "sem_prazo" };
  }

  const restanteMs = prazo.getTime() - now.getTime();
  if (finalizada) return { situacao: "no_prazo", prazo: prazoIso, restanteMs };
  if (restanteMs < 0) return { situacao: "atrasada", prazo: prazoIso, restanteMs };

  const alerta = parseIso(os.sla?.alertaEm);
  const emRisco = (alerta !== null && now.getTime() >= alerta.getTime()) || restanteMs <= 24 * HORA_MS || os.sla?.status === "atencao";
  return { situacao: emRisco ? "em_risco" : "no_prazo", prazo: prazoIso, restanteMs };
}

/** Minutos de atraso (positivo) quando a OS está atrasada; senão null. */
export function calcularAtrasoMinutosV3(os: OrdemServico | null | undefined, now: Date = new Date()): number | null {
  const sla = lerSlaV3(os, now);
  if (sla.situacao !== "atrasada" || typeof sla.restanteMs !== "number") return null;
  return Math.max(0, Math.round(-sla.restanteMs / 60000));
}

export function isAtrasadaV3(os: OrdemServico | null | undefined, now: Date = new Date()): boolean {
  return lerSlaV3(os, now).situacao === "atrasada";
}

// ----------------------------------------------------------------------------
// Próxima ação (item 8) — derivada da máquina única
// ----------------------------------------------------------------------------

export function proximaAcaoV3(os: OrdemServico | null | undefined): AcaoStatusV3 | null {
  return acaoPrimariaV3(statusV3FromOS(os));
}

// ----------------------------------------------------------------------------
// Técnicos conhecidos (para o seletor de atribuição)
// ----------------------------------------------------------------------------

export interface TecnicoRefV3 {
  id: string;
  nome: string;
}

export function tecnicoIdFromNomeV3(nome: string): string {
  const sl = slug(nome);
  return sl ? `tec:${sl}` : SEM_TECNICO;
}

export function tecnicosConhecidosV3(ordens: OrdemServico[]): TecnicoRefV3[] {
  const map = new Map<string, TecnicoRefV3>();
  for (const os of ordens ?? []) {
    const id = os.tecnico?.id;
    const nome = os.tecnico?.nome?.trim();
    if (!id || !nome) continue;
    if (!map.has(id)) map.set(id, { id, nome });
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

// ----------------------------------------------------------------------------
// Ordenação por prioridade (item 5/8) — urgência → SLA → prazo
// ----------------------------------------------------------------------------

const SLA_PESO: Record<SlaSituacaoV3, number> = { atrasada: 3, em_risco: 2, no_prazo: 1, sem_prazo: 0 };

/** Ordena (cópia) por: maior prioridade → SLA mais crítico → prazo mais próximo. */
export function ordenarPorPrioridadeV3(ordens: OrdemServico[], now: Date = new Date()): OrdemServico[] {
  return [...(ordens ?? [])].sort((a, b) => {
    const pa = prioridadeOrderV3(a);
    const pb = prioridadeOrderV3(b);
    if (pa !== pb) return pb - pa;
    const sa = lerSlaV3(a, now);
    const sb = lerSlaV3(b, now);
    if (SLA_PESO[sa.situacao] !== SLA_PESO[sb.situacao]) return SLA_PESO[sb.situacao] - SLA_PESO[sa.situacao];
    const ra = typeof sa.restanteMs === "number" ? sa.restanteMs : Number.POSITIVE_INFINITY;
    const rb = typeof sb.restanteMs === "number" ? sb.restanteMs : Number.POSITIVE_INFINITY;
    return ra - rb;
  });
}

// ----------------------------------------------------------------------------
// Agrupar por técnico (item 1) — bancada (apenas OS ativas)
// ----------------------------------------------------------------------------

export interface GrupoBancadaV3 {
  tecnicoId: string;
  tecnicoNome: string;
  semTecnico: boolean;
  ordens: OrdemServico[];
}

/** Agrupa OS ATIVAS por técnico, ordenadas por prioridade. Inclui grupo "Sem técnico". */
export function bancadaPorTecnicoV3(ordens: OrdemServico[], now: Date = new Date()): GrupoBancadaV3[] {
  const map = new Map<string, GrupoBancadaV3>();
  for (const os of ordens ?? []) {
    if (!ativa(os)) continue;
    const id = os.tecnico?.id ?? SEM_TECNICO;
    const semTecnico = id === SEM_TECNICO;
    const nome = semTecnico ? "Sem técnico atribuído" : os.tecnico?.nome ?? "Sem técnico atribuído";
    const grupo = map.get(id) ?? { tecnicoId: id, tecnicoNome: nome, semTecnico, ordens: [] };
    grupo.ordens.push(os);
    map.set(id, grupo);
  }
  const grupos = [...map.values()].map((g) => ({ ...g, ordens: ordenarPorPrioridadeV3(g.ordens, now) }));
  // Técnicos por carga (desc); "Sem técnico" sempre por último.
  return grupos.sort((a, b) => {
    if (a.semTecnico !== b.semTecnico) return a.semTecnico ? 1 : -1;
    return b.ordens.length - a.ordens.length;
  });
}

// ----------------------------------------------------------------------------
// Métricas por técnico (item 7) — leitura simples, sem comissão
// ----------------------------------------------------------------------------

export interface MetricasTecnicoV3 {
  tecnicoId: string;
  tecnicoNome: string;
  semTecnico: boolean;
  totalAtribuidas: number;
  emExecucao: number;
  prontas: number;
  atrasadas: number;
  entreguesHoje: number;
}

export function metricasPorTecnicoV3(ordens: OrdemServico[], now: Date = new Date()): MetricasTecnicoV3[] {
  const map = new Map<string, MetricasTecnicoV3>();
  for (const os of ordens ?? []) {
    const st = statusV3FromOS(os);
    if (st === "cancelada") continue;
    const id = os.tecnico?.id ?? SEM_TECNICO;
    const semTecnico = id === SEM_TECNICO;
    const nome = semTecnico ? "Sem técnico atribuído" : os.tecnico?.nome ?? "Sem técnico atribuído";
    const m =
      map.get(id) ??
      ({ tecnicoId: id, tecnicoNome: nome, semTecnico, totalAtribuidas: 0, emExecucao: 0, prontas: 0, atrasadas: 0, entreguesHoje: 0 } as MetricasTecnicoV3);
    m.totalAtribuidas += 1;
    if (st === "em_execucao") m.emExecucao += 1;
    if (st === "pronta") m.prontas += 1;
    if (isAtrasadaV3(os, now)) m.atrasadas += 1;
    if (st === "entregue") {
      const e = parseIso(lerEntregaV3(os).entregueEm);
      if (e && mesmoDia(e, now)) m.entreguesHoje += 1;
    }
    map.set(id, m);
  }
  return [...map.values()].sort((a, b) => {
    if (a.semTecnico !== b.semTecnico) return a.semTecnico ? 1 : -1;
    return b.totalAtribuidas - a.totalAtribuidas;
  });
}

// ----------------------------------------------------------------------------
// Produção do dia (item 3) — contagens reais
// ----------------------------------------------------------------------------

export interface ProducaoDoDiaV3 {
  emDiagnostico: number;
  emExecucao: number;
  prontas: number;
  atrasadas: number;
  semTecnico: number;
  tecnicosAtivos: number;
  entreguesHoje: number;
  ativasTotal: number;
}

export function producaoDoDiaV3(ordens: OrdemServico[], now: Date = new Date()): ProducaoDoDiaV3 {
  let emDiagnostico = 0;
  let emExecucao = 0;
  let prontas = 0;
  let atrasadas = 0;
  let semTecnico = 0;
  let entreguesHoje = 0;
  let ativasTotal = 0;
  const tecnicos = new Set<string>();
  for (const os of ordens ?? []) {
    const st = statusV3FromOS(os);
    if (st === "entregue") {
      const e = parseIso(lerEntregaV3(os).entregueEm);
      if (e && mesmoDia(e, now)) entreguesHoje += 1;
      continue;
    }
    if (st === "cancelada") continue;
    ativasTotal += 1;
    if (st === "diagnostico") emDiagnostico += 1;
    if (st === "em_execucao") emExecucao += 1;
    if (st === "pronta") prontas += 1;
    if (isAtrasadaV3(os, now)) atrasadas += 1;
    if (!os.tecnico?.id) semTecnico += 1;
    else tecnicos.add(os.tecnico.id);
  }
  return { emDiagnostico, emExecucao, prontas, atrasadas, semTecnico, tecnicosAtivos: tecnicos.size, entreguesHoje, ativasTotal };
}

// ----------------------------------------------------------------------------
// Fila de produção (item 4) — colunas operacionais (reusa a máquina de status)
// ----------------------------------------------------------------------------

export type ColunaFilaV3 = "aguardando_diagnostico" | "em_diagnostico" | "aguardando_peca" | "em_execucao" | "pronta";

export const FILA_COLUNAS_V3: { id: ColunaFilaV3; label: string; status: OperacaoStatusV3 }[] = [
  { id: "aguardando_diagnostico", label: "Aguardando diagnóstico", status: "aberta" },
  { id: "em_diagnostico", label: "Em diagnóstico", status: "diagnostico" },
  { id: "aguardando_peca", label: "Aguardando peça", status: "aguardando_peca" },
  { id: "em_execucao", label: "Em execução", status: "em_execucao" },
  { id: "pronta", label: "Pronta", status: "pronta" },
];

export function filaProducaoV3(ordens: OrdemServico[], now: Date = new Date()): Record<ColunaFilaV3, OrdemServico[]> {
  const acc: Record<ColunaFilaV3, OrdemServico[]> = {
    aguardando_diagnostico: [],
    em_diagnostico: [],
    aguardando_peca: [],
    em_execucao: [],
    pronta: [],
  };
  const porStatus = new Map<OperacaoStatusV3, ColunaFilaV3>(FILA_COLUNAS_V3.map((c) => [c.status, c.id]));
  for (const os of ordens ?? []) {
    const col = porStatus.get(statusV3FromOS(os));
    if (col) acc[col].push(os);
  }
  for (const c of FILA_COLUNAS_V3) acc[c.id] = ordenarPorPrioridadeV3(acc[c.id], now);
  return acc;
}
