"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { FileText, Loader2, Printer, ScanLine, Search, ShieldCheck, Smartphone, WifiOff } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ACESSORIOS_ITENS, sanitizeAcessorios, type Acessorios } from "@/lib/aparelhos/checklist"
import { normalizeImei } from "@/lib/aparelhos/imei"
import { CONTRATUAL_MAX_ABSOLUTO_DIAS, localDateKey, rotuloPrazo } from "@/lib/aparelhos/warranty"
import type { DeviceSaleLineV1 } from "@/lib/aparelhos/device-sale-line"
import { abrirDocumento, abrirPrevia, apiAparelhos, type AparelhoDTO, type PoliticaAparelhos } from "./api"
import { CoberturaRegua, CondicaoPill, EmptyState, FieldLabel, ImeiStrip, StatusPill, brl, inputCls } from "./parts"

export type LinhaAparelho = {
  produtoId: string
  name: string
  price: number
  deviceSale: DeviceSaleLineV1
  aparelho: Pick<AparelhoDTO, "id" | "codigoInterno" | "marca" | "modelo" | "variante" | "armazenamento" | "cor" | "condicao" | "imei1" | "serial">
}

type VendaBusca = { ok: true; itens: AparelhoDTO[]; politica: PoliticaAparelhos; permissoes: { vender: boolean; reservar: boolean } }

export function nomeLinhaAparelho(a: LinhaAparelho["aparelho"]): string {
  return [a.marca, a.modelo, a.variante, a.armazenamento, a.cor].filter(Boolean).join(" ")
}

function novoToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Seleção da unidade física + garantia. Não grava venda: reserva a unidade no servidor
 * (bloqueio contra outro caixa) e devolve a linha para o carrinho da superfície.
 */
