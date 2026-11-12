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

export async function cancelarAparelhosDaVendaTx(
  tx: Prisma.TransactionClient,
  args: { storeId: string; vendaId: string; pedidoId: string; operador: string; payload: unknown },
): Promise<number> {
  if (linhasAparelhoDoPayload(args.payload).length === 0) return 0
  const vinculos = await tx.aparelhoVenda.findMany({
    where: { storeId: args.storeId, vendaId: args.vendaId, status: "ativa" },
    select: { id: true, aparelhoId: true, numeroGarantia: true },
  })
  for (const v of vinculos) {
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "aparelhos_fisicos" WHERE "id" = ${v.aparelhoId} AND "storeId" = ${args.storeId} FOR UPDATE`
    const de = rows[0]?.status ?? null
    await tx.aparelhoVenda.update({ where: { id: v.id }, data: { status: "cancelada" } })
    if (de === "vendido") {
      await tx.aparelhoFisico.update({ where: { id: v.aparelhoId }, data: { status: "disponivel", version: { increment: 1 } } })
    }
    await tx.aparelhoEvento.create({
      data: {
        storeId: args.storeId,
        aparelhoId: v.aparelhoId,
        tipo: "venda_cancelada",
        deStatus: de,
        paraStatus: de === "vendido" ? "disponivel" : de,
        operador: args.operador,
        idempotencyKey: `venda-cancelada:${args.vendaId}:${v.aparelhoId}`,
        dados: { pedidoId: args.pedidoId, numeroGarantia: v.numeroGarantia },
      },
    })
  }
  return vinculos.length
}
