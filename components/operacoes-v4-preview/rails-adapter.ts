/**
 * Operações V4 Preview — adaptadores READ-ONLY das telas de rail (Visão geral,
 * Fila, Bancada, SLA, PDV de serviço).
 *
 * Recebe a lista de `OrdemServico` REAIS da loja ativa (carregadas por `listOrdens`,
 * somente leitura) e produz os view-models que cada tela de módulo consome. Puro,
 * sem efeitos colaterais, sem Prisma/Server Action. Onde não há dado real suficiente,
 * o builder sinaliza `temDados: false` para a UI exibir um estado vazio honesto e
 * ESPECÍFICO do módulo — nunca um número, técnico, SLA ou valor fabricado.
 *
 * Princípio (GOAL OPS-V4-REAL-SEARCH-AND-RAILS-001): só dado real ou vazio honesto.
 */
import type { OrdemServico } from "@/types/os";
import type { V4Status, V4Tone } from "./types";
import { STATUS_LABEL, TONE } from "./mock-data";
import { aparelhoLabel, fmtData, osTotalNumero, realStatusToV4 } from "./os-adapter";
import { C, fmt } from "./tokens";

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Status que NÃO contam como "ativo na operação" (fora da fila/bancada/SLA). */
const STATUS_FINALIZADO: V4Status[] = ["entregue", "cancelada"];

function isAtivo(os: OrdemServico): boolean {
  return !STATUS_FINALIZADO.includes(realStatusToV4(os.status));
}

/** Linha de OS reutilizada por Fila / Bancada / SLA (apenas dados reais). */
export interface RailOsRow {
  id: string;
  codigo: string;
  cliente: string;
  aparelho: string;
  status: V4Status;
  statusLabel: string;
  tone: V4Tone;
  entrada: string;
  previsao: string;
}

function toRow(os: OrdemServico): RailOsRow {
  const status = realStatusToV4(os.status);
  return {
    id: os.id,
    codigo: txt(os.codigo) || "OS",
    cliente: txt(os.cliente?.nome) || "Cliente não informado",
    aparelho: aparelhoLabel(os),
    status,
    statusLabel: STATUS_LABEL[status] || status,
    tone: TONE[status] || TONE.em_execucao,
    entrada: fmtData(os.criadoEm),
    previsao: os.sla?.prazo ? fmtData(os.sla.prazo) : "",
  };
}

/** Ordena por entrada (mais antiga primeiro = frente da fila); sem data vai ao fim. */
function ordemEntrada(a: OrdemServico, b: OrdemServico): number {
  const ta = new Date(a.criadoEm ?? "").getTime();
  const tb = new Date(b.criadoEm ?? "").getTime();
  const va = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
  const vb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
  return va - vb;
}

function temSlaReal(os: OrdemServico): boolean {
  return !!os.sla && (!!os.sla.prazo || !!os.sla.status);
}

// ---- Visão geral (dashboard) -----------------------------------------------

export interface DashboardBucket {
  key: V4Status;
  label: string;
  count: number;
}

export interface DashboardResumo {
  /** false quando a loja não tem nenhuma OS → empty state honesto. */
  temDados: boolean;
  total: number;
  ativos: number;
  buckets: DashboardBucket[];
  /** true quando ao menos uma OS tem SLA real → habilita o KPI de atrasadas. */
  temSla: boolean;
  atrasadas: number;
}

export function buildDashboardResumo(ordens: OrdemServico[]): DashboardResumo {
  const count = (s: V4Status) => ordens.filter((o) => realStatusToV4(o.status) === s).length;
  const buckets: DashboardBucket[] = [
    { key: "aberta", label: "Abertas", count: count("aberta") },
    { key: "diagnostico", label: "Em diagnóstico", count: count("diagnostico") },
    { key: "aguardando_aprovacao", label: "Aguardando aprovação", count: count("aguardando_aprovacao") },
    { key: "aprovado", label: "Aprovadas", count: count("aprovado") },
    { key: "aguardando_peca", label: "Aguardando peça", count: count("aguardando_peca") },
    { key: "em_execucao", label: "Em execução", count: count("em_execucao") },
    { key: "pronta", label: "Prontas", count: count("pronta") },
    { key: "entregue", label: "Entregues", count: count("entregue") },
  ];
  return {
    temDados: ordens.length > 0,
    total: ordens.length,
    ativos: ordens.filter(isAtivo).length,
    buckets,
    temSla: ordens.some(temSlaReal),
    atrasadas: ordens.filter((o) => o.sla?.status === "estourado").length,
  };
}

// ---- Fila ------------------------------------------------------------------

