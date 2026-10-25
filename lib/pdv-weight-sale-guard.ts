/**
 * ESTOQUE-MANUAL-KG-001 — orientação do PDV para produto declarado por peso.
 *
 * O estoque em KG já aceita entrada manual, mas a VENDA por peso (quantidade,
 * preço por kg, pagamento e baixa) segue bloqueada no servidor. Sem este guard o
 * PDV dizia "sem saldo no estoque" (mandando o operador repor) ou, com saldo,
 * deixava vender 1 unidade e só recusava no pagamento. Chamado antes de qualquer
 * checagem de estoque em todo `addToCart`; a restauração de carrinho é coberta por
 * `usePdvWeightBlockedCartGuard`.
 */
import { isProductWeightDeclared } from "@/lib/cadastros/product-commercial-contract"

export type PdvWeightSaleNotice = { title: string; description: string }

const TITULO = "Venda por peso ainda não liberada"
const ORIENTACAO = "Não venda como unidade nem como item avulso; o estoque não precisa de ajuste."

/** Projeção única usada por `/api/ops/inventory` e `/api/ops/inventory/lookup`. */
export function inventoryWeightSaleProjection(metadata: unknown): { vendaPesoIndisponivel?: true } {
  return isProductWeightDeclared(metadata) ? { vendaPesoIndisponivel: true } : {}
}

/** Repasse da marca nos mapeadores InventoryItem → produto do catálogo de cada PDV. */
export function pdvWeightSaleFlag(inv: { vendaPesoIndisponivel?: boolean }): { vendaPesoIndisponivel?: true } {
  return inv.vendaPesoIndisponivel === true ? { vendaPesoIndisponivel: true } : {}
}

export function pdvWeightSaleBlockedNotice(product: {
  name: string
  vendaPesoIndisponivel?: boolean
}): PdvWeightSaleNotice | null {
  if (!product.vendaPesoIndisponivel) return null
  return {
    title: TITULO,
    description: `${product.name} é vendido por kg e ainda não pode ser registrado no PDV. ${ORIENTACAO}`,
  }
}

type CatalogEntry = { id: string; dbId?: string; name: string; vendaPesoIndisponivel?: boolean }

/**
 * Separa linhas de carrinho cujo produto está com venda por peso bloqueada no
 * catálogo ATUAL (por id operacional ou id do banco). Linhas sem produto
 * conhecido (avulso, serviço, catálogo ainda carregando) são mantidas.
 */
export function splitWeightBlockedLines<L extends { inventoryId?: string }>(
  lines: readonly L[],
  catalog: readonly CatalogEntry[],
): { kept: L[]; blockedNames: string[] } {
  const blocked = new Map<string, string>()
  for (const p of catalog) {
    if (!p.vendaPesoIndisponivel) continue
    blocked.set(p.id, p.name)
    if (p.dbId) blocked.set(p.dbId, p.name)
  }
  if (blocked.size === 0) return { kept: [...lines], blockedNames: [] }
  const kept: L[] = []
  const names = new Set<string>()
  for (const line of lines) {
    const name = line.inventoryId ? blocked.get(line.inventoryId) : undefined
    if (name) names.add(name)
    else kept.push(line)
  }
  return { kept, blockedNames: [...names] }
}

/** Pagamento aberto: o carrinho não muda (pode haver envio em andamento); a venda será recusada. */
export function pdvWeightSaleBlockedDuringPaymentNotice(names: readonly string[]): PdvWeightSaleNotice {
  return {
    title: TITULO,
    description: `${names.join(", ")} é vendido por kg e ainda não pode ser registrado no PDV: esta venda será recusada sem gravar nada. Feche o pagamento; o item sai do carrinho para você revisar o total.`,
  }
}

export function pdvWeightSaleRemovedNotice(names: readonly string[]): PdvWeightSaleNotice {
  const quem = names.join(", ")
  return {
    title: TITULO,
    description: `${quem} ${names.length > 1 ? "saíram" : "saiu"} do carrinho: produto vendido por kg ainda não pode ser registrado no PDV. ${ORIENTACAO}`,
  }
}
