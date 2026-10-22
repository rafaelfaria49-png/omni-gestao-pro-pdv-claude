"use client"

import React, { useEffect, useId, useRef, useState } from "react"
import { Contact } from "lucide-react"
import type { ClientEditorValues } from "@/lib/cadastros/natural-text/cliente"
import { CLIENT_TEXT_LABELS } from "@/lib/cadastros/natural-text/cliente-types"
import { VCARD_ERROR_MESSAGES, VCARD_LIMITS, parseVcardBytes, parseVcardText, type VcardContact, type VcardParseResult } from "@/lib/cadastros/vcard/parser"
import {
  aplicaveisAosVazios, avisoTelefone, divergencias, previewContato, problemasRascunho, rascunhoInicial, rotulosContatos,
  type VcardClientField, type VcardClientPreview, type VcardDraft, type VcardOption,
} from "@/lib/cadastros/vcard/cliente"
import { Input, Textarea } from "./ui-kit"

type Props = {
  values: ClientEditorValues
  disabled?: boolean
  /** "empty" preenche só campos vazios; "replace" é a decisão explícita do operador numa divergência. */
  onApply: (patch: Partial<VcardDraft>, mode: "empty" | "replace") => void
}
type ChoiceField = "nome" | "telefone" | "email" | "endereco"
const button = "min-h-10 rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
const select = "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
const kib = (bytes: number) => `${Math.max(1, Math.ceil(bytes / 1024))} KiB`

function readFileBytes(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error("read"))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Importação assistida de UM contato (.vcf ou texto colado) para o editor de Clientes.
 * O arquivo é lido e interpretado só neste navegador: nada vai ao servidor, storage,
 * URL ou log. A prévia vive nesta montagem e é descartada ao cancelar, fechar,
 * trocar de loja (o editor remonta), trocar de arquivo ou aplicar.
 */
