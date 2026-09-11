/**
 * Integridade da finalização de venda — PDV-MOTOR-INTEGRITY-N1.
 *
 * Módulo puro (sem React/Prisma): mesmo harness `node` dos demais testes de
 * `lib/`. Concentra o vocabulário canônico do GOAL para que os 5 PDVs ativos
 * (Classic, Assistência, Supermercado, Venda Completa, Black/Next) e a troca
 * imediata compartilhem UMA decisão, em vez de cada caller reinventar:
 *
 * - `postFinalizeDisposition`: o contrato vivo `{ ok, pending }` do motor já
 *   distingue os três estados — `{ ok: false }` = FAILED (rejeitada antes de
 *   qualquer efeito), `{ ok: true, pending: true }` = PENDING (gravada local,
 *   AGUARDANDO confirmação do servidor), `{ ok: true, pending: false }` =
 *   CONFIRMED (servidor confirmou). Nenhuma segunda máquina de estados.
 * - `findUnresolvedSaleLines`: guard fail-closed pré-motor (padrão Black
 *   `linhasNaoResolvidas`) — linha de produto físico sem cadastro resolvido
 *   BLOQUEIA com os nomes, nunca é filtrada em silêncio enquanto o total
 *   cheio segue para cobrança.
 * - `createConfirmedSaleEmitter`: `_exactly-once_ do `venda_finalizada` — o
 *   evento definitivo só sai na confirmação server-side, uma vez por
 *   identidade (`clientSaleId` ou `id`), mesmo com retry concorrente.
 */

import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import { resolveSaleLineItemType } from "@/lib/sale-line-classification"

export const FINALIZE_CONFIRMED = "CONFIRMED" as const
export const FINALIZE_PENDING = "PENDING" as const
export const FINALIZE_FAILED = "FAILED" as const

export type FinalizeDisposition =
  | typeof FINALIZE_CONFIRMED
  | typeof FINALIZE_PENDING
  | typeof FINALIZE_FAILED

export type FinalizeResultLike = {
  ok: boolean
  pending?: boolean
}

/**
 * Vocabulário canônico sobre o contrato vivo do motor. Somente CONFIRMED
 * pode disparar efeitos de conclusão definitiva (limpar carrinho, cupom
 * definitivo, toast de sucesso). PENDING mantém carrinho + identidade e
 * oferece "Reenviar sync" com a MESMA identidade.
 */
export function postFinalizeDisposition(result: FinalizeResultLike): FinalizeDisposition {
  if (!result.ok) return FINALIZE_FAILED
  return result.pending === true ? FINALIZE_PENDING : FINALIZE_CONFIRMED
}

/** PENDING nunca usa copy de sucesso definitivo. */
export const PENDING_SALE_TITLE = "PENDENTE — AGUARDANDO CONFIRMAÇÃO" as const
export const PENDING_SALE_DESCRIPTION =
  "Venda salva localmente. Abra Vendas e use Reenviar sync (mesma identidade, sem duplicar)." as const

export type GuardSaleLineInput = {
  inventoryId?: string | null
  /** Nome exibido ao operador na mensagem de bloqueio. */
  name?: string | null
  itemType?: "produto" | "servico" | "avulso" | "ordem_servico" | null
  isAvulso?: boolean
}

export type UnresolvedSaleLine = {
  inventoryId: string
  name: string
}

/**
 * Devolve as linhas de PRODUTO físico cujo `inventoryId` não resolve no
 * catálogo real da loja. Linhas legítimas sem Produto — avulso, serviço
 * real, linha de O.S. (qualquer `isVirtualSaleLine`) ou `itemType` não-produto
 * — nunca bloqueiam e nunca são convertidas em outro tipo.
 */
export function findUnresolvedSaleLines(
  lines: readonly GuardSaleLineInput[],
  inventoryIds: ReadonlySet<string> | readonly string[],
): UnresolvedSaleLine[] {
  const known = new Set<string>(inventoryIds as Iterable<string>)
  const out: UnresolvedSaleLine[] = []
  for (const line of lines) {
    const rawId = typeof line?.inventoryId === "string" ? line.inventoryId.trim() : ""
    if (!rawId) continue
    if (isVirtualSaleLine(rawId)) continue
    if (resolveSaleLineItemType(line) !== "produto") continue
    if (known.has(rawId)) continue
    const name = typeof line?.name === "string" && line.name.trim() ? line.name.trim() : rawId
    out.push({ inventoryId: rawId, name })
  }
  return out
}

/** Mesma copy do guard mais maduro (Black): motivo + ação, sem perder o carrinho. */
export function formatUnresolvedSaleLines(names: readonly string[]): string {
  return `Sem cadastro no estoque desta loja: ${names.join(", ")}. Remova o item da lista e tente novamente.`
}

export function unresolvedSaleLinesDescription(unresolved: readonly UnresolvedSaleLine[]): string {
  return formatUnresolvedSaleLines(unresolved.map((l) => l.name))
}

export type ConfirmedSaleIdentity = {
  id: string
  clientSaleId?: string | null
}

/**
 * Fábrica do emissor exatamente-uma-vez. A chave é a identidade estável da
 * tentativa (`clientSaleId` quando houver, senão `id`): o retry da MESMA
 * pendência confirma sem duplicar venda/evento/estoque/financeiro.
 */
export function createConfirmedSaleEmitter(
  emit: (key: string) => void,
): (sale: ConfirmedSaleIdentity) => boolean {
  const emitted = new Set<string>()
  return (sale) => {
    const rawKey =
      typeof sale?.clientSaleId === "string" && sale.clientSaleId.trim()
        ? sale.clientSaleId.trim()
        : typeof sale?.id === "string"
          ? sale.id.trim()
          : ""
    if (!rawKey || emitted.has(rawKey)) return false
    emitted.add(rawKey)
    emit(rawKey)
    return true
  }
}
