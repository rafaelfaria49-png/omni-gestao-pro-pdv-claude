"use client"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorMessage, conflictCodes, accessCodes } from "@/lib/pessoas/adapters/cadastro-ui"
import { pessoasScopeEpoch, refreshPessoas } from "./use-disponibilidade"
export type StoreAction<F extends (...args: never[]) => Promise<unknown>> = (expectedStoreId: string, ...args: Parameters<F>) => ReturnType<F>
export type StoreResourceAction<F extends (...args: never[]) => Promise<unknown>> = (expectedStoreId: string, ...args: Parameters<F>) => Promise<{ ok: true; data: Awaited<ReturnType<F>> } | { ok: false; code: string }>
export const PessoasInteracaoContext = createContext(true)
export const control = "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
export function Notice({ code, retry }: { code: string; retry?: () => void }) {
  return <div role="alert" className="min-w-0 space-y-3 [overflow-wrap:anywhere] rounded-lg border border-border bg-muted/40 p-4 text-sm">
    <p>{errorMessage(code)}</p>{retry && <Button variant="outline" onClick={() => retry()}>Tentar novamente</Button>}
  </div>
}
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-4 [overflow-wrap:anywhere] rounded-lg border border-border bg-card p-4 sm:p-6">
    <h2 className="min-w-0 [overflow-wrap:anywhere] font-display text-lg font-semibold">{title}</h2>{children}</section>
}
export type Field = { name: string; label: string; type?: string; required?: boolean; value?: string | number | null; readOnly?: boolean; options?: string[]; hint?: string; maxLength?: number }
export function CommandForm({ fields, action, submitLabel = "Salvar", onSaved, onConflict, disabled = false, onPendingChange, acquireMutation }: {
  fields: Field[]
  action: (values: Record<string, string>, comandoId: string) => Promise<{ ok: boolean; code?: string }>
  submitLabel?: string; onSaved: () => void; onConflict?: () => void
  disabled?: boolean; onPendingChange?: (pending: boolean) => void; acquireMutation?: () => boolean
}) {
  const interativo = useContext(PessoasInteracaoContext)
  const autorizado = useRef(interativo)
  autorizado.current = interativo
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [unknown, setUnknown] = useState(false)
  const alive = useRef(true)
  const lock = useRef(false)
  const command = useRef<{ id: string; signature: string; values: Record<string, string> } | null>(null)
  const feedback = useRef<HTMLDivElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false; command.current = null } }, [])
  useEffect(() => { onPendingChange?.(busy || unknown) }, [busy, unknown, onPendingChange])
  useEffect(() => () => onPendingChange?.(false), [onPendingChange])
  async function execute(values: Record<string, string>) {
    if (lock.current || disabled || !autorizado.current || (acquireMutation && !acquireMutation())) return
    const operationEpoch = pessoasScopeEpoch()
    let pendingAfter = false
    onPendingChange?.(true)
    lock.current = true; setBusy(true); setError("")
    const signature = JSON.stringify(values)
    if (!command.current || command.current.signature !== signature) command.current = { id: crypto.randomUUID(), signature, values }
    try {
      const result = await action(command.current.values, command.current.id)
      if (!alive.current || operationEpoch !== pessoasScopeEpoch()) return
      if (result.ok) { command.current = null; onSaved(); return }
      const code = result.code ?? "FALHA_INTERNA"
      if (accessCodes.includes(code)) { refreshPessoas(); return }
      setError(code)
      if (conflictCodes.includes(code)) { command.current = null; onConflict?.(); return }
      pendingAfter = code === "FALHA_INTERNA" || code === "REDE"
      setUnknown(pendingAfter)
    } catch { pendingAfter = true; if (alive.current && operationEpoch === pessoasScopeEpoch()) { setError("REDE"); setUnknown(true) } }
    finally { lock.current = false; if (alive.current) { onPendingChange?.(pendingAfter); setBusy(false); requestAnimationFrame(() => { if (alive.current) feedback.current?.focus() }) } }
  }
  return <form autoComplete="off" onSubmit={event => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
    void execute(values)
  }} className="space-y-4">
    <fieldset disabled={!interativo || disabled || busy || unknown} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {fields.map(field => <label key={field.name} className="min-w-0 space-y-1 text-sm">
        <span className="block font-medium">{field.label}{field.required ? " *" : ""}</span>
        {field.options ? <select aria-describedby={field.hint ? field.name + "-hint" : undefined} className={control} name={field.name} required={field.required} defaultValue={field.value ?? ""}>
          <option value="">Selecione</option>{field.options.map(option => <option key={option}>{option}</option>)}
        </select> : <Input className="h-11" name={field.name} type={field.type ?? "text"} required={field.required} readOnly={field.readOnly}
          defaultValue={field.value ?? ""} maxLength={field.maxLength ?? 240} aria-describedby={field.hint ? field.name + "-hint" : undefined} />}
        {field.hint && <span id={field.name + "-hint"} className="block text-xs text-muted-foreground">{field.hint}</span>}
      </label>)}
    </fieldset>
    <div ref={feedback} tabIndex={-1} aria-live="polite">{error && <Notice code={error} />}</div>
    {unknown ? <div className="flex min-w-0 flex-wrap gap-2">
      <Button type="button" disabled={!interativo || disabled || busy} onClick={() => command.current && void execute(command.current.values)}>Repetir o mesmo comando</Button>
      <Button type="button" variant="outline" disabled={!interativo || disabled || busy} onClick={() => { command.current = null; setUnknown(false); onConflict?.() }}>Reler antes de alterar</Button>
    </div> : <Button className="min-h-11" disabled={!interativo || disabled || busy} type="submit">{busy ? "Salvando…" : submitLabel}</Button>}
  </form>
}
export function useResource<T>(load: () => Promise<{ ok: true; data: T } | { ok: false; code: string }>) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ data?: T; error?: string; source?: typeof load; refreshing?: boolean }>({})
  const request = useRef(0)
  useEffect(() => {
    let alive = true
    const currentRequest = ++request.current
    const operationEpoch = pessoasScopeEpoch()
    void load().then(result => {
      if (!alive || currentRequest !== request.current || operationEpoch !== pessoasScopeEpoch()) return
      if (!result.ok && accessCodes.includes(result.code)) refreshPessoas()
      setState(result.ok ? { source: load, data: result.data } : { source: load, error: result.code })
    }).catch(() => { if (alive && currentRequest === request.current && operationEpoch === pessoasScopeEpoch()) setState({ source: load, error: "REDE" }) })
    return () => { alive = false }
  }, [load, revision])
  const current = state.source === load ? state : {}
  return { ...current, refreshing: current.refreshing === true, reload: (retainData = false) => {
    request.current++
    setState(previous => retainData && previous.source === load ? { source: load, data: previous.data, refreshing: true } : {})
    setRevision(n => n + 1)
  } }
}
