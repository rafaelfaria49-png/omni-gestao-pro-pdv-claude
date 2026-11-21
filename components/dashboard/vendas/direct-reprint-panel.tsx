"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { directPrintClient, directPrintErrorMessage, isTransientDirectError, UNSUPPORTED_DIRECT_PRINT, type ReprintQuote } from "@/lib/printing/direct/client"
import { useDirectPrintAvailability } from "@/lib/printing/direct/use-direct-print"
import type { JobView } from "@/lib/printing/direct/status"
import { readSelectedTerminal } from "@/lib/pdv-terminal"

/**
 * D01-A1 — registered reprint from the sales history and the cash conference. With direct print on in the store, a
 * reprint never leaves the ledger: thermal (agent of this terminal) or browser, always marked SEGUNDA VIA, always
 * recorded, and printed only against a consent bound to the risk the operator saw (copies that may already exist).
 * Nothing is written to the server until the operator asks to reprint. Sales outside the direct-print contract, or a
 * server with the gate closed, go back to the existing flow (onLegacy).
 */
export interface DirectReprintPanelProps {
  storeId: string
  /** `Venda.id` (server row) — the ledger identity of the sale. */
  saleId: string
  numeroVenda: string
  onLegacy: () => void
}

type Risk = { possibleAdditionalCopy: boolean; uncertainCopies: number; acceptedCopies: number; browserCopies: number; queuedCopies: number }
type Ui =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; quote: ReprintQuote; notice: string | null }
  | { kind: "confirm-browser"; risk: Risk; consent: string }
  | { kind: "confirm-thermal"; quote: ReprintQuote }
  | { kind: "job"; job: JobView; stale: boolean }
  | { kind: "browser-done"; mark: string }
  | { kind: "error"; message: string }

