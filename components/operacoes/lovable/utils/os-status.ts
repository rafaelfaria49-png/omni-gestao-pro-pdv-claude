import type { OSStatus } from "@/types/os";

/**
 * Status canônico operacional (Operações HUB V2).
 *
 * - Não altera banco (Prisma enum continua com 4 estados).
 * - Preserva granularidade em `payload.operacaoStatus` quando disponível.
 */
export type OperacaoStatusCanonico = OSStatus;

export type PrismaOSStatus = "Aberto" | "EmAnalise" | "Pronto" | "Entregue";

export const OPERACAO_STATUS_PIPELINE: OperacaoStatusCanonico[] = [
  "aberta",
  "diagnostico",
  "aguardando_aprovacao",
  "em_execucao",
  "pronta",
  "entregue",
  "cancelada",
];

export type OperacaoStatusMeta = {
  id: OperacaoStatusCanonico;
  label: string;
  description: string;
  order: number;
  /** Classe utilitária (tokens) para badges (não obrigatório para UI atual). */
  badgeClass: string;
  /** Status Prisma compatível (colapsado). */
  prisma: PrismaOSStatus;
  /** Se é estado final no pipeline operacional. */
  final: boolean;
};

const META: Record<OperacaoStatusCanonico, OperacaoStatusMeta> = {
  aberta: {
    id: "aberta",
    label: "Aberto",
    description: "OS recém-criada, aguardando triagem",
    order: 10,
    badgeClass: "border-border bg-muted text-muted-foreground",
    prisma: "Aberto",
    final: false,
  },
  diagnostico: {
    id: "diagnostico",
    label: "Diagnóstico",
    description: "Técnico avaliando o equipamento",
    order: 20,
    badgeClass: "border-sky-500/20 bg-sky-500/10 text-sky-600",
    prisma: "EmAnalise",
    final: false,
  },
  aguardando_aprovacao: {
    id: "aguardando_aprovacao",
    label: "Aguardando aprovação/peça",
    description: "Aguardando aprovação do cliente ou chegada de peça",
    order: 30,
    badgeClass: "border-amber-500/20 bg-amber-500/10 text-amber-600",
    prisma: "EmAnalise",
    final: false,
  },
  em_execucao: {
    id: "em_execucao",
    label: "Em execução",
    description: "Reparo em andamento",
    order: 40,
    badgeClass: "border-indigo-500/20 bg-indigo-500/10 text-indigo-600",
    prisma: "EmAnalise",
    final: false,
  },
  pronta: {
    id: "pronta",
    label: "Pronto",
    description: "Pronto para retirada/entrega",
    order: 50,
    badgeClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
    prisma: "Pronto",
    final: false,
  },
  entregue: {
    id: "entregue",
    label: "Entregue",
    description: "Equipamento devolvido ao cliente",
    order: 60,
    badgeClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
    prisma: "Entregue",
    final: true,
  },
  cancelada: {
    id: "cancelada",
    label: "Cancelada",
    description: "OS encerrada/cancelada",
    order: 70,
    badgeClass: "border-rose-500/20 bg-rose-500/10 text-rose-600",
    prisma: "Aberto",
    final: true,
  },
};

const ALIASES: Record<string, OperacaoStatusCanonico> = {
  // variações comuns
  aberto: "aberta",
  recebida: "aberta",
  novo: "aberta",
  "em_analise": "diagnostico",
  "em-analise": "diagnostico",
  "aguardando_peca": "aguardando_aprovacao",
  "em_reparo": "em_execucao",
  pronto: "pronta",
  finalizado: "entregue",
};

export function normalizeOperacaoStatus(raw: unknown): OperacaoStatusCanonico {
  if (raw == null) return "aberta";
  if (typeof raw !== "string") return "aberta";
  const s = raw.trim();
  if (!s) return "aberta";
  if ((OPERACAO_STATUS_PIPELINE as string[]).includes(s)) return s as OperacaoStatusCanonico;
  const k = s.toLowerCase();
  return ALIASES[k] ?? "aberta";
}

export function getOperacaoStatusMeta(s: unknown): OperacaoStatusMeta {
  const id = normalizeOperacaoStatus(s);
  return META[id];
}

export function getOperacaoStatusLabel(s: unknown): string {
  return getOperacaoStatusMeta(s).label;
}

export function operacaoStatusToPrismaStatus(s: unknown): PrismaOSStatus {
  return getOperacaoStatusMeta(s).prisma;
}

export function prismaStatusToOperacaoStatus(s: unknown): OperacaoStatusCanonico {
  if (s === "Pronto") return "pronta";
  if (s === "Entregue") return "entregue";
  if (s === "EmAnalise") return "diagnostico";
  return "aberta";
}

export function isFinalOperacaoStatus(s: unknown): boolean {
  return getOperacaoStatusMeta(s).final;
}

export function canTransitionOperacaoStatus(from: unknown, to: unknown): boolean {
  const a = normalizeOperacaoStatus(from);
  const b = normalizeOperacaoStatus(to);
  if (a === b) return true;
  if (isFinalOperacaoStatus(a)) return false;
  // regra conservadora: permite avançar na ordem, ou cancelar a qualquer momento
  if (b === "cancelada") return true;
  return META[b].order >= META[a].order;
}

