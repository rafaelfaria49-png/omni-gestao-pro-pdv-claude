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
  CLIENT_VOICE_INITIAL, CLIENT_VOICE_POLICY, CLIENT_VOICE_SUPPORT_MESSAGES, formatarTranscricaoCliente, juntarTranscricaoCliente,
  reduceClientVoiceCapture, type ClientCaptureSource,
} from "@/lib/cadastros/voice-capture/cliente"
import { checkLocalVoiceSupport, installLocalVoicePack, localVoicePreflight, startLocalVoiceCapture, type LocalVoiceSupport } from "@/lib/cadastros/voice-capture/local"
import type { VoiceBrowserSession } from "@/lib/cadastros/voice-capture/browser"
import type { VoiceCaptureEvent, VoiceCaptureSnapshot } from "@/lib/cadastros/voice-capture/types"

type Props = { storeId: string; editing: ClienteDTO | null; onClose: () => void; onSaved: () => void | Promise<void> }
type VoiceSupport = LocalVoiceSupport | { status: "checking" } | { status: "disabled" }
const empty = (value?: string) => value === "—" ? "" : value ?? ""
const button = "min-h-10 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
const seconds = (ms: number) => `0:${String(Math.min(59, Math.floor(ms / 1000))).padStart(2, "0")}`
const supportQuery = { lang: CLIENT_VOICE_POLICY.lang, timeoutMs: CLIENT_VOICE_POLICY.availabilityTimeoutMs }

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
  const [voice, setVoice] = useState<VoiceCaptureSnapshot>(CLIENT_VOICE_INITIAL)
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
  const displayedText = voiceActive
    ? juntarTranscricaoCliente(textBeforeVoice.current, [voice.sessionTranscript, voice.interim].filter(Boolean).join(" "), CLIENT_TEXT_LIMIT)
    : text
  const voiceMessage = support.status === "available" ? voice.message
    : support.status === "unavailable" ? CLIENT_VOICE_SUPPORT_MESSAGES[support.reason] : CLIENT_VOICE_SUPPORT_MESSAGES[support.status]
  const extractedLabel = source === "voice" ? "Extraído da transcrição por voz" : "Extraído do texto"
  useEffect(() => {
    const lifecycle = mounted, pending = request, session = voiceSession, sessions = voiceSerial, supports = supportSerial
    lifecycle.current = true
    return () => {
      lifecycle.current = false; pending.current++
      // Close, store switch, cancel and navigation unmount the editor: stop the engine silently.
      sessions.current++; supports.current++
      session.current?.dispose(); session.current = null
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
    const session = voiceSession
    const onHide = (event: Event) => {
      if (event.type === "visibilitychange" && document.visibilityState !== "hidden") return
      const active = session.current
      session.current = null
      active?.cancel()
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
    if (support.status !== "available" || voiceSession.current || voiceActive || interpreting || saving) return
    const serial = ++voiceSerial.current
    request.current++
    setInterpreting(false)
    setSuggestion(null)
    setRevised(new Set())
    setMessage("")
    setAutoStopped(false)
    setElapsedMs(0)
    textBeforeVoice.current = text
    voiceStartedAt.current = Date.now()
    const emit = (event: VoiceCaptureEvent) => {
      if (!mounted.current || serial !== voiceSerial.current) return
      setVoice((v) => reduceClientVoiceCapture(v, event))
      if (event.type === "error" && event.code === "language-not-supported") refreshSupport()
    }
    emit({ type: "start" })
    const session = startLocalVoiceCapture({
      win: window, emit, lang: CLIENT_VOICE_POLICY.lang,
      maxDurationMs: CLIENT_VOICE_POLICY.maxDurationMs, maxChars: CLIENT_VOICE_POLICY.maxChars,
      onAutoStop: () => { if (mounted.current && serial === voiceSerial.current) setAutoStopped(true) },
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
    void installLocalVoicePack(window, CLIENT_VOICE_POLICY.lang).then((ok) => {
      if (!mounted.current) return
      setInstalling(false)
      if (!ok) setMessage("O navegador não instalou o pacote local pt-BR. Continue por texto.")
      refreshSupport()
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
      <Textarea id={`${id}-text`} value={displayedText} maxLength={CLIENT_TEXT_LIMIT} rows={3} disabled={saving} readOnly={voiceActive} placeholder="Novo cliente…, telefone…, mora em…; Endereço:…; Cidade:…" aria-describedby={`${id}-capture-help`}
        onChange={(e) => {
          if (voiceActive) return
          request.current++; setInterpreting(false); setSuggestion(null); setText(e.target.value); setMessage("")
          if (!e.target.value.trim()) setSource("text")
        }} />
      <p id={`${id}-capture-help`} className="text-xs text-muted-foreground">Extração determinística, sem enviar o texto a provedores externos de IA. A sugestão é temporária e não salva o cadastro.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!text.trim() || interpreting || saving || voiceActive} onClick={() => void interpret()}>{interpreting ? "Interpretando…" : "Interpretar texto"}</button>
        {voiceActive ? <>
          <button type="button" className={button} disabled={voice.status !== "listening"} onClick={() => voiceSession.current?.stop()}><Square aria-hidden="true" className="mr-1 inline h-4 w-4" />Parar ditado</button>
          <button type="button" className={button} onClick={cancelVoice}><X aria-hidden="true" className="mr-1 inline h-4 w-4" />Cancelar ditado</button>
        </> : support.status === "downloadable" ? <button type="button" className={button} disabled={installing || saving} onClick={installVoice} aria-describedby={`${id}-voice-status`}>
          {installing ? <Loader2 aria-hidden="true" className="mr-1 inline h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="mr-1 inline h-4 w-4" />}{installing ? "Instalando voz local…" : "Instalar voz local pt-BR"}
        </button> : support.status === "downloading" ? <button type="button" className={button} disabled={saving} onClick={refreshSupport} aria-describedby={`${id}-voice-status`}>
          <RefreshCw aria-hidden="true" className="mr-1 inline h-4 w-4" />Verificar voz local
        </button> : <button type="button" className={button} disabled={support.status !== "available" || interpreting || saving} onClick={startVoice} data-voice-status={voice.status} aria-describedby={`${id}-voice-status`}>
          {support.status === "checking" ? <Loader2 aria-hidden="true" className="mr-1 inline h-4 w-4 animate-spin" /> : support.status === "available" ? <Mic aria-hidden="true" className="mr-1 inline h-4 w-4" /> : <MicOff aria-hidden="true" className="mr-1 inline h-4 w-4" />}
          {support.status === "checking" ? "Verificando voz local…" : support.status === "available" ? "Ditar por voz" : "Voz indisponível"}
        </button>}
        {(text || suggestion || interpreting) && !voiceActive && <button type="button" className={button} disabled={saving} onClick={discard}>Descartar sugestões</button>}
      </div>
      {voiceActive && <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-destructive" />
        {voice.status === "listening" ? "Ouvindo" : "Finalizando"} · {seconds(elapsedMs)} de {seconds(CLIENT_VOICE_POLICY.maxDurationMs)}
      </p>}
      <p id={`${id}-voice-status`} aria-live="polite" className="text-xs text-muted-foreground">{voiceMessage}{autoStopped && voice.status === "completed" ? " Limite do ditado atingido." : ""}</p>
      {(support.status === "available" || support.status === "downloadable") && <p className="text-xs text-muted-foreground">Voz processada no próprio dispositivo (pt-BR), sem envio de áudio. O OmniGestão não grava áudio nem transcrição; cada ditado dura até {CLIENT_VOICE_POLICY.maxDurationMs / 1000} s e só vira cadastro depois da sua revisão e confirmação.</p>}
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
