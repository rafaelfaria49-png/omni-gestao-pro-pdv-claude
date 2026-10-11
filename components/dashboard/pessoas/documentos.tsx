"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { listarDocumentos } from "@/lib/pessoas/documentos/service"
import { usePessoas } from "./contexto"
import { control, Notice, Section, useResource } from "./ui"
import { accessCodes } from "@/lib/pessoas/adapters/cadastro-ui"
import { refreshPessoas } from "./use-disponibilidade"
import { Button } from "@/components/ui/button"
type DocumentosDto = Awaited<ReturnType<typeof listarDocumentos>>
type Intent = { signedUrl: string; headersObrigatorios: Record<string, string>; uploadIntent: string }
async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin", signal,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.code ?? "FALHA_INTERNA")
  return result.data
}
export function Documentos({ id }: { id: string }) {
  const { empregadorId, capacidades, categoriasDocumentais } = usePessoas()
  const resource = useResource(useCallback(async () => {
    try { return { ok: true as const, data: await api<DocumentosDto>("/api/pessoas/documentos?" + new URLSearchParams({ empregadorId, vinculoId: id })) } }
    catch (error) { return { ok: false as const, code: error instanceof Error ? error.message : "REDE" } }
  }, [empregadorId, id]))
  const [stage, setStage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [retryComplete, setRetryComplete] = useState(false)
  const [category, setCategory] = useState("identificacao")
  const pending = useRef<{ token: string; expires: number } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const lock = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); pending.current = null } }, [])
  function fail(reason: unknown) {
    if (!mounted.current) return
    const code = reason instanceof Error && /^[A-Z_]+$/.test(reason.message) ? reason.message : "REDE"
    if (accessCodes.includes(code)) { refreshPessoas(); return }
    setError(code)
  }
  async function complete(signal: AbortSignal) {
    const intent = pending.current
    if (!intent || Date.now() >= intent.expires) { pending.current = null; setRetryComplete(false); resource.reload(); throw new Error("INTENT_EXPIRADO") }
    setStage("Confirmando integridade e publicação…")
    await api("/api/pessoas/documentos/complete", { uploadIntent: intent.token }, signal)
    if (!mounted.current || signal.aborted) return
    pending.current = null; setRetryComplete(false); setStage("Documento salvo.")
    if (fileInput.current) fileInput.current.value = ""
    resource.reload()
  }
  async function upload(form: HTMLFormElement) {
    if (lock.current) return
    const file = fileInput.current?.files?.[0]
    if (!file) { setError("ARQUIVO_INVALIDO"); return }
    const ext = file.name.split(".").pop()?.toLowerCase()
    const mime: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" }
    if (!ext || mime[ext] !== file.type || file.size < 1 || file.size > 25 * 1024 * 1024) { setError("ARQUIVO_INVALIDO"); return }
    lock.current = true; setBusy(true); setError(""); setRetryComplete(false); pending.current = null
    const ac = new AbortController(); controller.current = ac
    try {
      setStage("Calculando SHA-256…")
      const bytes = await file.arrayBuffer()
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(v => v.toString(16).padStart(2, "0")).join("")
      if (!mounted.current || ac.signal.aborted) return
      const origem = category === "holerite_externo" ? "CONTADOR_EXTERNO" : new FormData(form).get("origem")
      setStage("Solicitando autorização de envio…")
      const expires = Date.now() + 9 * 60 * 1000
      const intent = await api<Intent>("/api/pessoas/documentos/upload-intent", { empregadorId, vinculoId: id, categoria: category,
        origem, nomeArquivo: file.name, mime: file.type, bytes: file.size, sha256: hash }, ac.signal)
      if (!mounted.current || ac.signal.aborted) return
      setStage("Enviando bytes ao armazenamento privado…")
      const put = await fetch(intent.signedUrl, { method: "PUT", body: file, headers: intent.headersObrigatorios, signal: ac.signal, credentials: "omit", referrerPolicy: "no-referrer" })
      if (!put.ok) throw new Error("PUT_FALHOU")
      pending.current = { token: intent.uploadIntent, expires }
      setRetryComplete(true)
      await complete(ac.signal)
    } catch (reason) { fail(reason) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  async function retry() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError("")
    const ac = new AbortController(); controller.current = ac
    try { await complete(ac.signal) } catch (reason) { fail(reason) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  async function download(documentoId: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError("")
    const ac = new AbortController(); controller.current = ac
    try {
      const result = await api<{ signedUrl: string }>("/api/pessoas/documentos/" + encodeURIComponent(documentoId) + "/download", { empregadorId }, ac.signal)
      if (!mounted.current || ac.signal.aborted) return
      const link = document.createElement("a")
      link.href = result.signedUrl; link.rel = "noopener noreferrer"; link.referrerPolicy = "no-referrer"; link.target = "_blank"
      document.body.appendChild(link); link.click(); link.remove()
    } catch (reason) { fail(reason) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  return <Section title="Documentos privados">
    <p className="text-sm text-muted-foreground">PDF, PNG ou JPG · até 25 MiB. Não envie arquivos de saúde. Holerites externos são documentos recebidos do contador.</p>
    {capacidades.includes("editCadastro") && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void upload(event.currentTarget) }}>
      <fieldset disabled={busy || retryComplete} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm">Arquivo<input ref={fileInput} className={control} type="file" accept=".pdf,.png,.jpg" required /></label>
        <label className="min-w-0 text-sm">Categoria<select className={control} value={category} onChange={event => setCategory(event.target.value)}>
          {categoriasDocumentais.map(value => <option key={value} value={value}>{value === "holerite_externo" ? "Holerite externo · recebido do contador" : value}</option>)}
        </select></label>
        {category !== "holerite_externo" && <label className="min-w-0 text-sm">Origem<select className={control} name="origem" required><option value="">Selecione</option><option value="INTERNO">Interno</option><option value="CONTADOR_EXTERNO">Recebido do contador</option></select></label>}
      </fieldset>
      {!retryComplete && <Button className="min-h-11" disabled={busy} type="submit">Enviar documento</Button>}
    </form>}
    {retryComplete && <div className="flex min-w-0 flex-wrap gap-2"><Button className="min-h-11" disabled={busy} onClick={() => void retry()}>Repetir confirmação</Button><Button className="min-h-11" variant="outline" disabled={busy} onClick={() => { pending.current = null; setRetryComplete(false); resource.reload(); setStage("Lista atualizada. Confira antes de iniciar outro envio.") }}>Conferir lista antes de novo envio</Button></div>}
    {busy && <Button variant="outline" onClick={() => { controller.current?.abort(); setStage("Operação interrompida. Confira a lista antes de repetir."); resource.reload() }}>Cancelar</Button>}
    <p role="status" className="text-sm">{stage}</p>
    {error && <Notice code={error} />}
    {resource.error ? <Notice code={resource.error} retry={resource.reload} /> : !resource.data ? <p role="status">Carregando documentos…</p> :
      !resource.data.length ? <p className="text-sm text-muted-foreground">Nenhum documento disponível para suas permissões.</p> :
      <ul className="divide-y divide-border">{resource.data.map(doc => <li key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-all text-sm">{doc.nomeArquivo}</p><p className="text-xs text-muted-foreground">{doc.categoria === "holerite_externo" ? "Documento recebido do contador" : doc.categoria} · {doc.mime}</p></div>
        <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => void download(doc.id)}>Baixar</Button>
      </li>)}</ul>}
  </Section>
}
