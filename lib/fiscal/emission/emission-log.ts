/**
 * Gravação da trilha de emissão fiscal em `FiscalLog` (GOAL_007).
 *
 * Usa a tabela `fiscal_logs` JÁ existente (model `FiscalLog`) — sem migration. Best-effort:
 * a auditoria NUNCA pode derrubar a emissão (try/catch silencioso). Registra provider, data
 * (createdAt), request/response resumidos (em `detalhe`), status, erro, tempo e `simulado=true`.
 */
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import type { FiscalEmissionLogEntry } from "./emission.types"

export type RecordFiscalEmissionLogParams = FiscalEmissionLogEntry & {
  storeId: string
  vendaId?: string | null
  notaFiscalId?: string | null
  operador?: string | null
}

/**
 * Grava uma entrada da trilha de emissão. Sempre marca `simulado: true` no detalhe
 * (nenhuma emissão real nesta fase). Nunca lança — falha de log não bloqueia o pipeline.
 */
export async function recordFiscalEmissionLog(params: RecordFiscalEmissionLogParams): Promise<void> {
  try {
    const storeId = String(params.storeId ?? "").trim()
    if (!storeId) return
    const detalhe = { simulado: true, ...(params.detalhe ?? {}) }
    await prisma.fiscalLog.create({
      data: {
        storeId,
        vendaId: params.vendaId ?? null,
        notaFiscalId: params.notaFiscalId ?? null,
        nivel: params.nivel,
        acao: params.acao,
        cStat: params.cStat ?? null,
        xMotivo: params.xMotivo ?? null,
        mensagem: String(params.mensagem ?? "").slice(0, 1000),
        detalhe: detalhe as Prisma.InputJsonValue,
        operador: params.operador ?? null,
      },
    })
  } catch {
    /* auditoria best-effort — não bloqueia a emissão */
  }
}
