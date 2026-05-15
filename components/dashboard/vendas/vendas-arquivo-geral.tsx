"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Search, RefreshCw, ReceiptText, User, Calendar,
  ShoppingBag, TrendingUp, BarChart3, AlertTriangle,
  Printer, Eye, XCircle, ChevronLeft, ChevronRight,
  CheckCircle, Filter, X, Tag, Clock, DollarSign, UserCheck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import { CupomNaoFiscal, type CupomData } from "./cupom-nao-fiscal"
import { useToast } from "@/hooks/use-toast"
import type { SaleRecord } from "@/lib/operations-sale-types"

// ── Types ─────────────────────────────────────────────────────────────────────

type VendaItem = {
  id: string
  dbId: string
  at: string
  cliente: string
  total: number
  status: string
  operador: string | null
  formaPagamento: string
  quantidadeItens: number
  cancelada: boolean
  canceladaEm: string | null
  motivoCancelamento: string | null
}

type Kpis = {
  totalVendas: number
  faturamento: number
  cancelamentos: number
  devolvidas: number
  concluidas: number
  ticketMedio: number
}

type ApiResponse = {
  ok: boolean
  vendas: VendaItem[]
  total: number
  kpis: Kpis
}

type VendaDetalhe = {
  id: string
  dbId: string
  at: string
  clienteNome: string | null
  clienteCpf: string | null
  total: number
  desconto: number
  status: string
  operador: string | null
  canceladaEm: string | null
  canceladaPor: string | null
  motivoCancelamento: string | null
  sessaoId: string | null
  pagamentos: Array<{ label: string; valor: number }>
  itens: Array<{ id: string; nome: string; quantidade: number; precoUnitario: number; lineTotal: number }>
  devolucoes: Array<{
    id: string
    localId: string
    at: string
    tipo: string
    valorTotal: number
    operador: string
    motivo: string
    itens: Array<{ nome: string; quantidade: number; valorTotal: number }>
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    concluida: "Concluída",
    cancelada: "Cancelada",
    devolvida: "Devolvida",
    parcialmente_devolvida: "Dev. Parcial",
  }
  return map[s] ?? s
}

function statusBadgeClass(s: string): string {
  if (s === "cancelada") return "border-destructive/30 bg-destructive/10 text-destructive"
  if (s === "devolvida" || s === "parcialmente_devolvida") return "border-warning/30 bg-warning/10 text-warning"
  return "border-success/20 bg-success/10 text-success"
}

const PAGE_SIZE = 20

