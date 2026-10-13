"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { listarDocumentos, criarUploadIntent, confirmarUpload, autorizarDownload } from "@/lib/pessoas/documentos/service"
import { usePessoas } from "./contexto"
import { control, Notice, Section, useResource, type StoreResourceAction } from "./ui"
import { accessCodes } from "@/lib/pessoas/adapters/cadastro-ui"
import { pessoasScopeEpoch, refreshPessoas } from "./use-disponibilidade"
import { Button } from "@/components/ui/button"

export type DocumentActions = {
  listar: StoreResourceAction<typeof listarDocumentos>; criarIntent: StoreResourceAction<typeof criarUploadIntent>
  confirmar: StoreResourceAction<typeof confirmarUpload>; download: StoreResourceAction<typeof autorizarDownload>
}
async function actionData<T>(operation: Promise<{ ok: true; data: T } | { ok: false; code: string }>, signal?: AbortSignal): Promise<T> {
  const operationEpoch = pessoasScopeEpoch()
  const result = await operation
  if (signal?.aborted || operationEpoch !== pessoasScopeEpoch()) throw new DOMException("Operação interrompida", "AbortError")
  if (!result.ok) throw new Error(result.code)
  return result.data
}
export function Documentos({ id, actions, disabled = false, onPendingChange, acquireMutation }: {
  id: string; actions: DocumentActions; disabled?: boolean; onPendingChange?: (pending: boolean) => void; acquireMutation?: () => boolean
}) {
  const { storeId, empregadorId, capacidades, categoriasDocumentais } = usePessoas()
  const resource = useResource(useCallback(() => actions.listar(storeId, empregadorId, id), [actions, storeId, empregadorId, id]))
  const [stage, setStage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [retryComplete, setRetryComplete] = useState(false)
  const [category, setCategory] = useState("identificacao")
  const pending = useRef<{ token: string } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const lock = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); pending.current = null } }, [])
  useEffect(() => { onPendingChange?.(busy || retryComplete) }, [busy, retryComplete, onPendingChange])
  useEffect(() => () => onPendingChange?.(false), [onPendingChange])
  function fail(reason: unknown) {
    if (!mounted.current) return
    const code = reason instanceof Error && /^[A-Z_]+$/.test(reason.message) ? reason.message : "REDE"
    if (accessCodes.includes(code)) { refreshPessoas(); return }
    setError(code)
  }
  async function complete(signal: AbortSignal) {
    const intent = pending.current
    if (!intent) throw new Error("INTENT_EXPIRADO")
    setStage("Confirmando integridade e publicação…")
    try { await actionData(actions.confirmar(storeId, intent.token), signal) }
    catch (reason) {
      // Só uma recusa definitiva do backend descarta o intent; falhas de rede permitem replay.
      if (mounted.current && reason instanceof Error && ["INTENT_INVALIDO", "INTENT_EXPIRADO", "INTEGRIDADE_INVALIDA", "CONTEUDO_INVALIDO"].includes(reason.message)) {
        pending.current = null; setRetryComplete(false); resource.reload()
      }
      throw reason
    }
    if (!mounted.current || signal.aborted) return
    pending.current = null; setRetryComplete(false); setStage("Documento salvo.")
    if (fileInput.current) fileInput.current.value = ""
    resource.reload()
  }
  async function upload(form: HTMLFormElement) {
    if (lock.current || disabled || pending.current) return
    const file = fileInput.current?.files?.[0]
    if (!file) { setError("ARQUIVO_INVALIDO"); return }
    const ext = file.name.split(".").pop()?.toLowerCase()
    const mime: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" }
    if (!ext || mime[ext] !== file.type || file.size < 1 || file.size > 25 * 1024 * 1024) { setError("ARQUIVO_INVALIDO"); return }
    const origem = category === "holerite_externo" ? "CONTADOR_EXTERNO" : new FormData(form).get("origem")
    if (origem !== "INTERNO" && origem !== "CONTADOR_EXTERNO") { setError("ORIGEM_INVALIDA"); return }
    if (acquireMutation && !acquireMutation()) return
    onPendingChange?.(true)
    lock.current = true; setBusy(true); setError(""); setRetryComplete(false)
    const ac = new AbortController(); controller.current = ac
    const operationEpoch = pessoasScopeEpoch()
    try {
      setStage("Calculando SHA-256…")
      const bytes = await file.arrayBuffer()
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(v => v.toString(16).padStart(2, "0")).join("")
      if (!mounted.current || ac.signal.aborted || operationEpoch !== pessoasScopeEpoch()) return
      setStage("Solicitando autorização de envio…")
      const intent = await actionData(actions.criarIntent(storeId, { empregadorId, vinculoId: id, categoria: category,
        origem, nomeArquivo: file.name, mime: file.type, bytes: file.size, sha256: hash }), ac.signal)
      if (!mounted.current || ac.signal.aborted) return
      pending.current = { token: intent.uploadIntent }; setRetryComplete(true)
      setStage("Enviando bytes ao armazenamento privado…")
      const put = await fetch(intent.signedUrl, { method: "PUT", body: file, headers: intent.headersObrigatorios, signal: ac.signal, credentials: "omit", referrerPolicy: "no-referrer" })
      if (!put.ok) throw new Error("PUT_FALHOU")
      if (!mounted.current || ac.signal.aborted || operationEpoch !== pessoasScopeEpoch()) return
      await complete(ac.signal)
    } catch (reason) { fail(reason) }
    finally { lock.current = false; if (mounted.current) { onPendingChange?.(pending.current !== null); setBusy(false) } }
  }
  async function retry() {
    if (lock.current || disabled || (acquireMutation && !acquireMutation())) return
    onPendingChange?.(true)
    lock.current = true; setBusy(true); setError("")
    const ac = new AbortController(); controller.current = ac
    try { await complete(ac.signal) } catch (reason) { fail(reason) }
    finally { lock.current = false; if (mounted.current) { onPendingChange?.(pending.current !== null); setBusy(false) } }
  }
  async function download(documentoId: string) {
    if (lock.current || disabled || (acquireMutation && !acquireMutation())) return
    onPendingChange?.(true)
    lock.current = true; setBusy(true); setError("")
    const ac = new AbortController(); controller.current = ac
    try {
      const result = await actionData(actions.download(storeId, empregadorId, documentoId), ac.signal)
      if (!mounted.current || ac.signal.aborted) return
      const link = document.createElement("a")
      link.href = result.signedUrl; link.rel = "noopener noreferrer"; link.referrerPolicy = "no-referrer"; link.target = "_blank"
      document.body.appendChild(link); link.click(); link.remove()
    } catch (reason) { fail(reason) }
    finally { lock.current = false; if (mounted.current) { onPendingChange?.(pending.current !== null); setBusy(false) } }
  }
  return <Section title="Documentos privados">
    <p className="text-sm text-muted-foreground">PDF, PNG ou JPG · até 25 MiB. Não envie arquivos de saúde. Holerites externos são documentos recebidos do contador.</p>
    {capacidades.includes("editCadastro") && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void upload(event.currentTarget) }}>
      <fieldset disabled={disabled || busy || retryComplete} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm">Arquivo<input ref={fileInput} className={control} type="file" accept=".pdf,.png,.jpg" required /></label>
        <label className="min-w-0 text-sm">Categoria<select className={control} value={category} onChange={event => setCategory(event.target.value)}>
          {categoriasDocumentais.map(value => <option key={value} value={value}>{value === "holerite_externo" ? "Holerite externo · recebido do contador" : value}</option>)}
        </select></label>
        {category !== "holerite_externo" && <label className="min-w-0 text-sm">Origem<select className={control} name="origem" required><option value="">Selecione</option><option value="INTERNO">Interno</option><option value="CONTADOR_EXTERNO">Recebido do contador</option></select></label>}
      </fieldset>
      {!retryComplete && <Button className="min-h-11" disabled={disabled || busy} type="submit">Enviar documento</Button>}
    </form>}
    {retryComplete && <div className="flex min-w-0 flex-wrap gap-2"><Button className="min-h-11" disabled={disabled || busy} onClick={() => void retry()}>Repetir confirmação</Button><Button className="min-h-11" variant="outline" disabled={disabled || busy} onClick={() => { resource.reload(); setStage("Lista atualizada. A confirmação pendente ainda pode ser repetida.") }}>Conferir lista antes de novo envio</Button></div>}
    {busy && <Button variant="outline" onClick={() => { controller.current?.abort(); setStage("Operação interrompida. Confira a lista ou repita a confirmação pendente."); resource.reload() }}>Cancelar</Button>}
    <p role="status" className="text-sm">{stage}</p>
    {error && <Notice code={error} />}
    {resource.error ? <Notice code={resource.error} retry={resource.reload} /> : !resource.data ? <p role="status">Carregando documentos…</p> :
      !resource.data.length ? <p className="text-sm text-muted-foreground">Nenhum documento disponível para suas permissões.</p> :
      <ul className="divide-y divide-border">{resource.data.map(doc => <li key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-all text-sm">{doc.nomeArquivo}</p><p className="text-xs text-muted-foreground">{doc.categoria === "holerite_externo" ? "Documento recebido do contador" : doc.categoria} · {doc.mime}</p></div>
        <Button className="min-h-11" variant="outline" disabled={disabled || busy} onClick={() => void download(doc.id)}>Baixar</Button>
      </li>)}</ul>}
  </Section>
}