export function VendaAparelhoDialog({ open, onOpenChange, storeId, produtoId, cliente, jaNoCarrinho, onConfirm, consultaInicial }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  storeId: string
  /** Quando o operador escolheu um modelo no catálogo, filtra as unidades desse produto. */
  produtoId?: string | null
  cliente: { id: string; name: string } | null
  jaNoCarrinho: string[]
  onConfirm: (linha: LinhaAparelho) => void
  /** IMEI bipado no PDV: abre já filtrado e seleciona a unidade quando houver uma só. */
  consultaInicial?: string
}) {
  const [q, setQ] = useState("")
  const [busca, setBusca] = useState<VendaBusca | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<AparelhoDTO | null>(null)
  const [contratual, setContratual] = useState(0)
  const [custom, setCustom] = useState("")
  const [entrega, setEntrega] = useState(() => localDateKey(new Date()))
  const [acess, setAcess] = useState<Acessorios>({})
  const [obs, setObs] = useState("")
  const [reservando, setReservando] = useState(false)
  const [online, setOnline] = useState(true)
  const token = useRef(novoToken())
  const inputRef = useRef<HTMLInputElement>(null)
  const autoSelecionar = useRef(false)

  useEffect(() => {
    if (!open) return
    setQ(consultaInicial ?? ""); setSel(null); setErro(null); setCustom(""); setObs(""); setEntrega(localDateKey(new Date()))
    autoSelecionar.current = !!consultaInicial
    token.current = novoToken()
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine)
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener("online", on); window.addEventListener("offline", off)
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) }
  }, [open, consultaInicial])

  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      apiAparelhos<VendaBusca>(storeId, `/venda?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => { setBusca(r); setErro(null) })
        .catch((e: Error) => { if (e.name !== "AbortError") setErro(e.message) })
        .finally(() => setLoading(false))
    }, q ? 250 : 0)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [open, q, storeId])

  const itens = useMemo(() => (busca?.itens ?? []).filter((a) => (!produtoId || a.produtoId === produtoId) && !jaNoCarrinho.includes(a.id)), [busca, produtoId, jaNoCarrinho])
  const politica = busca?.politica

  useEffect(() => {
    if (!autoSelecionar.current || loading || !busca) return
    autoSelecionar.current = false
    if (itens.length === 1) escolher(itens[0]!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, loading, itens])

  function escolher(a: AparelhoDTO) {
    setSel(a)
    const padrao = politica?.presetsContratuaisDias.includes(a.garantiaContratualDias) ? a.garantiaContratualDias : politica?.contratualPadraoDias ?? 0
    setContratual(padrao); setCustom("")
    setAcess(sanitizeAcessorios(a.acessorios))
  }

  // Leitor de código de barras: Enter com IMEI completo seleciona a unidade exata.
  function onEnter() {
    const d = normalizeImei(q)
    const exato = itens.find((a) => a.imei1 === d || a.imei2 === d || a.imei1?.endsWith(d.slice(-5)) && itens.length === 1)
    if (exato) escolher(exato)
    else if (itens.length === 1) escolher(itens[0]!)
  }

  const maxDias = Math.min(politica?.contratualMaxDias ?? 730, CONTRATUAL_MAX_ABSOLUTO_DIAS)
  const customNum = custom.trim() ? Number(custom) : null
  const diasEfetivos = customNum !== null ? customNum : contratual
  const diasValidos = Number.isInteger(diasEfetivos) && diasEfetivos >= 0 && diasEfetivos <= maxDias
  const hoje = localDateKey(new Date())

  async function confirmar() {
    if (!sel) return
    if (!online) { toast.error("Sem conexão: a venda de aparelho precisa confirmar a unidade no servidor."); return }
    if (!cliente) { toast.error("Selecione o cliente antes de incluir o aparelho."); return }
    if (!diasValidos) { toast.error(`Garantia contratual deve ficar entre 0 e ${maxDias} dias.`); return }
    if (entrega < hoje) { toast.error("A data de entrega não pode ser anterior a hoje."); return }
    setReservando(true)
    try {
      await apiAparelhos(storeId, `/${sel.id}/acao?canal=venda`, { method: "POST", body: { acao: "reservar", token: token.current, minutos: 30 } })
      onConfirm({
        produtoId: sel.produtoId,
        name: nomeLinhaAparelho(sel),
        price: sel.precoVenda,
        aparelho: sel,
        deviceSale: { version: 1, aparelhoId: sel.id, contratualDias: diasEfetivos, dataEntrega: entrega, reservaToken: token.current, acessoriosEntregues: acess, ...(obs.trim() ? { observacoes: obs.trim() } : {}) },
      })
      onOpenChange(false)
    } catch (e) { toast.error((e as Error).message) } finally { setReservando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !reservando && onOpenChange(v)}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl" onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus() }}>
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" aria-hidden />Adicionar aparelho</DialogTitle>
          <DialogDescription>Escolha a unidade pelo IMEI. Ela fica reservada para este atendimento por 30 minutos.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!online && <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"><WifiOff className="h-4 w-4" />Sem conexão. Aparelhos só podem ser vendidos online.</p>}
          {!cliente && <p role="alert" className="mb-3 rounded-lg border border-[color:var(--warning)] bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] px-3 py-2 text-sm text-foreground">Venda de aparelho exige cliente identificado. Selecione ou cadastre o cliente na venda.</p>}
          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <section aria-label="Unidades disponíveis" className="min-w-0 space-y-2">
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <label htmlFor="va-busca" className="sr-only">IMEI, final do IMEI ou modelo</label>
                <input id="va-busca" ref={inputRef} type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter() } }}
                  placeholder="Bipe o IMEI ou digite o modelo" className={cn(inputCls, "pl-9")} />
              </div>
              {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
              <ul className="max-h-[50vh] min-w-0 space-y-1.5 overflow-y-auto pr-1" aria-busy={loading}>
                {itens.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => escolher(a)} aria-pressed={sel?.id === a.id}
                      className={cn("w-full min-w-0 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring", sel?.id === a.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                      <span className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold">{nomeLinhaAparelho(a)}</span><span className="shrink-0 text-sm font-semibold tabular-nums">{brl(a.precoVenda)}</span></span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><CondicaoPill condicao={a.condicao} /><span className="truncate font-mono">{a.imei1 || a.serial}</span>{a.status === "reservado" && <StatusPill status="reservado" />}</span>
                    </button>
                  </li>
                ))}
                {!loading && busca && itens.length === 0 && <EmptyState icon={<Search className="h-5 w-5" />} title="Nenhuma unidade disponível">{q ? "Confira o IMEI ou libere o aparelho no Cadastros HUB." : "Cadastre e libere aparelhos no Cadastros HUB → Aparelhos."}</EmptyState>}
                {loading && !busca && <li className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando…</li>}
              </ul>
            </section>

            <section aria-label="Aparelho selecionado" className="min-w-0">
              {!sel ? (
                <EmptyState icon={<Smartphone className="h-5 w-5" />} title="Selecione a unidade">A garantia e os documentos usam exatamente o aparelho escolhido.</EmptyState>
              ) : (
                <div className="min-w-0 space-y-4">
                  <div className="min-w-0 space-y-1.5 rounded-xl border border-border p-4">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 text-base font-bold text-foreground">{nomeLinhaAparelho(sel)}</p>
                      <p className="text-lg font-bold tabular-nums text-foreground">{brl(sel.precoVenda)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2"><CondicaoPill condicao={sel.condicao} /><span className="font-mono text-xs text-muted-foreground">{sel.codigoInterno}</span></div>
                    <ImeiStrip imei={sel.imei1} label="IMEI 1" masked={sel.identificadoresMascarados} />
                    <ImeiStrip imei={sel.imei2} label="IMEI 2" masked={sel.identificadoresMascarados} />
                    {sel.estadoFisico && <p className="text-xs text-muted-foreground">Estado: {sel.estadoFisico}</p>}
                  </div>

                  <fieldset className="min-w-0 space-y-2 rounded-xl border border-border p-4">
                    <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden />Garantia</legend>
                    <p className="text-xs text-muted-foreground">90 dias de garantia legal são sempre garantidos. Escolha o adicional contratual:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(politica?.presetsContratuaisDias ?? [0]).map((d) => (
                        <button key={d} type="button" aria-pressed={customNum === null && contratual === d} onClick={() => { setContratual(d); setCustom("") }}
                          className={cn("h-9 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring", customNum === null && contratual === d ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-muted")}>
                          {d === 0 ? "Só a legal" : `+ ${rotuloPrazo(d)}`}
                        </button>
                      ))}
                      <div className="flex items-center gap-1.5">
                        <label htmlFor="va-custom" className="text-xs text-muted-foreground">Personalizada</label>
                        <input id="va-custom" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="dias" aria-invalid={!diasValidos}
                          className={cn("h-9 w-20 rounded-lg border bg-background px-2 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring", !diasValidos ? "border-destructive" : "border-input")} />
                      </div>
                    </div>
                    {!diasValidos && <p className="text-xs text-destructive">Máximo da loja: {maxDias} dias.</p>}
                    <div className="grid min-w-0 grid-cols-1 gap-3 pt-1 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-end">
                      <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor="va-entrega">Data de entrega</FieldLabel><input id="va-entrega" type="date" min={hoje} value={entrega} onChange={(e) => setEntrega(e.target.value || hoje)} className={inputCls} /></div>
                      {diasValidos && <CoberturaRegua dataEntrega={entrega >= hoje ? entrega : hoje} contratualDias={diasEfetivos} compact />}
                    </div>
                  </fieldset>

                  <fieldset className="min-w-0 space-y-2">
                    <legend className="text-sm font-semibold text-foreground">Entregue com</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {ACESSORIOS_ITENS.map((a) => (
                        <label key={a.key} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={!!acess[a.key]} onChange={(e) => setAcess({ ...acess, [a.key]: e.target.checked })} />{a.label}</label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor="va-obs">Observações do aparelho</FieldLabel><textarea id="va-obs" rows={2} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} className={cn(inputCls, "h-auto py-2")} placeholder="Estado, acessórios, combinados com o cliente…" /></div>
                </div>
              )}
            </section>
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-between">
          <Button variant="ghost" disabled={!sel || !diasValidos} onClick={() => sel && abrirPrevia(storeId, { aparelhoId: sel.id, clienteId: cliente?.id, contratualDias: diasEfetivos, dataEntrega: entrega, acessoriosEntregues: acess, observacoes: obs }).catch((e) => toast.error(e.message))}>
            <FileText className="mr-2 h-4 w-4" />Prévia do termo (rascunho)
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reservando}>Cancelar</Button>
            <Button onClick={() => void confirmar()} disabled={!sel || !cliente || !online || !diasValidos || reservando}>{reservando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Incluir na venda</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Libera a reserva quando a linha sai do carrinho (best effort; a reserva também expira). */
export function liberarReservaAparelho(storeId: string, linha: Pick<LinhaAparelho, "deviceSale">): void {
  void apiAparelhos(storeId, `/${linha.deviceSale.aparelhoId}/acao?canal=venda`, { method: "POST", body: { acao: "cancelar_reserva", token: linha.deviceSale.reservaToken } }).catch(() => {})
}

/** Pós-venda: documentos dos aparelhos de uma venda CONFIRMADA (reimpressão não cria nada). */
export function DocumentosAparelhoDialog({ open, onOpenChange, storeId, pedidoId }: { open: boolean; onOpenChange: (v: boolean) => void; storeId: string; pedidoId: string | null }) {
  const [itens, setItens] = useState<Array<{ id: string; numeroGarantia: string; aparelho: { marca: string; modelo: string; armazenamento: string } }> | null>(null)
  useEffect(() => {
    if (!open || !pedidoId) return
    setItens(null)
    let tentativas = 0
    const buscar = () => apiAparelhos<{ itens: NonNullable<typeof itens> }>(storeId, `/documentos?canal=venda&pedidoId=${encodeURIComponent(pedidoId)}`)
      .then((r) => { if (r.itens.length === 0 && tentativas++ < 3) setTimeout(buscar, 800); else setItens(r.itens) })
      .catch((e) => { toast.error(e.message); setItens([]) })
    buscar()
  }, [open, pedidoId, storeId])
  const doc = (tipo: string, formato: string, id: string) => abrirDocumento(storeId, { tipo, formato, aparelhoVendaId: id }, "venda").catch((e) => toast.error(e.message))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl sm:max-w-xl">
        <DialogHeader><DialogTitle>Documentos do aparelho</DialogTitle><DialogDescription>Venda {pedidoId} confirmada. Imprima o termo para o cliente assinar.</DialogDescription></DialogHeader>
        {!itens ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          : itens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma garantia encontrada para esta venda. Consulte em Cadastros → Aparelhos → Garantias.</p>
            : itens.map((g) => (
              <div key={g.id} className="min-w-0 space-y-2 rounded-xl border border-border p-3">
                <p className="text-sm font-semibold">{g.numeroGarantia} · {[g.aparelho.marca, g.aparelho.modelo, g.aparelho.armazenamento].filter(Boolean).join(" ")}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => void doc("termo_garantia", "a4", g.id)}><Printer className="mr-1.5 h-3.5 w-3.5" />Garantia A4</Button>
                  <Button size="sm" variant="outline" onClick={() => void doc("termo_garantia", "80mm", g.id)}><Printer className="mr-1.5 h-3.5 w-3.5" />Garantia 80 mm</Button>
                  <Button size="sm" variant="outline" onClick={() => void doc("comprovante_venda", "80mm", g.id)}><Printer className="mr-1.5 h-3.5 w-3.5" />Comprovante 80 mm</Button>
                  <Button size="sm" variant="outline" onClick={() => void doc("termo_entrega", "a4", g.id)}><FileText className="mr-1.5 h-3.5 w-3.5" />Termo de entrega</Button>
                </div>
              </div>
            ))}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
