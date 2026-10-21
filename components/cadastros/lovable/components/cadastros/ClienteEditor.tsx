"use client"

import React, { useEffect, useId, useRef, useState } from "react"
import { Download, Loader2, Mic, MicOff, RefreshCw, Square, WandSparkles, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ClienteDTO } from "@/app/actions/cadastros"
import { interpretarClienteTextoLivre, salvarClienteRevisado } from "@/app/actions/cliente-texto-livre"
import { aplicarSugestaoCliente, validateClientEditor, type ClientEditorValues } from "@/lib/cadastros/natural-text/cliente"
import { CLIENT_TEXT_FIELDS, CLIENT_TEXT_LABELS, CLIENT_TEXT_LIMIT, type ClientTextField, type ClientTextSuggestion } from "@/lib/cadastros/natural-text/cliente-types"
import { Input, Select, Textarea } from "./ui-kit"
import {
  CLIENT_VOICE_DIAGNOSTIC_TEXT, CLIENT_VOICE_INITIAL, CLIENT_VOICE_POLICY, CLIENT_VOICE_SUPPORT_MESSAGES, clientVoiceStage, formatarTranscricaoCliente,
  juntarTranscricaoCliente, reduceClientVoiceCapture, type ClientCaptureSource, type ClientVoiceSnapshot,
} from "@/lib/cadastros/voice-capture/cliente"
import { checkLocalVoiceSupport, installLocalVoicePack, localVoicePreflight, startLocalVoiceCapture, type LocalVoiceSupport } from "@/lib/cadastros/voice-capture/local"
import { classifyVoiceDiagnostic, runNativeLocalProbe, type VoiceDiagnostic } from "@/lib/cadastros/voice-capture/diagnostic"
import type { VoiceBrowserSession } from "@/lib/cadastros/voice-capture/browser"
import type { VoiceCaptureEvent } from "@/lib/cadastros/voice-capture/types"

type Props = { storeId: string; editing: ClienteDTO | null; onClose: () => void; onSaved: () => void | Promise<void> }
type VoiceSupport = LocalVoiceSupport | { status: "checking" } | { status: "disabled" }
const empty = (value?: string) => value === "—" ? "" : value ?? ""
const button = "min-h-10 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
// 44 px touch target for the controls that live inside the description field.
const fieldButton = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
const seconds = (ms: number) => `0:${String(Math.min(59, Math.floor(ms / 1000))).padStart(2, "0")}`
const supportQuery = { lang: CLIENT_VOICE_POLICY.lang, timeoutMs: CLIENT_VOICE_POLICY.availabilityTimeoutMs }
const ms = (value: number | undefined) => value === undefined ? "—" : `${value} ms`
const END_LABEL = { "engine-end": "encerrado pelo navegador", "grace-timeout": "sem resposta do motor", cancelled: "cancelado", "start-failed": "falha ao iniciar" } as const
/** Etapas, contagens e tempos apenas — nenhum texto ou áudio. */
function diagnosticDetails(d: VoiceDiagnostic) {
  return `qualidade ${d.quality} · microfone ${ms(d.steps.audiostart)} · som ${ms(d.steps.soundstart)} · fala ${ms(d.steps.speechstart)} · `
    + `resultados ${d.counts.results} (provisórios ${d.counts.interim}, finais ${d.counts.final}) · erro ${d.error ?? "nenhum"} · `
    + `${d.endReason ? END_LABEL[d.endReason] : "em andamento"} em ${d.durationMs} ms`
}

