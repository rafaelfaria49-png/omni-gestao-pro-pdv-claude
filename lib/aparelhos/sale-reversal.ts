/**
 * Reversões de venda com aparelho individualizado (OMNI-APARELHOS-ENDTOEND-001).
 *
 * - Cancelamento (rota canônica de cancelar venda): na MESMA transação, a garantia vira
 *   `cancelada` e a unidade volta a `disponivel` — casando com o estorno de +1 que o próprio
 *   cancelamento faz no produto (invariante Produto.stock = disponíveis + reservados).
 * - Devolução / correção de itens: ainda não integradas (F8 em andamento) → fail-closed para
 *   linhas de aparelho, em vez de devolver saldo sem tocar a unidade e a garantia.
 *
 * A detecção usa `Venda.payload.lines[].deviceSale`: vendas comuns nunca consultam as
 * tabelas novas (seguro mesmo antes da migration existir no banco).
 */
import type { Prisma } from "@/generated/prisma"

export type LinhaAparelhoVenda = { inventoryId: string; produtoId: string; aparelhoId: string }

export function linhasAparelhoDoPayload(payload: unknown): LinhaAparelhoVenda[] {
  const lines = payload && typeof payload === "object" ? (payload as { lines?: unknown }).lines : null
  if (!Array.isArray(lines)) return []
  const out: LinhaAparelhoVenda[] = []
  for (const l of lines) {
    if (!l || typeof l !== "object") continue
    const r = l as Record<string, unknown>
    const ds = r.deviceSale as Record<string, unknown> | undefined
    if (!ds || typeof ds.aparelhoId !== "string") continue
    out.push({ inventoryId: String(r.inventoryId ?? ""), produtoId: String(r.produtoId ?? ""), aparelhoId: ds.aparelhoId })
  }
  return out
}

export const APARELHO_REVERSAO_NAO_INTEGRADA = {
  code: "APARELHO_DEVOLUCAO_NAO_INTEGRADA",
  message:
    "Esta venda tem aparelho por IMEI. Devolução e correção de itens de aparelho ainda não estão integradas: cancele a venda inteira ou procure o gerente.",
} as const

/** Algum item tocado pela operação é linha de aparelho? (comparação por inventoryId OU produtoId). */
export function operacaoTocaAparelho(payload: unknown, inventoryIds: Iterable<string>): boolean {
  const linhas = linhasAparelhoDoPayload(payload)
  if (linhas.length === 0) return false
  const alvo = new Set(Array.from(inventoryIds).map((s) => s.trim()).filter(Boolean))
  return linhas.some((l) => alvo.has(l.inventoryId) || alvo.has(l.produtoId))
}

/** Cancelamento recusado: a unidade não está mais como a venda a deixou (ex.: recomprada). */
export class AparelhoCancelamentoBloqueadoError extends Error {
  readonly code = "APARELHO_CANCELAMENTO_BLOQUEADO"
  constructor(message: string) {
    super(message)
    this.name = "AparelhoCancelamentoBloqueadoError"
  }
}

/** Devolução de modelo serializado sem passar pela unidade (fail-closed). */
export class AparelhoDevolucaoBloqueadaError extends Error {
  readonly code = APARELHO_REVERSAO_NAO_INTEGRADA.code
  constructor() {
    super(APARELHO_REVERSAO_NAO_INTEGRADA.message)
    this.name = "AparelhoDevolucaoBloqueadaError"
  }
}

export async function cancelarAparelhosDaVendaTx(
  tx: Prisma.TransactionClient,
  args: { storeId: string; vendaId: string; pedidoId: string; operador: string; payload: unknown },
): Promise<number> {
  const linhas = linhasAparelhoDoPayload(args.payload)
  if (linhas.length === 0) return 0
  const vinculos = await tx.aparelhoVenda.findMany({
    where: { storeId: args.storeId, vendaId: args.vendaId },
    select: { id: true, aparelhoId: true, numeroGarantia: true, status: true },
  })
  // Pré-validação de TODAS as unidades antes de qualquer escrita: o cancelamento devolve +1 ao
  // produto de cada linha, então cada unidade precisa estar vendida, ativa e no mesmo produto.
  const travadas: Array<{ v: (typeof vinculos)[number]; de: string }> = []
  for (const linha of linhas) {
    const v = vinculos.find((x) => x.aparelhoId === linha.aparelhoId)
    const rows = await tx.$queryRaw<Array<{ status: string; produtoId: string }>>`
      SELECT "status", "produtoId" FROM "aparelhos_fisicos" WHERE "id" = ${linha.aparelhoId} AND "storeId" = ${args.storeId} FOR UPDATE`
    const u = rows[0]
    if (!v || v.status !== "ativa" || !u || u.status !== "vendido" || (linha.produtoId && u.produtoId !== linha.produtoId)) {
      throw new AparelhoCancelamentoBloqueadoError(
        "O aparelho desta venda já mudou de situação (recompra, revisão ou outra operação). Cancelamento bloqueado para não desalinhar estoque e garantia — procure o gerente.",
      )
    }
    travadas.push({ v, de: u.status })
  }
  for (const { v, de } of travadas) {
    await tx.aparelhoVenda.update({ where: { id: v.id }, data: { status: "cancelada" } })
    await tx.aparelhoFisico.update({ where: { id: v.aparelhoId }, data: { status: "disponivel", version: { increment: 1 } } })
    await tx.aparelhoEvento.create({
      data: {
        storeId: args.storeId,
        aparelhoId: v.aparelhoId,
        tipo: "venda_cancelada",
        deStatus: de,
        paraStatus: "disponivel",
        operador: args.operador,
        idempotencyKey: `venda-cancelada:${args.vendaId}:${v.aparelhoId}`,
        dados: { pedidoId: args.pedidoId, numeroGarantia: v.numeroGarantia },
      },
    })
  }
  return travadas.length
}
