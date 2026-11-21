import type { Prisma } from "@/generated/prisma"
import { cancelContaReceber } from "@/lib/financeiro/services/contas-receber-service"
import { recalcularSaldoCarteira } from "@/lib/financeiro/services/carteiras-service"
import { avaliarRecebiveisParaEstorno } from "./estorno-recebivel-guard"
import { sumPagamentosHistorico } from "./venda-financeiro-resumo"
import { moneyCents } from "./manual-kg-contract"

/** KG receivables must reverse with stock/status/cash, never in a later transaction. */
export async function cancelManualKgReceivables(tx: Prisma.TransactionClient, input: { storeId: string; pedidoId: string; motivo: string; operador: string }) {
  const prefix = `pdv-aprazo-${input.pedidoId}`
  await tx.$queryRaw`SELECT id FROM public.contas_receber_titulos WHERE "storeId" = ${input.storeId} AND left("localKey", length(${prefix})) = ${prefix} ORDER BY id FOR UPDATE`
  const titles = await tx.contaReceberTitulo.findMany({ where: { storeId: input.storeId, localKey: { startsWith: prefix } }, orderBy: { id: "asc" } })
  const verdict = avaliarRecebiveisParaEstorno(titles.map((t) => ({ status: t.status, valor: t.valor, pago: sumPagamentosHistorico(t.payload) })))
  if (verdict.bloqueado) throw new Error("MANUAL_KG_CANCELLATION_STALE")
  let estornoReceber = false, titulosCancelados = 0
  for (const title of titles) {
    const original = await tx.movimentacaoFinanceira.findMany({ where: { storeId: input.storeId, referenciaId: title.id, tipo: "entrada", origem: "receber" } })
    const reversed = await tx.movimentacaoFinanceira.count({ where: { storeId: input.storeId, referenciaId: title.id, tipo: "saida", origem: "estorno_receber" } })
    if (!reversed) {
      const byWallet = new Map<string, number>()
      for (const entry of original) {
        const value = moneyCents(entry.valor)
        if (value === null) throw new Error("MANUAL_KG_CANCELLATION_STALE")
        const key = entry.carteiraId ?? ""
        byWallet.set(key, (byWallet.get(key) ?? 0) + value)
      }
      for (const [wallet, cents] of [...byWallet].sort(([a], [b]) => a.localeCompare(b))) {
        if (!cents) continue
        await tx.movimentacaoFinanceira.create({ data: { storeId: input.storeId, referenciaId: title.id, tipo: "saida", origem: "estorno_receber", valor: cents / 100, carteiraId: wallet || null, descricao: `Cancelamento integral KG ${input.pedidoId}` } })
        if (wallet) await recalcularSaldoCarteira(wallet, input.storeId, tx)
        estornoReceber = true
      }
    }
    const canceled = await cancelContaReceber({ storeId: input.storeId, id: title.id, motivo: input.motivo, userLabel: input.operador, db: tx })
    if (!canceled.ok) throw new Error("MANUAL_KG_CANCELLATION_STALE")
    titulosCancelados++
  }
  return { estornoReceber, titulosCancelados }
}
