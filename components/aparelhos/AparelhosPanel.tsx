"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowDownToLine, ChevronLeft, ChevronRight, Eye, History, LayoutGrid, Loader2, Plus, Printer, RefreshCw, Search, Settings2,
  ShieldCheck, ShoppingCart, Smartphone, Truck, UserRoundCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { APARELHO_CONDICOES, APARELHO_CONDICAO_LABEL, APARELHO_ORIGENS, APARELHO_STATUS, APARELHO_STATUS_LABEL } from "@/lib/aparelhos/lifecycle"
import { dbToDateKey, formatDateKeyBr, rotuloPrazo } from "@/lib/aparelhos/warranty"
import {
  abrirDocumento, apiAparelhos, ApiError, type AparelhoDTO, type AquisicaoItem, type Detalhe, type GarantiaItem, type HistoricoItem, type Lista, type Resumo,
} from "./api"
import { AparelhoFormDialog } from "./AparelhoFormDialog"
import { AparelhoFichaDialog } from "./AparelhoFichaDialog"
import { CompraClienteDialog } from "./CompraClienteDialog"
import { CondicaoPill, EmptyState, FieldLabel, Pill, StatusPill, brl, dataBr, dataHoraBr, inputCls, origemLabel } from "./parts"

type Sub = "visao" | "lista" | "compras" | "garantias" | "historico"
const SUBS: Array<{ id: Sub; label: string; icon: typeof LayoutGrid }> = [
  { id: "visao", label: "Visão geral", icon: LayoutGrid },
  { id: "lista", label: "Aparelhos", icon: Smartphone },
  { id: "compras", label: "Compras de cliente", icon: UserRoundCheck },
  { id: "garantias", label: "Garantias", icon: ShieldCheck },
  { id: "historico", label: "Histórico", icon: History },
]

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

export function AparelhosPanel({ storeId }: { storeId: string }) {
  const [sub, setSub] = useState<Sub>("visao")
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [erroResumo, setErroResumo] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState<{ open: boolean; mode: { kind: "novo"; origem?: "cadastro_manual" | "fornecedor" | "lote" } | { kind: "editar"; aparelho: AparelhoDTO } }>({ open: false, mode: { kind: "novo" } })
  const [ficha, setFicha] = useState<string | null>(null)
  const [compra, setCompra] = useState(false)
  const [politicaOpen, setPoliticaOpen] = useState(false)

  const refresh = useCallback(() => setReload((n) => n + 1), [])
  useEffect(() => {
    if (!storeId) return
    let alive = true
    apiAparelhos<Resumo>(storeId, "/resumo?dias=30")
      .then((r) => { if (alive) { setResumo(r); setErroResumo(null) } })
      .catch((e: ApiError) => { if (alive) setErroResumo(e.message) })
    return () => { alive = false }
  }, [storeId, reload])

  if (erroResumo && !resumo) {
    return <EmptyState icon={<Smartphone className="h-5 w-5" />} title="Aparelhos indisponível">{erroResumo}</EmptyState>
  }
  if (!resumo) return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando aparelhos…</div>

  const perms = resumo.permissoes
  const politica = resumo.politica

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Smartphone className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Aparelhos</h2>
            <p className="text-sm text-muted-foreground">Novos e usados, do cadastro à venda, com IMEI, garantia e origem.</p>
          </div>
        </div>
        <nav aria-label="Seções de aparelhos" className="flex min-w-0 gap-1 overflow-x-auto pb-1">
          {SUBS.map((s) => {
            const Icon = s.icon
            const on = sub === s.id
            return (
              <button key={s.id} type="button" onClick={() => setSub(s.id)} aria-current={on ? "page" : undefined}
                className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted")}>
                <Icon className="h-4 w-4" />{s.label}
                {s.id === "compras" && resumo.aquisicoesPendentes > 0 && <span className={cn("ml-0.5 rounded-full px-1.5 text-xs tabular-nums", on ? "bg-primary-foreground/20" : "bg-primary/10 text-primary")}>{resumo.aquisicoesPendentes}</span>}
              </button>
            )
          })}
        </nav>
      </header>

      {sub === "visao" && (
        <VisaoGeral resumo={resumo} storeId={storeId} reload={reload}
          onNovo={(origem) => setForm({ open: true, mode: { kind: "novo", origem } })}
          onCompra={() => setCompra(true)} onFicha={setFicha} onPolitica={() => setPoliticaOpen(true)} onVerTodos={() => setSub("lista")} />
      )}
      {sub === "lista" && <ListaAparelhos storeId={storeId} reload={reload} perms={perms} onFicha={setFicha} onNovo={() => setForm({ open: true, mode: { kind: "novo" } })} />}
      {sub === "compras" && <Compras storeId={storeId} reload={reload} perms={perms} onCompra={() => setCompra(true)} onFicha={setFicha} onChanged={refresh} />}
      {sub === "garantias" && <Garantias storeId={storeId} reload={reload} perms={perms} onFicha={setFicha} />}
      {sub === "historico" && <Historico storeId={storeId} reload={reload} onFicha={setFicha} />}

      <AparelhoFormDialog open={form.open} onOpenChange={(v) => setForm((f) => ({ ...f, open: v }))} mode={form.mode} storeId={storeId} perms={perms} politica={politica}
        onSaved={(id) => { refresh(); if (form.mode.kind === "novo") setFicha(id) }} />
      <AparelhoFichaDialog open={!!ficha} onOpenChange={(v) => !v && setFicha(null)} aparelhoId={ficha} storeId={storeId} perms={perms} politica={politica} onChanged={refresh}
        onEdit={(d: Detalhe) => { setFicha(null); setForm({ open: true, mode: { kind: "editar", aparelho: d.aparelho } }) }} />
      <CompraClienteDialog open={compra} onOpenChange={setCompra} storeId={storeId} perms={perms} politica={politica} onDone={refresh} />
      <PoliticaDialog open={politicaOpen} onOpenChange={setPoliticaOpen} storeId={storeId} resumo={resumo} onSaved={refresh} />
    </div>
  )
}

