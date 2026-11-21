import "server-only"
import { prisma } from "@/lib/prisma"
import { saleFromDbRow } from "./sale-from-db-row"
import { MANUAL_KG_SALE } from "./manual-kg-contract"

/** A short shared-lock read serializes this snapshot with correction/cancellation. */
export async function readManualKgConfirmation(storeId: string, pedidoId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM public.vendas WHERE "storeId" = ${storeId} AND "pedidoId" = ${pedidoId} FOR SHARE`
    const row = await tx.venda.findFirst({ where: { storeId, pedidoId }, include: { itens: true } })
    if (!row || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload) || (row.payload as Record<string, unknown>).manualKgSale !== MANUAL_KG_SALE) return null
    const sale = saleFromDbRow({ ...row, serverId: row.id })
    const ids = row.itens.flatMap((item) => item.inventoryId ? [item.inventoryId] : [])
    const stocks = await tx.produto.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, stock: true } })
    const cpf = sale.customerCpf?.replace(/\D/g, "") ?? ""
    const credits = cpf ? await tx.clienteCredito.findMany({ where: { storeId, clienteDoc: cpf, status: "ativo" }, select: { saldoAtual: true, clienteNome: true } }) : []
    const credit = cpf ? { cpf, nome: sale.customerName || credits[0]?.clienteNome || "Cliente", saldo: Math.round(credits.reduce((sum, row) => sum + row.saldoAtual, 0) * 100) / 100 } : undefined
    return { storeId, sale, stocks, credit }
  })
}
