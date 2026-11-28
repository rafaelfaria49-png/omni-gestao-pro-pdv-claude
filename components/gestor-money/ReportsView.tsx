"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowDownRight, ArrowUpRight, BarChart3, Download, Filter } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ConsultaFinanceiraSnapshot } from "@/lib/gestor-money/contracts"
import {
  centavosParaReais,
  formatarCentavosBRL,
  formatarCentavosCompacto,
  rotuloTipoConta,
} from "@/lib/gestor-money/money"
import {
  gerarCsvRelatorio,
  projetarRelatorioFinanceiro,
  type GranularidadeRelatorio,
} from "@/lib/gestor-money/reports"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyStateCard } from "./shared"

function DeltaBadge({ pct, invertido = false }: { pct: number | null; invertido?: boolean }) {
  if (pct === null) {
    return <span className="text-[11px] text-muted-foreground">Sem base anterior</span>
  }
  const bom = invertido ? pct <= 0 : pct >= 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        bom
          ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
          : "bg-rose-500/12 text-rose-600 dark:text-rose-300"
      )}
    >
      {pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  )
}

export function ReportsView({ snapshot }: { snapshot: ConsultaFinanceiraSnapshot }) {
  const [granularidade, setGranularidade] = React.useState<GranularidadeRelatorio>("mensal")
  const [dataInicio, setDataInicio] = React.useState(snapshot.periodo.dataInicio)
  const [dataFim, setDataFim] = React.useState(snapshot.periodo.dataFim)
  const [carteiraId, setCarteiraId] = React.useState("todas")
  const [categoriaId, setCategoriaId] = React.useState("todas")

  const relatorio = React.useMemo(
    () =>
      projetarRelatorioFinanceiro(snapshot, {
        granularidade,
        dataInicio,
        dataFim,
        carteiraId,
        categoriaId,
      }),
    [snapshot, granularidade, dataInicio, dataFim, carteiraId, categoriaId]
  )

  const chartData = React.useMemo(
    () =>
      relatorio.serieTemporal.map((p) => ({
        label: p.label,
        receitas: centavosParaReais(p.receitaCentavos),
        despesas: centavosParaReais(p.despesaCentavos),
      })),
    [relatorio.serieTemporal]
  )

  const handleExportCsv = () => {
    const csv = gerarCsvRelatorio(snapshot, relatorio)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `gestor-money-relatorio-${snapshot.perfil.tipo.toLowerCase()}-${granularidade}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6" data-testid="gestor-money-relatorios">
      {/* Header & Granularity */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Relatórios financeiros</h2>
          <p className="text-xs text-muted-foreground">
            Base {snapshot.base} · Fuso {snapshot.timezone} · Moeda {snapshot.moeda} (G005)
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl text-xs"
          onClick={handleExportCsv}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Exportar CSV ({snapshot.proveniencia === "SINTETICO_ISOLADO" ? "sintético" : "real"})
        </Button>
      </div>

      {/* Filters bar */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "diario", label: "Diário" },
              { id: "semanal", label: "Semanal" },
              { id: "mensal", label: "Mensal" },
              { id: "periodo", label: "Por período" },
            ] as const
          ).map((g) => (
            <Button
              key={g.id}
              type="button"
              size="sm"
              variant={granularidade === g.id ? "default" : "outline"}
              className="rounded-xl text-xs"
              data-testid={`report-granularity-${g.id}`}
              onClick={() => setGranularidade(g.id)}
            >
              {g.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Data inicial</span>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="h-9 rounded-xl text-xs"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Data final</span>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="h-9 rounded-xl text-xs"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Filtrar por conta</span>
            <Select value={carteiraId} onValueChange={setCarteiraId}>
              <SelectTrigger className="h-9 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as contas</SelectItem>
                {snapshot.contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Filtrar por categoria</span>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger className="h-9 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {snapshot.categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Period Summary KPIs */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Receitas no recorte</p>
          <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatarCentavosBRL(relatorio.totalReceitasCentavos)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Despesas no recorte</p>
          <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {formatarCentavosBRL(relatorio.totalDespesasCentavos)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Resultado líquido</p>
          <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-foreground">
            {formatarCentavosBRL(relatorio.resultadoCentavos)}
          </p>
        </div>
      </div>

      {/* Interactive Chart */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-foreground">
              Fluxo {granularidade === "diario" ? "diário" : granularidade === "semanal" ? "semanal" : granularidade === "mensal" ? "mensal" : "no período"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {relatorio.quantidadeRegistros} lançamentos contabilizados sem dupla contagem de transferências
            </p>
          </div>
        </div>
        {chartData.length === 0 ? (
          <EmptyStateCard
            icon={<Filter className="h-5 w-5" />}
            title="Sem registros no recorte selecionado"
            description="Amplie o intervalo de datas ou limpe os filtros de conta e categoria para visualizar o gráfico."
          />
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatarCentavosCompacto(String(Math.round(Number(v) * 100)))}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    color: "var(--foreground)",
                    fontSize: 12,
                  }}
                  formatter={(v: number, name: string) => [
                    formatarCentavosBRL(String(Math.round(v * 100))),
                    name === "receitas" ? "Receitas" : "Despesas",
                  ]}
                />
                <Bar dataKey="receitas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="despesas" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Detailed breakdowns tabs: Por categoria / Por conta / Comparativos */}
      <Tabs defaultValue="categoria" className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <TabsList className="mb-4 rounded-xl">
          <TabsTrigger value="categoria" className="rounded-lg text-xs">
            Por categoria
          </TabsTrigger>
          <TabsTrigger value="conta" className="rounded-lg text-xs">
            Por conta
          </TabsTrigger>
          <TabsTrigger value="comparativos" className="rounded-lg text-xs">
            Comparativos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categoria" className="mt-0 space-y-2.5">
          {relatorio.porCategoria.length === 0 ? (
            <EmptyStateCard
              icon={<BarChart3 className="h-5 w-5" />}
              title="Sem movimentações por categoria"
              description="Nenhum lançamento corresponde ao filtro atual."
            />
          ) : (
            relatorio.porCategoria.map((row) => (
              <div
                key={row.categoria}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.cor }} />
                  <div>
                    <p className="font-semibold text-foreground">{row.categoria}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.quantidade} {row.quantidade === 1 ? "registro" : "registros"} ·{" "}
                      {row.participacaoDespesa.toFixed(1)}% das despesas
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right font-display font-bold tabular-nums">
                  {row.receitaCentavos !== "0" && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{formatarCentavosBRL(row.receitaCentavos)}
                    </span>
                  )}
                  {row.despesaCentavos !== "0" && (
                    <span className="text-rose-600 dark:text-rose-400">
                      −{formatarCentavosBRL(row.despesaCentavos)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="conta" className="mt-0 space-y-2.5">
          {relatorio.porConta.map((conta) => (
            <div
              key={conta.carteiraId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-xs"
            >
              <div>
                <p className="font-semibold text-foreground">{conta.nome}</p>
                <p className="text-[11px] text-muted-foreground">
                  {rotuloTipoConta(conta.tipo)} · {conta.quantidade} movimentos no período
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-right tabular-nums">
                <div>
                  <p className="text-[10px] text-muted-foreground">Entradas</p>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                    +{formatarCentavosBRL(conta.entradasCentavos)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Saídas</p>
                  <p className="font-semibold text-rose-600 dark:text-rose-400">
                    −{formatarCentavosBRL(conta.saidasCentavos)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Saldo atual</p>
                  <p className="font-display font-bold text-foreground">
                    {formatarCentavosBRL(conta.saldoCentavos)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="comparativos" className="mt-0">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Receitas (Mês atual vs. anterior)</p>
                <DeltaBadge pct={relatorio.comparativo.variacaoReceitaPct} />
              </div>
              <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">
                {formatarCentavosBRL(relatorio.comparativo.receitaAtualCentavos)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Mês anterior: {formatarCentavosBRL(relatorio.comparativo.receitaAnteriorCentavos)}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Despesas (Mês atual vs. anterior)</p>
                <DeltaBadge pct={relatorio.comparativo.variacaoDespesaPct} invertido />
              </div>
              <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">
                {formatarCentavosBRL(relatorio.comparativo.despesaAtualCentavos)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Mês anterior: {formatarCentavosBRL(relatorio.comparativo.despesaAnteriorCentavos)}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Resultado (Mês atual vs. anterior)</p>
                <DeltaBadge pct={relatorio.comparativo.variacaoResultadoPct} />
              </div>
              <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">
                {formatarCentavosBRL(relatorio.comparativo.resultadoAtualCentavos)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Mês anterior: {formatarCentavosBRL(relatorio.comparativo.resultadoAnteriorCentavos)}
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
