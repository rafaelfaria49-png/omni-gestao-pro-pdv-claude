import type { Orcamento, OrdemServico, OSStatus, Servico } from "@/types/os";
import { normalizeOperacaoStatus, prismaStatusToOperacaoStatus } from "@/components/operacoes/lovable/utils/os-status";
import { asOperacoesPayload } from "@/lib/operacoes/services/os-helpers";

export type PrismaOSRow = {
  id: string;
  storeId: string;
  numero: string | null;
  clienteId: string | null;
  defeito: string;
  status: "Aberto" | "EmAnalise" | "Pronto" | "Entregue";
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
  /** Colunas Prisma — usadas quando o JSONB não traz clienteId/orçamento fiéis. */
  valorTotal: number;
  valorBase: number;
  /** Itens Prisma (quando a leitura inclui `itens`). */
  itensPersistidos?: {
    id: string;
    tipo: string;
    descricao: string;
    quantidade: number;
    precoUnitario: number;
    produtoId: string | null;
  }[];
};

/**
 * Preferência: FK `ordens_servico.clienteId` (fonte multi-tenant), depois payload.
 * Payloads antigos costumam ter `clienteId` vazio com cliente só no snapshot.
 */
function resolveClienteId(m: OrdemServico, r: PrismaOSRow): string {
  const fk = r.clienteId?.trim();
  if (fk) return fk;
  const pid = (m.clienteId ?? "").trim();
  if (pid) return pid;
  const snap = (m.cliente?.id ?? "").trim();
  if (snap) return snap;
  return "";
}

/**
 * Preenche orçamento/totais quando o payload tem shell vazio mas Prisma ou `servicosCatalogo` têm valor.
 * Não sobrescreve orçamentos com linhas ou total já > 0.
 */
function mergeOrcamentoFromPrismaRow(r: PrismaOSRow, m: OrdemServico): Orcamento | undefined {
  const dbTotal = Number(r.valorTotal ?? 0) || 0;
  const dbBase = Number(r.valorBase ?? 0) || 0;
  const monetaryFallback = dbTotal > 0 ? dbTotal : dbBase;

  const cur = m.orcamento;
  if (cur) {
    const lineCount = (cur.pecas?.length ?? 0) + (cur.servicos?.length ?? 0);
    const declared = typeof cur.total === "number" ? cur.total : 0;
    if (lineCount > 0 || declared > 0) return undefined;
  }

  const cat = Array.isArray(m.servicosCatalogo) ? m.servicosCatalogo : [];
  let servicos: Servico[] = [];
  if (cat.length > 0) {
    servicos = cat.map((s, i) => ({
      id: s.servicoId || `cat_${i}`,
      descricao: s.descricao,
      valor: s.valorVenda,
      desconto: 0,
      prazoGarantiaDias: s.prazoGarantiaDias,
      termoGarantia: s.termoGarantia,
    }));
  } else if (monetaryFallback > 0) {
    servicos = [{ id: `svc_${r.id}`, descricao: "Serviços (valor registrado)", valor: monetaryFallback, desconto: 0 }];
  } else {
    return undefined;
  }

  const sumServ = servicos.reduce((acc, s) => acc + Math.max(0, s.valor - (s.desconto ?? 0)), 0);
  const total = Math.max(sumServ, monetaryFallback);

  const baseOrc: Orcamento =
    cur ??
    ({
      id: `orc_${r.id}`,
      status: "aprovado",
      pecas: [],
      servicos: [],
      desconto: 0,
      total: 0,
      criadoEm: m.criadoEm,
      atualizadoEm: m.atualizadoEm,
    } as Orcamento);

  return {
    ...baseOrc,
    pecas: baseOrc.pecas ?? [],
    servicos,
    desconto: typeof baseOrc.desconto === "number" ? baseOrc.desconto : 0,
    total,
    atualizadoEm: m.atualizadoEm,
  };
}

function applyPrismaEnrichment<T extends OrdemServico & { operacaoStatus?: OSStatus }>(
  r: PrismaOSRow,
  base: T,
  effective: OSStatus
): T {
  const m = base as unknown as OrdemServico;
  const clienteId = resolveClienteId(m, r);
  const storeId = r.storeId || m.storeId;
  let next = {
    ...base,
    clienteId,
    storeId,
    status: effective as unknown as T["status"],
    operacaoStatus: effective,
    prismaValorBase: r.valorBase,
    prismaValorTotal: r.valorTotal,
  } as T;
  const orc = mergeOrcamentoFromPrismaRow(r, next as unknown as OrdemServico);
  if (orc) {
    next = { ...next, orcamento: orc } as T;
  }
  if (Array.isArray(r.itensPersistidos) && r.itensPersistidos.length > 0) {
    next = { ...next, itensPersistidos: r.itensPersistidos } as T;
  }
  return next;
}

/**
 * Hidrata rows do Prisma em `OperacoesOSPayload` (mantém o comportamento do listOS atual).
 * Mantém a regra de status granular: prefere `payload.operacaoStatus`, depois `payload.status`, senão converte do enum Prisma.
 */
export function hydrateOSRows<T extends OrdemServico & { operacaoStatus?: OSStatus }>(rows: PrismaOSRow[]): T[] {
  const out: T[] = [];

  for (const r of rows) {
    const parsed = asOperacoesPayload<T>(r.payload as unknown);
    if (parsed) {
      const p = parsed as unknown as T & { operacaoStatus?: unknown; status?: unknown };
      const effective = normalizeOperacaoStatus(
        (p.operacaoStatus as OSStatus | undefined) ??
          (p.status as OSStatus | undefined) ??
          prismaStatusToOperacaoStatus(r.status)
      );
      const merged = applyPrismaEnrichment(r, { ...(p as T) }, effective);
      out.push(merged);
      continue;
    }

    const fallbackOperacao = prismaStatusToOperacaoStatus(r.status);
    const shell = {
      id: r.id,
      codigo: r.numero ?? `OS-${new Date(r.createdAt).getFullYear()}-${r.id.slice(-5)}`,
      storeId: r.storeId,
      clienteId: r.clienteId ?? "",
      cliente: { id: r.clienteId ?? "", nome: "—" },
      equipamento: { id: `eq_${r.id}`, tipo: "—", marca: "", modelo: "", defeitoRelatado: r.defeito ?? "" },
      status: fallbackOperacao as unknown as T["status"],
      operacaoStatus: fallbackOperacao,
      prioridade: "media",
      origem: "manual",
      sla: { prazo: r.updatedAt.toISOString(), status: "ok" },
      pecas: [],
      observacoes: [],
      anexos: [],
      timeline: [],
      garantia: { ativa: false },
      criadoEm: r.createdAt.toISOString(),
      atualizadoEm: r.updatedAt.toISOString(),
    } as unknown as T;
    out.push(applyPrismaEnrichment(r, shell, fallbackOperacao));
  }

  return out;
}