/* ───── Visão geral ───── */
function Kpi({ label, value, hint, accent = false }: { label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl border bg-card px-4 py-3", accent ? "border-primary/30" : "border-border")}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function VisaoGeral({ resumo, storeId, reload, onNovo, onCompra, onFicha, onPolitica, onVerTodos }: {
  resumo: Resumo; storeId: string; reload: number; onNovo: (origem?: "cadastro_manual" | "fornecedor" | "lote") => void; onCompra: () => void
  onFicha: (id: string) => void; onPolitica: () => void; onVerTodos: () => void
}) {
  const p = resumo.permissoes
  const ver = p.verCusto
  return (
    <div className="min-w-0 space-y-5">
      <section aria-label="Indicadores" className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Em estoque" value={resumo.emEstoque} hint={ver ? `Custo ${brl(resumo.custoEstoque)}` : `${resumo.emPreparo} em preparação`} accent />
        <Kpi label="Novos" value={resumo.novos} hint={ver ? `Custo ${brl(resumo.custoNovos)}` : "Lacrados e abertos"} />
        <Kpi label="Usados e seminovos" value={resumo.usados} hint={ver ? `Custo ${brl(resumo.custoUsados)}` : "Inclui recondicionados"} />
        <Kpi label="Reservados" value={resumo.reservados} hint={`Valor ${brl(resumo.valorReservados)}`} />
        <Kpi label="Vendidos em 30 dias" value={resumo.vendidosPeriodo} hint={ver ? `Resultado ${brl(resumo.resultadoPeriodo)}` : `Receita ${brl(resumo.receitaPeriodo)}`} />
      </section>

      <section aria-label="Ações rápidas" className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {p.cadastrar && <Button className="h-11 justify-center" onClick={() => onNovo("cadastro_manual")}><Plus className="mr-2 h-4 w-4" />Cadastrar aparelho</Button>}
        {p.comprarDeCliente && <Button variant="outline" className="h-11" onClick={onCompra}><UserRoundCheck className="mr-2 h-4 w-4" />Comprar de cliente</Button>}
        {p.cadastrar && <Button variant="outline" className="h-11" onClick={() => onNovo("fornecedor")}><Truck className="mr-2 h-4 w-4" />Entrada por fornecedor</Button>}
        {p.vender && <Button variant="outline" className="h-11" asChild><Link href="/dashboard/vendas/venda-completa"><ShoppingCart className="mr-2 h-4 w-4" />Vender aparelho</Link></Button>}
      </section>

      <section aria-labelledby="pol-title" className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h3 id="pol-title" className="text-sm font-semibold text-foreground">Garantia na venda</h3>
            <p className="text-xs text-muted-foreground">90 dias legais sempre + adicional contratual escolhido no balcão.</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 md:justify-end">
          {resumo.politica.presetsContratuaisDias.map((d) => (
            <Pill key={d} tone={d === resumo.politica.contratualPadraoDias ? "primary" : "neutral"}>{d === 0 ? "Só a legal" : `+ ${rotuloPrazo(d)}`}</Pill>
          ))}
          <Pill tone="neutral">Personalizada até {resumo.politica.contratualMaxDias} d</Pill>
        </div>
        {p.configurarGarantia && <Button variant="ghost" size="sm" onClick={onPolitica}><Settings2 className="mr-1.5 h-4 w-4" />Configurar</Button>}
      </section>

      <div className="min-w-0">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Entradas recentes</h3>
          <Button variant="ghost" size="sm" onClick={onVerTodos}>Ver todos</Button>
        </div>
        <ListaAparelhos storeId={storeId} reload={reload} perms={p} onFicha={onFicha} compacta onNovo={() => onNovo("cadastro_manual")} />
      </div>
    </div>
  )
}

