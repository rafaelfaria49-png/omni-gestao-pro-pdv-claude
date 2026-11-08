"use client"

import { useCallback, useRef, useState } from "react"
import {
  encerrarIdempotencyKey,
  encerrarSubmissao,
  iniciarSubmissao,
  loteEconomicFingerprint,
  novaTravaSubmissao,
  resolveIdempotencyKey,
} from "@/lib/contas-receber-lote"
import type {
  EnvioRecebimentoHub,
  RecebimentoHubItemPedido,
  RecebimentoHubPedido,
  RecebimentoHubResultado,
} from "@/lib/financeiro/recebimento-hub-client"

/**
 * Envio de UMA operação de recebimento do Financeiro HUB.
 *
 *  - trava SÍNCRONA (ref) contra clique duplo/Enter no mesmo tick — o `busy` do state só
 *    chega no próximo render;
 *  - a chave de idempotência é a mesma enquanto o desfecho for INCERTO (rede/5xx): o retry
 *    da mesma seleção vira replay no servidor, nunca segunda baixa;
 *  - desfecho definitivo (confirmado ou recusado) descarta a chave: dois recebimentos
 *    legítimos de mesmo valor recebem chaves distintas.
 */
export function useEnvioRecebimento(enviar: (p: RecebimentoHubPedido) => Promise<EnvioRecebimentoHub>) {
  const travaRef = useRef(novaTravaSubmissao())
  const chavesRef = useRef(new Map<string, string>())
  const [busy, setBusy] = useState(false)
  const [resultado, setResultado] = useState<RecebimentoHubResultado | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const submeter = useCallback(
    async (input: { formaPagamento: string; observacao?: string; itens: RecebimentoHubItemPedido[] }) => {
      if (input.itens.length === 0 || !input.formaPagamento.trim()) return null
      if (!iniciarSubmissao(travaRef.current)) return null
      const fingerprint = loteEconomicFingerprint({
        sessaoId: "financeiro-hub",
        formaPagamento: input.formaPagamento,
        itens: input.itens.map((i) => ({ ...i })),
      })
      const idempotencyKey = resolveIdempotencyKey(chavesRef.current, fingerprint)
      setBusy(true)
      setAviso(null)
      try {
        const out = await enviar({ ...input, idempotencyKey })
        if (out.kind === "ok") {
          encerrarIdempotencyKey(chavesRef.current, fingerprint)
          setResultado(out.resultado)
        } else if (out.kind === "recusado") {
          encerrarIdempotencyKey(chavesRef.current, fingerprint)
          setAviso(out.mensagem)
        } else {
          setAviso(out.mensagem)
        }
        return out
      } finally {
        encerrarSubmissao(travaRef.current)
        setBusy(false)
      }
    },
    [enviar],
  )

  const reset = useCallback(() => {
    if (travaRef.current.ativo) return
    chavesRef.current.clear()
    setResultado(null)
    setAviso(null)
  }, [])

  return { submeter, busy, resultado, aviso, setAviso, reset, emVoo: () => travaRef.current.ativo }
}