export function ClienteVcardImport({ values, disabled, onApply }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pasted, setPasted] = useState("")
  const [loadedFrom, setLoadedFrom] = useState("")
  const [reading, setReading] = useState(false)
  const [error, setError] = useState("")
  const [contacts, setContacts] = useState<VcardContact[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<VcardClientPreview | null>(null)
  const [draft, setDraft] = useState<VcardDraft | null>(null)
  const [choice, setChoice] = useState<Partial<Record<ChoiceField, string>>>({})
  const [edited, setEdited] = useState<Set<VcardClientField>>(new Set())
  const [info, setInfo] = useState("")
  const serial = useRef(0)
  const mounted = useRef(false)
  useEffect(() => {
    const lifecycle = mounted, reads = serial
    lifecycle.current = true
    // Fechar o editor, trocar de loja ou sair da tela invalida leituras em andamento.
    return () => { lifecycle.current = false; reads.current++ }
  }, [])

  function clearLoaded() {
    serial.current++
    setReading(false); setError(""); setInfo(""); setLoadedFrom("")
    setContacts(null); setSelected(null); setPreview(null); setDraft(null); setChoice({}); setEdited(new Set())
  }
  function reset() { clearLoaded(); setPasted("") }
  function close() { reset(); setOpen(false) }
  function selectContact(list: VcardContact[], index: number) {
    // Trocar de contato descarta a prévia anterior inteira: nunca mistura duas pessoas.
    const next = previewContato(list[index])
    setSelected(index); setPreview(next); setDraft(rascunhoInicial(next)); setChoice({}); setEdited(new Set()); setInfo("")
  }
  function load(result: VcardParseResult, from: string) {
    if (!result.ok) { setError(result.message); return }
    setContacts(result.contacts)
    setLoadedFrom(from)
    if (result.contacts.length === 1) selectContact(result.contacts, 0)
  }
  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = "" // o campo não segura o arquivo depois da leitura
    reset()
    if (!file) return
    if (file.size > VCARD_LIMITS.maxBytes) { setError(VCARD_ERROR_MESSAGES.TOO_LARGE); return }
    const current = ++serial.current
    const from = `Arquivo ${file.name} (${kib(file.size)})`
    setReading(true)
    readFileBytes(file).then((bytes) => {
      if (!mounted.current || current !== serial.current) return
      setReading(false)
      load(parseVcardBytes(bytes), from)
    }, () => {
      if (!mounted.current || current !== serial.current) return
      setReading(false)
      setError("Não foi possível ler o arquivo. Selecione-o novamente.")
    })
  }
  function readPasted() {
    clearLoaded()
    load(parseVcardText(pasted), "Conteúdo colado")
  }
  function choose(field: ChoiceField, optionId: string) {
    if (!preview || !draft) return
    setChoice((c) => ({ ...c, [field]: optionId }))
    setInfo("")
    if (field === "endereco") {
      const option = preview.addresses.find((a) => a.id === optionId)
      setDraft({ ...draft, ...(option?.values ?? { endereco: "", cidade: "", uf: "" }) })
      setEdited((e) => { const n = new Set(e); n.delete("endereco"); n.delete("cidade"); n.delete("uf"); return n })
      return
    }
    const list = field === "nome" ? preview.names : field === "telefone" ? preview.phones : preview.emails
    setDraft({ ...draft, [field]: list.find((o) => o.id === optionId)?.value ?? "" })
    setEdited((e) => { const n = new Set(e); n.delete(field); return n })
  }
  function edit(field: VcardClientField, value: string) {
    if (!draft) return
    setDraft({ ...draft, [field]: value })
    setEdited((e) => new Set(e).add(field))
    setInfo("")
  }
  function applyEmpty() {
    if (!draft) return
    const patch = aplicaveisAosVazios(draft, values)
    if (!Object.keys(patch).length) {
      setInfo("Nenhum campo vazio do formulário recebeu dados. Revise a prévia e as divergências, ou cancele a importação.")
      return
    }
    onApply(patch, "empty")
    close()
  }
  function replace(field: VcardClientField) {
    if (!draft) return
    onApply({ [field]: field === "uf" ? draft.uf.trim().toUpperCase() : draft[field].trim() }, "replace")
  }

  const issues = draft ? problemasRascunho(draft) : {}
  const conflicts = draft ? divergencias(draft, values) : []
  const labels = contacts && contacts.length > 1 ? rotulosContatos(contacts) : []
  const address = preview?.addresses.length === 1 ? preview.addresses[0] : preview?.addresses.find((a) => a.id === choice.endereco)

  function status(field: VcardClientField, options: { length: number }, choiceField?: ChoiceField) {
    if (edited.has(field)) return "Editado na prévia"
    if (!options.length) return field === "nome" ? "Ausente no contato: preencha o nome no formulário" : "Ausente no contato"
    const chosen = choiceField ? choice[choiceField] : undefined
    if (options.length > 1 && !chosen) return `Escolha entre os ${options.length} valores do contato`
    if (chosen === "none") return "Não será usado"
    return draft?.[field] ? "Do contato" : "Ausente no contato"
  }
  function previewInput(field: VcardClientField, options: { length: number }, choiceField?: ChoiceField) {
    if (!draft) return null
    const note = field === "telefone" ? avisoTelefone(draft.telefone) : null
    return <div className={`min-w-0 space-y-1 ${field === "nome" || field === "endereco" ? "sm:col-span-2" : ""}`}>
      <label htmlFor={`${id}-preview-${field}`} className="block text-sm">Prévia: {CLIENT_TEXT_LABELS[field]}</label>
      <Input id={`${id}-preview-${field}`} value={draft[field]} aria-invalid={!!issues[field]} aria-describedby={`${id}-preview-${field}-help`}
        onChange={(e) => edit(field, e.target.value)} />
      <p id={`${id}-preview-${field}-help`} className="text-xs text-muted-foreground">
        {status(field, options, choiceField)}
        {issues[field] && <span className="block text-destructive">{issues[field]}</span>}
        {!issues[field] && note && <span className="block">{note}</span>}
      </p>
    </div>
  }
  function chooser(field: Exclude<ChoiceField, "endereco">, options: VcardOption[]) {
    if (options.length < 2) return null
    return <div className="min-w-0 space-y-1 sm:col-span-2">
      <label htmlFor={`${id}-choice-${field}`} className="block text-sm">{CLIENT_TEXT_LABELS[field]}: o contato tem {options.length} valores</label>
      <select id={`${id}-choice-${field}`} className={select} value={choice[field] ?? ""} onChange={(e) => choose(field, e.target.value)}>
        <option value="">Escolha um valor…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.value}{o.label ? ` (${o.label})` : ""}</option>)}
        <option value="none">Não usar</option>
      </select>
    </div>
  }

  return <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-3 rounded-lg border border-border bg-muted/30 p-3 sm:p-4"
    // Enter numa caixa da prévia não pode submeter o cadastro.
    onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault() }}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h3 id={`${id}-title`} className="flex min-w-0 items-center gap-2 text-sm font-semibold"><Contact aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />Importar contato (vCard)</h3>
      {!open && <button type="button" className={button} disabled={disabled} aria-expanded={false} aria-controls={`${id}-panel`} onClick={() => setOpen(true)}>Importar contato</button>}
    </div>
    <p className="text-xs text-muted-foreground">Preenche este cadastro com os dados de UM contato (.vcf, vCard 3.0 ou 4.0 em UTF-8). Não importa agenda completa, clientes em lote nem backup do sistema.</p>
    {open && <fieldset id={`${id}-panel`} disabled={disabled} className="min-w-0 space-y-3">
      <p className="text-xs text-muted-foreground">Limites: até {VCARD_LIMITS.maxBytes / 1024} KiB e {VCARD_LIMITS.maxContacts} contatos por arquivo, {VCARD_LIMITS.maxValueChars.toLocaleString("pt-BR")} caracteres por campo. O conteúdo é lido somente neste navegador: não é enviado ao servidor, guardado nem registrado.</p>
      <div className="min-w-0 space-y-1">
        <label htmlFor={`${id}-file`} className="block text-sm">Arquivo de contato (.vcf)</label>
        <input id={`${id}-file`} type="file" accept=".vcf,.vcard,text/vcard,text/x-vcard" onChange={onFile}
          className="block w-full min-w-0 text-sm text-foreground file:mr-3 file:min-h-10 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:text-foreground" />
      </div>
      <div className="min-w-0 space-y-1">
        <label htmlFor={`${id}-paste`} className="block text-sm">Ou cole o conteúdo do vCard</label>
        <Textarea id={`${id}-paste`} value={pasted} rows={4} spellCheck={false} placeholder={"BEGIN:VCARD\nVERSION:3.0\nFN:…\nEND:VCARD"}
          onChange={(e) => { if (contacts || error) clearLoaded(); setPasted(e.target.value) }} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!pasted.trim() || reading} onClick={readPasted}>Ler conteúdo colado</button>
        {(pasted || contacts || error || loadedFrom) && <button type="button" className={button} onClick={reset}>Remover arquivo ou conteúdo</button>}
      </div>
      {reading && <p role="status" className="text-xs text-muted-foreground">Lendo o arquivo neste navegador…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loadedFrom && contacts && <p role="status" className="break-words text-xs text-muted-foreground">{loadedFrom}: {contacts.length === 1 ? "1 contato reconhecido" : `${contacts.length} contatos reconhecidos`}.</p>}

      {contacts && contacts.length > 1 && <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">Escolha o contato deste cadastro</legend>
        <p className="text-xs text-muted-foreground">Só o contato escolhido é usado. Os demais não são importados nem enviados.</p>
        <div className="max-h-48 min-w-0 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-2">
          {labels.map((label, i) => <label key={i} className="flex min-h-10 min-w-0 items-center gap-2 text-sm">
            <input type="radio" name={`${id}-contact`} className="h-4 w-4 shrink-0" checked={selected === i} onChange={() => selectContact(contacts, i)} />
            <span className="min-w-0 break-words">{label}</span>
          </label>)}
        </div>
      </fieldset>}

      {preview && draft && <div role="group" aria-label="Prévia do contato" className="min-w-0 space-y-3 border-t border-border pt-3">
        <p className="text-sm font-medium">Revise os dados do contato</p>
        <p className="text-xs text-muted-foreground">Nada é salvo nesta etapa. “Aplicar aos campos vazios” só preenche campos vazios do formulário; o cadastro continua exigindo sua revisão, a confirmação e o botão Salvar cliente. CPF/CNPJ e tipo PF/PJ não vêm do arquivo.</p>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {chooser("nome", preview.names)}
          {previewInput("nome", preview.names, "nome")}
          {chooser("telefone", preview.phones)}
          {previewInput("telefone", preview.phones, "telefone")}
          {chooser("email", preview.emails)}
          {previewInput("email", preview.emails, "email")}
          {preview.addresses.length > 1 && <div className="min-w-0 space-y-1 sm:col-span-2">
            <label htmlFor={`${id}-choice-endereco`} className="block text-sm">Endereço: o contato tem {preview.addresses.length} endereços</label>
            <select id={`${id}-choice-endereco`} className={select} value={choice.endereco ?? ""} onChange={(e) => choose("endereco", e.target.value)}>
              <option value="">Escolha um endereço…</option>
              {preview.addresses.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              <option value="none">Não usar</option>
            </select>
          </div>}
          {previewInput("endereco", preview.addresses, "endereco")}
          {previewInput("cidade", preview.addresses, "endereco")}
          {previewInput("uf", preview.addresses, "endereco")}
        </div>
        {address && address.notImported.length > 0 && <p className="break-words text-xs text-muted-foreground">Não importado deste endereço (sem campo no cadastro): {address.notImported.join("; ")}.</p>}
        {preview.ignored.length > 0 && <p className="break-words text-xs text-muted-foreground">Não utilizados deste contato: {preview.ignored.join(", ")}. Esses dados não são importados nem guardados.</p>}
        {conflicts.length > 0 && <div role="group" aria-label="Divergências com o formulário" className="min-w-0 space-y-2 rounded-md border border-border bg-background p-2">
          <p className="text-sm font-medium">Divergências com o que já está no formulário</p>
          <p className="text-xs text-muted-foreground">O valor do formulário é mantido, a menos que você escolha substituí-lo.</p>
          <ul className="min-w-0 space-y-2">
            {conflicts.map((field) => <li key={field} className="min-w-0 space-y-1">
              <p className="break-words text-xs"><span className="font-medium">{CLIENT_TEXT_LABELS[field]}</span> — no formulário: “{values[field]}”; no contato: “{draft[field]}”</p>
              <button type="button" className={button} onClick={() => replace(field)}>Substituir {CLIENT_TEXT_LABELS[field]} pelo do contato</button>
            </li>)}
          </ul>
        </div>}
        <button type="button" className={button} onClick={applyEmpty}>Aplicar aos campos vazios</button>
        {info && <p role="status" className="text-xs">{info}</p>}
      </div>}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <button type="button" className={button} onClick={close}>Cancelar importação</button>
      </div>
      <p className="text-xs text-muted-foreground">Cancelar descarta o arquivo e a prévia sem mudar o formulário; permanece apenas o que você já aplicou ou substituiu.</p>
    </fieldset>}
  </section>
}
