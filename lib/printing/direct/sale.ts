import { buildPagamentosResumo, type PdvReceiptInput } from "@/lib/escpos"
import { cleanData, hash, safeText as sanitize } from "./codec"
import { check, one, type Sql } from "./db"

const PAYMENT_KEYS = ["dinheiro", "pix", "cartaoDebito", "cartaoCredito", "carne", "aPrazo", "creditoVale"] as const

/**
 * One MVCC SELECT over sale + items + store header + receipt settings (scoped by store).
 * Eligibility: CONFIRMED server row only (status concluida, not cancelled, not in quarantine);
 * a PENDING sale has no server row, so it can never reach this reader.
 * Minimization: customer CPF, free-text notes and OS data never enter the snapshot.
 */
export async function saleSnapshot(sql: Sql, storeId: string, saleId: string, maxItems: number) {
  const row = await one(sql, `SELECT v.id,v."storeId",v."pedidoId",v.at,v.status,v."canceladaEm",v."clienteNome",v.operador,
    v.payload->>'sessaoId' "sessaoId",v."terminalId",
    v.total,encode(pg_catalog.float8send(v.total),'hex') total_bits,
    v.payload->'paymentBreakdown' payments,COALESCE(v.payload->'discountTotal',v.payload->'discountReais') discount,v.payload->'cashTendered' tendered,
    v.payload->'quarantine' quarantine,v.payload->'manualKg' manual_kg,v.payload->>'tipoVenda' tipo_venda,
    s.name store_name,s.cnpj store_cnpj,s.address store_address,
    COALESCE(st."receiptFooter",'') receipt_footer,st."printerConfig"->'impressao' impressao,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'nome',i.nome,'quantidade',i.quantidade,
      'precoUnitario',i."precoUnitario",'lineTotal',i."lineTotal",
      'priceBits',encode(pg_catalog.float8send(i."precoUnitario"),'hex'),
      'lineBits',encode(pg_catalog.float8send(i."lineTotal"),'hex')) ORDER BY i.id)
      FROM public.venda_itens i WHERE i."vendaId"=v.id),'[]'::jsonb) items
    FROM public.vendas v JOIN public.stores s ON s.id=v."storeId"
    LEFT JOIN public.store_settings st ON st."storeId"=v."storeId"
    WHERE v.id=$1 AND v."storeId"=$2`, [saleId, storeId])
  check(row.status === "concluida" && row.canceladaEm === null && !row.quarantine, "DOCUMENT_INELIGIBLE")
  check(!row.manual_kg && row.tipo_venda !== "manual_kg", "KG_RECEIPT_BLOCKED")
  check(row.items.length > 0, "DOCUMENT_INELIGIBLE")
  check(row.items.length <= maxItems, "ITEM_LIMIT", 400)
  check(row.items.every((i: { quantidade: number }) => Number.isInteger(i.quantidade) && i.quantidade > 0), "UNSUPPORTED_QUANTITY")
  const money = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0
  check(money(row.total) && row.items.every((i: Record<string, unknown>) => money(i.precoUnitario) && money(i.lineTotal)), "INVALID_MONEY")
  check((row.discount === null || money(row.discount)) && (row.tendered === null || money(row.tendered)), "INVALID_MONEY")
  check(row.payments === null || (typeof row.payments === "object" && !Array.isArray(row.payments)), "INVALID_PAYMENT")
  const payments = (row.payments ?? {}) as Record<string, unknown>
  check(Object.values(payments).every(money), "INVALID_PAYMENT")
  check(Object.entries(payments).every(([k, v]) => (PAYMENT_KEYS as readonly string[]).includes(k) || Number(v) === 0), "UNSUPPORTED_PAYMENT")
  const impressao = row.impressao && typeof row.impressao === "object" ? row.impressao as Record<string, unknown> : {}
  const settings = { footer: String(impressao.rodapeCupom ?? "").trim() || String(row.receipt_footer ?? "").trim(),
    mode: impressao.comprovanteModo === "simplificado" ? "simplificado" : "completo" }
  // Fingerprint: every printed field + eligibility + float bit patterns; never updatedAt.
  const projection = { storeId, source: { id: row.id, pedidoId: row.pedidoId, at: new Date(row.at).toISOString(), status: row.status,
    canceladaEm: row.canceladaEm, quarantine: row.quarantine ?? null, clienteNome: row.clienteNome ?? null, operador: row.operador ?? null,
    sessaoId: row.sessaoId ?? null, terminalId: row.terminalId ?? null, total: row.total, totalBits: row.total_bits,
    payments: row.payments ?? null, discount: row.discount ?? null, tendered: row.tendered ?? null, items: row.items },
    header: { name: row.store_name, cnpj: row.store_cnpj, address: row.store_address ?? null }, settings }
  return { version: hash("sale-fingerprint-v1", cleanData(projection)), row, settings }
}
export type SaleSnapshot = Awaited<ReturnType<typeof saleSnapshot>>

