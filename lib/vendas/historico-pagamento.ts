/**
 * Filtro por forma de pagamento do Histórico de Vendas
 * (GOAL PDV-PADARIA-HISTORICO-PAGAMENTO-G1-001).
 *
 * O filtro vira cláusula do `where` do Prisma — aplicada ANTES de `take/skip` e
 * do `count`. Antes, a rota paginava e só depois filtrava em memória a página
 * carregada: a página 1 podia vir vazia com as vendas válidas na página 2, e o
 * `total` ignorava o filtro.
 *
 * Contrato:
 * - Só as 7 chaves canônicas de `PaymentBreakdownFull` são aceitas.
 * - Venda moderna casa quando `payload.paymentBreakdown[chave]` é JSON numérico
 *   > 0. O Prisma compila `gt` com `JSONB_TYPEOF(...) = 'number'` e valores
 *   parametrizados: texto, zero, negativo, null e ausente não casam. Produção
 *   (2026-10-24): 2.017 breakdowns, todos numéricos — nenhum valor textual.
 * - Venda importada (sem `paymentBreakdown`) casa pelo rótulo exato gravado em
 *   `payload.formaPagamento` na importação. Rótulos ambíguos ("Dinheiro
 *   Parcelado", "Boleto Bancário") não são mapeados.
 * - Pagamento dividido pertence a cada forma com valor positivo; como é uma
 *   cláusula de `where`, a venda aparece uma única vez em cada filtro.
 */
import { Prisma } from "@/generated/prisma"

export const HISTORICO_PAGAMENTO_KEYS = [
  "dinheiro",
  "pix",
  "cartaoDebito",
  "cartaoCredito",
  "carne",
  "aPrazo",
  "creditoVale",
] as const

export type HistoricoPagamentoKey = (typeof HISTORICO_PAGAMENTO_KEYS)[number]

export const HISTORICO_PAGAMENTO_LABELS: Record<HistoricoPagamentoKey, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartaoDebito: "Débito",
  cartaoCredito: "Crédito",
  carne: "Carnê",
  aPrazo: "A Prazo",
  creditoVale: "Vale/Crédito",
}

/** Rótulos exatos gravados pela importação legada em `payload.formaPagamento`. */
export const HISTORICO_PAGAMENTO_LEGADO: Record<HistoricoPagamentoKey, readonly string[]> = {
  dinheiro: ["Dinheiro à Vista"],
  pix: ["PIX"],
  cartaoDebito: ["Cartão de Débito"],
  cartaoCredito: ["Cartão de Crédito"],
  carne: ["Carnê"],
  aPrazo: [],
  creditoVale: [],
}

export function isHistoricoPagamentoKey(value: unknown): value is HistoricoPagamentoKey {
  return typeof value === "string" && (HISTORICO_PAGAMENTO_KEYS as readonly string[]).includes(value)
}

export type HistoricoPagamentoParse =
  | { ok: true; key: HistoricoPagamentoKey | null }
  | { ok: false; error: string }

/** Parâmetro ausente/vazio = sem filtro. Qualquer outra chave é recusada. */
export function parseHistoricoPagamento(raw: string | null | undefined): HistoricoPagamentoParse {
  const value = raw?.trim() ?? ""
  if (!value) return { ok: true, key: null }
  if (isHistoricoPagamentoKey(value)) return { ok: true, key: value }
  return { ok: false, error: "Forma de pagamento inválida." }
}

export function buildHistoricoPagamentoWhere(key: HistoricoPagamentoKey): Prisma.VendaWhereInput {
  const moderno: Prisma.VendaWhereInput = { payload: { path: ["paymentBreakdown", key], gt: 0 } }
  const legados = HISTORICO_PAGAMENTO_LEGADO[key]
  if (legados.length === 0) return moderno
  return {
    OR: [
      moderno,
      {
        AND: [
          // AnyNull = caminho ausente OU JSON null: o rótulo legado nunca vale
          // para venda que tem `paymentBreakdown`.
          { payload: { path: ["paymentBreakdown"], equals: Prisma.AnyNull } },
          { OR: legados.map((label) => ({ payload: { path: ["formaPagamento"], equals: label } })) },
        ],
      },
    ],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/**
 * Rótulo da coluna Pagamento: todas as formas com valor positivo, na ordem
 * canônica ("Dinheiro + Pix"). Venda dividida não aparece como se fosse só a
 * forma de maior valor. Venda importada mostra o rótulo gravado.
 */
export function historicoFormasPagamentoLabel(payload: unknown): string {
  if (!isRecord(payload)) return "—"
  const pb = payload.paymentBreakdown
  if (isRecord(pb)) {
    const formas = HISTORICO_PAGAMENTO_KEYS.filter((key) => {
      const value = pb[key]
      return typeof value === "number" && Number.isFinite(value) && value > 0
    }).map((key) => HISTORICO_PAGAMENTO_LABELS[key])
    return formas.length > 0 ? formas.join(" + ") : "—"
  }
  const legado = payload.formaPagamento
  return typeof legado === "string" && legado.trim() ? legado.trim() : "—"
}
