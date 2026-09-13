"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react"
import { useOperationsStore } from "@/lib/operations-store"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { isSaleIdentityConflictCode } from "@/lib/vendas/sale-identity-conflict"
import { summarizeLocalPendingSales } from "@/lib/vendas/quarantine-local-reconciliation"

const SEM_REVISAO: ReadonlySet<string> = new Set()

/**
 * Indicador HONESTO de pendências de sincronização do PDV.
 *
 * Lê o estado local de operações (`sales`/`devolucoes`/`pendingCaixaOperations`
 * com `syncPending`) e avisa o operador ANTES de limpar os dados do navegador — protege
 * contra perder venda offline.
 *
 * Mostra somente pendência que existe de fato: venda reconciliada sai da contagem. Venda
 * preservada por conflito de identificação é resolvida pela reconciliação automática; só
 * as que o servidor devolveu para revisão viram assunto do administrador.
 *
 * A ação "Reenviar" reusa o fluxo EXISTENTE `retrySyncSale` (uma venda por vez) —
 * NÃO cria mecanismo de sync novo nem apaga pendências. Devoluções/caixa também
 * reenviam automaticamente (online/foco/30s); aqui só ficam visíveis na contagem.
 */
export function PdvPendingSyncBadge({ className }: { className?: string }) {
  const { sales, devolucoes, pendingCaixaOperations, retrySyncSale, quarantineReviewKeys } =
    useOperationsStore()
  const { toast } = useToast()
  const [resending, setResending] = useState(false)

  const { salesPend, retryableSales, preservadas, revisao, devPend, caixaPend, total } = useMemo(() => {
    const sp = sales.filter((s) => s.syncPending === true)
    const retryable = sp.filter((s) => !isSaleIdentityConflictCode(s.syncBlockedCode))
    const resumo = summarizeLocalPendingSales(sp, quarantineReviewKeys ?? SEM_REVISAO)
    const dp = devolucoes.filter((d) => d.syncPending === true).length
    const cp = (pendingCaixaOperations ?? []).filter((o) => o.syncPending === true).length
    return {
      salesPend: sp,
      retryableSales: retryable,
      preservadas: resumo.autoSync + resumo.review,
      revisao: resumo.review,
      devPend: dp,
      caixaPend: cp,
      total: sp.length + dp + cp,
    }
  }, [sales, devolucoes, pendingCaixaOperations, quarantineReviewKeys])

  if (total === 0) return null

  const parts: string[] = []
  if (salesPend.length) parts.push(`${salesPend.length} venda(s)`)
  if (devPend) parts.push(`${devPend} devolução(ões)`)
  if (caixaPend) parts.push(`${caixaPend} caixa`)

  const reenviar = async () => {
    if (resending || retryableSales.length === 0) return
    setResending(true)
    try {
      let ok = 0
      let fail = 0
      // Vendas preservadas não entram no reenvio comum: a reconciliação automática cuida delas.
      let automaticas = preservadas
      for (const s of retryableSales) {
        if (!s.id) continue
        const r = await retrySyncSale(s.id)
        if (r.ok) ok += 1
        else if (isSaleIdentityConflictCode(r.code)) automaticas += 1
        else fail += 1
      }
      const sufixoAutomaticas = automaticas ? ` · ${automaticas} sincronizando automaticamente.` : ""
      toast({
        title: fail === 0 ? "Sincronização reenviada" : "Reenvio parcial",
        description:
          fail === 0
            ? `${ok} venda(s) sincronizada(s).${sufixoAutomaticas}`
            : `${ok} sincronizada(s) · ${fail} ainda pendente(s). Tente novamente ou use o Histórico de Vendas.${sufixoAutomaticas}`,
        variant: fail === 0 ? "default" : "destructive",
      })
    } finally {
      setResending(false)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <strong>{total}</strong> pendência(s) de sincronização ({parts.join(" · ")}). O sistema envia
        automaticamente — não limpe os dados do navegador antes de concluir.
        {revisao > 0 && <> {revisao} venda(s) precisam de revisão do administrador em Vendas.</>}
      </span>
      {retryableSales.length > 0 && (
        <button
          type="button"
          onClick={() => void reenviar()}
          disabled={resending}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-warning/50 px-2 py-0.5 font-semibold transition-colors hover:bg-warning hover:text-warning-foreground disabled:opacity-60"
        >
          {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Reenviar
        </button>
      )}
    </div>
  )
}