function saleRecordToVendaItem(s: SaleRecord): VendaItem {
  const pb = s.paymentBreakdown
  const formas: string[] = []
  if (pb.dinheiro > 0) formas.push("Dinheiro")
  if (pb.pix > 0) formas.push("Pix")
  if (pb.cartaoDebito > 0) formas.push("Débito")
  if (pb.cartaoCredito > 0) formas.push("Crédito")
  if (pb.carne > 0) formas.push("Carnê")
  if (pb.aPrazo > 0) formas.push("À Prazo")
  if (pb.creditoVale > 0) formas.push("Vale")
  return {
    id: s.id,
    dbId: s.id,
    at: s.at,
    cliente: s.customerName?.trim() || "—",
    total: s.total,
    status: "concluida",
    operador: s.cashierId ?? null,
    formaPagamento: formas.length > 0 ? formas.join(" + ") : "—",
    quantidadeItens: s.lines.reduce((sum, l) => sum + l.quantity, 0),
    cancelada: false,
    canceladaEm: null,
    motivoCancelamento: null,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VendasArquivoGeral() {
  const { lojaAtivaId, empresaDocumentos, getEnderecoDocumentos } = useLojaAtiva()
  const storeId = lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID
  const { toast } = useToast()

  // Filters
  const [busca, setBusca] = useState("")
  const [buscaInput, setBuscaInput] = useState("")
  const [statusFiltro, setStatusFiltro] = useState("todos")
  const [pagamentoFiltro, setPagamentoFiltro] = useState("todos")
  const [operadorFiltro, setOperadorFiltro] = useState("")
  const [operadorInput, setOperadorInput] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [page, setPage] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  // Data
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)
  const [vendas, setVendas] = useState<VendaItem[]>([])
  const [total, setTotal] = useState(0)
  const [kpis, setKpis] = useState<Kpis>({ totalVendas: 0, faturamento: 0, cancelamentos: 0, devolvidas: 0, concluidas: 0, ticketMedio: 0 })
  const [remoteSales, setRemoteSales] = useState<SaleRecord[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)

  // Detalhe drawer
  const [detalheOpen, setDetalheOpen] = useState(false)
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [detalhe, setDetalhe] = useState<VendaDetalhe | null>(null)

  // Cupom modal
  const [cupomOpen, setCupomOpen] = useState(false)
  const [cupomData, setCupomData] = useState<CupomData | null>(null)

  // Cancel dialog
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [cancelMotivo, setCancelMotivo] = useState("")
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelConfirmForcar, setCancelConfirmForcar] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setApiError(false)
    try {
      const params = new URLSearchParams({
        storeId,
        take: String(PAGE_SIZE),
        skip: String(page * PAGE_SIZE),
        ...(busca ? { q: busca } : {}),
        ...(statusFiltro !== "todos" ? { status: statusFiltro } : {}),
        ...(pagamentoFiltro !== "todos" ? { pagamento: pagamentoFiltro } : {}),
        ...(operadorFiltro.trim() ? { operador: operadorFiltro.trim() } : {}),
        ...(fromDate ? { from: new Date(fromDate).toISOString() } : {}),
        ...(toDate ? { to: new Date(toDate + "T23:59:59").toISOString() } : {}),
      })
      const res = await fetch(`/api/vendas/historico?${params}`, {
        credentials: "include",
        cache: "no-store",
        headers: { "x-assistec-loja-id": storeId },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ApiResponse
      setVendas(data.vendas ?? [])
      setTotal(data.total ?? 0)
      setKpis(data.kpis ?? { totalVendas: 0, faturamento: 0, cancelamentos: 0, devolvidas: 0, concluidas: 0, ticketMedio: 0 })
    } catch {
      setApiError(true)
    } finally {
      setLoading(false)
    }
  }, [storeId, page, busca, statusFiltro, pagamentoFiltro, operadorFiltro, fromDate, toDate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); setBusca(buscaInput) }, 400)
    return () => clearTimeout(t)
  }, [buscaInput])

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); setOperadorFiltro(operadorInput) }, 400)
    return () => clearTimeout(t)
  }, [operadorInput])

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [statusFiltro, pagamentoFiltro, fromDate, toDate])

  useEffect(() => {
    let cancelled = false
    setRemoteLoading(true)
    async function fetchRemote() {
      try {
        const res = await fetch(
          `/api/ops/vendas-list?lojaId=${encodeURIComponent(storeId)}`,
          { credentials: "include", headers: { "x-assistec-loja-id": storeId } },
        )
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { sales?: SaleRecord[] }
          if (!cancelled) setRemoteSales(data.sales ?? [])
        }
      } catch (err: unknown) {
        if (!cancelled) console.warn("[vendas-arquivo] falha ao carregar do servidor:", err)
      } finally {
        if (!cancelled) setRemoteLoading(false)
      }
    }
    void fetchRemote()
    return () => { cancelled = true }
  }, [storeId])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const { mergedVendas, remoteOnlyIds } = useMemo(() => {
    const localIds = new Set(vendas.map((v) => v.id))
    const onlyIds = new Set<string>()
    const extra = remoteSales
      .filter((s) => s.id && !localIds.has(s.id))
      .map((s) => { onlyIds.add(s.id); return saleRecordToVendaItem(s) })
    const merged = [...vendas, ...extra].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    )
    return { mergedVendas: merged, remoteOnlyIds: onlyIds }
  }, [vendas, remoteSales])

  // ── Detalhe ──────────────────────────────────────────────────────────────────
  const openDetalhe = useCallback(async (vendaId: string) => {
    setDetalheOpen(true)
    setDetalheLoading(true)
    setDetalhe(null)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(vendaId)}`, {
        credentials: "include",
        headers: { "x-assistec-loja-id": storeId },
      })
      const data = await res.json()
      if (data.ok) setDetalhe(data.venda)
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar o detalhe da venda.", variant: "destructive" })
    } finally {
      setDetalheLoading(false)
    }
  }, [storeId, toast])

  // ── Cupom ────────────────────────────────────────────────────────────────────
  const openCupom = useCallback((d: VendaDetalhe) => {
    const lojaNome = empresaDocumentos.nomeFantasia || empresaDocumentos.razaoSocial || "Loja"
    const lojaCnpj = empresaDocumentos.cnpj || undefined
    const lojaEndereco = getEnderecoDocumentos() || undefined

    setCupomData({
      numeroPedido: d.id,
      at: d.at,
      lojaNome,
      lojaCnpj,
      lojaEndereco,
      clienteNome: d.clienteNome,
      clienteCpf: d.clienteCpf,
      operador: d.operador,
      sessaoId: d.sessaoId,
      itens: d.itens,
      pagamentos: d.pagamentos,
      total: d.total,
      desconto: d.desconto,
      status: d.status,
    })
    setCupomOpen(true)
  }, [empresaDocumentos])

  const openCupomFromRow = useCallback(async (vendaId: string) => {
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(vendaId)}`, {
        credentials: "include",
        headers: { "x-assistec-loja-id": storeId },
      })
      const data = await res.json()
      if (data.ok) openCupom(data.venda)
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar os dados do cupom.", variant: "destructive" })
    }
  }, [storeId, openCupom, toast])

  // ── Cancelamento ─────────────────────────────────────────────────────────────
  const handleCancelar = useCallback(async (forcar = false) => {
    if (!cancelandoId || !cancelMotivo.trim()) return
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(cancelandoId)}/cancelar`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-assistec-loja-id": storeId,
        },
        body: JSON.stringify({
          motivo: cancelMotivo.trim(),
          canceladaPor: "Operador",
          forcar,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.requireConfirm && !forcar) {
          setCancelConfirmForcar(true)
          return
        }
        toast({ title: "Erro", description: data.error ?? "Falha ao cancelar venda.", variant: "destructive" })
        return
      }
      toast({ title: "Venda cancelada", description: `${cancelandoId} cancelada com sucesso.` })
      setCancelandoId(null)
      setCancelMotivo("")
      setCancelConfirmForcar(false)
      // Refresh detail if open
      if (detalhe?.id === cancelandoId) {
        await openDetalhe(cancelandoId)
      }
      load()
    } catch {
      toast({ title: "Erro", description: "Falha ao cancelar venda.", variant: "destructive" })
    } finally {
      setCancelLoading(false)
    }
  }, [cancelandoId, cancelMotivo, storeId, detalhe, openDetalhe, load, toast])

  // ── KPI Cards ──────────────────────────────────────────────────────────────

  const kpiCards = [
    {
      label: "Concluídas",
      value: kpis.concluidas.toLocaleString("pt-BR"),
      icon: CheckCircle,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Faturamento líquido",
      value: fmtBrl(kpis.faturamento),
      icon: TrendingUp,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Ticket médio",
      value: fmtBrl(kpis.ticketMedio),
      icon: DollarSign,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "Cancelamentos",
      value: kpis.cancelamentos.toLocaleString("pt-BR"),
      icon: XCircle,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
  ]

  const hasActiveFilters = statusFiltro !== "todos" || pagamentoFiltro !== "todos" || busca !== "" || fromDate !== "" || toDate !== "" || operadorFiltro !== ""

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Histórico de Vendas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vendas reais registradas no banco de dados · unidade{" "}
          <span className="font-mono text-xs">{storeId}</span>
          {remoteLoading && (
            <span className="text-muted-foreground text-xs ml-2">· sincronizando…</span>
          )}
        </p>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <Card key={k.label} className="border-border bg-card">
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.bg}`}>
                <k.icon className={`h-4 w-4 ${k.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                {loading ? (
                  <Skeleton className="mt-1 h-5 w-20" />
                ) : (
                  <p className="text-base font-bold text-foreground leading-tight">{k.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + filters */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
            Registros de vendas
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-auto text-[10px] bg-primary/10 text-primary border-primary/20">
                Filtros ativos
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por cliente ou ID da venda…"
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showFilters ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setShowFilters((v) => !v)}
              >
                <Filter className="h-4 w-4" />
                Filtros
              </Button>
              <p className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                {loading ? "Carregando…" : `${total.toLocaleString("pt-BR")} venda${total !== 1 ? "s" : ""}`}
              </p>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Atualizar">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Expandable filters */}
          {showFilters && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1 border-t border-border">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Status
                </label>
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                    <SelectItem value="devolvida">Devolvida</SelectItem>
                    <SelectItem value="parcialmente_devolvida">Dev. Parcial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Pagamento
                </label>
                <Select value={pagamentoFiltro} onValueChange={setPagamentoFiltro}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todas as formas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as formas</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="cartaoDebito">Débito</SelectItem>
                    <SelectItem value="cartaoCredito">Crédito</SelectItem>
                    <SelectItem value="carne">Carnê</SelectItem>
                    <SelectItem value="aPrazo">A Prazo</SelectItem>
                    <SelectItem value="creditoVale">Vale/Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Data inicial
                </label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Data final
                </label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <UserCheck className="h-3 w-3" /> Operador
                </label>
                <Input
                  className="h-9 text-sm"
                  placeholder="Filtrar por nome ou ID do operador…"
                  value={operadorInput}
                  onChange={(e) => setOperadorInput(e.target.value)}
                />
              </div>
              {hasActiveFilters && (
                <div className="sm:col-span-2 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground gap-1.5 h-8"
                    onClick={() => {
                      setStatusFiltro("todos")
                      setPagamentoFiltro("todos")
                      setBuscaInput("")
                      setBusca("")
                      setOperadorFiltro("")
                      setOperadorInput("")
                      setFromDate("")
                      setToDate("")
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Limpar filtros
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content */}
      {apiError ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-8 py-14 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Erro ao carregar histórico</p>
            <p className="text-sm text-muted-foreground">Seus dados estão seguros. Verifique a conexão e tente novamente.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      ) : mergedVendas.length === 0 ? (
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-card px-8 py-16 text-center shadow-card">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <BarChart3 className="h-7 w-7 text-primary/70" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-foreground">
              {hasActiveFilters ? "Nenhuma venda encontrada" : "Nenhuma venda registrada"}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {hasActiveFilters
                ? "Nenhum resultado com os filtros aplicados. Ajuste os filtros ou limpe a busca."
                : "As vendas realizadas pelo PDV aparecerão aqui automaticamente após a sincronização com o banco."}
            </p>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={() => {
              setStatusFiltro("todos")
              setPagamentoFiltro("todos")
              setBuscaInput("")
              setBusca("")
              setOperadorFiltro("")
              setOperadorInput("")
              setFromDate("")
              setToDate("")
            }}>
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {mergedVendas.map((v) => (
            <div
              key={v.id}
              className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border bg-card p-4 transition-colors ${
                v.cancelada
                  ? "border-destructive/20 opacity-75 hover:opacity-100"
                  : "border-border hover:bg-panel/60"
              }`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-foreground">{v.id}</span>
                  <Badge
                    variant="secondary"
                    className={`border text-[10px] font-semibold px-1.5 py-0 ${statusBadgeClass(v.status)}`}
                  >
                    {statusLabel(v.status)}
                  </Badge>
                  {v.formaPagamento !== "—" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      {v.formaPagamento}
                    </Badge>
                  )}
                  {remoteOnlyIds.has(v.id) && (
                    <span className="bg-secondary text-muted-foreground text-[10px] px-1.5 py-0.5 rounded">
                      Servidor
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {v.cliente}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {fmtDate(v.at)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ShoppingBag className="h-3 w-3" />
                    {v.quantidadeItens} item{v.quantidadeItens !== 1 ? "s" : ""}
                  </span>
                  {v.operador && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {v.operador}
                    </span>
                  )}
                </div>
                {v.cancelada && v.motivoCancelamento && (
                  <p className="text-[11px] text-destructive/70 italic">
                    Cancelada: {v.motivoCancelamento}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end shrink-0">
                <div className="text-right mr-1">
                  <p className={`font-bold ${v.cancelada ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {fmtBrl(v.total)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => void openCupomFromRow(v.id)}
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Imprimir</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => void openDetalhe(v.id)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Detalhes</span>
                </Button>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detalhe Drawer ─────────────────────────────────────────────────────── */}
      <Sheet open={detalheOpen} onOpenChange={setDetalheOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 bg-card border-border">
          <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">
              {detalhe ? `Venda ${detalhe.id}` : "Detalhes da Venda"}
            </SheetTitle>
            {detalhe && (
              <SheetDescription className="text-xs text-muted-foreground">
                {fmtDate(detalhe.at)} · {detalhe.operador ?? "Operador"} · {statusLabel(detalhe.status)}
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {detalheLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : detalhe ? (
              <>
                {/* Status banner */}
                {detalhe.status !== "concluida" && (
                  <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 ${statusBadgeClass(detalhe.status)}`}>
                    {detalhe.status === "cancelada" ? (
                      <XCircle className="h-4 w-4 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0" />
                    )}
                    <div className="text-sm">
                      <p className="font-semibold">{statusLabel(detalhe.status)}</p>
                      {detalhe.canceladaEm && (
                        <p className="text-[11px] opacity-80">{fmtDate(detalhe.canceladaEm)}</p>
                      )}
                      {detalhe.motivoCancelamento && (
                        <p className="text-[11px] opacity-80">Motivo: {detalhe.motivoCancelamento}</p>
                      )}
                      {detalhe.canceladaPor && (
                        <p className="text-[11px] opacity-80">Por: {detalhe.canceladaPor}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Client + Operator info */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informações</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Cliente</p>
                      <p className="font-medium text-foreground">{detalhe.clienteNome ?? "—"}</p>
                    </div>
                    {detalhe.clienteCpf && (
                      <div>
                        <p className="text-xs text-muted-foreground">CPF</p>
                        <p className="font-medium text-foreground">{detalhe.clienteCpf}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Operador</p>
                      <p className="font-medium text-foreground">{detalhe.operador ?? "—"}</p>
                    </div>
                    {detalhe.sessaoId && (
                      <div>
                        <p className="text-xs text-muted-foreground">Sessão caixa</p>
                        <p className="font-mono text-[11px] text-foreground truncate">{detalhe.sessaoId}</p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Items */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Itens ({detalhe.itens.length})
                  </h3>
                  {detalhe.itens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum item registrado</p>
                  ) : (
                    <div className="space-y-1.5">
                      {detalhe.itens.map((it) => (
                        <div key={it.id} className="flex items-center justify-between text-sm py-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate">{it.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {it.quantidade}x {fmtBrl(it.precoUnitario)}
                            </p>
                          </div>
                          <p className="font-semibold text-foreground ml-4 shrink-0">{fmtBrl(it.lineTotal)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator className="bg-border" />

                {/* Payments + Total */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pagamento</h3>
                  {detalhe.pagamentos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">—</p>
                  ) : (
                    <div className="space-y-1">
                      {detalhe.pagamentos.map((pg, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{pg.label}</span>
                          <span className="font-medium text-foreground">{fmtBrl(pg.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(detalhe.desconto ?? 0) > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Desconto</span>
                      <span>-{fmtBrl(detalhe.desconto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base text-foreground pt-1 border-t border-border">
                    <span>Total</span>
                    <span>{fmtBrl(detalhe.total)}</span>
                  </div>
                </div>

                {/* Devoluções vinculadas */}
                {detalhe.devolucoes.length > 0 && (
                  <>
                    <Separator className="bg-border" />
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Devoluções ({detalhe.devolucoes.length})
                      </h3>
                      {detalhe.devolucoes.map((dev) => (
                        <div key={dev.id} className="rounded-lg border border-border bg-background/40 p-3 text-sm space-y-1">
                          <div className="flex justify-between">
                            <Badge variant="outline" className="text-[10px]">
                              {dev.tipo === "vale_credito" ? "Vale/Crédito" : dev.tipo === "troca" ? "Troca" : "Estoque"}
                            </Badge>
                            <span className="font-semibold text-destructive">{fmtBrl(dev.valorTotal)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{fmtDate(dev.at)} · {dev.operador || "Operador"}</p>
                          {dev.motivo && <p className="text-xs text-muted-foreground">Motivo: {dev.motivo}</p>}
                          {dev.itens.map((it, i) => (
                            <p key={i} className="text-xs text-foreground/70">{it.quantidade}x {it.nome}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Não foi possível carregar o detalhe.</p>
              </div>
            )}
          </div>

          {/* Drawer actions */}
          {detalhe && !detalheLoading && (
            <div className="shrink-0 border-t border-border px-6 py-4 space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-10 gap-2 text-sm"
                  onClick={() => openCupom(detalhe)}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir recibo
                </Button>
                {detalhe.status !== "cancelada" && (
                  <Button
                    variant="outline"
                    className="flex-1 h-10 gap-2 text-sm text-destructive border-destructive/30 hover:bg-destructive/5"
                    onClick={() => {
                      setCancelandoId(detalhe.id)
                      setCancelMotivo("")
                      setCancelConfirmForcar(false)
                    }}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar venda
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Cancel Dialog ──────────────────────────────────────────────────────── */}
      <AlertDialog open={!!cancelandoId} onOpenChange={(o) => !o && setCancelandoId(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {cancelConfirmForcar ? "Confirmar cancelamento com devoluções" : "Cancelar venda"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {cancelConfirmForcar
                ? "Esta venda possui devoluções registradas. O cancelamento irá apenas marcar a venda — as devoluções serão mantidas. Deseja continuar?"
                : `Informe o motivo do cancelamento da venda ${cancelandoId ?? ""}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!cancelConfirmForcar && (
            <div className="py-2">
              <Input
                placeholder="Motivo do cancelamento (obrigatório)…"
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                className="bg-background border-border"
                autoFocus
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border"
              onClick={() => {
                setCancelandoId(null)
                setCancelMotivo("")
                setCancelConfirmForcar(false)
              }}
            >
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelLoading || (!cancelConfirmForcar && !cancelMotivo.trim())}
              onClick={() => void handleCancelar(cancelConfirmForcar)}
            >
              {cancelLoading ? "Cancelando…" : cancelConfirmForcar ? "Confirmar mesmo assim" : "Cancelar venda"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cupom Modal ────────────────────────────────────────────────────────── */}
      {cupomData && (
        <CupomNaoFiscal
          isOpen={cupomOpen}
          onClose={() => setCupomOpen(false)}
          data={cupomData}
        />
      )}
    </div>
  )
}
