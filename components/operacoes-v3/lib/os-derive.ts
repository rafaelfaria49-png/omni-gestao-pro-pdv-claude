// ============================================================================
// Operações V3 — Derivações puras sobre OS reais (somente leitura)
// ----------------------------------------------------------------------------
// Tudo aqui é cálculo honesto a partir do que JÁ existe no DTO de OS.
// Nada inventa KPI nem simula recebimento. Onde o dado real não existe no
// read layer da OS (ex.: valor recebido em Financeiro), retornamos "a-conectar".
// ============================================================================

import type { OrdemServico, OSStatus } from "@/types/os";

export const OS_STATUS_LIST: OSStatus[] = [
  "aberta",
  "diagnostico",
  "aguardando_aprovacao",
  "aprovado",
  "em_execucao",
  "aguardando_peca",
  "pronta",
  "entregue",
  "cancelada",
];

export function emptyStatusCount(): Record<OSStatus, number> {
  return OS_STATUS_LIST.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<OSStatus, number>,
  );
}

export function countByStatus(ordens: OrdemServico[]): Record<OSStatus, number> {
  const acc = emptyStatusCount();
  for (const os of ordens) {
    if (os.status in acc) acc[os.status] += 1;
  }
  return acc;
}

/** OS está atrasada quando o SLA estourou e ela ainda não foi entregue/cancelada. */
export function isAtrasada(os: OrdemServico): boolean {
  if (os.status === "entregue" || os.status === "cancelada") return false;
  return os.sla?.status === "estourado";
}

/** OS em risco (SLA em atenção), ainda em fluxo. */
export function isEmRisco(os: OrdemServico): boolean {
  if (os.status === "entregue" || os.status === "cancelada") return false;
  return os.sla?.status === "atencao";
}

export function orcamentoTotal(os: OrdemServico): number {
  const t = os.orcamento?.total;
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
}

/** Receita estimada = soma do total dos orçamentos de OS não-canceladas (pipeline). */
export function receitaEstimada(ordens: OrdemServico[]): number {
  return ordens
    .filter((o) => o.status !== "cancelada")
    .reduce((s, o) => s + orcamentoTotal(o), 0);
}

export function isGarantiaAtiva(os: OrdemServico): boolean {
  if (os.garantia?.ativa) {
    if (!os.garantia.fimEm) return true;
    const fim = new Date(os.garantia.fimEm).getTime();
    return Number.isNaN(fim) ? true : fim >= Date.now();
  }
  return (os.garantiasOperacionais ?? []).some((g) => g.status === "ativa");
}

export function garantiasAtivas(ordens: OrdemServico[]): OrdemServico[] {
  return ordens.filter(isGarantiaAtiva);
}

// ----------------------------------------------------------------------------
// Pagamento — honesto: o "recebido" real vive no Financeiro (Contas a Receber),
// que NÃO está acoplado a este read layer. Por isso, nesta sprint, a V3 só
// afirma o que sabe: o VALOR da OS e se há/não há cobrança. O estado
// pago/parcial fica "a-conectar" (sem simular recebimento).
// ----------------------------------------------------------------------------

export type PagamentoEstado = "aberto" | "parcial" | "quitado" | "sem-cobranca" | "a-conectar";

export interface PagamentoInfo {
  estado: PagamentoEstado;
  total: number;
}

export function pagamentoInfo(os: OrdemServico): PagamentoInfo {
  const total = orcamentoTotal(os);
  if (os.faturamentoStatus === "cancelado") return { estado: "sem-cobranca", total };
  if (total <= 0) return { estado: "sem-cobranca", total };
  // Há valor cobrável, mas o status real do recebimento vive no Financeiro.
  return { estado: "a-conectar", total };
}

// ----------------------------------------------------------------------------
// Agrupamentos usados pelas telas (Bancada / Orçamentos / Histórico / Técnicos)
// ----------------------------------------------------------------------------

export interface GrupoTecnico {
  tecnicoId: string;
  tecnicoNome: string;
  ordens: OrdemServico[];
}

export function agruparPorTecnico(ordens: OrdemServico[]): GrupoTecnico[] {
  const map = new Map<string, GrupoTecnico>();
  for (const os of ordens) {
    if (os.status === "entregue" || os.status === "cancelada") continue;
    const id = os.tecnico?.id ?? "__sem_tecnico__";
    const nome = os.tecnico?.nome ?? "Sem técnico atribuído";
    const grupo = map.get(id) ?? { tecnicoId: id, tecnicoNome: nome, ordens: [] };
    grupo.ordens.push(os);
    map.set(id, grupo);
  }
  return [...map.values()].sort((a, b) => b.ordens.length - a.ordens.length);
}

export interface GrupoCliente {
  clienteId: string;
  clienteNome: string;
  telefone?: string;
  ordens: OrdemServico[];
  totalEstimado: number;
}

export function agruparPorCliente(ordens: OrdemServico[]): GrupoCliente[] {
  const map = new Map<string, GrupoCliente>();
  for (const os of ordens) {
    const id = os.cliente?.id ?? os.clienteId ?? "__sem_cliente__";
    const nome = os.cliente?.nome ?? "Cliente não identificado";
    const grupo =
      map.get(id) ??
      ({ clienteId: id, clienteNome: nome, telefone: os.cliente?.telefone, ordens: [], totalEstimado: 0 } as GrupoCliente);
    grupo.ordens.push(os);
    grupo.totalEstimado += orcamentoTotal(os);
    map.set(id, grupo);
  }
  return [...map.values()].sort((a, b) => b.ordens.length - a.ordens.length);
}

export type OrcamentoStatusV3 = "rascunho" | "enviado" | "aprovado" | "recusado" | "expirado" | "sem-orcamento";

export const ORCAMENTO_STATUS_LIST: OrcamentoStatusV3[] = [
  "rascunho",
  "enviado",
  "aprovado",
  "recusado",
  "expirado",
  "sem-orcamento",
];

export function orcamentoStatusDe(os: OrdemServico): OrcamentoStatusV3 {
  const st = os.orcamento?.status;
  if (st === "rascunho" || st === "enviado" || st === "aprovado" || st === "recusado" || st === "expirado") {
    return st;
  }
  return "sem-orcamento";
}

export function agruparPorOrcamento(ordens: OrdemServico[]): Record<OrcamentoStatusV3, OrdemServico[]> {
  const acc = ORCAMENTO_STATUS_LIST.reduce(
    (a, s) => {
      a[s] = [];
      return a;
    },
    {} as Record<OrcamentoStatusV3, OrdemServico[]>,
  );
  for (const os of ordens) {
    acc[orcamentoStatusDe(os)].push(os);
  }
  return acc;
}

/** Busca textual simples sobre os campos visíveis da OS. */
export function matchOrdem(os: OrdemServico, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const campos = [
    os.codigo,
    os.cliente?.nome,
    os.cliente?.telefone,
    os.cliente?.documento,
    os.equipamento?.marca,
    os.equipamento?.modelo,
    os.equipamento?.tipo,
    os.equipamento?.defeitoRelatado,
    os.tecnico?.nome,
  ];
  return campos.some((c) => (c ?? "").toLowerCase().includes(q));
}
