/**
 * GOAL: PDV-PEDIDO-ID-COLISAO-MULTILOJA-FIX-001
 *
 * Reconstrói o `SaleRecord` do PDV a partir de uma linha de `Venda` do banco.
 * Extraído de `app/api/ops/vendas-list/route.ts` para poder ser testado sem subir
 * a rota (arquivos de rota do Next não podem exportar símbolos extras).
 *
 * REGRA: toda venda que vem do banco está, por definição, CONFIRMADA. O `payload`
 * legado pode conter marcadores locais de sincronização (`syncPending`/`syncBlockedCode`)
 * — 520 registros no banco os têm — e eles são descartados aqui na leitura. Não existe
 * modelo server-side de outbox no schema que justificaria exceção. Compatibilidade é
 * feita na leitura: nenhum registro histórico é reescrito.
 */
import { itemCommercialQuantity, isKgItem } from "@/lib/vendas/item-quantity"
import type { PaymentBreakdownFull, SaleLineRecord, SaleRecord } from "@/lib/operations-sale-types"
import { stripClientSyncFlags } from "@/lib/vendas/sale-sync-flags"
import { resolveSaleLineItemType } from "@/lib/sale-line-classification"

const zeroPb: PaymentBreakdownFull = {
  dinheiro: 0,
  pix: 0,
  cartaoDebito: 0,
  cartaoCredito: 0,
  carne: 0,
  aPrazo: 0,
  creditoVale: 0,
}

export type VendaDbRow = {
  pedidoId: string
  total: number
  at: Date
  clienteNome: string | null
  status: string
  payload: unknown
  clientSaleId?: string | null
  serverId?: string | null
  itens: Array<{
    id?: string
    inventoryId: string | null
    nome: string
    quantidade: number | null
    quantidadeKg?: unknown
    precoUnitario: number
    lineTotal: number
  }>
}

export function saleFromDbRow(r: VendaDbRow): SaleRecord {
  const dbStatus = r.status as SaleRecord["status"] | undefined
  const technicalId = r.serverId?.trim() || undefined
  const clientSaleId =
    (typeof r.clientSaleId === "string" && r.clientSaleId.trim() ? r.clientSaleId.trim() : undefined) ||
    undefined
  const p = r.payload
  if (p && typeof p === "object") {
    const o = p as Partial<SaleRecord>
    if (typeof o.id === "string" && o.id === r.pedidoId && Array.isArray(o.lines)) {
      const payloadClientSaleId =
        typeof o.clientSaleId === "string" && o.clientSaleId.trim() ? o.clientSaleId.trim() : undefined
      return {
        ...stripClientSyncFlags(o as SaleRecord),
        ...(o.manualKgSale === "classic-manual-kg-v1" ? { at: r.at.toISOString(), total: r.total, paymentBreakdown: { ...zeroPb, ...o.paymentBreakdown }, lines: r.itens.map((item, index) => {
          const snapshot = o.lines?.find((line) => item.id && line.itemId === item.id) ?? o.lines?.[index]
          return { ...snapshot, inventoryId: item.inventoryId ?? "", itemId: item.id, name: item.nome, quantity: itemCommercialQuantity(item), unitPrice: item.precoUnitario, lineTotal: item.lineTotal, ...(isKgItem(item) ? { quantityUnit: "KG" as const, weightSource: "manual" as const } : {}) }
        }) } : {}),
        status: dbStatus,
        serverId: technicalId,
        clientSaleId: clientSaleId ?? payloadClientSaleId,
      }
    }
  }

  const lines: SaleLineRecord[] = r.itens.map((it) => {
    const inventoryId = it.inventoryId ?? ""
    return {
      inventoryId,
      name: it.nome,
      quantity: itemCommercialQuantity(it),
      ...(isKgItem(it) ? { quantityUnit: "KG" as const, weightSource: "manual" as const } : {}),
      unitPrice: it.precoUnitario,
      lineTotal: it.lineTotal,
      qtyReturned: 0,
      itemType: resolveSaleLineItemType({ inventoryId }),
    }
  })

  return {
    id: r.pedidoId,
    at: r.at.toISOString(),
    lines,
    total: r.total,
    status: dbStatus,
    customerName: r.clienteNome ?? undefined,
    paymentBreakdown: zeroPb,
    ...(technicalId ? { serverId: technicalId } : {}),
    ...(clientSaleId ? { clientSaleId } : {}),
  }
}
