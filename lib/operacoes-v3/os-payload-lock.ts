// ============================================================================
// Operações V3 — mutação do `OrdemServico.payload` SOB A TRAVA DA LINHA
// ----------------------------------------------------------------------------
// O payload JSONB da OS guarda estado de vários donos (operacional, orçamento,
// entrega, espelhos financeiros, `recebimentoMistoRecusasV3`, timeline). Um writer
// que lê o payload, faz `await` e grava o objeto inteiro apaga o que outro writer
// commitou no meio (lost update). Regra única para todo writer de payload:
//
//   transação → SELECT … FOR UPDATE da OS (loja + id) → releitura do payload MAIS
//   RECENTE → mutação intencional sobre ele (campos desconhecidos e timeline
//   preservados por spread do latest) → UPDATE na MESMA transação → commit.
//   `revalidatePath`/eventos/efeitos externos só DEPOIS do commit, no chamador.
//
// Ordem de travas (sem ciclo): writers de pagamento da V3 = advisory lock da OS →
// sessão de caixa (FOR SHARE) → OS (FOR UPDATE) → título (FOR UPDATE). Writers
// operacionais travam SÓ a OS (folha) — ou a OS e, depois dela, linhas que nenhum
// caminho trava antes da OS (produto/estoque, garantias). Nenhum writer segura
// duas OS ao mesmo tempo.
//
// Módulo comum (sem "use server"): não é exposto como Server Action.
// ============================================================================

import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";

export type OSPayloadV3 = OrdemServico & Record<string, unknown>;
export type TxOSPayloadV3 = Prisma.TransactionClient;

/** Transação curta de writer de payload (mesmos limites dos writers de pagamento). */
export const TX_PAYLOAD_OS_V3 = { maxWait: 5_000, timeout: 15_000 } as const;

export interface OSTravadaV3 {
  id: string;
  storeId: string;
  numero: string | null;
  /** Payload MAIS RECENTE, lido depois da trava. `{}` quando o payload gravado não é objeto. */
  payload: OSPayloadV3;
  payloadValido: boolean;
  valorTotal: number;
  valorBase: number;
  updatedAt: Date;
}

/** `SELECT … FOR UPDATE` da OS desta loja. `false` = a OS não existe nesta loja. */
export async function travarLinhaOSV3(tx: TxOSPayloadV3, storeId: string, osId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ordens_servico" WHERE "id" = ${osId} AND "storeId" = ${storeId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows.length > 0;
}

/** Trava a OS e relê a linha: o payload devolvido é o mais recente e ninguém o troca até o commit. */
export async function lerOSTravadaV3(tx: TxOSPayloadV3, storeId: string, osId: string): Promise<OSTravadaV3 | null> {
  if (!(await travarLinhaOSV3(tx, storeId, osId))) return null;
  const row = await tx.ordemServico.findFirst({
    where: { id: osId, storeId },
    select: { id: true, storeId: true, numero: true, payload: true, valorTotal: true, valorBase: true, updatedAt: true },
  });
  if (!row) return null;
  const payloadValido = !!row.payload && typeof row.payload === "object" && !Array.isArray(row.payload);
  return {
    id: row.id,
    storeId: row.storeId,
    numero: row.numero ?? null,
    payload: (payloadValido ? row.payload : {}) as unknown as OSPayloadV3,
    payloadValido,
    valorTotal: Number(row.valorTotal ?? 0) || 0,
    valorBase: Number(row.valorBase ?? 0) || 0,
    updatedAt: row.updatedAt,
  };
}

/**
 * Resultado da mutação: `payload: null` = nada a gravar (no-op); `colunas` = colunas Prisma
 * gravadas junto (status, valorTotal, defeito…); `resultado` = o que o writer devolve.
 */
export interface MutacaoPayloadOSV3<R> {
  payload: OSPayloadV3 | null;
  colunas?: Omit<Prisma.OrdemServicoUpdateInput, "payload">;
  resultado: R;
}

export interface MutarPayloadOSV3Params<R> {
  storeId: string;
  osId: string;
  /** Recebe a OS travada (payload mais recente) e o `tx`. Lançar aborta tudo (rollback). */
  mutate: (os: OSTravadaV3, tx: TxOSPayloadV3) => Promise<MutacaoPayloadOSV3<R>> | MutacaoPayloadOSV3<R>;
  /** Transação do chamador (já aberta). Ausente: abre uma própria com `TX_PAYLOAD_OS_V3`. */
  tx?: TxOSPayloadV3;
  /** Padrão: payload que não é objeto → "OS sem payload compatível.". `true` aceita `{}`. */
  aceitarPayloadVazio?: boolean;
  /** Padrão: OS inexistente nesta loja → "OS não encontrada.". Com isto, devolve o valor em vez de lançar. */
  aoAusente?: () => R;
}

/** MUTATE LATEST PAYLOAD UNDER ROW LOCK — ver cabeçalho do módulo. */
export async function mutarPayloadOSV3<R>(p: MutarPayloadOSV3Params<R>): Promise<R> {
  const executar = async (tx: TxOSPayloadV3): Promise<R> => {
    const os = await lerOSTravadaV3(tx, p.storeId, p.osId);
    if (!os) {
      if (p.aoAusente) return p.aoAusente();
      throw new Error("OS não encontrada.");
    }
    if (!os.payloadValido && !p.aceitarPayloadVazio) throw new Error("OS sem payload compatível.");
    const m = await p.mutate(os, tx);
    if (m.payload) {
      await tx.ordemServico.update({
        where: { id: os.id },
        data: { ...(m.colunas ?? {}), payload: m.payload as unknown as Prisma.InputJsonValue },
      });
    }
    return m.resultado;
  };
  return p.tx ? executar(p.tx) : prisma.$transaction(executar, TX_PAYLOAD_OS_V3);
}