function addressLine(address: unknown): string {
  if (!address || typeof address !== "object") return ""
  const a = address as Record<string, unknown>
  return [a.rua ?? a.logradouro, a.numero, a.bairro, a.cidade, a.uf].map(v => (typeof v === "string" || typeof v === "number") ? String(v).trim() : "")
    .filter(Boolean).join(", ")
}
function dateTimeBr(at: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(at)
}
const cents = (v: number) => Math.round(v * 100) / 100
// Typographic marks outside Latin-1 would print as "?" (lib/escpos maps only the euro sign); keep them readable.
const TYPOGRAPHIC: Record<string, string> = { "\u2014": "-", "\u2013": "-", "\u2018": "'", "\u2019": "'", "\u201c": "\"", "\u201d": "\"", "\u2026": "...", "\u2022": "*", "\u00a0": " " }
const safeText = (v: string) => sanitize(v).replace(/[\u2014\u2013\u2018\u2019\u201c\u201d\u2026\u2022\u00a0]/g, c => TYPOGRAPHIC[c])

/** Server-derived receipt input. All strings pass through safeText (no ESC/GS/DLE/NUL/C1 reaches ESC/POS). */
export function receiptInput(snapshot: SaleSnapshot): PdvReceiptInput {
  const { row, settings } = snapshot
  const payments = (row.payments ?? {}) as Record<string, number>
  const itens = (row.items as Array<Record<string, unknown>>).map(i => ({ name: safeText(String(i.nome)), quantity: Number(i.quantidade),
    unitPrice: Number(i.precoUnitario), lineTotal: Number(i.lineTotal) }))
  const subtotal = cents(itens.reduce((s, i) => s + i.lineTotal, 0))
  const discount = row.discount == null ? 0 : Number(row.discount)
  const tendered = row.tendered == null ? undefined : Number(row.tendered)
  const dinheiro = Number(payments.dinheiro ?? 0)
  const troco = tendered !== undefined && tendered - dinheiro > 0.005 ? cents(tendered - dinheiro) : undefined
  return {
    nomeFantasia: safeText(String(row.store_name || "")), cnpj: safeText(String(row.store_cnpj || "")),
    enderecoLinha: safeText(addressLine(row.store_address)), receiptFooter: safeText(settings.footer),
    numeroVenda: safeText(String(row.pedidoId)), operador: row.operador ? safeText(String(row.operador)) : undefined,
    clienteNome: row.clienteNome ? safeText(String(row.clienteNome)) : undefined,
    pagamentos: buildPagamentosResumo(payments).map(p => ({ label: safeText(p.label), valor: p.valor })),
    cashTendered: troco !== undefined ? tendered : undefined, troco,
    itens, subtotal, taxes: 0, discount, total: Number(row.total), dataHora: dateTimeBr(new Date(row.at)),
  }
}
