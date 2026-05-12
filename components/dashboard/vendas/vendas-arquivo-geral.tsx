"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Search, RefreshCw, ReceiptText, User, Calendar,
  ShoppingBag, TrendingUp, BarChart3, AlertTriangle,
  Printer, Eye, XCircle, ChevronLeft, ChevronRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"

// ── Types ─────────────────────────────────────────────────────────────────────

type VendaItem = {
  id: string
  at: string
  cliente: string
  total: number
  status: "pago"
  formaPagamento: string
  quantidadeItens: number
  cancelada: boolean
}

type Kpis = {
  totalVendas: number
  faturamento: number
  cancelamentos: number
}

type ApiResponse = {
  ok: boolean
  vendas: VendaItem[]
  total: number
  kpis: Kpis
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

const PAGE_SIZE = 20

// ── Component ─────────────────────────────────────────────────────────────────

export function VendasArquivoGeral() {
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID

  const [busca, setBusca] = useState("")
  const [buscaInput, setBuscaInput] = useState("")
  const [page, setPage] = useState(0)

  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)
  const [vendas, setVendas] = useState<VendaItem[]>([])
  const [total, setTotal] = useState(0)
  const [kpis, setKpis] = useState<Kpis>({ totalVendas: 0, faturamento: 0, cancelamentos: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    setApiError(false)
    try {
      const params = new URLSearchParams({
        storeId,
        take: String(PAGE_SIZE),
        skip: String(page * PAGE_SIZE),
        ...(busca ? { q: busca } : {}),
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
      setKpis(data.kpis ?? { totalVendas: 0, faturamento: 0, cancelamentos: 0 })
    } catch {
      setApiError(true)
    } finally {
      setLoading(false)
    }
  }, [storeId, page, busca])

  useEffect(() => {
    load()
  }, [load])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0)
      setBusca(buscaInput)
    }, 400)
    return () => clearTimeout(t)
  }, [buscaInput])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── KPI Cards ──────────────────────────────────────────────────────────────
  const kpiCards = [
    {
      label: "Vendas concluídas",
      value: kpis.totalVendas.toLocaleString("pt-BR"),
      icon: ShoppingBag,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "Faturamento total",
      value: fmtBrl(kpis.faturamento),
      icon: TrendingUp,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Cancelamentos",
      value: kpis.cancelamentos.toLocaleString("pt-BR"),
      icon: XCircle,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
  ]

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Histórico de Vendas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vendas reais registradas no banco de dados · unidade{" "}
          <span className="font-mono text-xs">{storeId}</span>
        </p>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpiCards.map((k) => (
          <Card key={k.label} className="border-border bg-card">
            <CardContent className="flex items-center gap-4 pt-5 pb-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${k.bg}`}>
                <k.icon className={`h-5 w-5 ${k.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                {loading ? (
                  <Skeleton className="mt-1 h-6 w-24" />
                ) : (
                  <p className="text-xl font-bold text-foreground">{k.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + controls */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
            Registros de vendas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por cliente ou ID da venda…"
              value={buscaInput}
              onChange={(e) => setBuscaInput(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {loading ? "Carregando…" : `${total.toLocaleString("pt-BR")} venda${total !== 1 ? "s" : ""}`}
            </p>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Atualizar">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
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
        /* Skeleton rows */
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
      ) : vendas.length === 0 ? (
        /* Premium empty state */
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-card px-8 py-16 text-center shadow-card">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <BarChart3 className="h-7 w-7 text-primary/70" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-foreground">
              {busca ? "Nenhuma venda encontrada" : "Nenhuma venda registrada"}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {busca
                ? `Nenhum resultado para "${busca}". Tente outro termo de busca.`
                : "As vendas realizadas pelo PDV aparecerão aqui automaticamente após a sincronização com o banco."}
            </p>
          </div>
          {busca && (
            <Button variant="outline" size="sm" onClick={() => { setBuscaInput(""); setBusca(""); }}>
              Limpar busca
            </Button>
          )}
        </div>
      ) : (
        /* Sale rows */
        <div className="space-y-2">
          {vendas.map((v) => (
            <div
              key={v.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:bg-panel/60 transition-colors"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-foreground">{v.id}</span>
                  <Badge
                    variant="secondary"
                    className="border border-success/20 bg-success/10 text-[10px] font-semibold text-success px-1.5 py-0"
                  >
                    {v.status.toUpperCase()}
                  </Badge>
                  {v.formaPagamento !== "—" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      {v.formaPagamento}
                    </Badge>
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
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end shrink-0">
                <div className="text-right mr-1">
                  <p className="font-bold text-foreground">{fmtBrl(v.total)}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled
                  className="gap-1.5 text-xs opacity-60"
                  title="Em breve"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Imprimir</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled
                  className="gap-1.5 text-xs opacity-60"
                  title="Em breve"
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
    </div>
  )
}
