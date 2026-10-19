"use client"
import { useCallback, useContext, useEffect, useRef, useState } from "react"
import type { listarDocumentos, criarUploadIntent, confirmarUpload, autorizarDownload } from "@/lib/pessoas/documentos/service"
import { usePessoas } from "./contexto"
import { control, Notice, PessoasInteracaoContext, Section, useResource, type StoreResourceAction } from "./ui"
import { accessCodes } from "@/lib/pessoas/adapters/cadastro-ui"
import { pessoasScopeEpoch, refreshPessoas } from "./use-disponibilidade"
import { Button } from "@/components/ui/button"

export type DocumentActions = {
  listar: StoreResourceAction<typeof listarDocumentos>; criarIntent: StoreResourceAction<typeof criarUploadIntent>
  confirmar: StoreResourceAction<typeof confirmarUpload>; download: StoreResourceAction<typeof autorizarDownload>
}
type UploadState = "idle" | "preparing" | "bytes_pending" | "put_unknown" | "confirmation_pending" | "complete_unknown" | "confirmed" | "invalid_intent"
type PendingUpload = {
  token: string; file: File; signedUrl: string; headers: Record<string, string>; urlExpiresAt: number; scopeEpoch: number
}
async function actionData<T>(operation: Promise<{ ok: true; data: T } | { ok: false; code: string }>, signal?: AbortSignal): Promise<T> {
  const operationEpoch = pessoasScopeEpoch()
  const result = await operation
  if (signal?.aborted || operationEpoch !== pessoasScopeEpoch()) throw new DOMException("Operação interrompida", "AbortError")
  if (!result.ok) throw new Error(result.code)
  return result.data
}
// Cancela somente a espera do complete; a Server Action continua e pode responder depois.
function waitForConfirmation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (finish: () => void) => {
      if (settled) return
      settled = true; signal.removeEventListener("abort", abort); finish()
    }
    const abort = () => settle(() => reject(new DOMException("Operação interrompida", "AbortError")))
    signal.addEventListener("abort", abort, { once: true })
    // Ambos os handlers consomem respostas tardias sem tocar em estado ou locks.
    operation.then(value => settle(() => resolve(value)), reason => settle(() => reject(reason)))
    if (signal.aborted) abort()
  })
}
export function Documentos({ id, actions, disabled = false, onPendingChange, acquireMutation }: {
  id: string; actions: DocumentActions; disabled?: boolean; onPendingChange?: (pending: boolean) => void; acquireMutation?: () => boolean
}) {
  const { storeId, empregadorId, capacidades, categoriasDocumentais } = usePessoas()
  const interativo = useContext(PessoasInteracaoContext)
  const autorizado = useRef(interativo)
  autorizado.current = interativo
  const resource = useResource(useCallback(() => actions.listar(storeId, empregadorId, id), [actions, storeId, empregadorId, id]))
  const [stage, setStage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<UploadState>("idle")
  const [urlExpired, setUrlExpired] = useState(false)
  const [bytesConfirmed, setBytesConfirmed] = useState(false)
  const [category, setCategory] = useState("identificacao")
  const pending = useRef<PendingUpload | null>(null)
  const uploadState = useRef<UploadState>("idle")
  const reloadOnResume = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const lock = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const hasPending = ["bytes_pending", "put_unknown", "confirmation_pending", "complete_unknown"].includes(state)
  const rejected = state === "invalid_intent"
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false; controller.current?.abort(); pending.current = null
    uploadState.current = "idle"; reloadOnResume.current = false
  } }, [])
  useEffect(() => { onPendingChange?.(busy || hasPending || rejected) }, [busy, hasPending, rejected, onPendingChange])
  useEffect(() => () => onPendingChange?.(false), [onPendingChange])
  useEffect(() => {
    const intent = pending.current
    if (!intent) return
    const remaining = intent.urlExpiresAt - Date.now()
    if (remaining <= 0) { setUrlExpired(true); return }
    const timer = window.setTimeout(() => setUrlExpired(true), remaining)
    return () => window.clearTimeout(timer)
  }, [state])
  useEffect(() => {
    if (interativo && reloadOnResume.current) { reloadOnResume.current = false; resource.reload() }
  }, [interativo, resource])
  function transition(next: UploadState) { uploadState.current = next; setState(next) }
  function refreshList() {
    if (autorizado.current) resource.reload()
    else reloadOnResume.current = true
  }
  function fail(reason: unknown) {
    if (!mounted.current) return
    const code = reason instanceof Error && /^[A-Z_]+$/.test(reason.message) ? reason.message : "REDE"
    if (accessCodes.includes(code)) { refreshPessoas(); return }
    setError(code)
  }
  async function complete(signal: AbortSignal) {
    const intent = pending.current
    if (!intent || signal.aborted || !autorizado.current || intent.scopeEpoch !== pessoasScopeEpoch()) return
    transition("confirmation_pending"); setStage("Confirmando integridade e publicação…")
    try { await actionData(waitForConfirmation(actions.confirmar(storeId, intent.token), signal), signal) }
    catch (reason) {
      if (!mounted.current || intent.scopeEpoch !== pessoasScopeEpoch()) return
      // A expiração da URL não invalida o intent: somente a recusa definitiva do backend o encerra.
      if (reason instanceof Error && ["INTENT_INVALIDO", "INTENT_EXPIRADO", "INTEGRIDADE_INVALIDA", "CONTEUDO_INVALIDO"].includes(reason.message)) {
        pending.current = null; transition("invalid_intent")
        setStage("A autorização do envio foi recusada. Confira a lista e descarte este envio antes de iniciar outro.")
        refreshList()
      } else {
        transition("complete_unknown"); setStage("Confirmação sem resposta conclusiva. Confira a lista ou repita a confirmação.")
      }
      throw reason
    }
    if (!mounted.current || signal.aborted) return
    pending.current = null; transition("confirmed"); setStage("Documento salvo.")
    if (fileInput.current) fileInput.current.value = ""
    refreshList()
  }
  async function sendBytes(signal: AbortSignal) {
    const intent = pending.current
    if (!intent || signal.aborted || !autorizado.current || intent.scopeEpoch !== pessoasScopeEpoch()) return
    if (Date.now() >= intent.urlExpiresAt) { setUrlExpired(true); return }
    transition("bytes_pending"); setStage("Enviando bytes ao armazenamento privado…")
    let response: Response
    try {
      response = await fetch(intent.signedUrl, { method: "PUT", body: intent.file, headers: intent.headers, signal, credentials: "omit", referrerPolicy: "no-referrer" })
      if (signal.aborted) throw new DOMException("Operação interrompida", "AbortError")
    } catch (reason) {
      if (mounted.current && intent.scopeEpoch === pessoasScopeEpoch()) { transition("put_unknown"); setStage("Resposta do envio de bytes não confirmada. Repita o envio ou verifique a confirmação.") }
      throw reason
    }
    if (!mounted.current || intent.scopeEpoch !== pessoasScopeEpoch()) return
    // 412 mantém a criação exclusiva: conferir o objeto existente pelo complete canônico.
    if (!response.ok && response.status !== 412) { transition("bytes_pending"); throw new Error("PUT_FALHOU") }
    setBytesConfirmed(true); transition("confirmation_pending")
    if (!autorizado.current) { setStage("Bytes enviados. Aguarde a revalidação para confirmar o documento."); return }
    await complete(signal)
  }
  async function operate(operation: (signal: AbortSignal) => Promise<void>) {
    if (lock.current || disabled || !autorizado.current || (acquireMutation && !acquireMutation())) return
    const operationEpoch = pessoasScopeEpoch()
    onPendingChange?.(true)
    lock.current = true; setBusy(true); setError("")
    const ac = new AbortController(); controller.current = ac
    try { await operation(ac.signal) } catch (reason) { if (operationEpoch === pessoasScopeEpoch()) fail(reason) }
    finally {
      lock.current = false
      if (mounted.current) {
        if (uploadState.current === "preparing" && !pending.current) transition("idle")
        onPendingChange?.(pending.current !== null || uploadState.current === "invalid_intent"); setBusy(false)
      }
    }
  }
  async function upload(form: HTMLFormElement) {
    if (pending.current || uploadState.current === "invalid_intent") return
    const file = fileInput.current?.files?.[0]
    if (!file) { setError("ARQUIVO_INVALIDO"); return }
    const ext = file.name.split(".").pop()?.toLowerCase()
    const mime: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" }
    if (!ext || mime[ext] !== file.type || file.size < 1 || file.size > 25 * 1024 * 1024) { setError("ARQUIVO_INVALIDO"); return }
    const origem = category === "holerite_externo" ? "CONTADOR_EXTERNO" : new FormData(form).get("origem")
    if (origem !== "INTERNO" && origem !== "CONTADOR_EXTERNO") { setError("ORIGEM_INVALIDA"); return }
    await operate(async signal => {
      const operationEpoch = pessoasScopeEpoch()
      transition("preparing"); setStage("Calculando SHA-256…")
      const bytes = await file.arrayBuffer()
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(v => v.toString(16).padStart(2, "0")).join("")
      if (!mounted.current || signal.aborted || !autorizado.current || operationEpoch !== pessoasScopeEpoch()) return
      setStage("Solicitando autorização de envio…")
      const requestedAt = Date.now()
      // Uma action já enviada pode responder após Cancelar: reter o intent recebido, sem iniciar PUT.
      const intent = await actionData(actions.criarIntent(storeId, { empregadorId, vinculoId: id, categoria: category,
        origem, nomeArquivo: file.name, mime: file.type, bytes: file.size, sha256: hash }))
      if (!mounted.current || operationEpoch !== pessoasScopeEpoch()) return
      pending.current = { token: intent.uploadIntent, file, signedUrl: intent.signedUrl,
        headers: intent.headersObrigatorios, urlExpiresAt: requestedAt + intent.expiresInSec * 1000, scopeEpoch: operationEpoch }
      setUrlExpired(false); setBytesConfirmed(false); transition("bytes_pending")
      if (signal.aborted || !autorizado.current) { setStage("Envio de bytes pendente. Retome após revalidar o acesso."); return }
      await sendBytes(signal)
    })
  }
  async function download(documentoId: string) {
    await operate(async signal => {
      const result = await actionData(actions.download(storeId, empregadorId, documentoId), signal)
      if (!mounted.current || signal.aborted || !autorizado.current) return
      const link = document.createElement("a")
      link.href = result.signedUrl; link.rel = "noopener noreferrer"; link.referrerPolicy = "no-referrer"; link.target = "_blank"
      document.body.appendChild(link); link.click(); link.remove()
    })
  }
  const blocked = !interativo || disabled || busy
  return <Section title="Documentos privados">
    <p className="text-sm text-muted-foreground">PDF, PNG ou JPG · até 25 MiB. Não envie arquivos de saúde. Holerites externos são documentos recebidos do contador.</p>
    {capacidades.includes("editCadastro") && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void upload(event.currentTarget) }}>
      <fieldset disabled={blocked || hasPending || rejected} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm">Arquivo<input ref={fileInput} className={control} type="file" accept=".pdf,.png,.jpg" required /></label>
        <label className="min-w-0 text-sm">Categoria<select className={control} value={category} onChange={event => setCategory(event.target.value)}>
          {categoriasDocumentais.map(value => <option key={value} value={value}>{value === "holerite_externo" ? "Holerite externo · recebido do contador" : value}</option>)}
        </select></label>
        {category !== "holerite_externo" && <label className="min-w-0 text-sm">Origem<select className={control} name="origem" required><option value="">Selecione</option><option value="INTERNO">Interno</option><option value="CONTADOR_EXTERNO">Recebido do contador</option></select></label>}
      </fieldset>
      {!hasPending && !rejected && <Button className="min-h-11" disabled={blocked} type="submit">Enviar documento</Button>}
    </form>}
    {hasPending && <div className="space-y-2">
      {urlExpired && <p role="status" className="text-sm">A URL de envio expirou. O documento ainda pode ser confirmado: confira a lista ou verifique a confirmação.</p>}
      <div className="flex min-w-0 flex-wrap gap-2">
        {!bytesConfirmed && <Button className="min-h-11" disabled={blocked || urlExpired} onClick={() => void operate(sendBytes)}>Repetir envio de bytes</Button>}
        <Button className="min-h-11" disabled={blocked} onClick={() => void operate(complete)}>{!bytesConfirmed ? "Verificar confirmação" : "Repetir confirmação"}</Button>
        <Button className="min-h-11" variant="outline" disabled={blocked} onClick={() => { refreshList(); setStage("Lista atualizada. O envio pendente ainda pode ser retomado.") }}>Conferir lista antes de novo envio</Button>
      </div>
    </div>}
    {rejected && <Button className="min-h-11" variant="outline" disabled={blocked} onClick={() => {
      if (lock.current || disabled || !autorizado.current) return
      transition("idle"); setError(""); setStage("Envio recusado descartado. Selecione o arquivo para iniciar outro envio.")
      if (fileInput.current) fileInput.current.value = ""
      onPendingChange?.(false)
    }}>Descartar envio recusado</Button>}
    {busy && <Button variant="outline" disabled={!interativo} onClick={() => { controller.current?.abort(); setStage("Operação interrompida. Confira a lista ou retome o envio pendente."); refreshList() }}>Cancelar</Button>}
    <p role="status" className="text-sm">{stage}</p>
    {error && <Notice code={error} />}
    {resource.error ? <Notice code={resource.error} retry={() => { if (autorizado.current) resource.reload() }} /> : !resource.data ? <p role="status">Carregando documentos…</p> :
      !resource.data.length ? <p className="text-sm text-muted-foreground">Nenhum documento disponível para suas permissões.</p> :
      <ul className="divide-y divide-border">{resource.data.map(doc => <li key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-all text-sm">{doc.nomeArquivo}</p><p className="text-xs text-muted-foreground">{doc.categoria === "holerite_externo" ? "Documento recebido do contador" : doc.categoria} · {doc.mime}</p></div>
        <Button className="min-h-11" variant="outline" disabled={blocked} onClick={() => void download(doc.id)}>Baixar</Button>
      </li>)}</ul>}
  </Section>
}
