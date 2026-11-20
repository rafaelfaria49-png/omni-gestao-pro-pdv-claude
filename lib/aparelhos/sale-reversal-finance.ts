import "server-only"
import type { Prisma } from "@/generated/prisma"
import { cancelContaReceber, travarTituloContaReceber } from "@/lib/financeiro/services/contas-receber-service"
import { AparelhoCancelamentoBloqueadoError } from "./sale-reversal"

/** Vínculo financeiro canônico exato, sem confundir pedidos que compartilham prefixo. */
export function titulosDaVendaAparelhoWhere(storeId: string, pedidoId: string, tituloId?: string | null): Prisma.ContaReceberTituloWhereInput {
  return { storeId, OR: [
    ...(tituloId ? [{ id: tituloId }] : []),
    { vendas: { some: { storeId, pedidoId } } },
    { payload: { path: ["vendas"], array_contains: [{ saleId: pedidoId }] } },
    { payload: { path: ["vendas"], array_contains: [{ pedidoId }] } },
  ] }
}

/** Título sem recebimento pode ser cancelado na mesma transação; recebido exige regularização. */
export async function cancelarTitulosAparelhosTx(tx: Prisma.TransactionClient, args: {
  storeId: string; pedidoId: string; tituloId?: string | null; motivo: string; operador: string
}): Promise<number> {
  const titulos = await tx.contaReceberTitulo.findMany({
    where: titulosDaVendaAparelhoWhere(args.storeId, args.pedidoId, args.tituloId),
    select: { id: true }, orderBy: { id: "asc" },
  })
  for (const titulo of titulos) {
    // Valida exclusividade sob o mesmo lock usado pelo contrato financeiro. Um
    // título agregado de várias vendas não pode ser cancelado por uma só delas.
    if (!(await travarTituloContaReceber(tx, args.storeId, { id: titulo.id }))) {
      throw new AparelhoCancelamentoBloqueadoError("Título da venda não encontrado. Recarregue antes de cancelar.")
    }
    const row = await tx.contaReceberTitulo.findFirstOrThrow({ where: { id: titulo.id, storeId: args.storeId },
      select: { payload: true, vendas: { select: { pedidoId: true, storeId: true } } } })
    const payload = row.payload as { vendas?: unknown } | null
    const refs = payload?.vendas
    if ((refs !== undefined && (!Array.isArray(refs) || refs.some((ref) => {
      if (!ref || typeof ref !== "object") return true
      const r = ref as { saleId?: unknown; pedidoId?: unknown }
      return (r.saleId ?? r.pedidoId) !== args.pedidoId
    }))) || row.vendas.some((v) => v.pedidoId !== args.pedidoId || v.storeId !== args.storeId)) {
      throw new AparelhoCancelamentoBloqueadoError("O título está compartilhado com outras vendas. Regularize os vínculos no Financeiro antes de cancelar o aparelho.")
    }
    const result = await cancelContaReceber({ storeId: args.storeId, id: titulo.id, motivo: args.motivo,
      userLabel: args.operador, exigirSemRecebimento: true, db: tx })
    if (!result.ok) throw new AparelhoCancelamentoBloqueadoError(
      "O título desta venda tem recebimento ou não pode ser cancelado com segurança. Regularize o recebimento no Financeiro antes de cancelar a venda do aparelho.",
    )
  }
  return titulos.length
}
