"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Unlock,
  Lock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Calendar,
  User,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Printer,
  RotateCcw,
  Search,
  Filter,
  Monitor,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useLojaAtiva } from "@/lib/loja-ativa"
import type { FechamentoResumo } from "@/lib/caixa-fechamento-resumo"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const fmtDt = (d: string) =>
  new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

interface CaixaOperacao {
  id: string
  tipo: string
  valor: number
  motivo: string
  operador: string
  at: string
}

interface DevolucaoResumo {
  id: string
  localId: string
  tipo: string
  valorTotal: number
  creditoEmitido: number
  clienteNome: string
  operador: string
  at: string
  _count: { itens: number }
}

interface SessaoDetalhe {
  id: string
  storeId: string
  operador: string
  saldoInicial: number
  saldoFinal: number | null
  saldoContado: number | null
  observacao: string
  status: "ABERTA" | "FECHADA"
  abertaEm: string
  fechadaEm: string | null
  terminalId: string | null
  payload: Record<string, unknown> | null
  operacoes: CaixaOperacao[]
  devolucoes: DevolucaoResumo[]
}

interface SessaoItem {
  id: string
  operador: string
  saldoInicial: number
  saldoFinal: number | null
  saldoContado: number | null
  status: "ABERTA" | "FECHADA"
  abertaEm: string
  fechadaEm: string | null
  terminalId: string | null
  _count: { operacoes: number }
}

interface TerminalInfo {
  id: string
  code: string
  name: string
}

type StatusFilter = "todos" | "ABERTA" | "FECHADA"

