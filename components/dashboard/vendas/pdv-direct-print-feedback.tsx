"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, Printer, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { directPrintClient, directPrintErrorMessage, UNSUPPORTED_DIRECT_PRINT, type ReprintQuote } from "@/lib/printing/direct/client"
import type { JobView } from "@/lib/printing/direct/status"

/** Sale CONFIRMED by the server (serverId = Venda.id). A pending sale never produces a request. */
export type DirectPrintRequest = { storeId: string; saleId: string; terminalId: string; numeroVenda: string; mode: "auto" | "manual"; copies: number }

export interface PdvDirectPrintFeedbackProps {
  request: DirectPrintRequest | null
  onDismiss: () => void
  /** The sale cannot use direct print (KG/fractional, item limit, payment form…): hand back to the existing manual print. */
  onUnsupported?: () => void
}

type Risk = { possibleAdditionalCopy: boolean; uncertainCopies: number; acceptedCopies: number; browserCopies: number }
type Ui =
  | { kind: "idle" }
  | { kind: "registering" }
  | { kind: "job"; job: JobView }
  | { kind: "error"; message: string }
  | { kind: "confirm-reprint"; quote: ReprintQuote; job: JobView | null }
  | { kind: "confirm-browser"; risk: Risk; consent: string; job: JobView | null }
  | { kind: "browser-done"; mark: string }