export function ClienteEditorDialog({ open, ...props }: Props & { open: boolean }) {
  const descriptionId = useId()
  return <Dialog open={open} onOpenChange={(next) => { if (!next) props.onClose() }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" aria-describedby={descriptionId}>
      <DialogHeader>
        <DialogTitle>{props.editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        <DialogDescription><span id={descriptionId}>Colete apenas os dados necessários ao atendimento. Revise antes de salvar.</span></DialogDescription>
      </DialogHeader>
      {open && <ClienteEditor key={`${props.storeId}:${props.editing?.id ?? "new"}`} {...props} />}
    </DialogContent>
  </Dialog>
}

/** This is the real HUB editor. Captures and suggestions live only in this mount. */
export function ClienteEditor({ storeId, editing, onClose, onSaved }: Props) {
  const id = useId()
  const [values, setValues] = useState<ClientEditorValues>(() => ({
    nome: empty(editing?.nome), telefone: empty(editing?.telefone), documento: empty(editing?.documento),
    email: empty(editing?.email), cidade: empty(editing?.cidade), endereco: empty(editing?.endereco), uf: empty(editing?.uf),
    tipo: editing?.tipo ?? "PF", tags: editing?.tags?.join(", ") ?? "", observacoes: empty(editing?.observacoes), active: editing?.status !== "Inativo",
  }))
  const [text, setText] = useState("")
  const [suggestion, setSuggestion] = useState<ClientTextSuggestion | null>(null)
  const [revised, setRevised] = useState<Set<ClientTextField>>(new Set())
  const [origins, setOrigins] = useState<Partial<Record<ClientTextField, string>>>({})
  const [interpreting, setInterpreting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [tipoEdited, setTipoEdited] = useState(false)
  const [message, setMessage] = useState("")
  const [errors, setErrors] = useState<Partial<Record<keyof ClientEditorValues, string>>>({})
  const request = useRef(0)
  const mounted = useRef(false)
  const submitting = useRef(false)
  // Voice: local-only engine, temporary transcript in this mount only.
  const [voice, setVoice] = useState<ClientVoiceSnapshot>(CLIENT_VOICE_INITIAL)
  const [diag, setDiag] = useState<VoiceDiagnostic | null>(null)
  const [probe, setProbe] = useState<{ running: boolean; result: VoiceDiagnostic | null }>({ running: false, result: null })
  const probeHandle = useRef<{ cancel: () => void } | null>(null)
  const probeSerial = useRef(0)
  const [support, setSupport] = useState<VoiceSupport>(() => CLIENT_VOICE_POLICY.enabled ? { status: "checking" } : { status: "disabled" })
  const [installing, setInstalling] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [autoStopped, setAutoStopped] = useState(false)
  const [source, setSource] = useState<ClientCaptureSource>("text")
  const voiceSession = useRef<VoiceBrowserSession | null>(null)
  const voiceSerial = useRef(0)
  const supportSerial = useRef(0)
  const voiceStartedAt = useRef(0)
  const textBeforeVoice = useRef("")
  const voiceActive = voice.status === "listening" || voice.status === "transcribing"
  // While listening the field shows only text the browser confirmed; provisional text
  // is shown apart, labelled as such, and never merged without an explicit click.
  const displayedText = voiceActive
    ? juntarTranscricaoCliente(textBeforeVoice.current, voice.sessionTranscript, CLIENT_TEXT_LIMIT)
    : text
  const diagCode = diag?.endReason ? classifyVoiceDiagnostic(diag) : null
  const voiceMessage = support.status === "available" ? voice.message
    : support.status === "unavailable" ? CLIENT_VOICE_SUPPORT_MESSAGES[support.reason] : CLIENT_VOICE_SUPPORT_MESSAGES[support.status]
  const extractedLabel = source === "voice" ? "Extraído da transcrição por voz" : "Extraído do texto"
  useEffect(() => {
    const lifecycle = mounted, pending = request, session = voiceSession, sessions = voiceSerial, supports = supportSerial
    const probing = probeHandle, probes = probeSerial
    lifecycle.current = true
    return () => {
      lifecycle.current = false; pending.current++
      // Close, store switch, cancel and navigation unmount the editor: stop the engine silently.
      sessions.current++; supports.current++; probes.current++
      session.current?.dispose(); session.current = null
      probing.current?.cancel(); probing.current = null
    }
  }, [])
  useEffect(() => {
    if (editing || !CLIENT_VOICE_POLICY.enabled) return
    const serial = ++supportSerial.current
    const refused = localVoicePreflight(window)
    if (refused) { setSupport(refused); return }
    void checkLocalVoiceSupport(window, supportQuery).then((next) => {
      if (!mounted.current || serial !== supportSerial.current) return
      setSupport(next)
      setVoice((v) => reduceClientVoiceCapture(v, { type: "capability", available: next.status === "available" }))
    })
  }, [editing])
  useEffect(() => {
    // Hidden tab or leaving the page never keeps the microphone open.
    const session = voiceSession, probing = probeHandle
    const onHide = (event: Event) => {
      if (event.type === "visibilitychange" && document.visibilityState !== "hidden") return
      const active = session.current
      session.current = null
      active?.cancel()
      probing.current?.cancel()
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", onHide)
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onHide) }
  }, [])
  useEffect(() => {
    if (voice.status !== "listening" && voice.status !== "transcribing") voiceSession.current = null
    if (voice.status !== "listening") return
    const timer = setInterval(() => setElapsedMs(Date.now() - voiceStartedAt.current), 250)
    return () => clearInterval(timer)
  }, [voice.status])
  useEffect(() => {
    // The transcript becomes editable text once; the temporary copy is dropped.
    if (voice.status !== "completed" || !voice.sessionTranscript) return
    setText(juntarTranscricaoCliente(textBeforeVoice.current, formatarTranscricaoCliente(voice.sessionTranscript), CLIENT_TEXT_LIMIT))
    setSource("voice")
    setVoice((v) => ({ ...v, sessionTranscript: "", interim: "" }))
  }, [voice.status, voice.sessionTranscript])

  function refreshSupport() {
    if (editing || !CLIENT_VOICE_POLICY.enabled) return
    const serial = ++supportSerial.current
    setSupport({ status: "checking" })
    void checkLocalVoiceSupport(window, supportQuery).then((next) => {
      if (!mounted.current || serial !== supportSerial.current) return
      setSupport(next)
      setVoice((v) => reduceClientVoiceCapture(v, { type: "capability", available: next.status === "available" }))
    })
  }
  function cancelVoice() {
    const active = voiceSession.current
    voiceSession.current = null
    active?.cancel()
  }
  function startVoice() {
    if (support.status !== "available" || voiceSession.current || voiceActive || probe.running || interpreting || saving) return
    const serial = ++voiceSerial.current
    request.current++
    setInterpreting(false)
    setSuggestion(null)
    setRevised(new Set())
    setMessage("")
    setAutoStopped(false)
    setElapsedMs(0)
    setDiag(null)
    textBeforeVoice.current = text
    voiceStartedAt.current = Date.now()
    const current = () => mounted.current && serial === voiceSerial.current
    const emit = (event: VoiceCaptureEvent) => {
      if (!current()) return
      setVoice((v) => reduceClientVoiceCapture(v, event))
      // A missing local pack surfaces as one of these errors: re-check, never go remote.
      if (event.type === "error" && (event.code === "language-not-supported" || event.code === "service-not-allowed")) refreshSupport()
    }
    emit({ type: "start" })
    const session = startLocalVoiceCapture({
      win: window, emit, lang: CLIENT_VOICE_POLICY.lang, quality: support.quality,
      maxDurationMs: CLIENT_VOICE_POLICY.maxDurationMs, maxChars: CLIENT_VOICE_POLICY.maxChars, endGraceMs: CLIENT_VOICE_POLICY.endGraceMs,
      onAutoStop: () => { if (current()) setAutoStopped(true) },
      onDiagnostic: (snapshot) => { if (current()) setDiag(snapshot) },
    })
    if (!session.ok) {
      if (session.reason === "unavailable") {
        // The engine refused processLocally: never retry without it.
        emit({ type: "capability", available: false })
        setSupport({ status: "unavailable", reason: "no-local-api" })
      } else emit({ type: "error", code: "start-failed" })
      voiceSerial.current++
      return
    }
    voiceSession.current = session
  }
  function installVoice() {
    if (support.status !== "downloadable" || installing) return
    setInstalling(true)
    // Called synchronously inside the click: browsers require user activation.
    void installLocalVoicePack(window, CLIENT_VOICE_POLICY.lang, support.quality).then((ok) => {
      if (!mounted.current) return
      setInstalling(false)
      if (!ok) setMessage("O navegador não instalou o pacote local pt-BR. Continue por texto.")
      refreshSupport()
    })
  }
  /** Explicit, reviewable recovery: provisional text only enters the editable description. */
  function applyProvisional() {
    if (voiceActive || !voice.provisional) return
    request.current++
    setSuggestion(null)
    setText((current) => juntarTranscricaoCliente(current, formatarTranscricaoCliente(voice.provisional), CLIENT_TEXT_LIMIT))
    setSource("voice")
    setVoice((v) => ({ ...v, provisional: "", message: "Trecho provisório levado ao campo. Revise antes de interpretar." }))
  }
  function dropProvisional() {
    setVoice((v) => ({ ...v, provisional: "" }))
  }
  /** Minimal native call in the same browser, independent of the editor adapter. */
  function runBrowserProbe() {
    if (support.status !== "available" || probe.running || voiceActive || voiceSession.current || saving) return
    const serial = ++probeSerial.current
    const handle = runNativeLocalProbe({
      win: window, lang: CLIENT_VOICE_POLICY.lang, quality: support.quality,
      listenMs: CLIENT_VOICE_POLICY.probeListenMs, endGraceMs: CLIENT_VOICE_POLICY.endGraceMs,
    })
    if (!handle) { setMessage("O teste mínimo não está disponível neste navegador."); return }
    probeHandle.current = handle
    setProbe({ running: true, result: null })
    void handle.done.then((result) => {
      if (!mounted.current || serial !== probeSerial.current) return
      probeHandle.current = null
      setProbe({ running: false, result })
    })
  }

  function discard() {
    request.current++
    cancelVoice()
    setVoice((v) => reduceClientVoiceCapture(v, { type: "reset" }))
    setInterpreting(false)
    setSuggestion(null)
    setText("")
    setSource("text")
    setAutoStopped(false)
    setDiag(null)
    setRevised(new Set())
    setMessage("")
  }
  function change<K extends keyof ClientEditorValues>(field: K, value: ClientEditorValues[K]) {
    if (field === "tipo") setTipoEdited(true)
    setValues((v) => ({ ...v, [field]: value }))
    setConfirmed(false)
    setErrors((e) => ({ ...e, [field]: undefined }))
    if (CLIENT_TEXT_FIELDS.includes(field as ClientTextField)) setOrigins((o) => ({ ...o, [field]: "Editado pelo operador" }))
  }
  async function interpret() {
    const serial = ++request.current
    setInterpreting(true)
    setSuggestion(null)
    setMessage("")
    setRevised(new Set())
    try {
      const response = await interpretarClienteTextoLivre(storeId, text, source)
      if (!mounted.current || serial !== request.current) return
      if (response.ok) setSuggestion(response.sugestao)
      else setMessage(response.message)
    } catch { if (mounted.current && serial === request.current) setMessage("Não foi possível interpretar. Verifique o acesso à loja e tente novamente.") }
    finally { if (mounted.current && serial === request.current) setInterpreting(false) }
  }
  function apply() {
    if (!suggestion) return
    const next = aplicarSugestaoCliente(suggestion, values, { preservarTipo: tipoEdited })
    const nextOrigins = { ...origins }
    for (const field of CLIENT_TEXT_FIELDS) if (next[field] !== values[field]) nextOrigins[field] = revised.has(field) ? "Revisado pelo operador" : extractedLabel
    setValues(next)
    setOrigins(nextOrigins)
    setConfirmed(false)
    discard()
    setMessage("Sugestões aplicadas aos campos vazios. Revise e confirme os dados abaixo.")
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || interpreting || voiceActive || !confirmed) return
    const nextErrors = validateClientEditor(values, editing ? {
      tipo: editing.tipo, documento: empty(editing.documento), telefone: empty(editing.telefone), email: empty(editing.email),
    } : undefined)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) { setMessage("Corrija os campos indicados antes de salvar."); return }
    submitting.current = true
    request.current++
    setSaving(true)
    setMessage("")
    try {
      const result = await salvarClienteRevisado(storeId, editing?.id ?? null, values, confirmed)
      if (!mounted.current) return
      if (!result.ok) {
        setMessage(result.message)
        if ("errors" in result && result.errors) setErrors(result.errors)
        setConfirmed(false)
        return
      }
      discard()
      await onSaved()
    } catch { if (mounted.current) setMessage("Não foi possível salvar. Verifique o acesso à loja e tente novamente.") }
    finally { submitting.current = false; if (mounted.current) setSaving(false) }
  }

  return <form onSubmit={save} noValidate autoComplete="off" className="min-w-0 space-y-5">
    {!editing && <section aria-label="Cadastro assistido por texto ou voz" className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><WandSparkles aria-hidden="true" className="h-4 w-4 text-primary" />Preencher por descrição</div>
      <label htmlFor={`${id}-text`} className="block text-sm">Descreva o novo cliente</label>
      {/* The microphone lives inside the description field; it only feeds this text. */}
      <div className="relative min-w-0" data-voice-field={voice.status}>
        <Textarea id={`${id}-text`} value={displayedText} maxLength={CLIENT_TEXT_LIMIT} rows={4} disabled={saving} readOnly={voiceActive}
          placeholder="Novo cliente…, telefone…, mora em…; Endereço:…; Cidade:…" aria-describedby={`${id}-capture-help ${id}-voice-status`}
          className={`pr-16 ${voiceActive ? (voice.provisional ? "pb-28" : "pb-20") : ""}`}
          onChange={(e) => {
            if (voiceActive) return
            request.current++; setInterpreting(false); setSuggestion(null); setText(e.target.value); setMessage("")
            if (!e.target.value.trim()) setSource("text")
          }} />
        {voiceActive ? <div role="group" aria-label="Controles do ditado" className="absolute inset-x-2 bottom-2 min-w-0 space-y-1 rounded-md border border-border bg-background/95 p-1.5">
          {voice.provisional && <div className="min-w-0 px-1" title="Texto provisório, ainda não confirmado pelo navegador">
            <p className="text-[11px] font-medium text-muted-foreground">Provisório · ainda não confirmado</p>
            <p className="min-w-0 truncate text-xs italic text-foreground">{voice.provisional}</p>
          </div>}
          <div className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="ml-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-destructive" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-xs font-medium" aria-live="polite">{voice.status === "listening" ? clientVoiceStage(diag) : "Finalizando no dispositivo…"}</span>
              <span className="block text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">{seconds(elapsedMs)}/{seconds(CLIENT_VOICE_POLICY.maxDurationMs)}</span>
            </span>
            <button type="button" className={fieldButton} aria-label="Parar ditado" title="Parar ditado" disabled={voice.status !== "listening"} onClick={() => voiceSession.current?.stop()}><Square aria-hidden="true" className="h-4 w-4" /></button>
            <button type="button" className={fieldButton} aria-label="Cancelar ditado" title="Cancelar ditado" onClick={cancelVoice}><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        </div> : <div className="absolute bottom-2 right-2">
          {support.status === "downloadable" ? <button type="button" className={fieldButton} aria-label={installing ? "Instalando voz local…" : "Instalar voz local pt-BR"} title="Instalar voz local pt-BR" disabled={installing || saving} onClick={installVoice} aria-describedby={`${id}-voice-status`}>
            {installing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="h-4 w-4" />}
          </button> : support.status === "downloading" ? <button type="button" className={fieldButton} aria-label="Verificar voz local" title="Verificar voz local" disabled={saving} onClick={refreshSupport} aria-describedby={`${id}-voice-status`}>
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </button> : <button type="button" className={`${fieldButton} ${support.status === "available" ? "border-primary text-primary" : ""}`}
            aria-label={support.status === "checking" ? "Verificando voz local…" : support.status === "available" ? "Ditar por voz" : "Voz indisponível"}
            title={support.status === "available" ? "Ditar por voz (reconhecimento no dispositivo)" : "Voz indisponível"}
            disabled={support.status !== "available" || interpreting || saving || probe.running} onClick={startVoice} data-voice-status={voice.status} aria-describedby={`${id}-voice-status`}>
            {support.status === "checking" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : support.status === "available" ? <Mic aria-hidden="true" className="h-5 w-5" /> : <MicOff aria-hidden="true" className="h-4 w-4" />}
          </button>}
        </div>}
      </div>
      <p id={`${id}-capture-help`} className="text-xs text-muted-foreground">Extração determinística, sem enviar o texto a provedores externos de IA. A sugestão é temporária e não salva o cadastro.</p>
      {!voiceActive && voice.provisional && <div className="min-w-0 space-y-2 rounded-md border border-border bg-background p-2 text-xs" role="group" aria-label="Trecho provisório">
        <p className="min-w-0 break-words"><span className="font-medium">Trecho provisório, não confirmado pelo navegador:</span> <span className="italic">{voice.provisional}</span></p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={saving} onClick={applyProvisional}>Usar trecho provisório</button>
          <button type="button" className={button} disabled={saving} onClick={dropProvisional}>Descartar trecho</button>
        </div>
      </div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!text.trim() || interpreting || saving || voiceActive} onClick={() => void interpret()}>{interpreting ? "Interpretando…" : "Interpretar texto"}</button>
        {(text || suggestion || interpreting) && !voiceActive && <button type="button" className={button} disabled={saving} onClick={discard}>Descartar sugestões</button>}
      </div>
      <p id={`${id}-voice-status`} aria-live="polite" className="text-xs text-muted-foreground">{voiceMessage}{autoStopped && voice.status === "completed" ? " Limite do ditado atingido." : ""}</p>
      {!voiceActive && diagCode && diagCode !== "FINAL_RECEIVED" && diagCode !== "CANCELLED" && <p className="text-xs">Diagnóstico do ditado: {CLIENT_VOICE_DIAGNOSTIC_TEXT[diagCode]}</p>}
      {(support.status === "available" || support.status === "downloadable") && <p className="text-xs text-muted-foreground">Voz processada no próprio dispositivo (pt-BR), sem envio de áudio. O OmniGestão não grava áudio nem transcrição; cada ditado dura até {CLIENT_VOICE_POLICY.maxDurationMs / 1000} s e só vira cadastro depois da sua revisão e confirmação.</p>}
      {support.status === "available" && <details className="min-w-0 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Diagnóstico da voz</summary>
        <div className="mt-2 min-w-0 space-y-2">
          <p>Mostra só etapas, contagens e tempos. Nenhum áudio ou texto é guardado, registrado ou enviado.</p>
          {diag?.endReason && <p className="break-words">Último ditado: {diagnosticDetails(diag)}</p>}
          <button type="button" className={button} disabled={probe.running || voiceActive || saving} onClick={runBrowserProbe}>
            {probe.running ? "Testando o navegador… fale uma frase curta" : `Testar o navegador (${CLIENT_VOICE_POLICY.probeListenMs / 1000} s)`}
          </button>
          {probe.result && <p className="break-words text-foreground">Teste mínimo do navegador: {CLIENT_VOICE_DIAGNOSTIC_TEXT[classifyVoiceDiagnostic(probe.result)]} ({diagnosticDetails(probe.result)})</p>}
        </div>
      </details>}
      {suggestion && <div className="space-y-3 border-t border-border pt-3" aria-label="Revisar sugestões">
        <p className="text-sm font-medium">Revise ou corrija cada sugestão</p>
        <p className="text-xs text-muted-foreground">Campos já preenchidos no formulário serão preservados. Campos ambíguos só serão aplicados se você os corrigir.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CLIENT_TEXT_FIELDS.map((field) => {
            const proposed = suggestion.campos[field]
            return <div key={field} className="min-w-0 space-y-1">
              <label htmlFor={`${id}-suggest-${field}`} className="block text-sm">Sugestão: {CLIENT_TEXT_LABELS[field]}</label>
              <Input id={`${id}-suggest-${field}`} value={proposed.valor ?? ""} onChange={(e) => {
                const value = e.target.value
                setSuggestion((s) => s ? { ...s, campos: { ...s.campos, [field]: { valor: value || null, estado: value ? "extraido" : "ausente" } } } : s)
                setRevised((r) => new Set(r).add(field))
              }} />
              <p className="text-xs text-muted-foreground">{revised.has(field) ? "Revisado pelo operador" : proposed.estado === "extraido" ? extractedLabel : proposed.estado === "ausente" ? "Ausente: revisão manual" : "Ambíguo: requer correção"}{proposed.aviso ? ` — ${proposed.aviso}` : ""}</p>
            </div>
          })}
        </div>
        <button type="button" className={button} onClick={apply}>Aplicar aos campos vazios</button>
      </div>}
    </section>}
    <fieldset disabled={saving} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      <legend className="mb-3 text-sm font-semibold">Dados do cliente</legend>
      {CLIENT_TEXT_FIELDS.map((field) => <div key={field} className={`min-w-0 space-y-1.5 ${field === "nome" || field === "endereco" ? "sm:col-span-2" : ""}`}>
        <label htmlFor={`${id}-${field}`} className="block text-sm font-medium">{CLIENT_TEXT_LABELS[field]}{field === "nome" ? " *" : ""}</label>
        <Input id={`${id}-${field}`} value={values[field]} required={field === "nome"} type={field === "email" ? "email" : "text"} inputMode={field === "telefone" ? "tel" : field === "documento" ? "numeric" : undefined}
          aria-invalid={!!errors[field]} aria-describedby={errors[field] || origins[field] ? `${id}-${field}-help` : undefined} onChange={(e) => change(field, e.target.value)} />
        {(errors[field] || origins[field]) && <p id={`${id}-${field}-help`} className={`text-xs ${errors[field] ? "text-destructive" : "text-muted-foreground"}`}>{errors[field] ?? origins[field]}</p>}
      </div>)}
      <div className="space-y-1.5"><label htmlFor={`${id}-tipo`} className="block text-sm font-medium">Tipo</label><Select id={`${id}-tipo`} value={values.tipo} onChange={(e) => change("tipo", e.target.value as "PF" | "PJ")}><option value="PF">PF — Pessoa Física</option><option value="PJ">PJ — Pessoa Jurídica</option></Select></div>
      <div className="space-y-1.5"><label htmlFor={`${id}-active`} className="block text-sm font-medium">Status</label><Select id={`${id}-active`} value={values.active ? "Ativo" : "Inativo"} onChange={(e) => change("active", e.target.value === "Ativo")}><option>Ativo</option><option>Inativo</option></Select></div>
      <div className="space-y-1.5 sm:col-span-2"><label htmlFor={`${id}-tags`} className="block text-sm font-medium">Tags</label><Input id={`${id}-tags`} value={values.tags} maxLength={500} onChange={(e) => change("tags", e.target.value)} /></div>
      <div className="space-y-1.5 sm:col-span-2"><label htmlFor={`${id}-notes`} className="block text-sm font-medium">Observações</label><Textarea id={`${id}-notes`} value={values.observacoes} maxLength={1000} rows={3} onChange={(e) => change("observacoes", e.target.value)} /></div>
    </fieldset>
    <p className="text-xs text-muted-foreground">Este formulário não registra consentimento. Solicitações de acesso, correção ou exclusão dependem de verificação de identidade, autorização e análise de retenção.</p>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving || interpreting} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 shrink-0" />Revisei os dados e confirmo o cadastro.</label>
    {message && <p role="status" aria-live="polite" className="text-sm">{message}</p>}
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
      <button type="button" className={button} onClick={() => { discard(); onClose() }}>Cancelar</button>
      <button type="submit" className={`${button} bg-primary font-medium text-primary-foreground`} disabled={saving || interpreting || voiceActive || !confirmed}>{saving ? "Salvando…" : "Salvar cliente"}</button>
    </div>
  </form>
}
