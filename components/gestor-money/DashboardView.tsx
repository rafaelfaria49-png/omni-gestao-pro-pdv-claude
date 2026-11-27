"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  Landmark,
  Plus,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ConsultaFinanceiraSnapshot } from "@/lib/gestor-money/contracts"
import {
  centavosParaReais,
  formatarCentavosBRL,
  formatarCentavosCompacto,
  formatarDataBR,
  parseBigIntCentavos,
} from "@/lib/gestor-money/money"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyStateCard, StatusPill } from "./shared"
import type { QuickEntryTab } from "./QuickEntrySheet"

export function DashboardView({
  snapshot,
  onOpenQuickEntry,
  onNavigate,
}: {
  snapshot: ConsultaFinanceiraSnapshot
  onOpenQuickEntry: (tab: QuickEntryTab, preset?: { dividaId?: string; descricao?: string; valorCentavos?: string }) => void
  onNavigate: (section: "dividas" | "cartoes" | "contas" | "categorias" | "relatorios") => void
}) {
  const evolucaoData = React.useMemo(
    () =>
      snapshot.evolucaoMensal.map((p) => ({
        label: p.label,
        receitas: centavosParaReais(p.receitaCentavos),
        despesas: centavosParaReais(p.despesaCentavos),
        resultado: centavosParaReais(p.resultadoCentavos),
      })),
    [snapshot.evolucaoMensal]
  )

  const categoriasData = React.useMemo(
    () =>
      snapshot.gastosPorCategoria.slice(0, 6).map((c) => ({
        name: c.categoria,
        value: centavosParaReais(c.despesaCentavos),
        centavos: c.despesaCentavos,
        color: c.cor,
        pct: c.participacaoPercentual,
        quantidade: c.quantidade,
      })),
    [snapshot.gastosPorCategoria]
  )

  const resultadoPositivo = parseBigIntCentavos(snapshot.resultadoCentavos) >= BigInt(0)

  const kpis = [
    {
      id: "saldo",
      label: "Saldo disponível",
      value: formatarCentavosBRL(snapshot.saldoDisponivelCentavos),
      hint: `${snapshot.contas.filter((c) => c.ativo).length} contas ativas · exclui crédito`,
      icon: Wallet,
      accent: "from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/25",
      iconClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "receitas",
      label: "Receitas realizadas",
      value: formatarCentavosBRL(snapshot.receitasCentavos),
      hint: `Base ${snapshot.base} no período`,
      icon: TrendingUp,
      accent: "from-sky-500/15 via-sky-500/5 to-transparent border-sky-500/25",
      iconClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    },
    {
      id: "despesas",
      label: "Despesas realizadas",
      value: formatarCentavosBRL(snapshot.despesasCentavos),
      hint: `${snapshot.quantidadeRegistros} lançamentos contabilizados`,
      icon: TrendingDown,
      accent: "from-rose-500/15 via-rose-500/5 to-transparent border-rose-500/25",
      iconClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    },
    {
      id: "dividas",
      label: "Dívidas em aberto",
      value: formatarCentavosBRL(snapshot.dividasAbertasCentavos),
      hint: `${snapshot.dividas.filter((d) => d.status !== "quitada").length} compromissos ativos`,
      icon: Scale,
      accent: "from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/25",
      iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
  ]

  return (
    <div className="space-y-6" data-testid="gestor-money-dashboard">
      {/* KPI Hero Grid */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div
              key={kpi.id}
              data-testid={`kpi-${kpi.id}`}
              className={cn(
                "relative overflow-hidden rounded-2xl border bg-gradient-to-br bg-card p-4 sm:p-5 shadow-sm transition-all hover:shadow-md",
                kpi.accent
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                  <p className="mt-2 font-display text-2xl font-bold tracking-tight tabular-nums text-foreground">
                    {kpi.value}
                  </p>
                </div>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", kpi.iconClass)}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 truncate text-[11px] text-muted-foreground">{kpi.hint}</p>
            </div>
          )
        })}
      </div>

      {/* Secondary strip: Contas a pagar, Contas a receber, Resultado líquido */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Contas a pagar</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {formatarCentavosBRL(snapshot.contasPagarCentavos)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {snapshot.pagar.filter((t) => t.status !== "pago").length} títulos pendentes
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl text-xs"
            onClick={() => onOpenQuickEntry("despesa")}
          >
            <ArrowDownRight className="mr-1 h-3.5 w-3.5 text-rose-500" />
            Lançar
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Contas a receber</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatarCentavosBRL(snapshot.contasReceberCentavos)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {snapshot.receber.filter((t) => t.status !== "pago").length} entradas previstas
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl text-xs"
            onClick={() => onOpenQuickEntry("receita")}
          >
            <ArrowUpRight className="mr-1 h-3.5 w-3.5 text-emerald-500" />
            Receber
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Resultado líquido (período)</p>
            <p
              className={cn(
                "mt-1 font-display text-lg font-bold tabular-nums",
                resultadoPositivo
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              )}
            >
              {resultadoPositivo ? "+" : ""}
              {formatarCentavosBRL(snapshot.resultadoCentavos)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {formatarDataBR(snapshot.periodo.dataInicio)} a {formatarDataBR(snapshot.periodo.dataFim)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl text-xs"
            onClick={() => onNavigate("relatorios")}
          >
            Relatórios
          </Button>
        </div>
      </div>

      {/* Charts Row: Evolução mensal + Gastos por categoria */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Evolução mensal</h2>
              <p className="text-xs text-muted-foreground">
                Receitas vs. despesas realizadas nos últimos 6 meses ({snapshot.moeda})
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Receitas
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                Despesas
              </span>
            </div>
          </div>

          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolucaoData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gmReceitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gmDespesas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
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
                  formatter={(value: number, name: string) => [
                    formatarCentavosBRL(String(Math.round(value * 100))),
                    name === "receitas" ? "Receitas" : "Despesas",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="receitas"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#gmReceitas)"
                />
                <Area
                  type="monotone"
                  dataKey="despesas"
                  stroke="#f43f5e"
                  strokeWidth={2.5}
                  fill="url(#gmDespesas)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm lg:col-span-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Gastos por categoria</h2>
              <p className="text-xs text-muted-foreground">Distribuição das despesas no período</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-lg text-xs"
              onClick={() => onNavigate("categorias")}
            >
              Gerenciar
            </Button>
          </div>

          {categoriasData.length === 0 ? (
            <EmptyStateCard
              icon={<Receipt className="h-5 w-5" />}
              title="Sem despesas categorizadas"
              description="Registre sua primeira despesa para visualizar a distribuição por categoria."
              actionLabel="Registrar despesa"
              onAction={() => onOpenQuickEntry("despesa")}
            />
          ) : (
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-5">
              <div className="h-[190px] sm:col-span-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoriasData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={3}
                    >
                      {categoriasData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--card)",
                        color: "var(--foreground)",
                        fontSize: 12,
                      }}
                      formatter={(val: number) => formatarCentavosBRL(String(Math.round(val * 100)))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2.5 sm:col-span-3">
                {categoriasData.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">
                        {formatarCentavosBRL(item.centavos)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(4, item.pct)}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Próximos vencimentos + Contas a pagar e receber */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm lg:col-span-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-semibold text-foreground">Próximos vencimentos</h2>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {snapshot.proximosVencimentos.length} itens
            </span>
          </div>

          {snapshot.proximosVencimentos.length === 0 ? (
            <EmptyStateCard
              icon={<CalendarClock className="h-5 w-5" />}
              title="Nenhum vencimento pendente"
              description="Todas as contas, dívidas e faturas estão em dia neste perfil."
            />
          ) : (
            <div className="space-y-2.5">
              {snapshot.proximosVencimentos.slice(0, 6).map((item) => (
                <div
                  key={`${item.origem}-${item.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/25 px-3.5 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{item.titulo}</p>
                      <StatusPill status={item.vencido ? "vencido" : item.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.contraparte} · Vence em {formatarDataBR(item.vencimento)}
                      {item.vencido
                        ? ` (${Math.abs(item.diasRestantes)}d em atraso)`
                        : item.diasRestantes === 0
                          ? " (hoje)"
                          : ` (em ${item.diasRestantes}d)`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="font-display text-sm font-bold tabular-nums text-foreground">
                        {formatarCentavosBRL(item.valorCentavos)}
                      </p>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {item.origem}
                      </span>
                    </div>
                    {item.origem === "DIVIDA" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 rounded-lg px-2.5 text-xs"
                        onClick={() => onOpenQuickEntry("pagamento", { dividaId: item.id })}
                      >
                        Pagar
                      </Button>
                    ) : item.origem === "FATURA" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 rounded-lg px-2.5 text-xs"
                        onClick={() => onNavigate("cartoes")}
                      >
                        Fatura
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm lg:col-span-6">
          <Tabs defaultValue="pagar" className="w-full">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-foreground">
                Contas a pagar e receber
              </h2>
              <TabsList className="h-8 rounded-xl">
                <TabsTrigger value="pagar" className="rounded-lg text-xs">
                  A pagar ({snapshot.pagar.length})
                </TabsTrigger>
                <TabsTrigger value="receber" className="rounded-lg text-xs">
                  A receber ({snapshot.receber.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="pagar" className="mt-0 space-y-2.5">
              {snapshot.pagar.length === 0 ? (
                <EmptyStateCard
                  icon={<Receipt className="h-5 w-5" />}
                  title="Nenhuma conta a pagar"
                  description="Cadastre uma despesa agendada para acompanhar vencimentos."
                  actionLabel="Agendar conta"
                  onAction={() => onOpenQuickEntry("despesa")}
                />
              ) : (
                snapshot.pagar.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{t.descricao}</p>
                        <StatusPill status={t.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.contraparte} · {t.categoriaNome} · Venc. {formatarDataBR(t.vencimento)}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      {formatarCentavosBRL(t.restanteCentavos)}
                    </span>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="receber" className="mt-0 space-y-2.5">
              {snapshot.receber.length === 0 ? (
                <EmptyStateCard
                  icon={<Landmark className="h-5 w-5" />}
                  title="Nenhuma conta a receber"
                  description="Registre recebimentos previstos para projetar seu fluxo de caixa."
                  actionLabel="Nova receita"
                  onAction={() => onOpenQuickEntry("receita")}
                />
              ) : (
                snapshot.receber.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{t.descricao}</p>
                        <StatusPill status={t.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.contraparte} · {t.categoriaNome} · Prev. {formatarDataBR(t.vencimento)}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatarCentavosBRL(t.restanteCentavos)}
                    </span>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>

          {/* Quick shortcut footer */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {snapshot.proximosVencimentos.some((v) => v.vencido) ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                  <span>Existem títulos vencidos aguardando baixa.</span>
                </>
              ) : (
                <>
                  <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Compromissos dentro do prazo.</span>
                </>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-xl text-xs"
              onClick={() => onOpenQuickEntry("despesa")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Lançamento rápido
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