/** Same ceiling as the server policy (CANDIDATE_POLICY.maxCopies): beyond it the operator is told, never silently trimmed. */
export const DIRECT_MAX_COPIES = 2
const POLL_MS = 800
const POLL_LIMIT_MS = 90_000
const newContextId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ctx-${Date.now().toString(36)}`)
const riskText = (r: Risk) => `${r.acceptedCopies + r.uncertainCopies + r.browserCopies} via(s) pode(m) já ter saído.`

/** Writes the server-rendered (escaped, script-free) receipt into a window opened synchronously by the click. */
function writeBrowserPrint(w: Window, html: string) {
  w.document.open(); w.document.write(html); w.document.close()
  w.focus(); w.print()
}

/**
 * Non-modal feedback of the direct (local agent) print. It registers the job once per confirmed sale, follows the
 * server ledger, and only offers actions that cannot duplicate a sale or silently duplicate a copy: retry only for
 * copies proven not sent; a second copy (thermal or browser) only after the disclosed risk is confirmed; the browser
 * print is recorded by the server and marked SEGUNDA VIA whenever a copy may already exist.
 */
export function PdvDirectPrintFeedback({ request, onDismiss, onUnsupported }: PdvDirectPrintFeedbackProps) {
  const [ui, setUi] = useState<Ui>({ kind: "idle" })
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  // Kept in a ref: a new callback identity from the parent must never re-register (no second POST).
  const unsupportedRef = useRef(onUnsupported)
  useEffect(() => { unsupportedRef.current = onUnsupported }, [onUnsupported])

  /** Polls until the job is final; an UNCERTAIN copy keeps being followed (a late agent report may resolve it, P2-3). */
  const follow = useCallback(async (gen: number, storeId: string, jobId: string) => {
    const until = Date.now() + POLL_LIMIT_MS
    while (generation.current === gen && Date.now() < until) {
      await new Promise(r => setTimeout(r, POLL_MS))
      if (generation.current !== gen) return
      const r = await directPrintClient.getJob(storeId, jobId)
      if (generation.current !== gen) return
      if (!r.ok) { setUi({ kind: "error", message: directPrintErrorMessage(r.error) }); return }
      setUi({ kind: "job", job: r.value.job })
      if (r.value.job.final && !r.value.job.copies.some(c => c.phase === "UNCERTAIN")) return
    }
  }, [])

  const show = useCallback((gen: number, job: JobView) => {
    if (!request || generation.current !== gen) return
    setUi({ kind: "job", job })
    if (!job.final || job.copies.some(c => c.phase === "UNCERTAIN")) void follow(gen, request.storeId, job.jobId)
  }, [follow, request])

  const register = useCallback(async () => {
    if (!request) return
    const gen = ++generation.current
    setUi({ kind: "registering" })
    const r = await directPrintClient.createInitial(request.storeId, { saleId: request.saleId, terminalId: request.terminalId,
      copies: Math.min(DIRECT_MAX_COPIES, Math.max(1, request.copies)), uiContextId: newContextId() })
    if (generation.current !== gen) return
    if (!r.ok && UNSUPPORTED_DIRECT_PRINT.has(r.error) && unsupportedRef.current) { unsupportedRef.current(); return }
    if (!r.ok) { setUi({ kind: "error", message: directPrintErrorMessage(r.error) }); return }
    show(gen, r.value.job)
  }, [request, show])

  /** After an error the real state is re-read from the ledger before any further action is offered (P2-4/P3-3). */
  const refresh = useCallback(async () => {
    if (!request) return
    const gen = ++generation.current
    setBusy(true)
    const r = await directPrintClient.latest(request.storeId, request.saleId)
    setBusy(false)
    if (generation.current !== gen) return
    if (!r.ok) { setUi({ kind: "error", message: directPrintErrorMessage(r.error) }); return }
    if (r.value.job) show(gen, r.value.job)
    else setUi({ kind: "idle" })
  }, [request, show])

  // One registration per confirmed sale. A StrictMode/remount repeat converges server-side on the same INITIAL job.
  useEffect(() => {
    generation.current++
    setUi({ kind: "idle" })
    if (request?.mode === "auto") void register()
    // Invalidating the generation is the point: responses of the previous request/store must be discarded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++ }
  }, [request, register])

  const guarded = async <T,>(work: (gen: number) => Promise<T>) => {
    const gen = ++generation.current
    setBusy(true)
    try { return await work(gen) } finally { setBusy(false) }
  }
  const retry = (job: JobView) => guarded(async gen => {
    if (!request) return
    const r = await directPrintClient.retry(request.storeId, job.jobId)
    if (generation.current !== gen) return
    if (!r.ok) { setUi({ kind: "error", message: directPrintErrorMessage(r.error) }); return }
    show(gen, r.value.job)
  })
  const askReprint = (job: JobView | null) => guarded(async gen => {
    if (!request) return
    const r = await directPrintClient.quoteReprint(request.storeId, request.saleId)
    if (generation.current !== gen) return
    if (!r.ok) { setUi({ kind: "error", message: directPrintErrorMessage(r.error) }); return }
    setUi({ kind: "confirm-reprint", quote: r.value.quote, job })
  })
  const confirmReprint = (quote: ReprintQuote, job: JobView | null) => guarded(async gen => {
    if (!request) return
    const reasonCode = job && job.copies.some(c => c.phase === "UNCERTAIN") ? "UNCERTAIN_RESULT" : "CUSTOMER_REQUEST"
    const r = await directPrintClient.createReprint(request.storeId, { saleId: request.saleId, terminalId: request.terminalId, reasonCode, consent: quote.consent, uiContextId: newContextId() })
    if (generation.current !== gen) return
    if (!r.ok) { setUi({ kind: "error", message: directPrintErrorMessage(r.error) }); return }
    show(gen, r.value.job)
  })
  /** `consent`: the server's re-confirmation token, bound to the risk shown — never a bare "yes" (D01-A1). */
  const browserPrint = (consent: string | null, job: JobView | null) => {
    if (!request) return
    // Opened inside the click (no popup blocker); nothing is recorded if the browser refuses the window.
    const w = window.open("", "_blank")
    if (!w) { setUi({ kind: "error", message: "O navegador bloqueou a janela de impressão. Permita pop-ups para esta tela." }); return }
    return guarded(async gen => {
      // The operator closed the window (or a blocker handed back a closed one): record nothing.
      if (w.closed) { setUi({ kind: "error", message: "A janela de impressão foi fechada. Nada foi registrado." }); return }
      const r = await directPrintClient.browserFallback(request.storeId, { saleId: request.saleId, confirm: false, ...(consent ? { consent } : {}) })
      if (generation.current !== gen || !r.ok || r.value.fallback.requiresConfirmation) w.close()
      if (generation.current !== gen) return
      if (!r.ok) { setUi({ kind: "error", message: directPrintErrorMessage(r.error) }); return }
      const f = r.value.fallback
      if (f.requiresConfirmation) {
        if (!f.consent) { setUi({ kind: "error", message: directPrintErrorMessage("RISK_CONFIRMATION_REQUIRED") }); return }
        setUi({ kind: "confirm-browser", risk: f, consent: f.consent, job }); return
      }
      writeBrowserPrint(w, f.html)
      setUi({ kind: "browser-done", mark: f.mark })
    })
  }

  if (!request) return null
  const sale = `Venda ${request.numeroVenda}`
  const job = ui.kind === "job" ? ui.job : null
  const phase = job?.phase
  const failed = phase === "FAILED_BEFORE_SEND" || phase === "NOT_SENT" || phase === "CANCELLED" || ui.kind === "error"
  const uncertain = !!job?.copies.some(c => c.phase === "UNCERTAIN")
  const done = phase === "IN_PRINTER_QUEUE"
  const working = ui.kind === "registering" || phase === "QUEUED" || phase === "SENDING"
  const tone = failed || uncertain ? "alert" : "status"
  const otherTerminal = job && job.terminalId !== request.terminalId
  const title = ui.kind === "idle" ? `${sale} confirmada`
    : ui.kind === "confirm-reprint" ? "Confirmar segunda via?"
    : ui.kind === "confirm-browser" ? "Imprimir pelo navegador como SEGUNDA VIA?"
    : ui.kind === "browser-done" ? "Impressão do navegador aberta"
    : working ? "Enviando comprovante à impressora do caixa…"
    : done ? "Comprovante enviado à fila da impressora"
    : uncertain ? "Venda confirmada · resultado da impressão incerto"
    : phase === "PARTIAL" ? "Venda confirmada · vias com resultados diferentes"
    : "Venda confirmada · comprovante não enviado"
  const detail = ui.kind === "idle" ? "Escolha como emitir o comprovante."
    : ui.kind === "error" ? ui.message
    : ui.kind === "browser-done" ? `${ui.mark}. A janela do navegador não confirma que o papel saiu.`
    : ui.kind === "confirm-reprint" ? (ui.quote.possibleAdditionalCopy
      ? `Atenção: ${riskText(ui.quote)} A nova será impressa como SEGUNDA VIA.`
      : "Nenhuma via anterior foi enviada à impressora. A nova será impressa como SEGUNDA VIA.")
    : ui.kind === "confirm-browser" ? (ui.risk.possibleAdditionalCopy
      ? `Atenção: ${riskText(ui.risk)} A impressão do navegador será marcada como SEGUNDA VIA e registrada.`
      // The server also asks when no copy is exposed but this is no longer the first copy (outside its window, D01-A1).
      : "Esta venda já passou da janela da 1ª via. A impressão do navegador sai como SEGUNDA VIA e fica registrada.")
    : working ? `${sale}. O PDV continua livre para a próxima venda.`
    : done ? `${sale} · a fila do Windows aceitou o comprovante. Confira o papel na impressora.${otherTerminal ? ` (Registrado na impressora ${job?.printerName ?? "de outro caixa"}.)` : ""}`
    : uncertain ? "O comprovante pode ter saído. Confira o papel antes de pedir a segunda via. Nada será reenviado automaticamente."
    : job ? job.copies.map(c => (job.copies.length > 1 ? `Via ${c.ordinal}: ` : "") + c.label).join(" · ") : ""
  const canBrowser = ui.kind === "idle" || (ui.kind === "job" && (failed || uncertain || phase === "PARTIAL"))

  return (
    <div className="fixed right-4 top-4 z-[70] w-[min(440px,calc(100vw-2rem))] min-w-0 rounded-xl border border-border bg-card p-4 shadow-xl"
      role={tone} aria-live="polite" data-testid="pdv-direct-print-feedback" data-phase={ui.kind === "job" ? phase : ui.kind}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone === "alert" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4" /> : tone === "alert" ? <AlertTriangle className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="pdv-direct-print-detail">{detail}</p>
          {request.copies > DIRECT_MAX_COPIES && ui.kind !== "browser-done" && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="pdv-direct-print-copies-limit">
              A impressão direta emite no máximo {DIRECT_MAX_COPIES} vias; a configuração pede {request.copies}.
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-2 h-8 w-8 shrink-0" onClick={onDismiss} aria-label="Fechar aviso de impressão">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
        {ui.kind === "idle" && <Button type="button" size="sm" className="gap-2" disabled={busy} onClick={() => void register()}><Printer className="h-3.5 w-3.5" />Imprimir comprovante</Button>}
        {ui.kind === "error" && <Button type="button" size="sm" disabled={busy} onClick={() => void refresh()}>Atualizar situação</Button>}
        {job?.canRetry && <Button type="button" size="sm" className="gap-2" disabled={busy} onClick={() => void retry(job)}><Printer className="h-3.5 w-3.5" />Tentar novamente</Button>}
        {job?.canReprint && <Button type="button" size="sm" variant={done ? "default" : "outline"} disabled={busy} onClick={() => void askReprint(job)}>Imprimir 2ª via</Button>}
        {ui.kind === "confirm-reprint" && <>
          <Button type="button" size="sm" disabled={busy} onClick={() => void confirmReprint(ui.quote, ui.job)}>Confirmar 2ª via</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setUi(ui.job ? { kind: "job", job: ui.job } : { kind: "idle" })}>Cancelar</Button>
        </>}
        {ui.kind === "confirm-browser" && <>
          <Button type="button" size="sm" disabled={busy} onClick={() => void browserPrint(ui.consent, ui.job)}>Imprimir pelo navegador (2ª via)</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setUi(ui.job ? { kind: "job", job: ui.job } : { kind: "idle" })}>Cancelar</Button>
        </>}
        {canBrowser && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void browserPrint(null, job)}>Abrir impressão do navegador</Button>}
        {!working && ui.kind !== "confirm-reprint" && ui.kind !== "confirm-browser" && <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>Fechar</Button>}
      </div>
    </div>
  )
}
