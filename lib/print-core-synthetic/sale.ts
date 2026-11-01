import { mapVendaDetalheToCupom } from "../vendas/venda-cupom-mapper"
import type { VendaDetalhe } from "../vendas/venda-detalhe-contract"
import { hash, cleanData } from "./codec"
import { check, one, type Sql } from "./db"
/** One MVCC SELECT for sale, eligibility and items. No commercial writer/legacy route. */
export async function saleSnapshot(sql: Sql, storeId: string, saleId: string, maxItems: number) {
  const row = await one(sql, `SELECT v.id,v."storeId",v."pedidoId",v.at,v.status,v."canceladaEm",v."clienteNome",v.operador,
    v.payload->>'sessaoId' "sessaoId",v."terminalId",v."fiscalStatus"::text,
    v.total,encode(pg_catalog.float8send(v.total),'hex') total_bits,
    v.payload->'paymentBreakdown' payments,COALESCE(v.payload->'discountTotal',v.payload->'discountReais') discount,v.payload->'cashTendered' tendered,
    v.payload->'quarantine' quarantine,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'nome',i.nome,'quantidade',i.quantidade,
      'precoUnitario',i."precoUnitario",'lineTotal',i."lineTotal",
      'priceBits',encode(pg_catalog.float8send(i."precoUnitario"),'hex'),
      'lineBits',encode(pg_catalog.float8send(i."lineTotal"),'hex')) ORDER BY i.id)
      FROM public.venda_itens i WHERE i."vendaId"=v.id),'[]'::jsonb) items
    FROM public.vendas v WHERE v.id=$1 AND v."storeId"=$2`, [saleId, storeId])
  check(row.status === "concluida" && row.canceladaEm === null && !row.quarantine, "DOCUMENT_INELIGIBLE")
  check(row.items.length > 0 && row.items.length <= maxItems, "ITEM_LIMIT", 400)
  check(row.items.every((i: { quantidade: number }) => Number.isInteger(i.quantidade) && i.quantidade > 0), "UNSUPPORTED_QUANTITY")
  const money = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0
  check(money(row.total) && row.items.every((i: Record<string, unknown>) => money(i.precoUnitario) && money(i.lineTotal)), "INVALID_MONEY")
  check((row.discount === null || money(row.discount)) && (row.tendered === null || money(row.tendered)), "INVALID_MONEY")
  check(row.payments === null || (typeof row.payments === "object" && !Array.isArray(row.payments)), "INVALID_PAYMENT")
  const payments = row.payments ?? {}
  check(Object.values(payments).every(money), "INVALID_PAYMENT")
  const labels: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", cartaoDebito: "Débito", cartaoCredito: "Crédito", carne: "Carnê", aPrazo: "A Prazo", creditoVale: "Vale/Crédito" }
  check(Object.entries(payments).every(([k, v]) => k in labels || Number(v) === 0), "UNSUPPORTED_PAYMENT")
  const pagamentos = Object.entries(labels).filter(([k]) => Number(payments[k]) > 0).map(([k, label]) => ({ label, valor: Number(payments[k]) }))
  const detail: VendaDetalhe = {
    id: row.pedidoId, dbId: row.id, at: row.at.toISOString(), clienteNome: row.clienteNome, clienteId: null, clienteCpf: null,
    total: row.total, desconto: Number(row.discount ?? 0), cashTendered: row.tendered == null ? null : Number(row.tendered),
    status: row.status, operador: row.operador, canceladaEm: null, canceladaPor: null, motivoCancelamento: null,
    sessaoId: row.sessaoId, terminalId: row.terminalId, observacao: null, correcoes: [], devolucoes: [],
    pagamentos, itens: row.items.map((i: Record<string, unknown>) => ({ id: String(i.id), nome: String(i.nome), quantidade: Number(i.quantidade), precoUnitario: Number(i.precoUnitario), lineTotal: Number(i.lineTotal) })),
  }
  const projection = { storeId, source: { id: row.id, pedidoId: row.pedidoId, at: detail.at, status: row.status,
    canceladaEm: row.canceladaEm, fiscalStatus: row.fiscalStatus, quarantine: row.quarantine,
    clienteNome: row.clienteNome, operador: row.operador, sessaoId: row.sessaoId, terminalId: row.terminalId,
    total: row.total, totalBits: row.total_bits, payments: row.payments, discount: row.discount, tendered: row.tendered, items: row.items } }
  return { version: hash("sale-fingerprint-v1", projection), detail, projection }
}
export function receipt(snapshot: Awaited<ReturnType<typeof saleSnapshot>>, store: { name: string; cnpj: string }) {
  return cleanData(mapVendaDetalheToCupom(snapshot.detail, { nome: store.name, cnpj: store.cnpj }))
}
