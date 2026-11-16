"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { Barcode, Download, Printer, RefreshCw } from "lucide-react"
import * as api from "@/app/actions/identificacao-etiquetas"
import { DEFAULT_MEDIA, targetKey, type IdentifierDTO, type JobDTO, type LabelMedia, type MutationRef, type Operation, type Result, type TargetDTO } from "@/lib/identificacao/contracts"

const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
const input = "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
type Pending = { op: Operation; payload: Record<string, unknown>; requestKey: string }
type History = { id: string; total: number; originalId: string | null; motivo: string; createdAt: string }
const newKey = () => crypto.randomUUID()
const scope = (t: TargetDTO) => ({ produtoId: t.produtoId, varianteId: t.varianteId })
const printStates: Record<string, string> = { SOLICITADO: "Solicitação registrada · envio não confirmado", RESULTADO_DESCONHECIDO: "Resultado desconhecido · confira a saída física", FALHA_ANTES_ENVIO: "Falha antes do envio", CONFIRMADO_MANUAL: "Saída confirmada manualmente" }
async function dispatch(storeId: string, p: Pending): Promise<Result<MutationRef>> {
  const actions = { INTERNO: api.emitirCodigoInterno, CADASTRAR: api.registrarIdentificador, ATIVO: api.alterarIdentificadorAtivo,
    LOTE: api.criarLoteEtiquetas, REIMPRIMIR: api.reimprimirLoteEtiquetas, TENTATIVA: api.iniciarImpressaoEtiquetas, EVENTO: api.registrarEventoImpressao }
  return actions[p.op](storeId, p.payload)
}

