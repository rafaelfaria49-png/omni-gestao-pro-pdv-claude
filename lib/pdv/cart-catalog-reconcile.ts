/**
 * Carrinho × catálogo atualizado (PDV-CADASTROS-SYNC-AUTOMATICO-001).
 *
 * Quando o catálogo da loja muda com o carrinho aberto (outra aba, outro aparelho), cada
 * linha de produto é reconferida pela identidade imutável `Produto.id` (`produtoId`),
 * nunca por SKU, nome ou código de barras:
 *
 * - SKU/código trocado → a linha só reaponta o `inventoryId` operacional (mesmo produto;
 *   sem impacto comercial, sem revisão);
 * - preço de catálogo mudou desde que o item entrou → divergência `price` (revisão explícita:
 *   aplicar o novo preço ou manter o do carrinho);
 * - saldo ficou abaixo do que está no carrinho → divergência `stock` (ajustar ou remover —
 *   manter não adianta: o PDV e o servidor recusam a venda acima do saldo);
 * - produto excluído do cadastro → divergência `removed` (só sai removendo a linha).
 *
 * Nada aqui apaga linha, muda quantidade ou preço sozinho: só o operador decide. Linhas
 * sem produto do catálogo (avulso, serviço, O.S., complemento, voz) não são tocadas.
 * Módulo puro (sem React).
 */

import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"

/** Estoque "controlado" abaixo disto (mesma convenção do PDV Clássico). */
export const UNCONTROLLED_STOCK_THRESHOLD = 999

export type ReconcilableCartLine = {
  lineId: string
  inventoryId: string
  name: string
  price: number
  quantity: number
  isAvulso?: boolean
  vendaPorPeso?: boolean
  /** `Produto.id` (cuid) — identidade imutável do item. */
  produtoId?: string
  /** Preço unitário do catálogo quando o item entrou (ou quando a mudança foi revisada). */
  catalogUnitPrice?: number
}

export type ReconcileCatalogItem = {
  id: string
  dbId?: string
  name: string
  price: number
  stock: number
  vendaPorPeso?: boolean
  precoPorKg?: number
  category?: string
}

export type CartCatalogDivergence =
  | { kind: "price"; lineId: string; produtoId: string; name: string; cartPrice: number; previousCatalogPrice: number; catalogPrice: number }
  | { kind: "stock"; lineId: string; produtoId: string; name: string; inCart: number; available: number; lineQuantity: number }
  | { kind: "removed"; lineId: string; produtoId: string; name: string }

export function catalogUnitPriceOf(item: Pick<ReconcileCatalogItem, "price" | "vendaPorPeso" | "precoPorKg">): number {
  return item.vendaPorPeso ? (item.precoPorKg ?? item.price) : item.price
}

/** Linha que representa um `Produto` do catálogo (as demais nunca são reconciliadas). */
export function isCatalogProductLine(line: Pick<ReconcilableCartLine, "inventoryId" | "isAvulso">): boolean {
  const id = typeof line.inventoryId === "string" ? line.inventoryId : ""
  if (!id || line.isAvulso === true) return false
  if (isVirtualSaleLine(id)) return false
  return !id.startsWith("comp-") && !id.startsWith("voice-")
}

function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

export function reconcileCartWithCatalog<L extends ReconcilableCartLine>(
  lines: readonly L[],
  catalog: readonly ReconcileCatalogItem[],
  opts: {
    /** Mesmo critério do PDV para "estoque controlado" (serviço/999+ não divergem). */
    isStockControlled?: (item: ReconcileCatalogItem) => boolean
  } = {},
): { lines: L[]; divergences: CartCatalogDivergence[]; changed: boolean } {
  // Catálogo vazio = carga falhou/ainda não veio: não acusa "excluído" em massa.
  if (catalog.length === 0) return { lines: [...lines], divergences: [], changed: false }
  const byDbId = new Map<string, ReconcileCatalogItem>()
  const byId = new Map<string, ReconcileCatalogItem>()
  for (const item of catalog) {
    if (item.dbId) byDbId.set(item.dbId, item)
    byId.set(item.id, item)
  }

  let changed = false
  const divergences: CartCatalogDivergence[] = []
  const next = lines.map((line) => {
    if (!isCatalogProductLine(line)) return line
    let item = line.produtoId ? byDbId.get(line.produtoId) : undefined
    let patched: L = line
    if (!line.produtoId) {
      // Linha antiga (venda em espera salva antes desta versão, comanda): adota a identidade
      // pelo mesmo casamento exato por id que a finalização já usava — nunca por nome. Limite
      // conhecido: se dois produtos trocaram de SKU enquanto a venda estava em espera, a linha
      // adota o produto que hoje tem aquele código (mesmo comportamento de antes desta mudança).
      item = byId.get(line.inventoryId)
      if (!item?.dbId) return line
      patched = { ...patched, produtoId: item.dbId }
    }
    if (!item) {
      divergences.push({ kind: "removed", lineId: line.lineId, produtoId: line.produtoId!, name: line.name })
      return line
    }
    if (item.id !== patched.inventoryId) patched = { ...patched, inventoryId: item.id }
    const catalogPrice = catalogUnitPriceOf(item)
    if (typeof patched.catalogUnitPrice !== "number") {
      patched = { ...patched, catalogUnitPrice: catalogPrice }
    } else if (!samePrice(patched.catalogUnitPrice, catalogPrice)) {
      divergences.push({
        kind: "price",
        lineId: line.lineId,
        produtoId: patched.produtoId!,
        name: line.name,
        cartPrice: line.price,
        previousCatalogPrice: patched.catalogUnitPrice,
        catalogPrice,
      })
    }
    if (patched !== line) changed = true
    return patched
  })

  // Saldo agregado por produto (duas linhas do mesmo produto somam).
  const qtyByProduto = new Map<string, number>()
  for (const line of next) {
    if (!isCatalogProductLine(line) || !line.produtoId) continue
    qtyByProduto.set(line.produtoId, (qtyByProduto.get(line.produtoId) ?? 0) + line.quantity)
  }
  for (const line of next) {
    if (!isCatalogProductLine(line) || !line.produtoId) continue
    const item = byDbId.get(line.produtoId)
    if (!item) continue
    const controlled = opts.isStockControlled
      ? opts.isStockControlled(item)
      : Number.isFinite(item.stock) && item.stock < UNCONTROLLED_STOCK_THRESHOLD
    if (!controlled) continue
    const inCart = qtyByProduto.get(line.produtoId) ?? 0
    if (inCart <= item.stock + 0.0001) continue
    divergences.push({
      kind: "stock",
      lineId: line.lineId,
      produtoId: line.produtoId,
      name: line.name,
      inCart,
      available: item.stock,
      lineQuantity: line.quantity,
    })
  }

  return { lines: next, divergences, changed }
}

export function describeDivergence(d: CartCatalogDivergence, formatMoney: (n: number) => string): string {
  switch (d.kind) {
    case "price":
      return `${d.name}: preço do cadastro mudou de ${formatMoney(d.previousCatalogPrice)} para ${formatMoney(d.catalogPrice)} (no carrinho: ${formatMoney(d.cartPrice)}).`
    case "stock":
      return `${d.name}: saldo do cadastro agora é ${d.available}; no carrinho há ${d.inCart}.`
    case "removed":
      return `${d.name}: o produto foi excluído do cadastro desta loja.`
  }
}
