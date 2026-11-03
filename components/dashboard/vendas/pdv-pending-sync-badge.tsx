"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw, WifiOff } from "lucide-react"
import { useOperationsStore } from "@/lib/operations-store"
import { cn } from "@/lib/utils"
import { isSaleIdentityConflictCode } from "@/lib/vendas/sale-identity-conflict"
import { summarizeLocalPendingSales } from "@/lib/vendas/quarantine-local-reconciliation"
import { saleLocalKey } from "@/lib/vendas/local-sale-identity"
import {
  pendingReasonView,
  PENDING_SYNC_CLASS,
  unresolvedLinesCarryStableId,
  unresolvedSaleLineLabels,
} from "@/lib/vendas/pending-sync-classification"
import {
  ATTEMPT_OUTCOME_LABEL,
  SALE_ALREADY_CONFIRMED_CODE,
  declaredPaymentLabels,
  isEffectivelyOffline,
  operatorSaleSyncView,
  type OperatorSaleSyncStatus,
  type SyncConnectivity,
} from "@/lib/vendas/sale-sync-engine"
import type { SaleRecord } from "@/lib/operations-sale-types"
import type { UnknownTwinPrompt } from "@/lib/operations-store"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const SEM_REVISAO: ReadonlySet<string> = new Set()

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

