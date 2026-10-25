"use client"

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import {
  pdvWeightSaleRemovedNotice,
  splitWeightBlockedLines,
  type PdvWeightSaleNotice,
} from "@/lib/pdv-weight-sale-guard"

/**
 * Invariante do PDV (ESTOQUE-MANUAL-KG-001): o carrinho nunca contém produto com
 * venda por peso bloqueada. Cobre o que não passa por `addToCart` — comanda
 * importada, venda em espera retomada, rascunho/carrinho persistido e catálogo que
 * só chega depois da restauração. A linha sai do carrinho com aviso, antes do pagamento.
 * `onRemoved` fecha o pagamento em andamento: valores lançados para o carrinho antigo
 * não podem ser confirmados contra o total novo (o modal zera os lançamentos ao fechar).
 */
export function usePdvWeightBlockedCartGuard<L extends { inventoryId?: string }>(params: {
  cart: readonly L[]
  setCart: Dispatch<SetStateAction<L[]>>
  catalog: ReadonlyArray<{ id: string; dbId?: string; name: string; vendaPesoIndisponivel?: boolean }>
  notify: (notice: PdvWeightSaleNotice) => void
  onRemoved?: () => void
}) {
  const { cart, setCart, catalog } = params
  const notifyRef = useRef(params.notify)
  notifyRef.current = params.notify
  const removedRef = useRef(params.onRemoved)
  removedRef.current = params.onRemoved

  useEffect(() => {
    const { blockedNames } = splitWeightBlockedLines(cart, catalog)
    if (blockedNames.length === 0) return
    setCart((prev) => splitWeightBlockedLines(prev, catalog).kept)
    removedRef.current?.()
    notifyRef.current(pdvWeightSaleRemovedNotice(blockedNames))
  }, [cart, catalog, setCart])
}
