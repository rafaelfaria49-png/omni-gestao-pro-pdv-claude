import "server-only"
import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { buildIdempotencyKey } from "@/lib/estoque/stock-ledger-contract"
import { assertVendaFiscalEditavel } from "@/lib/fiscal/venda-fiscal-state-machine"
import { itemCommercialQuantity, isKgItem, itemQuantityWrite } from "./item-quantity"
import { assertManualKgAvailable, enterManualKgTransaction, isManualKgProduct } from "./manual-kg-server"
import { moneyCents, MANUAL_KG_SALE } from "./manual-kg-contract"
import { planKgWeightCorrection, type KgCorrectionDraft } from "./manual-kg-correction-plan"
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}
export class KgCorrectionError extends Error { readonly code = "MANUAL_KG_CORRECTION_BLOCKED" }
function blocked(message: string): never { throw new KgCorrectionError(message) }

export async function correctManualKgWeight(input: { storeId: string; pedidoId: string; commandId: string; expectedRevision: number; itens: KgCorrectionDraft[]; motivo: string; operador: string; supervisorNome: string }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.commandId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.motivo.trim().length < 3) blocked("Identidade, revisão e motivo da correção são obrigatórios.")
  const digest = createHash("sha256").update(JSON.stringify({ revision: input.expectedRevision, itens: input.itens, motivo: input.motivo.trim() })).digest("hex")
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM public.vendas WHERE "storeId" = ${input.storeId} AND "pedidoId" = ${input.pedidoId} FOR UPDATE`
    const sale = await tx.venda.findFirst({ where: { storeId: input.storeId, pedidoId: input.pedidoId }, include: { itens: true } })
    if (!sale) blocked("Venda não encontrada nesta loja.")
    const payload = record(sale.payload)
    if (payload.manualKgSale !== MANUAL_KG_SALE || !sale.itens.some(isKgItem)) blocked("Venda sem contrato KG compatível.")
    const history = Array.isArray(payload.manualKgCorrections) ? payload.manualKgCorrections.map(record) : []
    const previous = history.find((entry) => entry.commandId === input.commandId)
    if (previous) {
      if (previous.digest !== digest) blocked("Identidade de correção reutilizada com outros dados.")
      return { ok: true, replayed: true, ...record(previous.result) }
    }
    await assertManualKgAvailable(tx, input.storeId)
    await enterManualKgTransaction(tx)
    if (sale.status !== "concluida" || !assertVendaFiscalEditavel(sale).ok || payload.manualKgRevision !== input.expectedRevision) blocked("Venda alterada, cancelada ou fiscalmente bloqueada. Recarregue antes de corrigir.")
    if (await tx.notaFiscal.count({ where: { storeId: input.storeId, vendaId: sale.id, vigente: true } })) blocked("Venda com documento fiscal não admite esta correção.")
    const sid = typeof payload.sessaoId === "string" ? payload.sessaoId : ""
    await tx.$queryRaw`SELECT id FROM public.sessoes_caixa WHERE id = ${sid} AND "storeId" = ${input.storeId} FOR UPDATE`
    const cash = await tx.sessaoCaixa.findFirst({ where: { id: sid, storeId: input.storeId } })
    if (cash?.status !== "ABERTA") blocked("A sessão original precisa estar aberta para corrigir o peso.")
    for (const date of [sale.at, new Date()]) {
      const day = date.toISOString().slice(0, 10), month = day.slice(0, 7) + "-01"
      if (await tx.fechamentoFinanceiro.count({ where: { storeId: input.storeId, status: "fechado", OR: [{ tipo: "diario", dataReferencia: day }, { tipo: "mensal", dataReferencia: month }] } })) blocked("Período financeiro fechado. Correção não aplicada.")
    }
    if (await tx.devolucaoVenda.count({ where: { storeId: input.storeId, vendaLocalId: sale.pedidoId } }) || await tx.usoCreditoCliente.count({ where: { storeId: input.storeId, vendaId: sale.pedidoId } }) || await tx.contaReceberTitulo.count({ where: { storeId: input.storeId, localKey: { startsWith: `pdv-aprazo-${sale.pedidoId}` } } })) blocked("Venda com devolução, vale ou título não admite correção de peso.")
    const oldLines = sale.itens.map((item) => ({ ...item, quantidade: itemCommercialQuantity(item), quantityUnit: isKgItem(item) ? "KG" : "UN" }))
    const plan = planKgWeightCorrection({ oldLines, newLines: input.itens, oldTotal: sale.total, oldBreakdown: record(payload.paymentBreakdown) as Partial<PaymentBreakdownFull>, discount: Number(payload.discountTotal ?? 0), tax: payload.manualKgTax })
    if (!plan.ok) blocked(plan.error ?? "Correção de peso indisponível.")
    const item = sale.itens[0], next = input.itens[0], originalLine = record(Array.isArray(payload.lines) ? payload.lines[0] : null)
    if (!Array.isArray(payload.lines) || payload.lines.length !== 1 || originalLine.quantity !== oldLines[0].quantidade || originalLine.unitPrice !== item.precoUnitario || originalLine.lineTotal !== item.lineTotal) blocked("Snapshot do item divergente. Nenhuma correção aplicada.")
    await tx.$queryRaw`SELECT id FROM public.estoque_produtos WHERE id = ${item.inventoryId ?? ""} AND "storeId" = ${input.storeId} FOR UPDATE`
    const product = await tx.produto.findFirst({ where: { id: item.inventoryId ?? "", storeId: input.storeId } })
    if (!product || !isManualKgProduct(product.metadata)) blocked("Cadastro atual do produto incompatível. Correção bloqueada.")
    const entries = await tx.movimentacaoFinanceira.findMany({ where: { storeId: input.storeId, referenciaId: sale.pedidoId } })
    if (entries.length !== 1 || entries[0].tipo !== "entrada" || entries[0].origem !== "venda" || moneyCents(entries[0].valor) !== moneyCents(sale.total)) blocked("Financeiro da venda não permite reconciliação única e segura.")
    const delta = plan.stockDeltas[0].deltaQty
    const result = await applyStockMutationTx(tx as unknown as StockLedgerTx, { storeId: input.storeId, principal: null, source: "vendas-corrigir-peso", operatorLabel: input.operador }, { kind: delta > 0 ? "saida" : "entrada", produtoId: product.id, quantidade: Math.abs(delta), origem: "correcao_pdv", documento: sale.pedidoId, motivo: input.motivo, idempotencyKey: buildIdempotencyKey("correcao-kg", sale.pedidoId, input.commandId, product.id) })
    if (!result.ok) blocked(`Estoque não atualizado: ${result.code}. Nenhuma correção aplicada.`)
    await tx.itemVenda.update({ where: { id: item.id }, data: { ...itemQuantityWrite(next.quantidade, true), lineTotal: plan.lineTotal } })
    await tx.movimentacaoFinanceira.update({ where: { id: entries[0].id }, data: { valor: plan.newTotal } })
    // Preserve any wallet balance within this same transaction.
    if (entries[0].carteiraId) {
      const { recalcularSaldoCarteira } = await import("@/lib/financeiro/services/carteiras-service")
      await recalcularSaldoCarteira(entries[0].carteiraId, input.storeId, tx)
    }
    const response = { pedidoId: sale.pedidoId, totalAnterior: sale.total, totalNovo: plan.newTotal, deltaTotal: plan.deltaTotal, revision: input.expectedRevision + 1, estoqueMovimentos: 1 }
    const audit = { commandId: input.commandId, digest, result: response, at: new Date().toISOString(), operador: input.operador, supervisorNome: input.supervisorNome, motivo: input.motivo.trim(), campos: ["peso"], totalAnterior: sale.total, totalNovo: plan.newTotal, itemId: item.id, pesoAnterior: oldLines[0].quantidade, pesoNovo: next.quantidade }
    await tx.venda.update({ where: { id: sale.id }, data: { total: plan.newTotal, payload: { ...payload, total: plan.newTotal, paymentBreakdown: plan.newBreakdown, manualKgTax: plan.tax, manualKgRevision: response.revision, manualKgCorrections: [...history, audit], correcoes: [...(Array.isArray(payload.correcoes) ? payload.correcoes : []), audit], lines: [{ ...originalLine, quantity: next.quantidade, lineTotal: plan.lineTotal }] } as Prisma.InputJsonValue } })
    return { ok: true, replayed: false, ...response }
  }, { timeout: 20000, maxWait: 20000, isolationLevel: "Serializable" })
}
