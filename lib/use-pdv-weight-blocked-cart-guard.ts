"use client"

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import {
  pdvWeightSaleBlockedDuringPaymentNotice,
  pdvWeightSaleRemovedNotice,
  splitWeightBlockedLines,
  type PdvWeightSaleNotice,
} from "@/lib/pdv-weight-sale-guard"

/**
 * Invariante do PDV (ESTOQUE-MANUAL-KG-001): o carrinho nunca contém produto com
 * venda por peso bloqueada. Cobre o que não passa por `addToCart` — comanda
 * importada, venda em espera retomada, rascunho/carrinho persistido e catálogo que
 * só chega depois da restauração. A linha sai do carrinho com aviso.
 *
 * Com o pagamento aberto (`paused`) o carrinho NÃO é alterado e o modal NÃO é fechado:
 * pode haver uma confirmação em andamento, e mexer no carrinho ou liberar o modal
 * permitiria um segundo envio ou pagamentos lançados contra outro total. O servidor
 * recusa a venda inteira com o item (409, sem efeito parcial); o operador é avisado e
 * a linha sai assim que o pagamento fechar.
 */
export function usePdvWeightBlockedCartGuard<L extends { inventoryId?: string }>(params: {
  cart: readonly L[]
  setCart: Dispatch<SetStateAction<L[]>>
  catalog: ReadonlyArray<{ id: string; dbId?: string; name: string; vendaPesoIndisponivel?: boolean }>
  notify: (notice: PdvWeightSaleNotice) => void
  paused: boolean
}) {
  const { cart, setCart, catalog, paused } = params
  const notifyRef = useRef(params.notify)
  notifyRef.current = params.notify
  const pausedNoticeRef = useRef("")

  useEffect(() => {
    const { blockedNames } = splitWeightBlockedLines(cart, catalog)
    if (blockedNames.length === 0) {
      pausedNoticeRef.current = ""
      return
    }
    if (paused) {
      const key = blockedNames.join("|")
      if (pausedNoticeRef.current === key) return
      pausedNoticeRef.current = key
      notifyRef.current(pdvWeightSaleBlockedDuringPaymentNotice(blockedNames))
      return
    }
    pausedNoticeRef.current = ""
    setCart((prev) => splitWeightBlockedLines(prev, catalog).kept)
    notifyRef.current(pdvWeightSaleRemovedNotice(blockedNames))
  }, [cart, catalog, paused, setCart])
}
