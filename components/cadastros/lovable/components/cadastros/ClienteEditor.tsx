"use client"

import React, { useEffect, useId, useRef, useState } from "react"
import { MicOff, WandSparkles } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ClienteDTO } from "@/app/actions/cadastros"
import { interpretarClienteTextoLivre, salvarClienteRevisado } from "@/app/actions/cliente-texto-livre"
import { aplicarSugestaoCliente, validateClientEditor, type ClientEditorValues } from "@/lib/cadastros/natural-text/cliente"
import { CLIENT_TEXT_FIELDS, CLIENT_TEXT_LABELS, CLIENT_TEXT_LIMIT, CLIENT_VOICE_PRIVACY_GATE, type ClientTextField, type ClientTextSuggestion } from "@/lib/cadastros/natural-text/cliente-types"
import { Input, Select, Textarea } from "./ui-kit"
import { clientVoiceCaptureSnapshot } from "@/lib/cadastros/voice-capture/cliente"

type Props = { storeId: string; editing: ClienteDTO | null; onClose: () => void; onSaved: () => void | Promise<void> }
const empty = (value?: string) => value === "—" ? "" : value ?? ""
const button = "min-h-10 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"

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
  const voice = clientVoiceCaptureSnapshot()
  useEffect(() => {
    const lifecycle = mounted, pending = request
    lifecycle.current = true
    return () => { lifecycle.current = false; pending.current++ }
  }, [])

  function discard() {
    request.current++
    setInterpreting(false)
    setSuggestion(null)
    setText("")
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
      const response = await interpretarClienteTextoLivre(storeId, text, "text")
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
    for (const field of CLIENT_TEXT_FIELDS) if (next[field] !== values[field]) nextOrigins[field] = revised.has(field) ? "Revisado pelo operador" : "Extraído do texto"
    setValues(next)
    setOrigins(nextOrigins)
    setConfirmed(false)
    discard()
    setMessage("Sugestões aplicadas aos campos vazios. Revise e confirme os dados abaixo.")
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || interpreting || !confirmed) return
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
    {!editing && <section aria-label="Cadastro assistido por texto" className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><WandSparkles aria-hidden="true" className="h-4 w-4 text-primary" />Preencher por descrição</div>
      <label htmlFor={`${id}-text`} className="block text-sm">Descreva o novo cliente</label>
      <Textarea id={`${id}-text`} value={text} maxLength={CLIENT_TEXT_LIMIT} rows={3} disabled={saving} placeholder="Novo cliente…, telefone…, mora em…; Endereço:…; Cidade:…" aria-describedby={`${id}-capture-help`}
        onChange={(e) => { request.current++; setInterpreting(false); setSuggestion(null); setText(e.target.value); setMessage("") }} />
      <p id={`${id}-capture-help`} className="text-xs text-muted-foreground">Extração determinística, sem enviar o texto a provedores externos de IA. A sugestão é temporária e não salva o cadastro.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!text.trim() || interpreting || saving} onClick={() => void interpret()}>{interpreting ? "Interpretando…" : "Interpretar texto"}</button>
        <button type="button" className={button} disabled={CLIENT_VOICE_PRIVACY_GATE.enabled === false} data-voice-status={voice.status} aria-describedby={`${id}-voice-gate`}><MicOff aria-hidden="true" className="mr-1 inline h-4 w-4" />Voz indisponível</button>
        {(text || suggestion || interpreting) && <button type="button" className={button} disabled={saving} onClick={discard}>Descartar sugestões</button>}
      </div>
      <p id={`${id}-voice-gate`} className="text-xs text-muted-foreground">{voice.message}</p>
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
              <p className="text-xs text-muted-foreground">{revised.has(field) ? "Revisado pelo operador" : proposed.estado === "extraido" ? "Extraído do texto" : proposed.estado === "ausente" ? "Ausente: revisão manual" : "Ambíguo: requer correção"}{proposed.aviso ? ` — ${proposed.aviso}` : ""}</p>
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
      <button type="submit" className={`${button} bg-primary font-medium text-primary-foreground`} disabled={saving || interpreting || !confirmed}>{saving ? "Salvando…" : "Salvar cliente"}</button>
    </div>
  </form>
}