/* ───── Lista ───── */
function ListaAparelhos({ storeId, reload, perms, onFicha, onNovo, compacta = false }: {
  storeId: string; reload: number; perms: Resumo["permissoes"]; onFicha: (id: string) => void; onNovo: () => void; compacta?: boolean
}) {
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("")
  const [condicao, setCondicao] = useState("")
  const [origem, setOrigem] = useState("")
  const [ordem, setOrdem] = useState("recentes")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(compacta ? 5 : 10)
  const [data, setData] = useState<Lista | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const dq = useDebounced(q)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setPage(1) }, [dq, status, condicao, origem, ordem, pageSize])
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ordem, ...(dq ? { q: dq } : {}), ...(status ? { status } : {}), ...(condicao ? { condicao } : {}), ...(origem ? { origem } : {}) })
    apiAparelhos<Lista>(storeId, `?${qs}`, { signal: ctrl.signal })
      .then((r) => { setData(r); setErro(null) })
      .catch((e: Error) => { if (e.name !== "AbortError") setErro(e.message) })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [storeId, page, pageSize, dq, status, condicao, origem, ordem, reload])

  useEffect(() => {
    if (compacta) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus() } }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [compacta])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="min-w-0 space-y-3">
      {!compacta && (
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <label htmlFor="apa-busca" className="sr-only">Buscar aparelhos</label>
            <input id="apa-busca" ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Modelo, marca, IMEI (ou final), série, código, fornecedor… (F2)" className={cn(inputCls, "pl-9")} />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
            <select aria-label="Condição" className={cn(inputCls, "lg:w-40")} value={condicao} onChange={(e) => setCondicao(e.target.value)}><option value="">Condição</option>{APARELHO_CONDICOES.map((c) => <option key={c} value={c}>{APARELHO_CONDICAO_LABEL[c]}</option>)}</select>
            <select aria-label="Origem" className={cn(inputCls, "lg:w-40")} value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">Origem</option>{APARELHO_ORIGENS.map((o) => <option key={o} value={o}>{origemLabel(o)}</option>)}</select>
            <select aria-label="Situação" className={cn(inputCls, "lg:w-44")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Situação (ativas)</option>{APARELHO_STATUS.map((s) => <option key={s} value={s}>{APARELHO_STATUS_LABEL[s]}</option>)}</select>
            <select aria-label="Ordenar" className={cn(inputCls, "lg:w-40")} value={ordem} onChange={(e) => setOrdem(e.target.value)}><option value="recentes">Mais recentes</option><option value="modelo">Modelo A–Z</option><option value="preco_asc">Menor preço</option><option value="preco_desc">Maior preço</option></select>
          </div>
        </div>
      )}

      {erro && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{erro}</p>}

      {data && data.total === 0 && !loading ? (
        <EmptyState icon={<Smartphone className="h-5 w-5" />} title={dq || status || condicao || origem ? "Nenhum aparelho encontrado" : "Nenhum aparelho cadastrado"}
          action={!dq && perms.cadastrar ? <Button size="sm" onClick={onNovo}><Plus className="mr-1.5 h-4 w-4" />Cadastrar aparelho</Button> : undefined}>
          {dq ? "Confira o IMEI ou tente parte do modelo." : "Cadastre a primeira unidade com IMEI para vender com garantia."}
        </EmptyState>
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Aparelho</th>
                  <th scope="col" className="px-3 py-2 font-medium">IMEI / série</th>
                  <th scope="col" className="px-3 py-2 font-medium">Condição</th>
                  <th scope="col" className="px-3 py-2 font-medium">Origem</th>
                  <th scope="col" className="px-3 py-2 font-medium">Garantia</th>
                  {perms.verCusto && <th scope="col" className="px-3 py-2 text-right font-medium">Custo</th>}
                  <th scope="col" className="px-3 py-2 text-right font-medium">Preço</th>
                  <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                  <th scope="col" className="px-3 py-2 font-medium">Entrada</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className={cn("divide-y divide-border", loading && "opacity-60")}>
                {(data?.itens ?? []).map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => onFicha(a.id)} className="min-w-0 text-left focus-visible:outline-2 focus-visible:outline-ring">
                        <span className="block font-semibold text-foreground">{[a.marca, a.modelo, a.variante].filter(Boolean).join(" ")}</span>
                        <span className="block text-xs text-muted-foreground">{[a.armazenamento, a.cor].filter(Boolean).join(" · ") || "—"} · <span className="font-mono">{a.codigoInterno}</span></span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs tabular-nums">{a.imei1 || a.serial || "—"}</td>
                    <td className="px-3 py-2.5"><CondicaoPill condicao={a.condicao} /></td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{origemLabel(a.origem)}</td>
                    <td className="px-3 py-2.5 text-xs">{a.garantiaContratualDias > 0 ? `Legal + ${rotuloPrazo(a.garantiaContratualDias)}` : "Só a legal (90 d)"}</td>
                    {perms.verCusto && <td className="px-3 py-2.5 text-right tabular-nums">{brl(a.custoTotal)}</td>}
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{brl(a.precoVenda)}</td>
                    <td className="px-3 py-2.5"><StatusPill status={a.status} /></td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{dataBr(a.entradaEstoqueEm ?? a.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right"><Button size="icon" variant="ghost" aria-label={`Abrir ficha ${a.codigoInterno}`} onClick={() => onFicha(a.id)}><Eye className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
                {!data && <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
              </tbody>
            </table>
          </div>
          {data && !compacta && (
            <div className="flex min-w-0 flex-col gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Exibindo {data.itens.length} de {data.total} aparelhos</span>
              <div className="flex items-center gap-2">
                <label htmlFor="apa-pp">Por página</label>
                <select id="apa-pp" className="h-8 rounded-md border border-input bg-background px-2 text-foreground" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>{[10, 25, 50].map((n) => <option key={n}>{n}</option>)}</select>
                <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="tabular-nums text-foreground">{page} / {pages}</span>
                <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Próxima página" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ───── Compras de cliente ───── */
const STATUS_AQ: Record<string, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  aguardando_aprovacao: { label: "Aguardando aprovação", tone: "warning" }, confirmada: { label: "Confirmada", tone: "success" },
  recusada: { label: "Recusada", tone: "danger" }, cancelada: { label: "Cancelada", tone: "neutral" },
}

function Compras({ storeId, reload, perms, onCompra, onFicha, onChanged }: { storeId: string; reload: number; perms: Resumo["permissoes"]; onCompra: () => void; onFicha: (id: string) => void; onChanged: () => void }) {
  const [status, setStatus] = useState("")
  const [data, setData] = useState<{ total: number; itens: AquisicaoItem[] } | null>(null)
  const [recusa, setRecusa] = useState<{ id: string; motivo: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    apiAparelhos<{ total: number; itens: AquisicaoItem[] }>(storeId, `/aquisicoes${status ? `?status=${status}` : ""}`).then(setData).catch((e) => toast.error(e.message))
  }, [storeId, status, reload])

  async function decidir(id: string, decisao: "aprovar" | "recusar", motivo?: string) {
    setBusy(id)
    try {
      await apiAparelhos(storeId, `/aquisicoes/${id}`, { method: "POST", body: { decisao, motivo } })
      toast.success(decisao === "aprovar" ? "Compra aprovada. Confira o IMEI e libere o aparelho para venda." : "Compra recusada.")
      setRecusa(null); onChanged()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <select aria-label="Filtrar por situação" className={cn(inputCls, "sm:w-56")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas as compras</option>{Object.entries(STATUS_AQ).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {perms.comprarDeCliente && <Button onClick={onCompra}><UserRoundCheck className="mr-2 h-4 w-4" />Comprar de cliente</Button>}
      </div>
      {data && data.itens.length === 0 && <EmptyState icon={<UserRoundCheck className="h-5 w-5" />} title="Nenhuma compra registrada">Registre a compra de um usado com protocolo, conferência e aprovação.</EmptyState>}
      <ul className="min-w-0 space-y-2">
        {(data?.itens ?? []).map((a) => {
          const st = STATUS_AQ[a.status] ?? { label: a.status, tone: "neutral" as const }
          return (
            <li key={a.id} className="min-w-0 rounded-xl border border-border bg-card p-4">
              <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="flex min-w-0 flex-wrap items-center gap-2"><span className="font-mono text-sm font-semibold">{a.protocolo}</span><Pill tone={st.tone}>{st.label}</Pill></p>
                  <p className="text-sm text-foreground">{a.vendedor} {a.vendedorDocMascarado && <span className="text-muted-foreground">· {a.vendedorDocMascarado}</span>}</p>
                  <p className="text-xs text-muted-foreground">{dataHoraBr(a.createdAt)} · {a.valorTotal !== null ? brl(a.valorTotal) : "valor restrito"} · {a.pagamentoStatus === "pago" ? "pago" : "pagamento pendente"}{a.aprovadaPor ? ` · decidido por ${a.aprovadaPor}` : ""}{a.motivoRecusa ? ` · ${a.motivoRecusa}` : ""}</p>
                  <ul className="pt-1 text-sm">{a.aparelhos.map((u) => (
                    <li key={u.id}><button type="button" className="text-left text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onFicha(u.id)}>{u.codigoInterno} · {[u.marca, u.modelo, u.armazenamento].filter(Boolean).join(" ")}</button> <span className="font-mono text-xs text-muted-foreground">{u.imei1}</span></li>
                  ))}</ul>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => abrirDocumento(storeId, { tipo: "protocolo_aquisicao", formato: "a4", aquisicaoId: a.id }).catch((e) => toast.error(e.message))}><Printer className="mr-1.5 h-3.5 w-3.5" />Protocolo</Button>
                  {a.status === "aguardando_aprovacao" && perms.aprovarAquisicao && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => setRecusa({ id: a.id, motivo: "" })}>Recusar</Button>
                      <Button size="sm" disabled={busy === a.id || (a.criadoPorMim && perms.role !== "admin")} title={a.criadoPorMim && perms.role !== "admin" ? "Quem registrou não aprova a própria compra" : undefined} onClick={() => void decidir(a.id, "aprovar")}>Aprovar</Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <Dialog open={!!recusa} onOpenChange={(v) => !v && setRecusa(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar compra</DialogTitle><DialogDescription>O aparelho não entra na loja e o IMEI fica livre para nova tentativa.</DialogDescription></DialogHeader>
          <FieldLabel htmlFor="rec-motivo" required>Motivo</FieldLabel>
          <input id="rec-motivo" className={inputCls} value={recusa?.motivo ?? ""} onChange={(e) => recusa && setRecusa({ ...recusa, motivo: e.target.value })} />
          <DialogFooter><Button variant="outline" onClick={() => setRecusa(null)}>Voltar</Button><Button variant="destructive" disabled={!recusa?.motivo.trim()} onClick={() => recusa && void decidir(recusa.id, "recusar", recusa.motivo)}>Recusar compra</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ───── Garantias ───── */
function Garantias({ storeId, reload, perms, onFicha }: { storeId: string; reload: number; perms: Resumo["permissoes"]; onFicha: (id: string) => void }) {
  const [q, setQ] = useState("")
  const [vigentes, setVigentes] = useState(true)
  const [data, setData] = useState<{ total: number; itens: GarantiaItem[] } | null>(null)
  const dq = useDebounced(q)
  useEffect(() => {
    const qs = new URLSearchParams({ ...(dq ? { q: dq } : {}), ...(vigentes ? { vigentes: "1" } : {}) })
    apiAparelhos<{ total: number; itens: GarantiaItem[] }>(storeId, `/garantias?${qs}`).then(setData).catch((e) => toast.error(e.message))
  }, [storeId, dq, vigentes, reload])
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="gar-busca" className="sr-only">Buscar garantias</label>
          <input id="gar-busca" type="search" className={cn(inputCls, "pl-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, número da garantia, venda, modelo ou final do IMEI" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={vigentes} onChange={(e) => setVigentes(e.target.checked)} />Somente vigentes</label>
      </div>
      {data && data.itens.length === 0 && <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="Nenhuma garantia encontrada">Garantias nascem na venda confirmada de um aparelho com IMEI.</EmptyState>}
      <ul className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
        {(data?.itens ?? []).map((g) => (
          <li key={g.id} className="min-w-0 rounded-xl border border-border bg-card p-4">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold">{g.numeroGarantia}</p>
                <button type="button" onClick={() => onFicha(g.aparelho.id)} className="text-left text-sm text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">{[g.aparelho.marca, g.aparelho.modelo, g.aparelho.armazenamento].filter(Boolean).join(" ")}</button>
                <p className="text-xs text-muted-foreground">{g.cliente} · {g.pedidoId} · <span className="font-mono">{g.aparelho.imei1}</span></p>
              </div>
              <Pill tone={g.vigente ? "success" : "neutral"}>{g.vigente ? "Vigente" : g.status === "ativa" ? "Encerrada" : g.status}</Pill>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Entrega {formatDateKeyBr(dbToDateKey(g.dataEntrega))} · legal 90 d{g.contratualDias > 0 ? ` + contratual ${g.contratualDias} d` : ""} · cobertura até <b className="text-foreground">{formatDateKeyBr(dbToDateKey(g.coberturaFim))}</b></p>
            {perms.reimprimir && <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => abrirDocumento(storeId, { tipo: "termo_garantia", formato: "a4", aparelhoVendaId: g.id }).catch((e) => toast.error(e.message))}><Printer className="mr-1.5 h-3.5 w-3.5" />Termo A4</Button>
              <Button size="sm" variant="outline" onClick={() => abrirDocumento(storeId, { tipo: "comprovante_venda", formato: "80mm", aparelhoVendaId: g.id }).catch((e) => toast.error(e.message))}><Printer className="mr-1.5 h-3.5 w-3.5" />80 mm</Button>
              <Button size="sm" variant="outline" onClick={() => abrirDocumento(storeId, { tipo: "termo_entrega", formato: "a4", aparelhoVendaId: g.id }).catch((e) => toast.error(e.message))}><ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />Termo de entrega</Button>
            </div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ───── Histórico ───── */
function Historico({ storeId, reload, onFicha }: { storeId: string; reload: number; onFicha: (id: string) => void }) {
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ total: number; itens: HistoricoItem[] } | null>(null)
  const dq = useDebounced(q)
  useEffect(() => { setPage(1) }, [dq])
  useEffect(() => {
    apiAparelhos<{ total: number; itens: HistoricoItem[] }>(storeId, `/historico?page=${page}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`).then(setData).catch((e) => toast.error(e.message))
  }, [storeId, dq, page, reload])
  const label = useMemo(() => ({ cadastro: "Cadastro", liberacao: "Liberado para venda", venda: "Venda", venda_cancelada: "Venda cancelada", reserva: "Reserva", reserva_cancelada: "Reserva cancelada", conferencia_restricao: "Conferência de IMEI", bloqueio: "Bloqueio", status: "Situação alterada", edicao: "Edição", alteracao_preco: "Preço alterado", aquisicao_confirmada: "Aquisição confirmada", aquisicao_recusada: "Aquisição recusada", reaquisicao: "Recompra", fotos: "Fotos" } as Record<string, string>), [])
  return (
    <div className="min-w-0 space-y-3">
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="hist-busca" className="sr-only">Buscar no histórico</label>
        <input id="hist-busca" type="search" className={cn(inputCls, "pl-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="IMEI (ou final), código interno ou modelo" />
      </div>
      {data && data.itens.length === 0 && <EmptyState icon={<History className="h-5 w-5" />} title="Sem movimentações">Cada cadastro, conferência, reserva e venda aparece aqui.</EmptyState>}
      <ol className="min-w-0 divide-y divide-border rounded-xl border border-border bg-card">
        {(data?.itens ?? []).map((e) => (
          <li key={e.id} className="flex min-w-0 flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-foreground"><b className="font-semibold">{label[e.tipo] ?? e.tipo}</b> · <button type="button" className="text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onFicha(e.aparelho.id)}>{e.aparelho.codigoInterno} {[e.aparelho.marca, e.aparelho.modelo, e.aparelho.armazenamento].filter(Boolean).join(" ")}</button></p>
              <p className="text-xs text-muted-foreground">{e.operador || "sistema"}{e.paraStatus && e.deStatus !== e.paraStatus ? ` · ${APARELHO_STATUS_LABEL[e.paraStatus as keyof typeof APARELHO_STATUS_LABEL] ?? e.paraStatus}` : ""}</p>
            </div>
            <time className="shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={e.createdAt}>{dataHoraBr(e.createdAt)}</time>
          </li>
        ))}
      </ol>
      {data && data.total > 30 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anteriores</Button>
          <Button size="sm" variant="outline" disabled={page * 30 >= data.total} onClick={() => setPage(page + 1)}>Mais antigos</Button>
        </div>
      )}
    </div>
  )
}

/* ───── Política (proprietário) ───── */
function PoliticaDialog({ open, onOpenChange, storeId, resumo, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; storeId: string; resumo: Resumo; onSaved: () => void }) {
  const p = resumo.politica
  const [presets, setPresets] = useState("")
  const [padrao, setPadrao] = useState(0)
  const [max, setMax] = useState(730)
  const [cond, setCond] = useState("")
  const [aprov, setAprov] = useState(true)
  const [conf, setConf] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setPresets(p.presetsContratuaisDias.join(", ")); setPadrao(p.contratualPadraoDias); setMax(p.contratualMaxDias); setCond(p.condicoesTermo)
    setAprov(p.aquisicaoExigeAprovacao); setConf(p.liberacaoExigeConferencia)
  }, [open, p])
  async function salvar() {
    setSaving(true)
    try {
      const list = presets.split(/[,;\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0)
      await apiAparelhos(storeId, "/politica", { method: "PUT", body: { presetsContratuaisDias: list, contratualPadraoDias: padrao, contratualMaxDias: max, condicoesTermo: cond, aquisicaoExigeAprovacao: aprov, liberacaoExigeConferencia: conf } })
      toast.success("Política salva. Garantias já emitidas não mudam.")
      onSaved(); onOpenChange(false)
    } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl sm:max-w-2xl">
        <DialogHeader><DialogTitle>Política de garantia e aquisição</DialogTitle><DialogDescription>A garantia legal de 90 dias é fixa. Aqui você define só o adicional contratual.</DialogDescription></DialogHeader>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5 sm:col-span-3"><FieldLabel htmlFor="pol-presets">Opções rápidas (dias adicionais)</FieldLabel><input id="pol-presets" className={inputCls} value={presets} onChange={(e) => setPresets(e.target.value)} placeholder="0, 30, 90, 180, 365" /></div>
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor="pol-padrao">Padrão na venda</FieldLabel><input id="pol-padrao" type="number" min={0} className={inputCls} value={padrao} onChange={(e) => setPadrao(Number(e.target.value))} /></div>
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor="pol-max">Máximo personalizado</FieldLabel><input id="pol-max" type="number" min={0} max={1825} className={inputCls} value={max} onChange={(e) => setMax(Number(e.target.value))} /></div>
          <div className="min-w-0 space-y-1.5 sm:col-span-3"><FieldLabel htmlFor="pol-cond">Condições adicionais do termo (uma por linha)</FieldLabel><textarea id="pol-cond" rows={4} className={cn(inputCls, "h-auto py-2")} value={cond} onChange={(e) => setCond(e.target.value)} placeholder="Ex.: Película e capa não são cobertas pela garantia contratual." /><p className="text-xs text-muted-foreground">O texto legal do termo é fixo; estas linhas são acrescentadas ao final e não podem retirar direitos do consumidor.</p></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="h-4 w-4 accent-primary" checked={aprov} onChange={(e) => setAprov(e.target.checked)} />Compra de cliente exige aprovação por outra pessoa</label>
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="h-4 w-4 accent-primary" checked={conf} onChange={(e) => setConf(e.target.checked)} />Liberar usado para venda exige conferência de IMEI registrada</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} onClick={() => void salvar()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Salvar nova versão</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
