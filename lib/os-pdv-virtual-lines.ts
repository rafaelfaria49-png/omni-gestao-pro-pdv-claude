/**
 * Linhas de venda PDV sem SKU de estoque real.
 *
 * Hoje cobrimos 2 famílias:
 *  - O.S. (`__os_servico__` / `__os_pecas__`): faturamento da Ordem de Serviço
 *    pelo PDV sem produto no catálogo.
 *  - Item Avulso (`__avulso__`): venda balcão rápida (INSERT) de um item não
 *    cadastrado — descrição/preço/qtd informados na hora.
 *
 * Todas elas **não** tocam estoque (`MovimentacaoEstoque`), não exigem produto
 * resolvido em `Produto`, e preservam o `inventoryId` virtual em `ItemVenda`.
 * A baixa de estoque (Step 3 do `upsertVendaInTransaction`) e a checagem de
 * saldo em `finalizeSaleTransaction` consultam `isVirtualSaleLine` e pulam.
 */

export const OS_SERVICO_PREFIX = "__os_servico__"
export const OS_PECAS_PREFIX = "__os_pecas__"
export const AVULSO_PREFIX = "__avulso__"

export function isOsVirtualSaleLine(inventoryId: string | null | undefined): boolean {
  return (
    typeof inventoryId === "string" &&
    (inventoryId.startsWith(OS_SERVICO_PREFIX) || inventoryId.startsWith(OS_PECAS_PREFIX))
  )
}

export function isAvulsoSaleLine(inventoryId: string | null | undefined): boolean {
  return typeof inventoryId === "string" && inventoryId.startsWith(AVULSO_PREFIX)
}

/**
 * Predicate unificado: qualquer linha que NÃO deve tocar estoque/Produto.
 * Use este em todos os pontos que decidem "pular ledger" (upsert venda, finalize,
 * devolução, cancelamento). `isOsVirtualSaleLine` permanece exportado por
 * compatibilidade quando o caller precisa diferenciar O.S. de avulso.
 */
export function isVirtualSaleLine(inventoryId: string | null | undefined): boolean {
  return isOsVirtualSaleLine(inventoryId) || isAvulsoSaleLine(inventoryId)
}

export function osServicoInventoryId(osId: string): string {
  return `${OS_SERVICO_PREFIX}${osId}`
}

export function osPecasInventoryId(osId: string): string {
  return `${OS_PECAS_PREFIX}${osId}`
}

/**
 * Gera um inventoryId único para um Item Avulso. O `localId` (opcional) permite
 * estabilidade entre re-renders (use o `lineId` do carrinho). Sem `localId`,
 * usa timestamp + random — adequado para o ato de adicionar ao carrinho.
 */
export function avulsoInventoryId(localId?: string): string {
  const stable = typeof localId === "string" && localId.trim() ? localId.trim() : null
  const id = stable ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `${AVULSO_PREFIX}${id}`
}