/** Answers that mean "use the existing reprint flow": outside the contract, or direct print closed on this server. */
const LEGACY = new Set([...UNSUPPORTED_DIRECT_PRINT, "DIRECT_PRINT_DISABLED"])
/** The thermal job alone is refused (receipt too large for the agent/profile): the registered browser copy still works. */
const THERMAL_REFUSED = new Set(["COMMAND_LIMIT", "SNAPSHOT_LIMIT", "PAYLOAD_LIMIT", "THERMAL_PROFILE_UNSUPPORTED"])
const RISK_STALE = new Set(["RISK_CONFIRMATION_REQUIRED", "STALE_RISK"])
const POLL_MS = 800
const POLL_LIMIT_MS = 90_000
const newContextId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ctx-${Date.now().toString(36)}`)
const exposed = (r: Risk) => r.acceptedCopies + r.uncertainCopies + r.browserCopies
function riskText(r: Risk) {
  const main = r.possibleAdditionalCopy ? `Atenção: ${exposed(r)} via(s) desta venda pode(m) já ter saído.` : "Nenhuma via desta venda foi registrada como impressa."
  const queued = r.queuedCopies > 0 ? ` ${r.queuedCopies} via(s) ainda aguarda(m) a impressora do caixa e será(ão) substituída(s) por esta segunda via.` : ""
  return main + queued
}

export function DirectReprintPanel({ storeId, saleId, numeroVenda, onLegacy }: DirectReprintPanelProps) {
  const [ui, setUi] = useState<Ui>({ kind: "idle" })
  const [busy, setBusy] = useState(false)
  const [thermalRefused, setThermalRefused] = useState(false)
  const generation = useRef(0)
  const legacyRef = useRef(onLegacy)
  useEffect(() => { legacyRef.current = onLegacy }, [onLegacy])
  // Invalidating the generation is the point: responses of a closed dialog / another sale must be discarded.
  useEffect(() => () => { generation.current++ }, [])
  const terminalId = readSelectedTerminal(storeId)?.id ?? null
  const thermal = useDirectPrintAvailability(storeId, terminalId, true)

  const fail = (error: string) => setUi({ kind: "error", message: directPrintErrorMessage(error) })

  /** Every reprint starts from a fresh quote: the risk shown is the risk the server will check (consent is bound to it). */
  const quote = useCallback(async (notice: string | null = null) => {
    const gen = ++generation.current
    setUi({ kind: "loading" })
    const r = await directPrintClient.quoteReprint(storeId, saleId)
    if (generation.current !== gen) return
    if (!r.ok && LEGACY.has(r.error)) { legacyRef.current(); return }
    if (!r.ok) { setUi({ kind: "error", message: directPrintErrorMessage(r.error) }); return }
    setUi({ kind: "ready", quote: r.value.quote, notice })
  }, [storeId, saleId])

  /** Follows the job; a transient failure keeps the last known state, and the end of the window offers a new check. */
  const follow = useCallback(async (gen: number, job: JobView) => {
    const until = Date.now() + POLL_LIMIT_MS
    let last = job
    while (generation.current === gen && Date.now() < until) {
      await new Promise(r => setTimeout(r, POLL_MS))
      if (generation.current !== gen) return
      const r = await directPrintClient.getJob(storeId, job.jobId)
      if (generation.current !== gen) return
      if (!r.ok && isTransientDirectError(r)) continue
      if (!r.ok) { setUi({ kind: "error", message: directPrintErrorMessage(r.error) }); return }
      last = r.value.job
      setUi({ kind: "job", job: last, stale: false })
      if (last.final && !last.copies.some(c => c.phase === "UNCERTAIN")) return
    }
    if (generation.current === gen) setUi({ kind: "job", job: last, stale: true })
  }, [storeId])

  const guarded = async (work: (gen: number) => Promise<void>) => {
    const gen = ++generation.current
    setBusy(true)
    try { await work(gen) } finally { setBusy(false) }
  }
  const showJob = (gen: number, job: JobView) => {
    setUi({ kind: "job", job, stale: false })
    if (!job.final || job.copies.some(c => c.phase === "UNCERTAIN")) void follow(gen, job)
  }
  /** With a possibly printed or uncertain copy, the thermal reprint needs a second, explicit click (never automatic). */
  const askThermal = (q: ReprintQuote) => {
    if (q.possibleAdditionalCopy || q.uncertainCopies > 0) setUi({ kind: "confirm-thermal", quote: q })
    else void printThermal(q)
  }
  const printThermal = (q: ReprintQuote) => guarded(async gen => {
    if (!terminalId) return
    const reasonCode = q.uncertainCopies > 0 ? "UNCERTAIN_RESULT" : "CUSTOMER_REQUEST"
    const r = await directPrintClient.createReprint(storeId, { saleId, terminalId, reasonCode, consent: q.consent, uiContextId: newContextId() })
    if (generation.current !== gen) return
    if (!r.ok && THERMAL_REFUSED.has(r.error)) {
      setThermalRefused(true)
      void quote("A impressora do caixa não aceita este comprovante. Use a 2ª via pelo navegador, que também fica registrada.")
      return
    }
    if (!r.ok && RISK_STALE.has(r.error)) { void quote("A consulta expirou ou as vias mudaram. Confira a situação atualizada."); return }
    if (!r.ok) { fail(r.error); return }
    showJob(gen, r.value.job)
  })
  const retry = (job: JobView) => guarded(async gen => {
    const r = await directPrintClient.retry(storeId, job.jobId)
    if (generation.current !== gen) return
    if (!r.ok) { fail(r.error); return }
    showJob(gen, r.value.job)
  })
  const recheck = (job: JobView) => guarded(async gen => {
    const r = await directPrintClient.getJob(storeId, job.jobId)
    if (generation.current !== gen) return
    if (!r.ok) { fail(r.error); return }
    showJob(gen, r.value.job)
  })
  /**
   * Browser copy, recorded by the server and marked SEGUNDA VIA, sent with the consent of the risk the operator saw. If
   * that risk is no longer current (another tab or terminal printed, or the consent expired) the server prints nothing
   * and returns the current risk with a new consent to confirm.
   */
  const printBrowser = (consent: string) => {
    // Opened inside the click (no popup blocker); nothing is recorded if the browser refuses the window.
    const w = window.open("", "_blank")
    if (!w) { setUi({ kind: "error", message: "O navegador bloqueou a janela de impressão. Permita pop-ups para esta tela." }); return }
    return guarded(async gen => {
      if (w.closed) { setUi({ kind: "error", message: "A janela de impressão foi fechada. Nada foi registrado." }); return }
      const r = await directPrintClient.browserFallback(storeId, { saleId, confirm: false, origin: "REPRINT", consent })
      if (generation.current !== gen || !r.ok || r.value.fallback.requiresConfirmation) w.close()
      if (generation.current !== gen) return
      if (!r.ok) { fail(r.error); return }
      const f = r.value.fallback
      if (f.requiresConfirmation) {
        if (!f.consent) { fail("RISK_CONFIRMATION_REQUIRED"); return }
        setUi({ kind: "confirm-browser", risk: f, consent: f.consent }); return
      }
      w.document.open(); w.document.write(f.html); w.document.close()
      w.focus(); w.print()
      setUi({ kind: "browser-done", mark: f.mark })
    })
  }

  const job = ui.kind === "job" ? ui.job : null
  const uncertain = !!job?.copies.some(c => c.phase === "UNCERTAIN")
  const working = ui.kind === "loading" || job?.phase === "QUEUED" || job?.phase === "SENDING"
  const failed = ui.kind === "error" || job?.phase === "FAILED_BEFORE_SEND" || job?.phase === "NOT_SENT" || job?.phase === "CANCELLED"
  const alert = failed || uncertain || ui.kind === "confirm-browser" || ui.kind === "confirm-thermal" || (ui.kind === "ready" && (ui.quote.possibleAdditionalCopy || !!ui.notice))
  const title = ui.kind === "idle" ? "Reimpressão registrada"
    : ui.kind === "loading" ? "Consultando as vias desta venda…"
    : ui.kind === "ready" ? "Reimprimir como SEGUNDA VIA"
    : ui.kind === "confirm-browser" ? "Confirme de novo: a situação das vias mudou"
    : ui.kind === "confirm-thermal" ? "Confirmar 2ª via na impressora do caixa?"
    : ui.kind === "browser-done" ? "Impressão do navegador aberta"
    : ui.kind === "error" ? "Não foi possível reimprimir"
    : working && ui.stale ? "A segunda via ainda não teve resposta da impressora do caixa"
    : working ? "Enviando a segunda via à impressora do caixa…"
    : job?.phase === "IN_PRINTER_QUEUE" ? "Segunda via enviada à fila da impressora"
    : uncertain ? "Resultado da segunda via incerto"
    : "Segunda via não enviada"
  const detail = ui.kind === "idle" ? "Com a impressão direta ligada, a reimpressão desta venda sai marcada SEGUNDA VIA e fica registrada."
    : ui.kind === "ready" ? `${ui.notice ? ui.notice + " " : ""}${riskText(ui.quote)} A reimpressão sai marcada SEGUNDA VIA e fica registrada.`
    : ui.kind === "confirm-browser" ? `${riskText(ui.risk)} Situação conferida agora no servidor. Confirme para imprimir, marcada SEGUNDA VIA.`
    : ui.kind === "confirm-thermal" ? `${riskText(ui.quote)} Confira o papel antes. A nova via sai marcada SEGUNDA VIA e nada é reenviado automaticamente.`
    : ui.kind === "browser-done" ? `${ui.mark}. A janela do navegador não confirma que o papel saiu.`
    : ui.kind === "error" ? ui.message
    : ui.kind === "loading" ? `Venda ${numeroVenda}`
    : working && ui.stale ? "Nada foi reenviado. Confira a impressora do caixa e consulte de novo."
    : job?.phase === "IN_PRINTER_QUEUE" ? "A fila do Windows aceitou a segunda via. Confira o papel na impressora."
    : uncertain ? "A segunda via pode ter saído. Confira o papel antes de pedir outra. Nada será reenviado automaticamente."
    : job ? job.copies.map(c => (job.copies.length > 1 ? `Via ${c.ordinal}: ` : "") + c.label).join(" · ") : ""
  const canThermal = thermal.available && !thermalRefused

  return (
    <div className="min-w-0 space-y-3" data-testid="direct-reprint-panel" data-state={ui.kind === "job" ? job?.phase : ui.kind}>
      <div role={alert ? "alert" : "status"} aria-live={alert ? "assertive" : "polite"}
        className={`flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-xs ${alert ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-foreground"}`}>
        {working && !(ui.kind === "job" && ui.stale) ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : alert ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          : ui.kind === "browser-done" || job?.phase === "IN_PRINTER_QUEUE" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Printer className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5" data-testid="direct-reprint-detail">{detail}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
        {ui.kind === "idle" && (
          <Button type="button" className="h-10 flex-1 gap-2 text-sm" onClick={() => void quote()}>
            <Printer className="h-4 w-4" />Reimprimir como 2ª via
          </Button>
        )}
        {ui.kind === "ready" && canThermal && (
          <Button type="button" className="h-10 flex-1 gap-2 text-sm" disabled={busy} onClick={() => askThermal(ui.quote)}>
            <Printer className="h-4 w-4" />Imprimir 2ª via na impressora do caixa
          </Button>
        )}
        {ui.kind === "ready" && (
          <Button type="button" variant={canThermal ? "outline" : "default"} className="h-10 flex-1 gap-2 text-sm" disabled={busy}
            onClick={() => void printBrowser(ui.quote.consent)}>
            <Printer className="h-4 w-4" />Imprimir 2ª via pelo navegador
          </Button>
        )}
        {ui.kind === "confirm-thermal" && <>
          <Button type="button" className="h-10 flex-1 text-sm" disabled={busy} onClick={() => void printThermal(ui.quote)}>Confirmar 2ª via na impressora do caixa</Button>
          <Button type="button" variant="outline" className="h-10 flex-1 text-sm" disabled={busy} onClick={() => setUi({ kind: "ready", quote: ui.quote, notice: null })}>Cancelar</Button>
        </>}
        {ui.kind === "confirm-browser" && <>
          <Button type="button" className="h-10 flex-1 text-sm" disabled={busy} onClick={() => void printBrowser(ui.consent)}>Confirmar 2ª via pelo navegador</Button>
          <Button type="button" variant="outline" className="h-10 flex-1 text-sm" disabled={busy} onClick={() => setUi({ kind: "idle" })}>Cancelar</Button>
        </>}
        {job?.canRetry && <Button type="button" className="h-10 flex-1 gap-2 text-sm" disabled={busy} onClick={() => void retry(job)}>Tentar novamente</Button>}
        {job && ui.kind === "job" && working && ui.stale && (
          <Button type="button" variant="outline" className="h-10 flex-1 text-sm" disabled={busy} onClick={() => void recheck(job)}>Conferir de novo</Button>
        )}
        {(ui.kind === "error" || ui.kind === "browser-done" || (job && !working)) && (
          <Button type="button" variant="outline" className="h-10 flex-1 text-sm" disabled={busy} onClick={() => void quote()}>
            {ui.kind === "error" ? "Tentar de novo" : "Nova reimpressão"}
          </Button>
        )}
      </div>
    </div>
  )
}