function hora(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

/** Identidade curta da pendência (ref local + horário) — sem dado de cliente. */
function pendingSaleLabel(sale: Pick<SaleRecord, "id" | "at">): string {
  const at = new Date(sale.at)
  const when = Number.isNaN(at.getTime())
    ? ""
    : ` de ${at.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
  return `Venda ${sale.id}${when}`
}

const CONNECTIVITY_LABEL: Record<SyncConnectivity, string> = {
  online: "Conectado ao servidor",
  offline: "Sem internet",
  servidor_inacessivel: "Servidor não responde",
  desconhecida: "Conexão ainda não verificada",
}

const STATUS_TONE: Record<OperatorSaleSyncStatus, string> = {
  REGISTRADA_LOCALMENTE: "text-warning",
  AGUARDANDO_CONEXAO: "text-warning",
  VERIFICANDO_SERVIDOR: "text-info",
  ENVIANDO: "text-info",
  CONFIRMADA: "text-success",
  REJEITADA: "text-destructive",
  EXIGE_CORRECAO: "text-destructive",
  QUARENTENA: "text-destructive",
}

type LastRun = { at: string; ok: number; fail: number; offline: boolean; detail: string }

/**
 * Decisão EXPLÍCITA quando a finalização foi barrada por uma venda idêntica cujo envio ficou sem
 * resposta (pode já estar gravada). Repetir a finalização não decide nada; só estes botões.
 */
function UnknownTwinDecision({
  prompt,
  onDecide,
}: {
  prompt: UnknownTwinPrompt
  onDecide: (decision: "outra" | "verificar" | "cancelar") => void
}) {
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onDecide("cancelar") }}>
      <AlertDialogContent data-testid="pdv-unknown-twin-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Venda idêntica sem confirmação do servidor</AlertDialogTitle>
          <AlertDialogDescription>
            A venda de {brl(prompt.total)} das {hora(prompt.at)} tem o mesmo conteúdo e o envio dela ficou sem resposta — ela
            pode já estar gravada. Registrar de novo sem verificar pode duplicar. Nada foi gravado ainda.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => onDecide("cancelar")}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => onDecide("verificar")}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            Verificar a venda anterior
          </button>
          <button
            type="button"
            onClick={() => onDecide("outra")}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            É outra venda
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Painel HONESTO de sincronização do PDV (PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001).
 *
 * Mostra conexão útil com o servidor, quantas vendas estão em cada estado, a fase da
 * tentativa em curso ("Verificando…" / "Enviando…") e o resultado da última tentativa de
 * cada venda — gravado na própria venda, não num toast que some. "Confirmada" só aparece
 * com prova do servidor. Reenviar executa uma tentativa real e mostra o desfecho aqui.
 */
export function PdvPendingSyncBadge({ className }: { className?: string }) {
  const {
    sales,
    devolucoes,
    pendingCaixaOperations,
    retrySyncSale,
    quarantineReviewKeys,
    syncConnectivity = "desconhecida",
    saleSyncPhases,
    localQueueHealthy = true,
    unknownTwinPrompt,
    resolveUnknownTwin,
  } = useOperationsStore()
  const [twinNote, setTwinNote] = useState<string | null>(null)
  const decideTwin = (decision: "outra" | "verificar" | "cancelar") => {
    void resolveUnknownTwin?.(decision).then((r) => {
      if (decision === "outra") setTwinNote("Confirmado: é outra venda. A anterior continua na fila. Finalize de novo para registrar a nova.")
      else if (decision === "verificar") setTwinNote(r?.ok ? "A venda anterior foi confirmada pelo servidor." : `Venda anterior: ${r?.reason ?? "sem resposta"}`)
    })
  }
  const [resending, setResending] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [lastRun, setLastRun] = useState<LastRun | null>(null)
  const offline = isEffectivelyOffline(syncConnectivity)

  const { salesPend, retryableSales, revisao, devPend, caixaPend, total, headline, headlineSale, rows, counts } = useMemo(() => {
    const sp = sales.filter((s) => s.syncPending === true)
    const retryable = sp.filter((s) => !isSaleIdentityConflictCode(s.syncBlockedCode))
    const resumo = summarizeLocalPendingSales(sp, quarantineReviewKeys ?? SEM_REVISAO)
    const dp = devolucoes.filter((d) => d.syncPending === true).length
    const cp = (pendingCaixaOperations ?? []).filter((o) => o.syncPending === true).length
    // Cada motivo fica amarrado à PRÓPRIA venda pendente (linhas dela, não do carrinho).
    const views = sp.map((s) => ({
      sale: s,
      view: pendingReasonView({
        code: s.syncBlockedCode,
        httpStatus: s.syncHttpStatus,
        networkError: s.syncNetworkError,
        message: s.syncFailureMessage,
        drift: s.syncDrift,
        unresolvedLabels: unresolvedSaleLineLabels(s.lines, s.syncUnresolvedInventoryIds),
        unresolvedProductRemoved: unresolvedLinesCarryStableId(s.lines, s.syncUnresolvedInventoryIds),
        pending: true,
      }),
      op: operatorSaleSyncView(s, { phase: saleSyncPhases?.[saleLocalKey(s)] ?? null, offline }),
    }))
    const actionRequiredViews = views.filter((v) => v.view.class === PENDING_SYNC_CLASS.ACTION_REQUIRED)
    const autoRetry = views.filter((v) => v.view.class === PENDING_SYNC_CLASS.AUTO_RETRY)
    const quarantined = views.filter((v) => v.view.class === PENDING_SYNC_CLASS.QUARANTINED)
    const primary =
      actionRequiredViews[0] ??
      (autoRetry.length > 0 ? autoRetry[0] : undefined) ??
      quarantined[0]
    const c = { aguardando: 0, correcao: 0, quarentena: 0, emCurso: 0 }
    for (const v of views) {
      if (v.op.status === "VERIFICANDO_SERVIDOR" || v.op.status === "ENVIANDO") c.emCurso += 1
      else if (v.op.status === "QUARENTENA") c.quarentena += 1
      else if (v.op.status === "REJEITADA" || v.op.status === "EXIGE_CORRECAO") c.correcao += 1
      else c.aguardando += 1
    }
    return {
      salesPend: sp,
      retryableSales: retryable,
      revisao: resumo.review,
      devPend: dp,
      caixaPend: cp,
      total: sp.length + dp + cp,
      headline: primary?.view,
      headlineSale: primary?.sale,
      rows: views,
      counts: c,
    }
  }, [sales, devolucoes, pendingCaixaOperations, quarantineReviewKeys, saleSyncPhases, offline])

  if (total === 0) {
    if (!offline && localQueueHealthy) return null
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning",
          className,
        )}
        role="status"
        aria-live="polite"
        data-testid="pdv-sync-panel"
        data-connectivity={syncConnectivity}
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="min-w-0">
          {!localQueueHealthy ? (
            <strong>Armazenamento do navegador falhou — venda offline bloqueada até liberar espaço ou a conexão voltar.</strong>
          ) : (
            <>
              <strong>{CONNECTIVITY_LABEL[syncConnectivity]}.</strong> Vendas feitas agora ficam registradas só neste terminal até o
              servidor confirmar. Crédito/vale, a prazo e carnê ficam bloqueados enquanto isso.
            </>
          )}
        </span>
      </div>
    )
  }

  const parts: string[] = []
  if (salesPend.length) parts.push(`${salesPend.length} venda(s)`)
  if (devPend) parts.push(`${devPend} devolução(ões)`)
  if (caixaPend) parts.push(`${caixaPend} caixa`)

  const actionRequired = headline?.class === PENDING_SYNC_CLASS.ACTION_REQUIRED
  const quarantinedOnly = headline?.class === PENDING_SYNC_CLASS.QUARANTINED
  const driftBlocked =
    actionRequired &&
    (headline?.title.startsWith("Estoque divergente — depósito") ||
      headline?.title.startsWith("Estoque divergente — exige"))

  const reasonLine = quarantinedOnly
    ? " O sistema envia automaticamente — não limpe os dados do navegador antes de concluir."
    : headline
      ? `${actionRequired && headlineSale ? ` ${pendingSaleLabel(headlineSale)}:` : ""} ${headline.title}. ${headline.description} ${headline.recommendedAction}`
      : " O sistema envia automaticamente — não limpe os dados do navegador antes de concluir."

  const reenviar = async (only?: SaleRecord) => {
    if (resending) return
    const alvo = only ? [only] : retryableSales
    if (alvo.length === 0) return
    setResending(true)
    let ok = 0
    let fail = 0
    let semConexao = false
    const motivos: string[] = []
    try {
      for (const s of alvo) {
        if (!s.id) continue
        const r = await retrySyncSale(s.clientSaleId || s.id)
        if (r.ok) ok += 1
        else if (r.code === SALE_ALREADY_CONFIRMED_CODE) ok += 1
        else {
          fail += 1
          if (r.code === "SEM_CONEXAO") semConexao = true
          if (motivos.length < 2) motivos.push(`${pendingSaleLabel(s)}: ${r.reason.slice(0, 180)}`)
        }
      }
    } finally {
      setResending(false)
      setLastRun({
        at: new Date().toISOString(),
        ok,
        fail,
        offline: semConexao,
        detail: motivos.join(" · "),
      })
      if (fail > 0) setExpanded(true)
    }
  }

  const emCurso = resending || counts.emCurso > 0
  const fasesAtivas = rows.filter((r) => r.op.status === "VERIFICANDO_SERVIDOR" || r.op.status === "ENVIANDO")
  const faseLabel = fasesAtivas.some((r) => r.op.status === "VERIFICANDO_SERVIDOR") ? "Verificando venda…" : "Enviando…"

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning",
        className,
      )}
      role="status"
      aria-live="polite"
      data-testid="pdv-sync-panel"
      data-connectivity={syncConnectivity}
    >
      {unknownTwinPrompt && <UnknownTwinDecision prompt={unknownTwinPrompt} onDecide={decideTwin} />}
      {twinNote && (
        <div className="min-w-0 text-[11px] font-medium text-foreground" data-testid="pdv-unknown-twin-note">
          {twinNote}
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {offline ? <WifiOff className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span data-testid="pdv-sync-total"><strong>{total}</strong></span> pendência(s) de sincronização ({parts.join(" · ")}).
          {reasonLine}
          {actionRequired && driftBlocked && <> Ação administrativa necessária.</>}
          {revisao > 0 && <> {revisao} venda(s) precisam de revisão do administrador em Vendas.</>}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {salesPend.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded border border-warning/50 px-2 py-0.5 font-semibold transition-colors hover:bg-warning/20"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Detalhes
            </button>
          )}
          {retryableSales.length > 0 && (
            <button
              type="button"
              onClick={() => void reenviar()}
              disabled={emCurso}
              className="inline-flex items-center gap-1 rounded border border-warning/50 px-2 py-0.5 font-semibold transition-colors hover:bg-warning hover:text-warning-foreground disabled:opacity-60"
            >
              {emCurso ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {emCurso ? faseLabel : "Reenviar"}
            </button>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground" data-testid="pdv-sync-summary">
        <span className={cn("font-semibold", offline ? "text-destructive" : "text-foreground")} data-testid="pdv-sync-connectivity">
          {CONNECTIVITY_LABEL[syncConnectivity]}
        </span>
        <span>Aguardando: {counts.aguardando}</span>
        <span>Exigem correção: {counts.correcao}</span>
        <span>Preservadas (envio automático): {counts.quarentena}</span>
        {counts.emCurso > 0 && <span className="text-info">Em envio: {counts.emCurso}</span>}
        {!localQueueHealthy && <span className="font-semibold text-destructive">Armazenamento local falhou — não recarregue a página</span>}
      </div>

      {lastRun && (
        <div
          className={cn("min-w-0 text-[11px] font-medium", lastRun.fail > 0 ? "text-destructive" : "text-success")}
          data-testid="pdv-sync-last-run"
        >
          Último reenvio ({hora(lastRun.at)}):{" "}
          {lastRun.fail === 0
            ? `${lastRun.ok} venda(s) confirmada(s) pelo servidor.`
            : lastRun.offline
              ? `sem conexão — nada foi enviado. ${lastRun.ok} confirmada(s), ${lastRun.fail} ainda pendente(s).`
              : `${lastRun.ok} confirmada(s), ${lastRun.fail} ainda pendente(s). ${lastRun.detail}`}
        </div>
      )}

      {expanded && salesPend.length > 0 && (
        <ul className="mt-1 flex min-w-0 flex-col divide-y divide-warning/20 rounded border border-warning/30 bg-background text-foreground" data-testid="pdv-sync-list">
          {rows.map(({ sale, view, op }) => {
            const declarados = declaredPaymentLabels(sale.paymentBreakdown)
            const outcome = sale.syncLastAttemptOutcome
            const conflict = isSaleIdentityConflictCode(sale.syncBlockedCode)
            return (
              <li key={sale.clientSaleId || sale.id} className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5" data-testid="pdv-sync-row" data-status={op.status}>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                  <span className="min-w-0 font-semibold">{pendingSaleLabel(sale)}</span>
                  <span className="tabular-nums">{brl(sale.total)}</span>
                  <span className={cn("ml-auto shrink-0 font-semibold", STATUS_TONE[op.status])}>{op.label}</span>
                </div>
                <div className="min-w-0 text-[11px] text-muted-foreground">
                  No servidor: {op.serverHasSale === "sim" ? "gravada" : op.serverHasSale === "nao" ? "NÃO gravada" : "ainda não confirmada"} ·
                  estoque e caixa do servidor: {op.serverHasSale === "sim" ? "lançados" : "não lançados"}
                  {declarados.length > 0 && <> · pagamento declarado pelo operador ({declarados.join(", ")}) — sem conciliação automática</>}
                  {sale.registeredOffline && <> · registrada sem conexão</>}
                </div>
                <div className="min-w-0 text-[11px]">
                  {view.title}. {view.recommendedAction}
                </div>
                {outcome && (
                  <div className="min-w-0 text-[11px] text-muted-foreground" data-testid="pdv-sync-row-last-attempt">
                    Última tentativa {hora(sale.syncLastAttemptAt)}
                    {sale.syncLastAttemptSource === "manual" ? " (manual)" : sale.syncLastAttemptSource === "auto" ? " (automática)" : ""}:{" "}
                    {ATTEMPT_OUTCOME_LABEL[outcome]}
                    {sale.syncAttemptCount ? ` · ${sale.syncAttemptCount} tentativa(s)` : ""}
                  </div>
                )}
                {!conflict && op.canResend && (
                  <div>
                    <button
                      type="button"
                      onClick={() => void reenviar(sale)}
                      disabled={emCurso}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      <RefreshCw className="h-3 w-3" /> Reenviar esta venda
                    </button>
                  </div>
                )}
                {conflict && (
                  <div className="text-[11px] text-muted-foreground">
                    O sistema confere esta venda no servidor sozinho; se precisar de revisão, o administrador resolve em Vendas. Não registre de novo.
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
