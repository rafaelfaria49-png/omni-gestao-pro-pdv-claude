import type { OrdemServico, OSStatus } from "@/types/os";
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
};

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
      out.push({
        ...(p as T),
        status: effective as unknown as T["status"],
        operacaoStatus: effective,
      });
      continue;
    }

    const fallbackOperacao = prismaStatusToOperacaoStatus(r.status);
    out.push({
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
    } as unknown as T);
  }

  return out;
}