export function buildFilaItens(ordens: OrdemServico[]): RailOsRow[] {
  return ordens.filter(isAtivo).slice().sort(ordemEntrada).map(toRow);
}

// ---- Bancada por técnico ---------------------------------------------------

export interface BancadaGrupo {
  tecnico: string;
  itens: RailOsRow[];
}

export interface BancadaView {
  /** false quando nenhuma OS ativa tem técnico real → empty honesto (sem inventar técnico). */
  temDados: boolean;
  grupos: BancadaGrupo[];
}

export function buildBancadaView(ordens: OrdemServico[]): BancadaView {
  const comTecnico = ordens.filter((o) => isAtivo(o) && txt(o.tecnico?.nome));
  if (comTecnico.length === 0) return { temDados: false, grupos: [] };

  const map = new Map<string, OrdemServico[]>();
  for (const o of comTecnico) {
    const t = txt(o.tecnico?.nome);
    const list = map.get(t);
    if (list) list.push(o);
    else map.set(t, [o]);
  }
  const grupos: BancadaGrupo[] = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([tecnico, list]) => ({ tecnico, itens: list.slice().sort(ordemEntrada).map(toRow) }));
  return { temDados: true, grupos };
}

// ---- SLA & atrasos ---------------------------------------------------------

export interface SlaView {
  /** false quando nenhuma OS tem SLA real → empty honesto (sem inventar prazo). */
  temDados: boolean;
  atrasadas: RailOsRow[];
  vencendo: RailOsRow[];
  noPrazo: number;
}

export function buildSlaView(ordens: OrdemServico[]): SlaView {
  const comSla = ordens.filter(temSlaReal);
  if (comSla.length === 0) return { temDados: false, atrasadas: [], vencendo: [], noPrazo: 0 };

  const ativos = comSla.filter(isAtivo);
  return {
    temDados: true,
    atrasadas: ativos.filter((o) => o.sla?.status === "estourado").slice().sort(ordemEntrada).map(toRow),
    vencendo: ativos.filter((o) => o.sla?.status === "atencao").slice().sort(ordemEntrada).map(toRow),
    noPrazo: ativos.filter((o) => o.sla?.status === "ok").length,
  };
}

// ---- PDV de serviço --------------------------------------------------------

const FATURA_TONE: Record<"pendente" | "cancelado" | "neutro", V4Tone> = {
  pendente: { bg: C.warnBg, fg: C.warnFg, dot: C.warn },
  cancelado: { bg: C.dangerBg, fg: C.dangerFg, dot: C.danger },
  neutro: { bg: C.line3, fg: C.bodySoft, dot: C.subtle },
};

export interface PdvRow {
  id: string;
  codigo: string;
  cliente: string;
  total: string;
  totalNum: number;
  statusFaturamento: string;
  statusTone: V4Tone;
}

export interface PdvView {
  /** false quando nenhuma OS tem valor/faturamento real → empty honesto. */
  temDados: boolean;
  itens: PdvRow[];
  totalGeral: string;
  aReceberCount: number;
}

function temFinanceiroReal(os: OrdemServico): boolean {
  return (
    osTotalNumero(os) > 0 ||
    !!txt(os.faturamentoFormaPagamento) ||
    !!os.faturamentoPendente ||
    os.faturamentoStatus === "cancelado"
  );
}

export function buildPdvView(ordens: OrdemServico[]): PdvView {
  const comFin = ordens.filter(temFinanceiroReal);
  if (comFin.length === 0) {
    return { temDados: false, itens: [], totalGeral: fmt(0), aReceberCount: 0 };
  }

  const itens: PdvRow[] = comFin
    .slice()
    .sort((a, b) => osTotalNumero(b) - osTotalNumero(a))
    .map((os) => {
      const totalNum = osTotalNumero(os);
      const toneKey: "pendente" | "cancelado" | "neutro" =
        os.faturamentoStatus === "cancelado" ? "cancelado" : os.faturamentoPendente ? "pendente" : "neutro";
      const statusFaturamento =
        toneKey === "cancelado"
          ? "Faturamento cancelado"
          : toneKey === "pendente"
            ? "A receber"
            : "Sem pendência";
      return {
        id: os.id,
        codigo: txt(os.codigo) || "OS",
        cliente: txt(os.cliente?.nome) || "Cliente não informado",
        total: totalNum > 0 ? fmt(totalNum) : "—",
        totalNum,
        statusFaturamento,
        statusTone: FATURA_TONE[toneKey],
      };
    });

  const totalGeral = itens.reduce((acc, it) => acc + it.totalNum, 0);
  const aReceberCount = comFin.filter((o) => !!o.faturamentoPendente).length;
  return { temDados: true, itens, totalGeral: fmt(totalGeral), aReceberCount };
}
