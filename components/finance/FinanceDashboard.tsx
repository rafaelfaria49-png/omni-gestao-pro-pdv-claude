"use client"

import {
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  Banknote,
  CreditCard,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  XCircle,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { useFinanceDashboard, type FinanceTransaction, type FinanceAccount } from "./useFinanceDashboard"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const fmtDate = (s?: string | null) => {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

const ACCOUNT_ICONS: Record<string, typeof Wallet> = {
  cash: Banknote,
  bank: Building2,
  pix: Smartphone,
  credit_card: CreditCard,
}

function AccountIcon({ type }: { type: string }) {
  const Icon = ACCOUNT_ICONS[type] ?? Wallet
  return <Icon className="h-4 w-4" />
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Pago
      </Badge>
    )
  if (status === "canceled")
    return (
      <Badge variant="outline" className="gap-1 border-muted text-muted-foreground">
        <XCircle className="h-3 w-3" /> Cancelado
      </Badge>
    )
  return (
    <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600">
      <Clock className="h-3 w-3" /> Pendente
    </Badge>
  )
}

function KPICard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  title: string
  value: string
  hint?: string
  icon: typeof Wallet
  tone?: "positive" | "negative" | "warning" | "default"
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-destructive"
        : tone === "warning"
          ? "text-amber-600"
          : "text-foreground"

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className={`text-2xl font-semibold tracking-tight ${valueColor}`}>{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

function TransactionRow({ tx }: { tx: FinanceTransaction }) {
  const isIncome = tx.type === "income"
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: tx.category?.color ?? (isIncome ? "#10b981" : "#ef4444") }}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{tx.description}</p>
          <p className="text-xs text-muted-foreground">
            {tx.category?.name ?? (isIncome ? "Receita" : "Despesa")} · {fmtDate(tx.dueDate)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-sm font-semibold ${isIncome ? "text-emerald-600" : "text-destructive"}`}>
          {isIncome ? "+" : "-"}{fmt(tx.amount)}
        </span>
        <StatusBadge status={tx.status} />
      </div>
    </div>
  )
}

function AccountCard({ account }: { account: FinanceAccount }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="rounded-md bg-muted p-1.5 text-muted-foreground">
          <AccountIcon type={account.type} />
        </div>
        <div>
          <p className="text-sm font-medium">{account.name}</p>
          <p className="text-xs capitalize text-muted-foreground">{account.type.replace("_", " ")}</p>
        </div>
      </div>
      <span className={`text-sm font-semibold ${account.balance < 0 ? "text-destructive" : "text-foreground"}`}>
        {fmt(account.balance)}
      </span>
    </div>
  )
}

export function FinanceDashboard() {
  const { data, loading, error, reload } = useFinanceDashboard()
  const { cards, accounts, recentTransactions, dueTodayTransactions, fluxoMensal, despesasPorCategoria } = data

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={reload} className="gap-1">
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <KPICard title="Saldo total" value={fmt(cards.totalBalance)} icon={Wallet} />
            <KPICard title="Entradas mês" value={fmt(cards.entradas)} icon={ArrowDownCircle} tone="positive" />
            <KPICard title="Saídas mês" value={fmt(cards.saidas)} icon={ArrowUpCircle} tone="negative" />
            <KPICard
              title="Lucro mês"
              value={fmt(cards.lucro)}
              icon={TrendingUp}
              tone={cards.lucro >= 0 ? "positive" : "negative"}
            />
            <KPICard
              title="Vencidas"
              value={String(cards.overdueCount)}
              hint="Contas em atraso"
              icon={AlertTriangle}
              tone={cards.overdueCount > 0 ? "warning" : "default"}
            />
            <KPICard
              title="Pendentes"
              value={String(cards.pendingCount)}
              hint="A receber/pagar"
              icon={Clock}
            />
          </>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Fluxo mensal */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Receitas vs Despesas</h3>
            <span className="text-xs text-muted-foreground">Últimos 6 meses</span>
          </div>
          {loading ? (
            <Skeleton className="h-56 rounded-lg" />
          ) : fluxoMensal.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
              Nenhum dado financeiro registrado ainda.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fluxoMensal} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    color: "hsl(var(--popover-foreground))",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmt(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receitas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" fill="hsl(var(--destructive))" opacity={0.7} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Despesas por categoria */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Despesas por categoria</h3>
          </div>
          {loading ? (
            <Skeleton className="h-56 rounded-lg" />
          ) : despesasPorCategoria.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
              Sem despesas pagas neste mês.
            </div>
          ) : (
            <div className="space-y-2">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={despesasPorCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} paddingAngle={2}>
                    {despesasPorCategoria.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1">
                {despesasPorCategoria.slice(0, 5).map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-muted-foreground">{c.name}</span>
                    </div>
                    <span className="font-medium">{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Últimas transações */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">Últimas transações</h3>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              Nenhuma transação registrada. Adicione sua primeira lançamento.
            </div>
          ) : (
            <div className="space-y-2">
              {recentTransactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Contas bancárias */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Contas e carteiras</h3>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : accounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma conta cadastrada.</p>
            ) : (
              <div className="space-y-2">
                {accounts.map((a) => <AccountCard key={a.id} account={a} />)}
              </div>
            )}
          </div>

          {/* Vencendo hoje */}
          {!loading && dueTodayTransactions.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-amber-700">Vence hoje</h3>
              </div>
              <div className="space-y-2">
                {dueTodayTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between">
                    <p className="truncate text-xs text-foreground">{tx.description}</p>
                    <span className="ml-2 shrink-0 text-xs font-semibold text-amber-700">{fmt(tx.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