/** Remontado por loja no HUB. Respostas antigas não podem preencher a nova unidade. */
export function IdentificacaoEtiquetasPanel({ storeId }: { storeId: string }) {
  const [rows, setRows] = useState<TargetDTO[]>([]), [q, setQ] = useState(""), [code, setCode] = useState("")
  const [limited, setLimited] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false)
  const [loadingJob, setLoadingJob] = useState(false)
  const [message, setMessage] = useState(""), [pending, setPending] = useState<Pending | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({}), [media, setMedia] = useState<LabelMedia>(DEFAULT_MEDIA)
  const [detail, setDetail] = useState<TargetDTO | null>(null), [identifiers, setIdentifiers] = useState<IdentifierDTO[]>([])
  const [adopt, setAdopt] = useState(false), [type, setType] = useState<"ALIAS" | "GTIN">("ALIAS")
  const [value, setValue] = useState(""), [origin, setOrigin] = useState("MANUAL"), [evidence, setEvidence] = useState("")
  const [history, setHistory] = useState<History[]>([]), [job, setJob] = useState<JobDTO | null>(null), [reason, setReason] = useState("")
  const [preview, setPreview] = useState<string | null>(null), [pdfReady, setPdfReady] = useState(false)
  const alive = useRef(false), sequence = useRef(0), detailSequence = useRef(0), inFlight = useRef(false), printing = useRef(false), pdfUrl = useRef<string | null>(null)
  const jobSequence = useRef(0), previewSequence = useRef(0), currentJobId = useRef<string | null>(null)
  const storageKey = `omni.identificacao.pending.v1:${storeId}`
  const locked = busy || loadingJob || !!pending
  const selection = rows.filter(t => quantities[targetKey(t)] > 0)
  const total = selection.reduce((n, t) => n + quantities[targetKey(t)], 0)

  const refresh = useCallback(async (query = "") => {
    const seq = ++sequence.current
    setLoading(true)
    try {
      const [targets, jobs] = await Promise.all([api.listIdentificacaoTargets(storeId, query), api.listLotesEtiquetas(storeId)])
      if (!alive.current || seq !== sequence.current) return
      if (targets.ok) { setRows(targets.value.items); setLimited(targets.value.limited) } else setMessage(targets.message)
      if (jobs.ok) setHistory(jobs.value)
      return targets.ok ? targets.value.items : null
    } catch { if (alive.current) setMessage("Falha de rede ao consultar. Tente atualizar.") }
    finally { if (alive.current && seq === sequence.current) setLoading(false) }
  }, [storeId])
  useEffect(() => {
    alive.current = true
    try { const p = JSON.parse(sessionStorage.getItem(storageKey) || "null"); if (p?.requestKey && p?.payload && ["INTERNO", "CADASTRAR", "ATIVO", "LOTE", "REIMPRIMIR", "TENTATIVA", "EVENTO"].includes(p.op)) setPending(p) } catch { /* storage indisponível */ }
    void refresh()
    return () => { alive.current = false; if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current) }
  }, [refresh, storageKey])
  const savePending = (p: Pending | null) => {
    setPending(p)
    // Persistir ANTES do envio; se storage falhar, ainda manter a chave em memória e exibi-la.
    try { if (p) sessionStorage.setItem(storageKey, JSON.stringify(p)); else sessionStorage.removeItem(storageKey) } catch { /* chave permanece no componente */ }
  }
  const openJob = async (id: string) => {
    const seq = ++jobSequence.current
    ++previewSequence.current
    currentJobId.current = null
    setLoadingJob(true); setPdfReady(false); setPreview(null)
    if (pdfUrl.current) { URL.revokeObjectURL(pdfUrl.current); pdfUrl.current = null }
    try {
      const r = await api.getLoteEtiquetas(storeId, id)
      if (!alive.current || seq !== jobSequence.current) return
      if (r.ok) {
        currentJobId.current = r.value.id; setJob(r.value)
      } else setMessage(r.message)
    } catch { if (alive.current && seq === jobSequence.current) setMessage("Não foi possível consultar o lote.") }
    finally { if (alive.current && seq === jobSequence.current) setLoadingJob(false) }
  }
  const openDetail = async (t: TargetDTO) => {
    const seq = ++detailSequence.current
    setDetail(t); setIdentifiers([]); setAdopt(false); setValue(""); setEvidence("")
    try {
      const r = await api.listIdentificadores(storeId, scope(t))
      if (alive.current && seq === detailSequence.current && r.ok) setIdentifiers(r.value)
      else if (alive.current && seq === detailSequence.current && !r.ok) setMessage(r.message)
    } catch { if (alive.current) setMessage("Falha ao consultar identificadores.") }
  }
  const accept = async (ref: MutationRef) => {
    const current = await refresh(q)
    if (!alive.current) return
    if (ref.kind === "job") await openJob(ref.id)
    else if (ref.kind === "attempt" && job) await openJob(job.id)
    else if (detail) await openDetail(current?.find(t => targetKey(t) === targetKey(detail)) ?? detail)
  }
  const perform = async (op: Operation, payload: Record<string, unknown>, retry?: Pending): Promise<MutationRef | null> => {
    if (inFlight.current) return null
    inFlight.current = true
    const p = retry ?? { op, payload: { ...payload, requestKey: newKey() }, requestKey: "" }
    if (!retry) p.requestKey = p.payload.requestKey as string
    savePending(p); setBusy(true); setMessage("")
    try {
      const r = await dispatch(storeId, p)
      if (!alive.current) return null
      if (!r.ok) { setMessage(r.message); if (r.code !== "UNKNOWN_RESULT") savePending(null); return null }
      savePending(null); setMessage("Operação registrada."); await accept(r.value); return r.value
    } catch { if (alive.current) setMessage("Resposta perdida. Consulte a solicitação antes de continuar."); return null }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  const recover = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const r = await api.consultarSolicitacaoIdentificacao(storeId, pending.op, pending.requestKey)
      if (!alive.current) return
      if (r.ok && r.value) { savePending(null); setMessage("Resultado recuperado; nenhum reenvio de impressão foi feito."); await accept(r.value) }
      else setMessage(r.ok ? "Ainda sem resultado confirmado. Repita apenas esta mesma solicitação." : r.message)
    } catch { if (alive.current) setMessage("Consulta indisponível. A chave foi preservada.") }
    finally { if (alive.current) setBusy(false) }
  }
  const endpoint = (id: string, format?: string) => `/api/identificacao/etiquetas/${encodeURIComponent(id)}?storeId=${encodeURIComponent(storeId)}${format ? `&format=${format}` : ""}`
  const makePreview = async () => {
    if (!job) return
    const jobId = job.id, seq = ++previewSequence.current
    setBusy(true); setPdfReady(false)
    try {
      const r = await fetch(endpoint(jobId), { cache: "no-store" })
      if (!r.ok) throw new Error((await r.json()).message || "Falha ao gerar PDF.")
      const bytes = new Uint8Array(await r.arrayBuffer())
      if (bytes.length < 5 || [37, 80, 68, 70, 45].some((b, i) => bytes[i] !== b)) throw new Error("Resposta de PDF vazia ou inválida. O lote permanece salvo; tente gerar novamente.")
      const blob = new Blob([bytes], { type: "application/pdf" })
      if (!alive.current || currentJobId.current !== jobId || seq !== previewSequence.current) return
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current)
      pdfUrl.current = URL.createObjectURL(blob); setPreview(pdfUrl.current); setPdfReady(true); setMessage("PDF pronto para conferência. Impressão física não homologada.")
    } catch (e) { if (alive.current && currentJobId.current === jobId && seq === previewSequence.current) setMessage(e instanceof Error ? e.message : "Falha no PDF; lote permanece salvo.") }
    finally { if (alive.current) setBusy(false) }
  }
  const print = async () => {
    if (!job || locked || !pdfReady || printing.current) return
    printing.current = true
    const popup = window.open("about:blank", "_blank", "popup,width=650,height=750")
    if (popup) popup.opener = null
    const attempt = await perform("TENTATIVA", { loteId: job.id })
    if (!attempt) { popup?.close(); printing.current = false; return }
    if (!popup) { await perform("EVENTO", { tentativaId: attempt.id, evento: "POPUP_BLOQUEADO" }); printing.current = false; return }
    setBusy(true)
    let invoked = false
    try {
      const r = await fetch(endpoint(job.id, "html"), { cache: "no-store" })
      if (!r.ok) throw new Error("Falha ao preparar impressão.")
      const html = await r.text()
      if (popup.closed || !alive.current) throw new Error("Janela fechada antes do envio.")
      popup.document.open(); popup.document.write(html); popup.document.close()
      await popup.document.fonts.ready
      popup.focus(); invoked = true; popup.print()
    } catch { if (!invoked) popup.close() }
    // afterprint/fechar diálogo não é prova física. Se print() foi chamado, resultado sempre incerto.
    if (alive.current) await perform("EVENTO", { tentativaId: attempt.id, evento: invoked ? "DIALOGO_SOLICITADO" : "FALHA_PREPARACAO" })
    if (alive.current) setBusy(false)
    printing.current = false
  }

  return <section aria-label="Identificação e etiquetas" className="space-y-5 pb-8">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Barcode className="h-5 w-5 text-primary"/>Identificação e etiquetas</h2><p className="mt-1 text-sm text-muted-foreground">Códigos permanentes por produto e variação. Selecione, configure a mídia e confira o PDF.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">QA privado · sem operação de estoque</span></div>
    {message && <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm break-words">{message}</p>}
    {pending && <div role="alert" className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><p>Solicitação com resultado pendente. A chave está preservada: <code className="break-all">{pending.requestKey}</code></p><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void recover()}>Consultar resultado</button><button className={button} disabled={busy} onClick={() => void perform(pending.op, pending.payload, pending)}>Repetir mesma solicitação</button></div></div>}
    <div className="grid gap-3 md:grid-cols-2">
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setQuantities({}); void refresh(q) }}><label className="sr-only" htmlFor="etiquetas-busca">Buscar produto ou SKU</label><input id="etiquetas-busca" className={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar produto ou SKU" maxLength={100}/><button className={button} disabled={loading}>Buscar</button></form>
      <form className="flex gap-2" onSubmit={async e => { e.preventDefault(); try { const r = await api.lookupIdentificacao(storeId, code); if (alive.current) { if (r.ok) { setRows([r.value]); setQuantities({}); setLimited(false); setMessage("Código identificado nesta loja.") } else setMessage(r.message) } } catch { if (alive.current) setMessage("Consulta indisponível.") } }}><label className="sr-only" htmlFor="etiquetas-codigo">Ler código</label><input id="etiquetas-codigo" className={input} value={code} onChange={e => setCode(e.target.value)} placeholder="Ler código ou digitar identificador" maxLength={160}/><button className={button}>Identificar</button></form>
    </div>
    <div className="rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border p-3"><h3 className="text-sm font-semibold">Alvos para etiquetas</h3><button className={button} disabled={loading || busy} onClick={() => { setQuantities({}); void refresh(q) }}><RefreshCw className="h-3.5 w-3.5"/>Atualizar</button></div>
      {loading ? <p className="p-4 text-sm" role="status">Consultando catálogo…</p> : rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum alvo ativo encontrado. Cadastre produtos ou ajuste a busca.</p> : <ul className="divide-y divide-border">{rows.map(t => <li key={targetKey(t)} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{t.nome}</p><p className="mt-1 break-words text-xs text-muted-foreground">{t.varianteId ? `${t.cor} · ${t.tamanho}` : "Produto simples"} · SKU {t.sku || "não informado"}</p><p className="mt-1 break-all font-mono text-xs">{t.codigoInterno ? `${t.codigoInterno}${t.codigoInternoAtivo ? "" : " · desativado"}` : "Código interno ainda não emitido"}</p></div><div className="flex items-end gap-2"><label className="text-xs text-muted-foreground">Quantidade<input aria-label={`Quantidade ${t.sku || t.nome}`} className={`${input} mt-1 w-20`} type="number" min={0} max={100} step={1} value={quantities[targetKey(t)] || 0} disabled={locked || !t.codigoInternoAtivo} onChange={e => setQuantities(old => ({ ...old, [targetKey(t)]: Math.max(0, Math.min(100, Math.trunc(Number(e.target.value) || 0))) }))}/></label><button className={button} disabled={locked} onClick={() => void openDetail(t)}>Códigos</button></div></li>)}</ul>}
      {limited && <p className="border-t border-border p-3 text-xs text-muted-foreground">Mostrando até 40 alvos. Refine por nome ou SKU.</p>}
    </div>
    {detail && <div className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Gerenciar códigos"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Códigos · {detail.nome}</h3><p className="text-xs text-muted-foreground">{detail.cor} {detail.tamanho} · SKU {detail.sku || "não informado"}</p></div><button className={button} disabled={locked} onClick={() => setDetail(null)}>Fechar</button></div>
      {!detail.codigoInterno && <div className="space-y-2">{detail.varianteId && detail.codigoExistente && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={adopt} disabled={locked} onChange={e => setAdopt(e.target.checked)}/>Preservar o código existente {detail.codigoExistente} como alias permanente e atribuir novo código interno.</label>}<button className={button} disabled={locked || (!!detail.varianteId && !!detail.codigoExistente && !adopt)} onClick={() => void perform("INTERNO", { target: scope(detail), preservarCodigoExistente: adopt })}>Emitir código interno</button></div>}
      <ul className="space-y-2">{identifiers.map(i => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2 text-xs"><span className="break-all"><strong>{i.tipo} · {i.valor}</strong><br/>{i.formato || "Código local"} · {i.origem} · {i.ativo ? "Ativo" : "Desativado"}<br/>{i.evidencia}</span><button className={button} disabled={locked} onClick={() => void perform("ATIVO", { id: i.id, ativo: !i.ativo, expectedVersion: i.version })}>{i.ativo ? "Desativar" : "Reativar"}</button></li>)}</ul>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void perform("CADASTRAR", { target: scope(detail), tipo: type, valor: value, origem: origin, evidencia: evidence }) }}><label className="text-xs">Tipo<select className={`${input} mt-1`} value={type} disabled={locked} onChange={e => { const v = e.target.value as "ALIAS" | "GTIN"; setType(v); setOrigin(v === "GTIN" ? "FABRICANTE" : "MANUAL") }}><option>ALIAS</option><option>GTIN</option></select></label><label className="text-xs">Código<input className={`${input} mt-1`} required maxLength={100} value={value} disabled={locked} onChange={e => setValue(e.target.value)}/></label><label className="text-xs">Proveniência<select className={`${input} mt-1`} value={origin} disabled={locked} onChange={e => setOrigin(e.target.value)}>{(type === "GTIN" ? ["FABRICANTE", "FORNECEDOR", "MARCA"] : ["MANUAL", "FABRICANTE", "FORNECEDOR", "MARCA"]).map(o => <option key={o}>{o}</option>)}</select></label><label className="text-xs">Evidência / referência<input className={`${input} mt-1`} required minLength={3} maxLength={500} value={evidence} disabled={locked} onChange={e => setEvidence(e.target.value)}/></label><p className="text-xs text-muted-foreground sm:col-span-2">GTIN tem validação de formato e checksum. A proveniência é declarada pelo usuário; não há consulta externa de titularidade. Registrar o mesmo valor de um alias como GTIN promove o registro explicitamente.</p><button className={button} disabled={locked}>Registrar identificador</button></form>
    </div>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]"><div className="space-y-4 rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">Mídia e lote</h3><label className="block text-xs">Tamanho da etiqueta<select aria-label="Tamanho da etiqueta" className={`${input} mt-1`} disabled={locked} value={`${media.widthMm}x${media.heightMm}`} onChange={e => { const [widthMm, heightMm] = e.target.value.split("x").map(Number); setMedia(m => ({ ...m, widthMm, heightMm, marginMm: 2, barcodeHeightMm: heightMm === 30 && m.showPrice ? 8 : 10 })) }}><option value="50x30">50 × 30 mm</option><option value="60x40">60 × 40 mm</option><option value="80x50">80 × 50 mm</option></select></label><div className="grid grid-cols-2 gap-3"><label className="text-xs">Margem (mm)<input className={`${input} mt-1`} type="number" min={2} max={6} value={media.marginMm} disabled={locked} onChange={e => setMedia(m => ({ ...m, marginMm: Number(e.target.value) }))}/></label><label className="text-xs">Barras (mm)<input className={`${input} mt-1`} type="number" min={7} max={20} value={media.barcodeHeightMm} disabled={locked} onChange={e => setMedia(m => ({ ...m, barcodeHeightMm: Number(e.target.value) }))}/></label></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={media.showPrice} disabled={locked} onChange={e => setMedia(m => ({ ...m, showPrice: e.target.checked, barcodeHeightMm: Math.min(m.barcodeHeightMm, Math.max(7, m.heightMm - 2 * m.marginMm - (e.target.checked ? 18 : 15))) }))}/>Incluir preço de venda</label><p className="text-sm"><strong>{total}</strong> etiquetas · {selection.length} alvos</p><p className="text-xs text-muted-foreground">Até 50 alvos, 100 unidades por alvo e 500 etiquetas por lote. O lote congela o cadastro e a mídia; atualizar o produto não altera um lote salvo.</p><button className={`${button} w-full bg-primary text-primary-foreground hover:bg-primary/90`} disabled={locked || !total || total > 500 || selection.length > 50} onClick={() => void perform("LOTE", { media, items: selection.map(t => ({ target: scope(t), quantidade: quantities[targetKey(t)], expectedUpdatedAt: t.updatedAt, expectedVariantVersion: t.variantVersion })) })}>Salvar lote para conferência</button></div>
    <div className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Prévia e saída</h3>{job && <span className="text-xs text-muted-foreground">{job.total} etiquetas · {new Date(job.createdAt).toLocaleString("pt-BR")}</span>}</div>{!job ? <div className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-5 text-center text-muted-foreground"><Barcode className="h-8 w-8"/><p className="text-sm">Salve um lote ou abra um lote recente para conferir.</p></div> : <><div className="flex flex-wrap gap-2"><button className={button} disabled={locked} onClick={() => void makePreview()}>Gerar prévia / PDF</button>{preview && <a className={button} href={preview} download={`etiquetas-${job.id}.pdf`}><Download className="h-4 w-4"/>Baixar PDF</a>}<button className={button} disabled={locked || !pdfReady || job.tentativas.some(t => t.estado !== "FALHA_ANTES_ENVIO")} onClick={() => void print()}><Printer className="h-4 w-4"/>Solicitar impressão</button></div>{preview ? <iframe title="Prévia PDF das etiquetas" src={`${preview}#toolbar=0`} className="h-[420px] w-full rounded-lg border border-border bg-muted"/> : <p className="rounded-lg bg-muted/40 p-5 text-sm">Lote salvo. Gere o PDF para conferir o conteúdo antes de imprimir.</p>}<p className="text-xs text-muted-foreground">Uma etiqueta por página na mídia escolhida. Use escala 100%, sem cabeçalhos ou ajuste automático. Fechar o diálogo não confirma saída física. Impressora e leitor ainda exigem homologação real. PDF impresso fora deste fluxo não retorna estado à aplicação.</p>{job.tentativas.some(t => t.estado !== "FALHA_ANTES_ENVIO") && <p className="text-sm">Já há solicitação neste lote. Para outro envio, crie reimpressão com motivo abaixo.</p>}<ul className="space-y-2">{job.tentativas.map(t => <li key={t.id} className="space-y-2 rounded-lg border border-border p-3 text-xs"><p>{printStates[t.estado]}</p>{!["CONFIRMADO_MANUAL", "FALHA_ANTES_ENVIO"].includes(t.estado) && <button className={button} disabled={locked} onClick={() => { if (window.confirm("Você conferiu fisicamente a saída deste lote? Esta confirmação manual será auditada.")) void perform("EVENTO", { tentativaId: t.id, evento: "CONFIRMAR_MANUAL" }) }}>Confirmei a saída física</button>}</li>)}</ul><form className="flex flex-wrap gap-2 border-t border-border pt-3" onSubmit={e => { e.preventDefault(); void perform("REIMPRIMIR", { loteId: job.id, motivo: reason }) }}><label className="sr-only" htmlFor="etiquetas-motivo">Motivo da reimpressão</label><input id="etiquetas-motivo" className={`${input} flex-1`} placeholder="Motivo da reimpressão" minLength={3} maxLength={300} required value={reason} onChange={e => setReason(e.target.value)} disabled={locked}/><button className={button} disabled={locked}>Criar reimpressão</button></form></>}</div></div>
    <div className="rounded-xl border border-border bg-card p-4"><h3 className="mb-3 font-semibold">Lotes recentes</h3>{history.length ? <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{history.map(h => <li key={h.id}><button className={`${button} h-full w-full flex-col items-start text-left`} disabled={locked} onClick={() => void openJob(h.id)}><span>{h.total} etiquetas · {h.originalId ? "Reimpressão" : "Lote original"}</span><span className="text-xs font-normal text-muted-foreground">{new Date(h.createdAt).toLocaleString("pt-BR")}</span>{h.motivo && <span className="break-words font-normal">{h.motivo}</span>}</button></li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum lote salvo nesta loja.</p>}</div>
  </section>
}