export function CaixaHistoricoClient() {
  const { lojaAtivaId } = useLojaAtiva()

  const [sessoes, setSessoes] = useState<SessaoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<SessaoDetalhe | null>(null)
  const [detalheTerminal, setDetalheTerminal] = useState<TerminalInfo | null>(null)
  const [detalheTotaisTerminal, setDetalheTotaisTerminal] = useState<{
    total: number | null
    count: number | null
  } | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos")
  const [terminalFilter, setTerminalFilter] = useState<string>("todos") // "todos" | "sem" | id
  const [search, setSearch] = useState("")
  const [terminais, setTerminais] = useState<TerminalInfo[]>([])
  const terminalMap = useMemo(
    () => new Map(terminais.map((t) => [t.id, t] as const)),
    [terminais],
  )

  // Carrega a lista de terminais da loja (gracioso se a tabela não existir).
  useEffect(() => {
    if (!lojaAtivaId) return
    let cancelled = false
    void (async () => {
      try {
        // Reaproveita o histórico de vendas para listar terminais (mesmo endpoint).
        const res = await fetch(
          `/api/vendas/historico?storeId=${encodeURIComponent(lojaAtivaId)}&take=1`,
          { headers: { "x-assistec-loja-id": lojaAtivaId }, cache: "no-store" },
        )
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { terminais?: TerminalInfo[] }
          setTerminais(data.terminais ?? [])
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lojaAtivaId])

  const fetchSessoes = useCallback(async () => {
    if (!lojaAtivaId) return
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({ take: "50" })
      if (statusFilter !== "todos") params.set("status", statusFilter)
      if (terminalFilter !== "todos") params.set("terminalId", terminalFilter)
      const res = await fetch(`/api/ops/caixa/sessoes?${params}`, {
        credentials: "include",
        cache: "no-store",
        headers: { "x-assistec-loja-id": lojaAtivaId },
      })
      if (res.ok) {
        const data = (await res.json()) as { sessoes: SessaoItem[] }
        setSessoes(data.sessoes ?? [])
      } else {
        const errData = await res.json().catch(() => null) as { error?: string } | null
        const msg = errData?.error ?? `HTTP ${res.status}`
        console.error("[caixa/historico] sessoes:", res.status, msg)
        setFetchError(msg)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha de rede"
      console.error("[caixa/historico] sessoes:", msg)
      setFetchError(msg)
    } finally {
      setLoading(false)
    }
  }, [lojaAtivaId, statusFilter, terminalFilter])

  useEffect(() => {
    fetchSessoes()
  }, [fetchSessoes])

  const loadDetalhe = useCallback(
    async (sessaoId: string) => {
      if (!lojaAtivaId) return
      if (expandedId === sessaoId) {
        setExpandedId(null)
        setDetalhe(null)
        setDetalheTerminal(null)
        setDetalheTotaisTerminal(null)
        return
      }
      setExpandedId(sessaoId)
      setLoadingDetalhe(true)
      try {
        const res = await fetch(
          `/api/ops/caixa/sessao-detalhe?sessaoId=${sessaoId}`,
          { headers: { "x-assistec-loja-id": lojaAtivaId } }
        )
        if (res.ok) {
          const data = (await res.json()) as {
            sessao: SessaoDetalhe
            terminal?: TerminalInfo | null
            totais?: { totalVendasTerminal?: number | null; totalVendasCountTerminal?: number | null }
          }
          setDetalhe(data.sessao ?? null)
          setDetalheTerminal(data.terminal ?? null)
          setDetalheTotaisTerminal(
            data.totais
              ? {
                  total: data.totais.totalVendasTerminal ?? null,
                  count: data.totais.totalVendasCountTerminal ?? null,
                }
              : null,
          )
        }
      } finally {
        setLoadingDetalhe(false)
      }
    },
    [expandedId, lojaAtivaId]
  )

  const filtradas = sessoes.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.operador.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
  })

  const handleImprimir = (s: SessaoDetalhe) => {
    const payload = s.payload as Record<string, unknown> | null
    const sangrias = s.operacoes.filter((o) => o.tipo === "sangria").reduce((a, o) => a + o.valor, 0)
    const suprimentos = s.operacoes.filter((o) => o.tipo === "suprimento").reduce((a, o) => a + o.valor, 0)
    const recebimentosCr = s.operacoes
      .filter((o) => o.tipo === "recebimento_cr")
      .reduce((a, o) => a + o.valor, 0)
    const totalDev = s.devolucoes.reduce((a, d) => a + d.valorTotal, 0)

    // Comprovante ERP: usa o resumoFechamento (por origem + pagamento + totais) quando
    // a sessão foi fechada já com a consolidação premium; senão cai no ledger legado.
    const resumo = (payload?.resumoFechamento ?? null) as FechamentoResumo | null
    const ledger = payload?.ledger as Record<string, number> | null

    let secaoVendas = ""
    if (resumo) {
      const origem = resumo.porOrigem
        .map((o) => `<p>${o.label}: ${fmt(o.valorBruto)} (${o.qtdItens} itens)</p>`)
        .join("")
      const pg = resumo.porPagamento
      secaoVendas = `<hr><strong>VENDAS POR ORIGEM</strong>
      ${origem || "<p>—</p>"}
      <hr><strong>FORMAS DE PAGAMENTO</strong>
      <p>Dinheiro: ${fmt(pg.dinheiro)}</p>
      <p>Pix: ${fmt(pg.pix)}</p>
      <p>Débito: ${fmt(pg.cartaoDebito)}</p>
      <p>Crédito: ${fmt(pg.cartaoCredito)}</p>
      <p>Carnê: ${fmt(pg.carne)}</p>
      <p>A prazo: ${fmt(pg.aPrazo)}</p>
      <p>Vale/Crédito: ${fmt(pg.creditoVale)}</p>
      <hr><strong>CONSOLIDAÇÃO</strong>
      <p>Vendas (qtd): ${resumo.qtdVendas}</p>
      <p>Subtotal bruto: ${fmt(resumo.subtotalBruto)}</p>
      <p>Descontos: -${fmt(resumo.descontos)}</p>
      <p>Total líquido: ${fmt(resumo.totalLiquido)}</p>
      <p>Total recebido: ${fmt(resumo.totalRecebido)}</p>
      <p>Ticket médio: ${fmt(resumo.ticketMedio)}</p>
      ${resumo.qtdRecebimentosContas > 0 ? `<p>Serviços recebidos: ${fmt(resumo.recebimentosContas)} (${resumo.qtdRecebimentosContas})</p>` : ""}`
    } else if (ledger) {
      secaoVendas = `<hr>
      <p>Dinheiro: ${fmt(ledger.vendasDinheiro ?? 0)}</p>
      <p>Pix: ${fmt(ledger.vendasPix ?? 0)}</p>
      <p>Débito: ${fmt(ledger.vendasCartaoDebito ?? 0)}</p>
      <p>Crédito: ${fmt(ledger.vendasCartaoCredito ?? 0)}</p>
      <p>Carnê: ${fmt(ledger.vendasCarne ?? 0)}</p>`
    }

    const html = `<html><head><title>Fechamento de Caixa</title>
    <style>body{font-family:monospace;font-size:12px;margin:16px}</style>
    </head><body>
    <h2>RELATÓRIO DE SESSÃO DE CAIXA</h2>
    <p>Operador: ${s.operador || "—"}</p>
    <p>Terminal: ${s.terminalId ? terminalMap.get(s.terminalId)?.name || terminalMap.get(s.terminalId)?.code || s.terminalId : "Sem terminal"}</p>
    <p>Abertura: ${fmtDt(s.abertaEm)}</p>
    <p>Fechamento: ${s.fechadaEm ? fmtDt(s.fechadaEm) : "Em aberto"}</p>
    <p>Status: ${s.status}</p>
    <hr>
    <p>Saldo inicial: ${fmt(s.saldoInicial)}</p>
    <p>Saldo final esperado: ${fmt(s.saldoFinal ?? 0)}</p>
    ${s.saldoContado != null ? `<p>Saldo contado: ${fmt(s.saldoContado)}</p>` : ""}
    <p>Sangrias: ${fmt(sangrias)}</p>
    <p>Suprimentos: ${fmt(suprimentos)}</p>
    ${recebimentosCr > 0 ? `<p>Serviços recebidos: ${fmt(recebimentosCr)}</p>` : ""}
    <p>Devoluções: ${fmt(totalDev)}</p>
    ${secaoVendas}
    </body></html>`
    const w = window.open("", "_blank", "width=500,height=600")
    if (w) { w.document.write(html); w.document.close(); w.print() }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de Caixa</h1>
          <p className="text-sm text-muted-foreground">
            Sessões de abertura e fechamento do PDV
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSessoes} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por operador ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 bg-secondary border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[140px] border-border bg-secondary">
            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ABERTA">Abertos</SelectItem>
            <SelectItem value="FECHADA">Fechados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={terminalFilter} onValueChange={setTerminalFilter}>
          <SelectTrigger className="h-9 w-[180px] border-border bg-secondary">
            <Monitor className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Terminal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os terminais</SelectItem>
            {terminais.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name || t.code}
              </SelectItem>
            ))}
            <SelectItem value="sem">Sem terminal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista de sessões */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 py-16 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-destructive/60" />
          <p className="font-medium text-foreground">Erro ao carregar sessões</p>
          <p className="mt-1 text-sm text-muted-foreground">{fetchError}</p>
          <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={fetchSessoes}>
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/30 py-16 text-center">
          <Lock className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="font-medium text-foreground">Nenhuma sessão encontrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            As sessões de caixa aparecerão aqui após a primeira abertura.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((s) => (
            <div key={s.id} className="overflow-hidden rounded-xl border border-border bg-card">
              {/* Row header */}
              <button
                onClick={() => loadDetalhe(s.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                  {s.status === "ABERTA" ? (
                    <Unlock className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{fmtDt(s.abertaEm)}</span>
                  </div>
                  {s.operador && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{s.operador}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                    {s.terminalId ? (
                      <span className="text-sm text-muted-foreground">
                        {terminalMap.get(s.terminalId)?.code || "PDV"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/70">Sem terminal</span>
                    )}
                  </div>
                  <span className="text-sm">
                    <span className="text-muted-foreground">Abertura: </span>
                    <span className="font-medium">{fmt(s.saldoInicial)}</span>
                  </span>
                  {s.saldoFinal != null && (
                    <span className="text-sm">
                      <span className="text-muted-foreground">Fechamento: </span>
                      <span className="font-medium">{fmt(s.saldoFinal)}</span>
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      s.status === "ABERTA"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                        : "border-border text-muted-foreground"
                    }
                  >
                    {s.status === "ABERTA" ? "Aberto" : "Fechado"}
                  </Badge>
                  {expandedId === s.id ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expandido: detalhe */}
              {expandedId === s.id && (
                <div className="border-t border-border px-4 py-4">
                  {loadingDetalhe ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-1/3" />
                    </div>
                  ) : detalhe && detalhe.id === s.id ? (
                    <SessaoDetalheView
                      sessao={detalhe}
                      terminal={detalheTerminal}
                      totaisTerminal={detalheTotaisTerminal}
                      onImprimir={handleImprimir}
                    />
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SessaoDetalheView({
  sessao,
  terminal,
  totaisTerminal,
  onImprimir,
}: {
  sessao: SessaoDetalhe
  terminal: TerminalInfo | null
  totaisTerminal: { total: number | null; count: number | null } | null
  onImprimir: (s: SessaoDetalhe) => void
}) {
  const sangrias = sessao.operacoes.filter((o) => o.tipo === "sangria")
  const suprimentos = sessao.operacoes.filter((o) => o.tipo === "suprimento")
  const recebimentosCr = sessao.operacoes.filter((o) => o.tipo === "recebimento_cr")
  const totalSangrias = sangrias.reduce((a, o) => a + o.valor, 0)
  const totalSuprimentos = suprimentos.reduce((a, o) => a + o.valor, 0)
  const totalRecebimentosCr = recebimentosCr.reduce((a, o) => a + o.valor, 0)
  const totalDev = sessao.devolucoes.reduce((a, d) => a + d.valorTotal, 0)
  const payload = sessao.payload as Record<string, unknown> | null
  const ledger = payload?.ledger as Record<string, number> | null
  const resumo = (payload?.resumoFechamento ?? null) as FechamentoResumo | null

  const diferenca =
    sessao.saldoContado != null && sessao.saldoFinal != null
      ? sessao.saldoContado - sessao.saldoFinal
      : null

  return (
    <div className="space-y-4">
      {/* Terminal vinculado (ou aviso de sessão legada sem terminal) */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
        {terminal ? (
          <>
            <span className="text-muted-foreground">Terminal</span>
            <Badge variant="outline" className="text-[10px]">
              {terminal.code}
              {terminal.name && terminal.name !== terminal.code ? ` · ${terminal.name}` : ""}
            </Badge>
          </>
        ) : (
          <span className="text-muted-foreground/80">
            Sessão sem terminal vinculado (anterior ao multi-terminais)
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniKpi label="Abertura" value={fmt(sessao.saldoInicial)} />
        <MiniKpi label="Saldo Final" value={sessao.saldoFinal != null ? fmt(sessao.saldoFinal) : "—"} />
        <MiniKpi
          label="Sangrias"
          value={fmt(totalSangrias)}
          color={totalSangrias > 0 ? "text-red-500" : undefined}
          icon={<TrendingDown className="h-3 w-3" />}
        />
        <MiniKpi
          label="Suprimentos"
          value={fmt(totalSuprimentos)}
          color={totalSuprimentos > 0 ? "text-emerald-500" : undefined}
          icon={<TrendingUp className="h-3 w-3" />}
        />
        {totalRecebimentosCr > 0 && (
          <MiniKpi
            label="Serviços recebidos"
            value={fmt(totalRecebimentosCr)}
            color="text-violet-600 dark:text-violet-400"
            icon={<TrendingUp className="h-3 w-3" />}
          />
        )}
      </div>

      {/* Vendas pelo Venda.terminalId (mais preciso que janela temporal) */}
      {terminal && totaisTerminal && totaisTerminal.total != null && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Vendas neste terminal ({totaisTerminal.count ?? 0})
          </p>
          <p className="text-base font-semibold text-primary">{fmt(totaisTerminal.total)}</p>
        </div>
      )}

      {diferenca != null && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            Math.abs(diferenca) > 0.01
              ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
          }`}
        >
          {Math.abs(diferenca) > 0.01 ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span>
            {Math.abs(diferenca) > 0.01
              ? `Diferença de ${fmt(diferenca)} detectada no fechamento`
              : "Fechamento conferido sem diferença"}
          </span>
        </div>
      )}

      {/* Vendas por origem (consolidação ERP — sessões fechadas com resumo premium) */}
      {resumo && resumo.porOrigem.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vendas por origem
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-3">
            {resumo.porOrigem.map((o) => (
              <div key={o.key} className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-center">
                <p className="text-[10px] text-muted-foreground">
                  {o.label} ({o.qtdItens})
                </p>
                <p className="font-semibold">{fmt(o.valorBruto)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {resumo && resumo.qtdRecebimentosContas > 0 && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Serviços recebidos no PDV ({resumo.qtdRecebimentosContas})
          </p>
          <p className="text-base font-semibold text-violet-600 dark:text-violet-400">
            {fmt(resumo.recebimentosContas)}
          </p>
        </div>
      )}

      {/* Formas de pagamento do ledger */}
      {ledger && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vendas por forma de pagamento
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Dinheiro", "vendasDinheiro"],
              ["Pix", "vendasPix"],
              ["Débito", "vendasCartaoDebito"],
              ["Crédito", "vendasCartaoCredito"],
              ["Carnê", "vendasCarne"],
              ["Vale", "vendasCreditoVale"],
            ].map(([label, key]) =>
              (ledger[key] ?? 0) > 0 ? (
                <div key={key} className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="font-semibold">{fmt(ledger[key] ?? 0)}</p>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Operações (sangrias/suprimentos) */}
      {sessao.operacoes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Operações de caixa
          </p>
          <div className="space-y-1.5">
            {sessao.operacoes.map((op) => (
              <div
                key={op.id}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      op.tipo === "sangria"
                        ? "border-red-500/30 text-red-500"
                        : op.tipo === "recebimento_cr"
                          ? "border-violet-500/30 text-violet-600 dark:text-violet-400"
                          : "border-emerald-500/30 text-emerald-500"
                    }
                  >
                    {op.tipo === "recebimento_cr" ? "Serviço" : op.tipo}
                  </Badge>
                  <span className="text-muted-foreground">{op.motivo || "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{fmtDt(op.at)}</span>
                  <span
                    className={`font-semibold ${
                      op.tipo === "sangria"
                        ? "text-red-500"
                        : op.tipo === "recebimento_cr"
                          ? "text-violet-600 dark:text-violet-400"
                          : "text-emerald-500"
                    }`}
                  >
                    {op.tipo === "sangria" ? "−" : "+"}
                    {fmt(op.valor)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Devoluções */}
      {sessao.devolucoes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Devoluções ({sessao.devolucoes.length})
          </p>
          <div className="space-y-1.5">
            {sessao.devolucoes.map((dev) => (
              <div
                key={dev.id}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-mono text-xs">{dev.localId}</span>
                  <span className="text-muted-foreground">{dev.clienteNome || "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{fmtDt(dev.at)}</span>
                  <span className="font-semibold text-amber-500">{fmt(dev.valorTotal)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 text-right text-xs text-muted-foreground">
            Total devolvido: <span className="font-semibold text-amber-500">{fmt(totalDev)}</span>
          </div>
        </div>
      )}

      <Separator className="bg-border" />

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => onImprimir(sessao)}>
          <Printer className="h-4 w-4" />
          Imprimir relatório
        </Button>
      </div>
    </div>
  )
}

function MiniKpi({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: string
  color?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 flex items-center gap-1 font-semibold ${color ?? "text-foreground"}`}>
        {icon}
        {value}
      </p>
    </div>
  )
}
