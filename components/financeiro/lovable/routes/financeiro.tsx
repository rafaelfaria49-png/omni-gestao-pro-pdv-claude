import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFinanceiroReal,
  FinanceiroRealProvider,
  type StatusReceber,
  type StatusPagar,
  type ContaReceber,
  type ContaPagar,
  type NovoReceberInput,
  type NovoPagarInput,
  type TipoCarteira,
  type DREMensal,
  type FechamentoPublico,
  type ConciliacaoPublica,
  type PresetPeriodo,
  type FiltrosFinanceiros,
  type RegistrarMovimentacaoCarteiraInput,
} from "../context/FinanceiroRealContext";
import { toast } from "sonner";
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  AlertTriangle,
  Plus,
  Receipt,
  RotateCcw,
  History,
  Filter,
  Mic,
  ArrowRightLeft,
  CreditCard,
  Banknote,
  Building2,
  Store,
  User,
  CheckCircle2,
  Clock,
  XCircle,
  PiggyBank,
  BarChart3,
  Settings,
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  FileText,
  Edit,
  Trash2,
  Zap,
  Repeat,
  ShoppingCart,
  Wrench,
  CalendarClock,
  TrendingDown,
  Percent,
  Printer,
  Share2,
  Download,
  Copy,
  AlertCircle,
  ShieldCheck,
  Lock,
  Unlock,
  RefreshCw,
  CalendarCheck,
  Scale,
  ListChecks,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Area,
  ReferenceLine,
} from "recharts";
import { EmptyState } from "@/components/ui/states/EmptyState";
import { LoadingState } from "@/components/ui/states/LoadingState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { isOrigemTransferenciaInterna } from "@/lib/financeiro/services/movimentacao-financeira-classify";

export const Route = createFileRoute("/financeiro" as never)({
  head: () => ({
    meta: [
      { title: "Financeiro HUB — OmniGestão Pro" },
      {
        name: "description",
        content:
          "Hub financeiro completo: visão geral, contas a pagar e receber, fluxo de caixa, carteiras e relatórios.",
      },
    ],
  }),
  component: FinanceiroHub,
});

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Evita R$ 0,00 quando não há base de dados carregada para o indicador. */
const fmtOrDash = (n: number | null | undefined, show: boolean): string => {
  if (!show) return "—";
  if (n == null || !Number.isFinite(n)) return "—";
  return fmt(n);
};

// StatusReceber, StatusPagar, ContaReceber, ContaPagar imported from FinanceiroRealContext

const statusBadge = (s: StatusReceber | StatusPagar) => {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    pendente: {
      label: "Pendente",
      cls: "bg-muted text-muted-foreground border-border",
      icon: Clock,
    },
    atrasado: {
      label: "Atrasado",
      cls: "bg-destructive/10 text-destructive border-destructive/30",
      icon: XCircle,
    },
    pago: {
      label: "Pago",
      cls: "bg-primary/10 text-primary border-primary/30",
      icon: CheckCircle2,
    },
    parcial: {
      label: "Parcial",
      cls: "bg-accent text-accent-foreground border-border",
      icon: Clock,
    },
  };
  const it = map[s];
  const Icon = it.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${it.cls}`}>
      <Icon className="h-3 w-3" />
      {it.label}
    </Badge>
  );
};

// Mapeamento de tipo de carteira → ícone Lucide
function tipoToIcon(tipo: string) {
  switch (tipo) {
    case "banco": return Landmark;
    case "pix": return Zap;
    case "dinheiro": return Banknote;
    case "credito":
    case "debito": return CreditCard;
    case "investimento": return TrendingUp;
    default: return Store; // caixa
  }
}

// Tipo minimal para seleção em modais
type CarteiraRef = { id: string; nome: string };

type FluxoPeriodoTab = "hoje" | "semana" | "mes" | "personalizado";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fluxoTabDateRange(
  period: FluxoPeriodoTab,
  customIni?: string,
  customFim?: string,
): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  if (period === "hoje") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "semana") {
    start.setTime(end.getTime());
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === "mes") {
    start.setFullYear(end.getFullYear(), end.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
  } else {
    const a = customIni?.trim()
      ? new Date(`${customIni.trim()}T00:00:00`)
      : (() => {
          const t = new Date(end);
          t.setDate(end.getDate() - 29);
          return t;
        })();
    a.setHours(0, 0, 0, 0);
    const b = customFim?.trim()
      ? new Date(`${customFim.trim()}T23:59:59.999`)
      : new Date(end.getTime());
    return { start: a, end: b };
  }
  return { start, end };
}

type MovPrismaRow = {
  id: string;
  descricao: string;
  tipo: string;
  valor: number;
  createdAt: string;
  origem?: string | null;
};

function buildFluxoChartFromMovs(
  movs: MovPrismaRow[],
  start: Date,
  end: Date,
): { label: string; entrada: number; saida: number }[] {
  const startKey = ymd(start);
  const endKey = ymd(end);
  const map = new Map<string, { entrada: number; saida: number }>();
  for (const m of movs) {
    if (isOrigemTransferenciaInterna(m.origem)) continue;
    const dKey = m.createdAt.slice(0, 10);
    if (dKey < startKey || dKey > endKey) continue;
    const cur = map.get(dKey) ?? { entrada: 0, saida: 0 };
    if (m.tipo === "entrada") cur.entrada += m.valor;
    else if (m.tipo === "saida") cur.saida += m.valor;
    map.set(dKey, cur);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, v]) => ({
      label: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
      entrada: v.entrada,
      saida: v.saida,
    }));
}

// receber[] and pagar[] removed — data now comes from FinanceiroRealProvider via useFinanceiroReal()
// fluxoMensal, movimentacoes, receitasOrigem, despesasCategoria, resultadoLoja now come from analytics via useFinanceiroReal()

const CHART_COLORS = [
  "var(--color-primary)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: any;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneCls =
    tone === "positive"
      ? "text-primary"
      : tone === "negative"
        ? "text-destructive"
        : tone === "warning"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <p className={`text-2xl font-semibold tracking-tight ${toneCls}`}>
              {value}
            </p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="rounded-lg bg-muted p-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helpers DRE
function crescBadge(pct: number) {
  if (Math.abs(pct) < 1) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${up ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function DRECard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
  badge,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: any;
  tone?: "default" | "positive" | "negative" | "warning";
  badge?: React.ReactNode;
}) {
  const toneCls =
    tone === "positive" ? "text-primary" :
    tone === "negative" ? "text-destructive" :
    tone === "warning" ? "text-amber-600" : "text-foreground";
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground truncate">{title}</p>
              {badge}
            </div>
            <p className={`text-xl font-semibold tracking-tight ${toneCls}`}>{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="rounded-lg bg-muted p-2 text-muted-foreground shrink-0">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VisaoGeral() {
  const {
    summaryR,
    summaryP,
    analytics,
    receber,
    pagar,
    fluxoCaixa,
    saldoTotalCarteiras,
    carteiras: listaCarteiras,
    dre,
    loadingDRE,
    loading,
    error,
  } = useFinanceiroReal();

  const hasCoreFinance = fluxoCaixa != null || summaryR != null || summaryP != null;
  const showMoneyKpis = loading || hasCoreFinance;

  // Preferência: fluxo-caixa real → fallback analytics/summaryR/P
  const totalReceber = fluxoCaixa?.totalReceberAberto ?? summaryR?.totalAberto ?? 0;
  const totalPagar = fluxoCaixa?.totalPagarAberto ?? summaryP?.totalAberto ?? 0;
  const entradas = fluxoCaixa?.entradasMes ?? analytics?.fluxoMensal?.at(-1)?.entrada ?? summaryR?.totalPago ?? 0;
  const saidas = fluxoCaixa?.saidasMes ?? analytics?.fluxoMensal?.at(-1)?.saida ?? summaryP?.totalPago ?? 0;
  const lucro = entradas - saidas;
  const saldoReal = fluxoCaixa?.saldoAtual ?? null;
  const fluxoMensal = analytics?.fluxoMensal ?? [];
  const receitasOrigem = analytics?.receitasOrigem ?? [];
  const recebidoOS = receitasOrigem.find((x) => x.name === "Ordem de Serviço")?.value;
  const recebidoPDV = receitasOrigem.find((x) => x.name === "PDV")?.value;
  const atrasados = (fluxoCaixa?.totalVencidosReceber ?? 0) + (fluxoCaixa?.totalVencidosPagar ?? 0);
  const mesAtual = analytics?.fluxoMensal?.at(-1);
  const periodoResultado =
    mesAtual?.mes?.trim() ||
    new Date().toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

  // DRE dados
  const drePeriodo = dre?.periodo.label ?? periodoResultado;
  const dreComp = dre?.comparativo ?? null;
  const dreTendencia = dre?.tendencia ?? "estavel";
  const dreHistorico = dre?.historico6Meses ?? [];

  // Alertas: fluxo-caixa + DRE gerencial, urgentes primeiro
  type AlertItem = { msg: string; val: string; urgente?: boolean };
  const alertItems: AlertItem[] = [
    ...(fluxoCaixa?.alertas?.map((a) => ({
      msg: a.mensagem,
      val: a.valor != null ? fmt(a.valor) : "",
      urgente: a.urgente,
    })) ?? (
      [
        summaryP && summaryP.totalVencido > 0
          ? { msg: `${summaryP.quantidade} contas a pagar — ${fmt(summaryP.totalVencido)} em atraso`, val: fmt(summaryP.totalVencido), urgente: true }
          : null,
        summaryR && summaryR.totalVencido > 0
          ? { msg: `A receber — ${fmt(summaryR.totalVencido)} vencido de clientes`, val: fmt(summaryR.totalVencido), urgente: false }
          : null,
      ] as Array<AlertItem | null>
    ).filter((x): x is AlertItem => x !== null)),
    ...(dre?.alertas?.map((a) => ({
      msg: a.mensagem,
      val: a.valor != null ? `${Math.abs(a.valor).toFixed(1)}${a.tipo.includes("margem") || a.tipo.includes("despesa") ? "%" : ""}` : "",
      urgente: a.urgente,
    })) ?? []),
  ].sort((a, b) => Number(b.urgente) - Number(a.urgente));

  return (
    <div className="space-y-4">
      {/* ── Saldo + receber/pagar + resultado ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {saldoReal !== null
          ? <StatCard title="Saldo realizado" value={fmt(saldoReal)} hint="Entradas − saídas efetivadas" icon={Wallet} tone={saldoReal >= 0 ? "positive" : "negative"} />
          : <StatCard title="Saldo em carteiras" value={showMoneyKpis ? fmt(saldoTotalCarteiras) : "—"} hint={`${listaCarteiras.filter(c => c.ativo).length} carteiras ativas`} icon={Wallet} />
        }
        <StatCard title="A receber" value={fmtOrDash(totalReceber, showMoneyKpis)} hint="Em aberto" icon={ArrowDownCircle} tone="positive" />
        <StatCard title="A pagar" value={fmtOrDash(totalPagar, showMoneyKpis)} hint="Em aberto" icon={ArrowUpCircle} tone="negative" />
        <StatCard title="Resultado do mês" value={fmtOrDash(lucro, showMoneyKpis)} hint={periodoResultado} icon={TrendingUp} tone={lucro >= 0 ? "positive" : "negative"} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Entradas mês" value={fmtOrDash(entradas, showMoneyKpis)} icon={ArrowDownLeft} tone="positive" />
        <StatCard title="Saídas mês" value={fmtOrDash(saidas, showMoneyKpis)} icon={ArrowUpRight} tone="negative" />
        <StatCard title="Lucro líquido" value={fmtOrDash(lucro, showMoneyKpis)} hint="Consolidado no período exibido" icon={PiggyBank} tone={lucro >= 0 ? "positive" : "negative"} />
      </div>

      {/* ── Resultado Gerencial (DRE) ── */}
      <div className="flex items-center gap-2 pt-1">
        <BarChart3 className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Resultado Gerencial</p>
        <Badge variant="outline" className="text-[10px] gap-1">
          {dreTendencia === "positiva" ? <TrendingUp className="h-3 w-3 text-primary" /> : dreTendencia === "negativa" ? <TrendingDown className="h-3 w-3 text-destructive" /> : <Percent className="h-3 w-3" />}
          {dreTendencia === "positiva" ? "Tendência positiva" : dreTendencia === "negativa" ? "Tendência negativa" : "Estável"}
        </Badge>
        {loadingDRE && <span className="text-xs text-muted-foreground animate-pulse">calculando...</span>}
      </div>

      {!loadingDRE && !dre ? (
        <Alert>
          <AlertTitle>Sem dados de DRE</AlertTitle>
          <AlertDescription>
            Não há resultado gerencial calculado para a loja e período atuais. Quando o serviço retornar DRE, os indicadores aparecerão aqui.
          </AlertDescription>
        </Alert>
      ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DRECard
          title="Receita líquida"
          value={dre ? fmt(dre.receitaBruta) : "—"}
          hint={drePeriodo}
          icon={ArrowDownCircle}
          tone={dre && dre.receitaBruta > 0 ? "positive" : "default"}
          badge={dreComp ? crescBadge(dreComp.receitaCrescimento) : undefined}
        />
        <DRECard
          title="Lucro líquido"
          value={dre ? fmt(dre.lucroLiquido) : "—"}
          hint={dre && dreComp ? `Ant.: ${fmt(dreComp.lucroMesAnterior)}` : undefined}
          icon={PiggyBank}
          tone={dre && dre.lucroLiquido > 0 ? "positive" : dre && dre.lucroLiquido < 0 ? "negative" : "default"}
          badge={dreComp ? crescBadge(dreComp.lucroCrescimento) : undefined}
        />
        <DRECard
          title="Margem líquida"
          value={dre ? `${dre.margemLiquida.toFixed(1)}%` : "—"}
          hint={dre ? (dre.margemLiquida >= 10 ? "Saudável (≥10%)" : dre.margemLiquida > 0 ? "Atenção (<10%)" : "Prejuízo") : undefined}
          icon={Percent}
          tone={dre && dre.margemLiquida >= 15 ? "positive" : dre && dre.margemLiquida > 0 ? "warning" : dre && dre.margemLiquida <= 0 ? "negative" : "default"}
        />
        <DRECard
          title="Ticket médio"
          value={dre ? fmt(dre.ticketMedio) : "—"}
          hint={dre ? `${dre.totalTransacoes} transações` : undefined}
          icon={Receipt}
          tone="default"
        />
      </div>
      )}

      {/* ── Alertas financeiros ── */}
      <Card className="rounded-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <CardTitle className="text-base">Alertas financeiros</CardTitle>
          </div>
          <CardDescription>Itens que exigem sua atenção</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {alertItems.length === 0 ? (
            <EmptyState
              compact
              dashboardLink={false}
              title="Nenhum alerta no momento"
              description="Não há itens que exijam atenção com base nos dados atuais da loja."
            />
          ) : (
            alertItems.map((a, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg border p-3 ${a.urgente ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/40"}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-md p-1.5 ${a.urgente ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <p className="text-sm text-foreground">{a.msg}</p>
                </div>
                {a.val && <span className="text-sm font-medium text-muted-foreground">{a.val}</span>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── DRE Mensal — últimos 6 meses ── */}
      {dreHistorico.length > 0 && (
        <Card className="rounded-xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">DRE Mensal — Receita · Despesa · Lucro</CardTitle>
            </div>
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dreHistorico}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    color: "var(--color-popover-foreground)",
                  }}
                  formatter={(value: number) => [fmt(value)]}
                />
                <Legend />
                <Bar dataKey="receita" name="Receita" fill="var(--color-primary)" opacity={0.85} radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill="var(--color-chart-3)" opacity={0.75} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="lucro" name="Lucro" stroke="var(--color-chart-2)" strokeWidth={2.5} dot={{ r: 4 }} />
                <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="4 2" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Evolução entradas vs saídas ── */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Evolução — entradas vs. saídas</CardTitle>
          <CardDescription>Últimos 6 meses</CardDescription>
        </CardHeader>
        <CardContent className="h-72 min-w-0">
          {fluxoMensal.length === 0 ? (
            <EmptyState
              compact
              dashboardLink={false}
              title="Sem dados de evolução"
              description="Não há série mensal de entradas e saídas para exibir. Verifique se há movimentações no período ou se a loja ativa está correta."
            />
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fluxoMensal}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-popover-foreground)",
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="entrada" stroke="var(--color-primary)" strokeWidth={2} />
              <Line type="monotone" dataKey="saida" stroke="var(--color-chart-2)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Fluxo automático ── */}
      <Card className="rounded-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Fluxo automático</CardTitle>
          </div>
          <CardDescription>Lançamentos integrados ao PDV, OS e recorrências</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Recebido OS", val: (recebidoOS ?? 0) > 0 ? fmt(recebidoOS as number) : "—", icon: Wrench, tone: (recebidoOS ?? 0) > 0 ? "primary" : "muted" },
              { label: "Recebido PDV", val: (recebidoPDV ?? 0) > 0 ? fmt(recebidoPDV as number) : "—", icon: ShoppingCart, tone: (recebidoPDV ?? 0) > 0 ? "primary" : "muted" },
              { label: "Despesas em aberto", val: fmtOrDash(totalPagar, showMoneyKpis), icon: Repeat, tone: "muted" },
              {
                label: "Próx. 7 dias",
                val:
                  fluxoCaixa != null
                    ? fmt(fluxoCaixa.proximosRecebimentos7Dias.total + fluxoCaixa.proximosPagamentos7Dias.total)
                    : "—",
                icon: CalendarClock,
                tone: "muted",
              },
              { label: "Em atraso", val: fmtOrDash(atrasados, showMoneyKpis), icon: TrendingDown, tone: atrasados > 0 ? "destructive" : "muted" },
              {
                label: "Entradas hoje",
                val: fluxoCaixa != null ? fmt(fluxoCaixa.entradasHoje) : "—",
                icon: Percent,
                tone: fluxoCaixa != null && fluxoCaixa.entradasHoje > 0 ? "primary" : "muted",
              },
            ].map((c) => {
              const Icon = c.icon;
              const ring =
                c.tone === "primary"
                  ? "border-primary/30 bg-primary/5"
                  : c.tone === "destructive"
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-border bg-muted/30";
              const text =
                c.tone === "primary"
                  ? "text-primary"
                  : c.tone === "destructive"
                    ? "text-destructive"
                    : "text-foreground";
              return (
                <div key={c.label} className={`rounded-xl border p-3 ${ring}`}>
                  <div className={`mb-2 inline-flex rounded-md p-1.5 ${text} bg-background/60`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                  <p className={`text-sm font-semibold ${text}`}>{c.val}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ContaReceber type imported from FinanceiroRealContext

function ContasReceber() {
  const { receber, loading, error, reload, liquidarReceber, receberParcial, estornarReceber, criarReceber } = useFinanceiroReal();
  const [filter, setFilter] = useState<string>("todos");
  const [openNovo, setOpenNovo] = useState(false);
  const [selected, setSelected] = useState<ContaReceber | null>(null);
  const [modal, setModal] = useState<"receber" | "recibo" | "estorno" | "historico" | "renegociar" | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (m: typeof modal, item: ContaReceber) => {
    setSelected(item);
    setModal(m);
  };

  const handleReceber = async (valor: number, total: boolean) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      if (total) {
        await liquidarReceber(selected.id);
        toast.success("Conta quitada");
      } else {
        await receberParcial(selected.id, valor);
        toast.success("Baixa parcial registrada");
      }
      setModal(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar recebimento");
    } finally {
      setBusy(false);
    }
  };

  const handleEstorno = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await estornarReceber(selected.id);
      toast.success("Recebimento estornado");
      setModal(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao estornar");
    } finally {
      setBusy(false);
    }
  };

  const list = receber.filter((r) => filter === "todos" || r.status === filter);

  if (loading) return <LoadingState message="Carregando títulos a receber…" />;
  if (error) return (
    <div className="space-y-3 py-8 text-center">
      <p className="text-sm text-destructive">{error}</p>
      <button className="text-xs text-primary underline" onClick={reload}>Tentar novamente</button>
    </div>
  );

  return (
    <div className="min-w-0 space-y-4">
      <Card className="rounded-xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Contas a Receber</CardTitle>
            <CardDescription>
              Títulos, clientes, parcelas, baixas e recibos
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-1" onClick={() => setOpenNovo(true)}>
              <Plus className="h-4 w-4" /> Novo recebimento
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="min-w-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell>{r.cliente}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.parcela}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(r.venc).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(r.valor)}</TableCell>
                    <TableCell className="text-right text-primary">{fmt(r.recebido)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Receber" onClick={() => open("receber", r)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Emitir recibo" onClick={() => open("recibo", r)}>
                          <Receipt className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Renegociar" onClick={() => open("renegociar", r)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Estornar" onClick={() => open("estorno", r)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Histórico" onClick={() => open("historico", r)}>
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <NovoRecebimentoModal open={openNovo} onOpenChange={setOpenNovo} onSave={criarReceber} />
      <ReceberContaModal
        open={modal === "receber"}
        onOpenChange={(v) => !v && setModal(null)}
        conta={selected}
        onConfirm={handleReceber}
      />
      <ReciboModal open={modal === "recibo"} onOpenChange={(v) => !v && setModal(null)} conta={selected} />
      <EstornoModal
        open={modal === "estorno"}
        onOpenChange={(v) => !v && setModal(null)}
        conta={selected}
        onConfirm={handleEstorno}
      />
      <HistoricoModal open={modal === "historico"} onOpenChange={(v) => !v && setModal(null)} conta={selected} />
      <RenegociarModal
        open={modal === "renegociar"}
        onOpenChange={(v) => !v && setModal(null)}
        conta={selected}
      />
    </div>
  );
}

// ContaPagar type imported from FinanceiroRealContext

function ContasPagar() {
  const { pagar, loading, error, reload, liquidarPagar, pagarParcial, estornarPagar, criarPagar } = useFinanceiroReal();
  const [filter, setFilter] = useState<string>("todos");
  const [openNovo, setOpenNovo] = useState(false);
  const [selected, setSelected] = useState<ContaPagar | null>(null);
  const [modal, setModal] = useState<"pagar" | "historico" | "estorno" | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePagar = async (valor: number, total: boolean) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      if (total) {
        await liquidarPagar(selected.id);
        toast.success("Pagamento total registrado");
      } else {
        await pagarParcial(selected.id, valor);
        toast.success("Pagamento parcial registrado");
      }
      setModal(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar pagamento");
    } finally {
      setBusy(false);
    }
  };

  const handleEstorno = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await estornarPagar(selected.id);
      toast.success("Pagamento estornado");
      setModal(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao estornar");
    } finally {
      setBusy(false);
    }
  };

  const handleMarcarPago = async (item: ContaPagar) => {
    try {
      await liquidarPagar(item.id);
      toast.success("Conta marcada como paga");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao liquidar");
    }
  };

  const handleDuplicar = (item: ContaPagar) => {
    criarPagar({ fornecedor: item.fornecedor, descricao: item.fornecedor, valor: item.valor, vencimento: item.venc })
      .then(() => toast.success("Conta duplicada"))
      .catch(() => toast.error("Falha ao duplicar"));
  };

  const handleExcluir = (_item: ContaPagar) => {
    toast.info("Exclusão não disponível — use estorno para reverter");
  };

  const list = pagar.filter((r) => filter === "todos" || r.status === filter);

  if (loading) return <LoadingState message="Carregando títulos a pagar…" />;
  if (error) return (
    <div className="space-y-3 py-8 text-center">
      <p className="text-sm text-destructive">{error}</p>
      <button className="text-xs text-primary underline" onClick={reload}>Tentar novamente</button>
    </div>
  );

  return (
    <div className="min-w-0 space-y-4">
    <Card className="rounded-xl">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Contas a Pagar</CardTitle>
          <CardDescription>Despesas, fornecedores e vencimentos</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1" onClick={() => setOpenNovo(true)}>
            <Plus className="h-4 w-4" /> Nova conta
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="min-w-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc.</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell>{p.fornecedor}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(p.venc).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(p.valor)}</TableCell>
                  <TableCell className="text-right text-primary">{fmt(p.pago)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Pagar" onClick={() => { setSelected(p); setModal("pagar"); }}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Marcar pago" onClick={() => handleMarcarPago(p)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Estornar" onClick={() => { setSelected(p); setModal("estorno"); }}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Histórico" onClick={() => { setSelected(p); setModal("historico"); }}>
                        <History className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Duplicar" onClick={() => handleDuplicar(p)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Excluir" onClick={() => handleExcluir(p)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    <NovaContaModal open={openNovo} onOpenChange={setOpenNovo} onSave={criarPagar} />
    <PagarContaModal
      open={modal === "pagar"}
      onOpenChange={(v) => !v && setModal(null)}
      conta={selected}
      onConfirm={handlePagar}
    />
    <EstornoPagarModal
      open={modal === "estorno"}
      onOpenChange={(v) => !v && setModal(null)}
      conta={selected}
      onConfirm={handleEstorno}
    />
    <HistoricoPagarModal open={modal === "historico"} onOpenChange={(v) => !v && setModal(null)} conta={selected} />
    </div>
  );
}

function FluxoCaixa() {
  const { fluxoCaixa, loadingFluxoCaixa, refreshFluxoCaixa, getActiveStoreId } = useFinanceiroReal();
  const [periodo, setPeriodo] = useState<FluxoPeriodoTab>("mes");
  const [customIni, setCustomIni] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [movRows, setMovRows] = useState<MovPrismaRow[]>([]);
  const [loadingMovs, setLoadingMovs] = useState(false);

  const range = useMemo(
    () => fluxoTabDateRange(periodo, customIni, customFim),
    [periodo, customIni, customFim],
  );

  const loadMovs = useCallback(async () => {
    const di = ymd(range.start);
    const df = ymd(range.end);
    const sid = getActiveStoreId();
    if (!sid) {
      setMovRows([]);
      setLoadingMovs(false);
      return;
    }
    setLoadingMovs(true);
    try {
      const res = await fetch(
        `/api/financeiro/movimentacoes?dataInicial=${encodeURIComponent(di)}&dataFinal=${encodeURIComponent(df)}&take=500`,
        { headers: { [ASSISTEC_LOJA_HEADER]: sid } },
      );
      const json = (await res.json()) as Record<string, unknown>;
      if (json.ok && Array.isArray(json.rows)) {
        setMovRows(json.rows as MovPrismaRow[]);
      } else {
        setMovRows([]);
      }
    } catch {
      setMovRows([]);
    } finally {
      setLoadingMovs(false);
    }
  }, [range.start, range.end, getActiveStoreId]);

  useEffect(() => {
    void loadMovs();
  }, [loadMovs]);

  const movsAgregacao = useMemo(
    () => movRows.filter((m) => !isOrigemTransferenciaInterna(m.origem)),
    [movRows],
  );

  const totEntrada = movsAgregacao
    .filter((m) => m.tipo === "entrada")
    .reduce((a, m) => a + m.valor, 0);
  const totSaida = movsAgregacao
    .filter((m) => m.tipo === "saida")
    .reduce((a, m) => a + m.valor, 0);

  const chartData = useMemo(() => {
    const startKey = ymd(range.start);
    const endKey = ymd(range.end);
    const fromFluxo = fluxoCaixa?.fluxoDiarioUltimos30Dias?.filter(
      (d) => d.data >= startKey && d.data <= endKey,
    );
    if (periodo !== "personalizado" && fromFluxo && fromFluxo.length > 0) {
      return fromFluxo.map((d) => ({ mes: d.label, entrada: d.entrada, saida: d.saida }));
    }
    return buildFluxoChartFromMovs(movsAgregacao, range.start, range.end);
  }, [fluxoCaixa, range.start, range.end, movsAgregacao, periodo]);

  const listaMovs = useMemo(() => {
    return [...movsAgregacao]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 80)
      .map((m) => ({
        id: m.id,
        desc: m.descricao,
        tipo: m.tipo === "saida" ? "saida" as const : "entrada" as const,
        valor: m.valor,
        data: new Date(m.createdAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));
  }, [movsAgregacao]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => {
            void refreshFluxoCaixa();
            void loadMovs();
          }}
          disabled={loadingFluxoCaixa && loadingMovs}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingFluxoCaixa || loadingMovs ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadingFluxoCaixa && !fluxoCaixa ? (
          <>
            <StatCard title="Saldo consolidado" value="—" hint="Carregando…" icon={Wallet} />
            <StatCard title="Entradas hoje" value="—" icon={ArrowDownLeft} />
            <StatCard title="Saídas hoje" value="—" icon={ArrowUpRight} />
            <StatCard title="A receber (aberto)" value="—" icon={ArrowDownCircle} />
          </>
        ) : (
          <>
            <StatCard
              title="Saldo consolidado"
              value={fluxoCaixa != null ? fmt(fluxoCaixa.saldoAtual) : "—"}
              hint="Movimentações realizadas"
              icon={Wallet}
              tone={fluxoCaixa != null && fluxoCaixa.saldoAtual >= 0 ? "positive" : "negative"}
            />
            <StatCard
              title="Entradas hoje"
              value={fluxoCaixa != null ? fmt(fluxoCaixa.entradasHoje) : "—"}
              icon={ArrowDownLeft}
              tone="positive"
            />
            <StatCard
              title="Saídas hoje"
              value={fluxoCaixa != null ? fmt(fluxoCaixa.saidasHoje) : "—"}
              icon={ArrowUpRight}
              tone="negative"
            />
            <StatCard
              title="A receber (aberto)"
              value={fluxoCaixa != null ? fmt(fluxoCaixa.totalReceberAberto) : "—"}
              icon={ArrowDownCircle}
            />
          </>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Entradas (período filtrado)"
          value={loadingMovs ? "—" : fmt(totEntrada)}
          icon={ArrowDownLeft}
          tone="positive"
        />
        <StatCard
          title="Saídas (período filtrado)"
          value={loadingMovs ? "—" : fmt(totSaida)}
          icon={ArrowUpRight}
          tone="negative"
        />
        <StatCard
          title="Saldo do período (filtrado)"
          value={loadingMovs ? "—" : fmt(totEntrada - totSaida)}
          icon={Wallet}
          tone={totEntrada - totSaida >= 0 ? "positive" : "negative"}
        />
      </div>

      {fluxoCaixa && (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-base">Próximos recebimentos (7 dias)</CardTitle>
              <CardDescription>Total {fmt(fluxoCaixa.proximosRecebimentos7Dias.total)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-56 overflow-y-auto">
              {fluxoCaixa.proximosRecebimentos7Dias.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem recebimentos previstos neste intervalo.</p>
              ) : (
                fluxoCaixa.proximosRecebimentos7Dias.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2 text-sm border-b border-border/50 pb-2">
                    <span className="truncate">{it.descricao}</span>
                    <span className="shrink-0 font-medium">{fmt(it.valor)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-base">Próximos pagamentos (7 dias)</CardTitle>
              <CardDescription>Total {fmt(fluxoCaixa.proximosPagamentos7Dias.total)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-56 overflow-y-auto">
              {fluxoCaixa.proximosPagamentos7Dias.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem pagamentos previstos neste intervalo.</p>
              ) : (
                fluxoCaixa.proximosPagamentos7Dias.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2 text-sm border-b border-border/50 pb-2">
                    <span className="truncate">{it.descricao}</span>
                    <span className="shrink-0 font-medium">{fmt(it.valor)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {fluxoCaixa && fluxoCaixa.alertas.length > 0 && (
        <Card className="rounded-xl border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Alertas operacionais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fluxoCaixa.alertas.map((a, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 text-sm ${a.urgente ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30"}`}
              >
                {a.mensagem}
                {a.valor != null && <span className="ml-2 font-medium">{fmt(a.valor)}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Fluxo de Caixa</CardTitle>
            <CardDescription>Período e movimentações reais (API)</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as FluxoPeriodoTab)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="semana">Semana (7 dias)</SelectItem>
                  <SelectItem value="mes">Mês corrente</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodo === "personalizado" && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  className="w-40"
                  value={customIni}
                  onChange={(e) => setCustomIni(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="date"
                  className="w-40"
                  value={customFim}
                  onChange={(e) => setCustomFim(e.target.value)}
                />
                <Button type="button" size="sm" variant="secondary" onClick={() => void loadMovs()}>
                  Aplicar
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="min-h-72 min-w-0">
          {loadingMovs && chartData.length === 0 ? (
            <LoadingState message="Carregando série do período…" />
          ) : chartData.length === 0 ? (
            <EmptyState
              compact
              dashboardLink={false}
              title="Sem movimentações no período"
              description="Ajuste o filtro ou registre lançamentos em Carteiras."
            />
          ) : (
            <div className="h-72 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="entrada" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="saida" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Movimentações do período</CardTitle>
          <CardDescription>Ordenadas por data (mais recentes primeiro)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingMovs ? (
            <LoadingState message="Carregando movimentações…" inline />
          ) : listaMovs.length === 0 ? (
            <EmptyState
              compact
              dashboardLink={false}
              title="Nenhuma movimentação"
              description="Não há lançamentos no intervalo selecionado."
            />
          ) : (
            listaMovs.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`rounded-md p-1.5 shrink-0 ${
                      m.tipo === "entrada"
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {m.tipo === "entrada" ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.desc}</p>
                    <p className="text-xs text-muted-foreground">{m.data}</p>
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold shrink-0 ${
                    m.tipo === "entrada" ? "text-primary" : "text-destructive"
                  }`}
                >
                  {m.tipo === "entrada" ? "+" : "-"}
                  {fmt(m.valor)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GestaoCarteiras() {
  const { carteiras, loadingCarteiras, transferirEntreCarteiras, registrarMovimentacaoCarteira } = useFinanceiroReal();
  const [openNova, setOpenNova] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [movModal, setMovModal] = useState<{ tipo: "entrada" | "saida"; carteiraId: string } | null>(null);

  const ativasRef: CarteiraRef[] = carteiras
    .filter((c) => c.ativo)
    .map((c) => ({ id: c.id, nome: c.nome }));

  const handleTransfer = async (origem: string, destino: string, valor: number) => {
    try {
      await transferirEntreCarteiras({ origemId: origem, destinoId: destino, valor });
      toast.success("Transferência realizada com sucesso!");
      setOpenTransfer(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na transferência");
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <Card className="rounded-xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Carteiras</CardTitle>
            <CardDescription>Por loja, banco, caixa, cartão e pessoal</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => toast.info("Captura por voz em breve")}>
              <Mic className="h-4 w-4" /> Voz
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpenTransfer(true)}>
              <ArrowRightLeft className="h-4 w-4" /> Transferir
            </Button>
            <Button size="sm" className="gap-1" onClick={() => setOpenNova(true)}>
              <Plus className="h-4 w-4" /> Nova carteira
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingCarteiras ? (
            <LoadingState message="Carregando carteiras…" />
          ) : carteiras.filter((c) => c.ativo).length === 0 ? (
            <EmptyState
              compact
              dashboardLink={false}
              title="Nenhuma carteira cadastrada"
              description="Crie uma carteira para consolidar saldos por loja, banco ou caixa."
              action={{ label: "Criar primeira carteira", onClick: () => setOpenNova(true) }}
            />
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {carteiras.filter((c) => c.ativo).map((c) => {
                const Icon = tipoToIcon(c.tipo);
                const negativo = c.saldoAtual < 0;
                return (
                  <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="rounded-lg p-2"
                          style={{ backgroundColor: `${c.cor}22`, color: c.cor }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{c.nome}</p>
                          <p className="text-xs text-muted-foreground capitalize">{c.tipo}</p>
                        </div>
                      </div>
                      {negativo && (
                        <Badge variant="destructive" className="text-xs">Negativo</Badge>
                      )}
                    </div>
                    <p className={`text-2xl font-semibold tracking-tight ${negativo ? "text-destructive" : ""}`}>
                      {fmt(c.saldoAtual)}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => setMovModal({ tipo: "entrada", carteiraId: c.id })}>
                        <ArrowDownLeft className="h-3.5 w-3.5" /> Entrada
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => setMovModal({ tipo: "saida", carteiraId: c.id })}>
                        <ArrowUpRight className="h-3.5 w-3.5" /> Saída
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <NovaCarteiraModal open={openNova} onOpenChange={setOpenNova} />
      <TransferenciaModal
        open={openTransfer}
        onOpenChange={setOpenTransfer}
        carteiras={ativasRef}
        onConfirm={handleTransfer}
      />
      <MovimentacaoModal
        open={movModal !== null}
        onOpenChange={(v) => !v && setMovModal(null)}
        tipo={movModal?.tipo ?? "entrada"}
        carteiraId={movModal?.carteiraId ?? ""}
        carteiras={ativasRef}
        onConfirm={async (payload) => {
          try {
            await registrarMovimentacaoCarteira(payload);
            toast.success(payload.tipo === "entrada" ? "Entrada registrada" : "Saída registrada");
            setMovModal(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha ao registrar movimentação");
          }
        }}
      />
    </div>
  );
}

// ── Filtros de período ────────────────────────────────────────────────────────

const PRESETS: { v: PresetPeriodo; label: string }[] = [
  { v: "hoje", label: "Hoje" },
  { v: "ontem", label: "Ontem" },
  { v: "7dias", label: "7 dias" },
  { v: "30dias", label: "30 dias" },
  { v: "estemes", label: "Este mês" },
  { v: "mespassado", label: "Mês passado" },
  { v: "personalizado", label: "Personalizado" },
];

function FiltrosPeriodo() {
  const { filtrosFinanceiros, setFiltrosFinanceiros, refreshRelatorios, loadingRelatorios } = useFinanceiroReal();

  function handlePreset(v: PresetPeriodo) {
    const newF = { ...filtrosFinanceiros, preset: v };
    setFiltrosFinanceiros(newF);
    void refreshRelatorios(newF);
  }
  function handleDates(field: "dataInicio" | "dataFim", v: string) {
    const newF = { ...filtrosFinanceiros, [field]: v, preset: "personalizado" as PresetPeriodo };
    setFiltrosFinanceiros(newF);
  }
  function handleApply() { void refreshRelatorios(filtrosFinanceiros); }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {PRESETS.map((p) => (
        <button
          key={p.v}
          onClick={() => handlePreset(p.v)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filtrosFinanceiros.preset === p.v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
        >
          {p.label}
        </button>
      ))}
      {filtrosFinanceiros.preset === "personalizado" && (
        <div className="flex items-center gap-2">
          <Input type="date" value={filtrosFinanceiros.dataInicio ?? ""} onChange={(e) => handleDates("dataInicio", e.target.value)} className="h-7 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={filtrosFinanceiros.dataFim ?? ""} onChange={(e) => handleDates("dataFim", e.target.value)} className="h-7 w-36 text-xs" />
          <Button size="sm" onClick={handleApply} disabled={loadingRelatorios} className="h-7 px-3 text-xs">
            <RefreshCw className={`h-3 w-3 mr-1 ${loadingRelatorios ? "animate-spin" : ""}`} />Aplicar
          </Button>
        </div>
      )}
      {loadingRelatorios && filtrosFinanceiros.preset !== "personalizado" && (
        <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

// ── Botões de exportação ──────────────────────────────────────────────────────

function ExportButton({ tipo, label, filtros }: { tipo: string; label: string; filtros?: FiltrosFinanceiros }) {
  const { exportarRelatorio, filtrosFinanceiros } = useFinanceiroReal();
  const f = filtros ?? filtrosFinanceiros;
  return (
    <div className="flex min-w-0 items-center gap-1" title={label.trim() ? undefined : `Exportar ${tipo}`}>
      {label.trim() ? <span className="text-xs text-muted-foreground w-36 truncate">{label}</span> : null}
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs gap-1"
        type="button"
        aria-label={`Exportar ${tipo} em CSV`}
        onClick={() => exportarRelatorio(tipo, "csv", f)}
      >
        <Download className="h-3 w-3" />CSV
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs gap-1"
        type="button"
        aria-label={`Exportar ${tipo} em Excel`}
        onClick={() => exportarRelatorio(tipo, "xlsx", f)}
      >
        <Download className="h-3 w-3" />XLSX
      </Button>
    </div>
  );
}

// ── StatKPI ────────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Relatorios() {
  const { analytics, summaryR, summaryP, receber, relatorios, loadingRelatorios, filtrosFinanceiros, refreshRelatorios } = useFinanceiroReal();

  // Load on mount
  useEffect(() => { void refreshRelatorios(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  const pctStr = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

  const ind = relatorios.resumo?.indicadores;
  const comparativoMensal = relatorios.comparativoMensal;
  const topR = relatorios.topReceitas;
  const topD = relatorios.topDespesas;
  const analiseCarteiras = relatorios.analiseCarteiras;
  const receitasCat = relatorios.resumo?.receitasPorCategoria ?? [];
  const despesasCat = relatorios.resumo?.despesasPorCategoria ?? [];

  // Fallback: dados do DRE/analytics existente para gráficos
  const receitasOrigem = analytics?.receitasOrigem ?? [];
  const despesasCategoria = analytics?.despesasCategoria ?? [];

  // Fallback inadimplência do context existente
  const vencidas = summaryR?.totalVencido ?? 0;
  const atrasosByCliente = useMemo(() => {
    const m = new Map<string, { cliente: string; total: number }>();
    for (const r of receber) {
      if (r.status !== "atrasado") continue;
      const nome = r.cliente || "Cliente";
      m.set(nome, { cliente: nome, total: (m.get(nome)?.total ?? 0) + Math.max(0, r.valor - r.recebido) });
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, 3);
  }, [receber]);
  const clientesAtraso = atrasosByCliente.length;
  const denom = (summaryR?.totalPago ?? 0) + (summaryR?.totalAberto ?? 0) + (summaryR?.totalVencido ?? 0);
  const taxa = denom > 0 ? (vencidas / denom) * 100 : 0;

  const receitaBruta = ind?.receitaTotal ?? summaryR?.totalPago ?? 0;
  const despesas = ind?.despesaTotal ?? summaryP?.totalPago ?? 0;
  const lucroLiquido = ind?.lucroLiquido ?? receitaBruta - despesas;
  const margem = ind?.margemLiquida ?? (receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0);

  const hasRelKpiBase = relatorios.resumo != null || summaryR != null || summaryP != null;

  const TTSTYLE = { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 };

  return (
    <div className="space-y-5 min-w-0">
      {/* Filtros globais */}
      <FiltrosPeriodo />

      {/* 1. KPIs Executivos */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Visão Executiva</h3>
        {loadingRelatorios ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-muted" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPICard label="Receita total" value={hasRelKpiBase ? fmt(receitaBruta) : "—"} color="text-success" sub={ind?.crescimentoMensal !== undefined ? `${pctStr(ind.crescimentoMensal)} vs mês ant.` : undefined} />
            <KPICard label="Despesa total" value={hasRelKpiBase ? fmt(despesas) : "—"} color="text-destructive" />
            <KPICard label="Lucro líquido" value={hasRelKpiBase ? fmt(lucroLiquido) : "—"} color={lucroLiquido >= 0 ? "text-primary" : "text-destructive"} />
            <KPICard label="Margem líquida" value={hasRelKpiBase ? `${margem.toFixed(1)}%` : "—"} color={margem >= 20 ? "text-success" : margem >= 0 ? "text-warning" : "text-destructive"} />
            <KPICard label="Ticket médio" value={ind?.ticketMedio != null ? fmt(ind.ticketMedio) : "—"} />
            <KPICard label="Saldo consolidado" value={ind?.saldoConsolidado != null ? fmt(ind.saldoConsolidado) : "—"} />
            <KPICard label="A receber" value={ind?.receberPendente != null ? fmt(ind.receberPendente) : "—"} color="text-primary" />
            <KPICard label="A pagar" value={ind?.pagarPendente != null ? fmt(ind.pagarPendente) : "—"} color="text-warning" />
          </div>
        )}
      </div>

      {/* 2. Comparativo Mensal */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            Comparativo Mensal
            <ExportButton tipo="movimentacoes" label="" />
          </CardTitle>
          <CardDescription className="text-xs">Últimos 12 meses — receita, despesa e lucro</CardDescription>
        </CardHeader>
        <CardContent className="h-72 min-w-0">
          {comparativoMensal.length === 0 ? (
            <EmptyState
              compact
              dashboardLink={false}
              title="Sem dados para comparativo"
              description="Aplique os filtros de período ou aguarde movimentações no financeiro."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={comparativoMensal} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="mesLabel" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TTSTYLE} formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="entrada" name="Receita" fill="var(--color-primary)" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Bar dataKey="saida" name="Despesa" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Line type="monotone" dataKey="lucro" name="Lucro" stroke="var(--color-success)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 3. Fluxo de período */}
      {relatorios.fluxo.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fluxo de Caixa Acumulado</CardTitle>
            <CardDescription className="text-xs">Evolução mês a mês no período selecionado</CardDescription>
          </CardHeader>
          <CardContent className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={relatorios.fluxo} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TTSTYLE} formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="entrada" name="Entradas" fill="var(--color-primary)" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Bar dataKey="saida" name="Saídas" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 4. Rankings */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" />Top Receitas</CardTitle>
          </CardHeader>
          <CardContent>
            {topR.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum dado.</p> : (
              <div className="space-y-2">
                {topR.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate font-medium">{r.label}</p>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, r.percentual)}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-success">{fmt(r.valor)}</p>
                      <p className="text-[10px] text-muted-foreground">{r.percentual.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" />Top Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            {topD.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum dado.</p> : (
              <div className="space-y-2">
                {topD.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate font-medium">{r.label}</p>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-destructive" style={{ width: `${Math.min(100, r.percentual)}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-destructive">{fmt(r.valor)}</p>
                      <p className="text-[10px] text-muted-foreground">{r.percentual.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. Categorias */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-3"><CardTitle className="text-base">Receitas por Categoria</CardTitle></CardHeader>
          <CardContent className="h-64 min-w-0">
            {receitasCat.length === 0 && receitasOrigem.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={receitasCat.length > 0 ? receitasCat.map((c) => ({ name: c.categoria, value: c.total })) : receitasOrigem} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                    {(receitasCat.length > 0 ? receitasCat : receitasOrigem).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TTSTYLE} formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-3"><CardTitle className="text-base">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent className="h-64 min-w-0">
            {despesasCat.length === 0 && despesasCategoria.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={despesasCat.length > 0 ? despesasCat.map((c) => ({ name: c.categoria, value: c.total })) : despesasCategoria} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" stroke="var(--color-muted-foreground)" fontSize={11} width={80} />
                  <Tooltip contentStyle={TTSTYLE} formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="value" fill="var(--color-destructive)" radius={[0, 4, 4, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Análise de Carteiras */}
      {analiseCarteiras.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />Análise de Carteiras</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Carteira</th>
                    <th className="text-right py-2 pr-4 font-medium">Saldo Atual</th>
                    <th className="text-right py-2 pr-4 font-medium">Entradas</th>
                    <th className="text-right py-2 pr-4 font-medium">Saídas</th>
                    <th className="text-right py-2 pr-4 font-medium">Movimentações</th>
                    <th className="text-right py-2 font-medium">Part. %</th>
                  </tr>
                </thead>
                <tbody>
                  {analiseCarteiras.map((c) => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 pr-4 font-medium">{c.nome}</td>
                      <td className={`py-2 pr-4 text-right font-semibold ${c.saldoAtual < 0 ? "text-destructive" : ""}`}>{fmt(c.saldoAtual)}</td>
                      <td className="py-2 pr-4 text-right text-green-600 dark:text-green-400">{fmt(c.totalEntradas)}</td>
                      <td className="py-2 pr-4 text-right text-red-600 dark:text-red-400">{fmt(c.totalSaidas)}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">{c.qtdMovimentacoes}</td>
                      <td className="py-2 text-right text-muted-foreground">{c.participacao.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7. Inadimplência */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inadimplência</CardTitle>
          <CardDescription className="text-xs">Contas vencidas e clientes em atraso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <KPICard label="Vencidas" value={fmt(vencidas)} color="text-destructive" />
            <KPICard label="Clientes" value={String(clientesAtraso)} />
            <KPICard label="Taxa" value={`${taxa.toFixed(1)}%`} color={taxa > 10 ? "text-destructive" : taxa > 5 ? "text-warning" : ""} />
          </div>
          {atrasosByCliente.length > 0 && (
            <div className="space-y-2 mt-2">
              {atrasosByCliente.map((i) => (
                <div key={i.cliente} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                  <div>
                    <p className="text-sm font-medium">{i.cliente}</p>
                    <p className="text-xs text-muted-foreground">Em atraso</p>
                  </div>
                  <span className="text-sm font-semibold text-destructive">{fmt(i.total)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 8. Exportação */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4 text-primary" />Exportar Relatórios</CardTitle>
          <CardDescription className="text-xs">Baixe os dados do período selecionado em CSV ou XLSX.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <ExportButton tipo="movimentacoes" label="Movimentações" />
            <ExportButton tipo="receber" label="Contas a Receber" />
            <ExportButton tipo="pagar" label="Contas a Pagar" />
            <ExportButton tipo="conciliacoes" label="Conciliações" />
            <ExportButton tipo="auditoria" label="Log de Auditoria" />
            <ExportButton tipo="fluxo" label="Fluxo de Caixa" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── helpers de status ─────────────────────────────────────────────────────────

function FechamentoBadge({ status }: { status: string }) {
  if (status === "fechado") return <Badge className="bg-destructive/10 text-destructive border-0 text-xs font-medium"><Lock className="h-3 w-3 mr-1" />Fechado</Badge>;
  if (status === "reaberto") return <Badge className="bg-warning/10 text-warning border-0 text-xs font-medium"><Unlock className="h-3 w-3 mr-1" />Reaberto</Badge>;
  return <Badge variant="outline" className="text-xs">Aberto</Badge>;
}

function ConciliacaoBadge({ status }: { status: string }) {
  if (status === "conciliado") return <Badge className="bg-success/10 text-success border-0 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Conciliado</Badge>;
  if (status === "divergente") return <Badge className="bg-destructive/10 text-destructive border-0 text-xs"><AlertCircle className="h-3 w-3 mr-1" />Divergente</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Modal de fechamento ───────────────────────────────────────────────────────

function FecharModal({
  tipo, open, onClose,
}: { tipo: "dia" | "mes"; open: boolean; onClose: () => void }) {
  const { fecharDia, fecharMes } = useFinanceiroReal();
  const [loading, setLoading] = useState(false);
  const [obs, setObs] = useState("");
  const now = new Date();

  async function handleConfirm() {
    if (loading) return;
    setLoading(true);
    try {
      if (tipo === "dia") {
        await fecharDia({ observacao: obs || undefined });
        toast.success("Dia fechado com sucesso.");
      } else {
        await fecharMes(now.getMonth() + 1, now.getFullYear(), { observacao: obs || undefined });
        toast.success("Mês fechado com sucesso.");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao fechar período.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl border border-border">
        <h3 className="text-lg font-semibold mb-1">
          {tipo === "dia" ? "Fechar dia de hoje" : `Fechar mês ${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Após o fechamento, alterações neste período serão bloqueadas até reabertura manual.
        </p>
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground">Observação (opcional)</label>
          <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: Conferência realizada, sem divergências." className="mt-1" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button size="sm" onClick={handleConfirm} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white">
            <Lock className="h-4 w-4 mr-1" />{loading ? "Fechando..." : "Confirmar Fechamento"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de reabertura ───────────────────────────────────────────────────────

function ReopenModal({
  fechamento, open, onClose,
}: { fechamento: FechamentoPublico | null; open: boolean; onClose: () => void }) {
  const { reabrirFechamento } = useFinanceiroReal();
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function handleConfirm() {
    if (loading || !fechamento) return;
    if (motivo.trim().length < 5) { toast.error("Informe o motivo (mín. 5 caracteres)."); return; }
    setLoading(true);
    try {
      await reabrirFechamento(fechamento.id, motivo.trim());
      toast.success("Fechamento reaberto.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reabrir.");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !fechamento) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl border border-border">
        <h3 className="text-lg font-semibold mb-1">Reabrir Fechamento</h3>
        <p className="text-sm text-muted-foreground mb-1">
          {fechamento.tipo === "diario" ? `Dia ${fechamento.dataReferencia}` : `Mês ${String(fechamento.mes).padStart(2, "0")}/${fechamento.ano}`}
        </p>
        <p className="text-xs text-muted-foreground mb-4">Informe o motivo da reabertura para registro de auditoria.</p>
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground">Motivo <span className="text-red-500">*</span></label>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: Lançamento esquecido, estorno necessário..." className="mt-1" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button size="sm" onClick={handleConfirm} disabled={loading} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Unlock className="h-4 w-4 mr-1" />{loading ? "Reabrindo..." : "Confirmar Reabertura"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de conciliação ──────────────────────────────────────────────────────

function ConciliarModal({
  carteiras, open, onClose,
}: { carteiras: { id: string; nome: string; saldoAtual: number }[]; open: boolean; onClose: () => void }) {
  const { conciliarCarteira } = useFinanceiroReal();
  const [loading, setLoading] = useState(false);
  const [carteiraId, setCarteiraId] = useState("");
  const [saldo, setSaldo] = useState("");
  const [obs, setObs] = useState("");

  async function handleConfirm() {
    if (!carteiraId) { toast.error("Selecione uma carteira."); return; }
    const val = parseFloat(saldo.replace(",", "."));
    if (!Number.isFinite(val)) { toast.error("Informe um saldo válido."); return; }
    setLoading(true);
    try {
      const result = await conciliarCarteira(carteiraId, val, { observacao: obs || undefined });
      if (result.status === "conciliado") toast.success("Carteira conciliada. Sem divergências.");
      else toast.warning(`Divergência de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(result.diferenca))}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na conciliação.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl border border-border">
        <h3 className="text-lg font-semibold mb-1">Conciliar Carteira</h3>
        <p className="text-sm text-muted-foreground mb-4">Informe o saldo real da carteira para comparação com o sistema.</p>
        <div className="mb-3">
          <label className="text-xs font-medium text-muted-foreground">Carteira <span className="text-red-500">*</span></label>
          <select value={carteiraId} onChange={(e) => setCarteiraId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Selecionar...</option>
            {carteiras.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} (sistema: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.saldoAtual)})</option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <label className="text-xs font-medium text-muted-foreground">Saldo Informado (R$) <span className="text-red-500">*</span></label>
          <Input value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0,00" type="number" step="0.01" className="mt-1" />
        </div>
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground">Observação</label>
          <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" className="mt-1" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button size="sm" onClick={handleConfirm} disabled={loading} className="bg-primary text-primary-foreground">
            <Scale className="h-4 w-4 mr-1" />{loading ? "Conciliando..." : "Conciliar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── AuditoriaFechamento ───────────────────────────────────────────────────────

function AuditoriaFechamento() {
  const {
    auditoriaFinanceira, conciliacoes, fechamentos, resumoConciliacao,
    loadingAuditoria, loadingConciliacao, loadingFechamentos,
    refreshAuditoria, refreshConciliacao, refreshFechamentos,
    carteiras: listaCarteiras,
  } = useFinanceiroReal();
  const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const [showFecharDia, setShowFecharDia] = useState(false);
  const [showFecharMes, setShowFecharMes] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<FechamentoPublico | null>(null);
  const [showConciliar, setShowConciliar] = useState(false);

  // Alertas derivados
  const alertas: { tipo: string; msg: string; urgente: boolean }[] = [];
  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtual = new Date().getMonth() + 1;
  const anoAtual = new Date().getFullYear();

  const fechadoHoje = fechamentos.find((f) => f.tipo === "diario" && f.dataReferencia === hoje && f.status === "fechado");
  const fechadoMes = fechamentos.find((f) => f.tipo === "mensal" && f.mes === mesAtual && f.ano === anoAtual && f.status === "fechado");
  const reabertoRecente = fechamentos.find((f) => f.status === "reaberto" && f.reabertoEm && (Date.now() - new Date(f.reabertoEm).getTime()) < 24 * 60 * 60 * 1000);
  const divergentes = conciliacoes.filter((c) => c.status === "divergente");

  if (!fechadoHoje) alertas.push({ tipo: "fechamento_pendente", msg: "Fechamento do dia ainda não realizado.", urgente: false });
  if (divergentes.length > 0) alertas.push({ tipo: "divergencia", msg: `${divergentes.length} carteira(s) com divergência de saldo.`, urgente: true });
  if (fechadoMes) alertas.push({ tipo: "periodo_fechado", msg: `Mês ${String(mesAtual).padStart(2,"0")}/${anoAtual} está fechado. Operações bloqueadas.`, urgente: false });
  if (reabertoRecente) alertas.push({ tipo: "reaberto", msg: `Fechamento reaberto recentemente: ${reabertoRecente.observacao ?? "sem motivo"}`, urgente: true });

  const acaoLabel: Record<string, string> = {
    criar: "Criou", editar: "Editou", excluir: "Excluiu", liquidar: "Liquidou",
    estornar: "Estornou", fechar: "Fechou", reabrir: "Reabriu", conciliar: "Conciliou",
    transferir: "Transferiu", cancelar: "Cancelou",
  };
  const entidadeLabel: Record<string, string> = {
    movimentacao: "Movimentação", receber: "Conta a receber", pagar: "Conta a pagar",
    carteira: "Carteira", dre: "DRE", fechamento: "Fechamento", conciliacao: "Conciliação",
  };

  return (
    <div className="space-y-5 min-w-0">
      {/* Modals */}
      <FecharModal tipo="dia" open={showFecharDia} onClose={() => { setShowFecharDia(false); void refreshFechamentos(); }} />
      <FecharModal tipo="mes" open={showFecharMes} onClose={() => { setShowFecharMes(false); void refreshFechamentos(); }} />
      <ReopenModal fechamento={reopenTarget} open={!!reopenTarget} onClose={() => { setReopenTarget(null); void refreshFechamentos(); }} />
      <ConciliarModal
        carteiras={listaCarteiras.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome, saldoAtual: c.saldoAtual }))}
        open={showConciliar}
        onClose={() => { setShowConciliar(false); void refreshConciliacao(); }}
      />

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl p-3 border text-sm ${a.urgente ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-warning/10 border-warning/30 text-warning"}`}>
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* 1. Card de Fechamento */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-4 w-4 text-primary" />Fechamento Financeiro</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setShowFecharDia(true)} disabled={!!fechadoHoje} className="text-xs">
                <Lock className="h-3 w-3 mr-1" />Fechar Dia
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowFecharMes(true)} disabled={!!fechadoMes} className="text-xs">
                <Lock className="h-3 w-3 mr-1" />Fechar Mês
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void refreshFechamentos()} className="text-xs text-muted-foreground" title="Atualizar">
                <RefreshCw className={`h-3 w-3 ${loadingFechamentos ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingFechamentos ? (
            <LoadingState message="Carregando fechamentos…" inline />
          ) : fechamentos.length === 0 ? (
            <EmptyState
              compact
              dashboardLink={false}
              title="Nenhum fechamento registrado"
              description="Os fechamentos diários e mensais aparecerão aqui quando forem concluídos."
            />
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Tipo</th>
                    <th className="text-left py-2 pr-4 font-medium">Referência</th>
                    <th className="text-right py-2 pr-4 font-medium">Saldo Sistema</th>
                    <th className="text-right py-2 pr-4 font-medium">Diferença</th>
                    <th className="text-left py-2 pr-4 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Fechado em</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {fechamentos.slice(0, 10).map((f) => (
                    <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs capitalize">{f.tipo}</Badge>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{f.tipo === "diario" ? f.dataReferencia : `${String(f.mes).padStart(2,"0")}/${f.ano}`}</td>
                      <td className="py-2 pr-4 text-right font-medium">{fmt(f.saldoSistema)}</td>
                      <td className={`py-2 pr-4 text-right text-xs ${f.diferenca !== 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                        {f.diferenca === 0 ? "—" : fmt(f.diferenca)}
                      </td>
                      <td className="py-2 pr-4"><FechamentoBadge status={f.status} /></td>
                      <td className="py-2 text-xs text-muted-foreground">{fmtDate(f.fechadoEm)}</td>
                      <td className="py-2 pl-2">
                        {f.status === "fechado" && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                            onClick={() => setReopenTarget(f)}>
                            <Unlock className="h-3 w-3 mr-1" />Reabrir
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Card de Conciliação */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4 text-primary" />Conciliação de Carteiras</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowConciliar(true)} className="text-xs">
                <Scale className="h-3 w-3 mr-1" />Nova Conciliação
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void refreshConciliacao()} className="text-xs text-muted-foreground" title="Atualizar">
                <RefreshCw className={`h-3 w-3 ${loadingConciliacao ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          {resumoConciliacao && (
            <div className="flex gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" />{resumoConciliacao.conciliadas} conciliadas</span>
              <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-red-500" />{resumoConciliacao.divergentes} divergentes</span>
              {resumoConciliacao.totalDivergencia > 0 && (
                <span className="text-red-600 font-medium">Divergência total: {fmt(resumoConciliacao.totalDivergencia)}</span>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loadingConciliacao ? (
            <LoadingState message="Carregando conciliações…" inline />
          ) : conciliacoes.length === 0 ? (
            <EmptyState
              compact
              dashboardLink={false}
              title="Nenhuma conciliação registrada"
              description='Clique em "Nova conciliação" para iniciar o processo.'
            />
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Carteira</th>
                    <th className="text-left py-2 pr-4 font-medium">Data</th>
                    <th className="text-right py-2 pr-4 font-medium">Saldo Sistema</th>
                    <th className="text-right py-2 pr-4 font-medium">Saldo Informado</th>
                    <th className="text-right py-2 pr-4 font-medium">Diferença</th>
                    <th className="text-left py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {conciliacoes.slice(0, 15).map((c: ConciliacaoPublica) => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 font-medium">{c.carteiraNome}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground font-mono">{c.dataReferencia}</td>
                      <td className="py-2 pr-4 text-right">{fmt(c.saldoSistema)}</td>
                      <td className="py-2 pr-4 text-right">{fmt(c.saldoInformado)}</td>
                      <td className={`py-2 pr-4 text-right text-xs font-medium ${c.diferenca !== 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                        {c.diferenca === 0 ? "✓" : fmt(c.diferenca)}
                      </td>
                      <td className="py-2"><ConciliacaoBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Card de Auditoria */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-primary" />Log de Auditoria</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => void refreshAuditoria()} className="text-xs text-muted-foreground" title="Atualizar">
              <RefreshCw className={`h-3 w-3 ${loadingAuditoria ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <CardDescription className="text-xs">Últimas 30 operações financeiras registradas.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAuditoria ? (
            <LoadingState message="Carregando auditoria…" inline />
          ) : auditoriaFinanceira.length === 0 ? (
            <EmptyState
              compact
              dashboardLink={false}
              title="Nenhuma operação na auditoria"
              description="As movimentações sensíveis aparecerão aqui quando houver registros."
            />
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Ação</th>
                    <th className="text-left py-2 pr-4 font-medium">Entidade</th>
                    <th className="text-left py-2 pr-4 font-medium">Usuário</th>
                    <th className="text-left py-2 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoriaFinanceira.slice(0, 20).map((a) => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs capitalize">{acaoLabel[a.acao] ?? a.acao}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{entidadeLabel[a.entidade] ?? a.entidade}</td>
                      <td className="py-2 pr-4 text-xs">{a.usuarioNome ?? <span className="text-muted-foreground">Sistema</span>}</td>
                      <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Configuracoes() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="rounded-xl border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Preferências do Financeiro</CardTitle>
          <CardDescription>
            Categorias, formas de pagamento, carteira padrão, regras de vencimento e integrações PDV/OS ainda não possuem persistência nesta tela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Em uma próxima entrega, estas opções serão salvas na loja (sem alterar o fluxo já real de contas, movimentações e carteiras).
          </p>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">Em breve</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

function FinanceiroHub() {
  return (
    <FinanceiroRealProvider>
      <FinanceiroHubInner />
    </FinanceiroRealProvider>
  );
}

function FinanceiroHubInner() {
  const { error } = useFinanceiroReal();
  const [theme, setTheme] = useState<"light" | "soft-ice" | "midnight" | "black">("light");

  // Herda o tema global (data-theme) sem sobrescrever.
  useEffect(() => {
    const get = () => {
      const v = document.documentElement.getAttribute("data-theme");
      if (v === "soft-ice" || v === "midnight" || v === "black" || v === "light") return v;
      return "light";
    };
    setTheme(get());
    const obs = new MutationObserver(() => setTheme(get()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const tabs = useMemo(
    () =>
      [
        { v: "visao", label: "Visão geral", icon: LayoutDashboard, comp: <VisaoGeral /> },
        { v: "receber", label: "A receber", icon: ArrowDownCircle, comp: <ContasReceber /> },
        { v: "pagar", label: "A pagar", icon: ArrowUpCircle, comp: <ContasPagar /> },
        { v: "fluxo", label: "Fluxo de caixa", icon: BarChart3, comp: <FluxoCaixa /> },
        { v: "carteiras", label: "Carteiras", icon: Wallet, comp: <GestaoCarteiras /> },
        { v: "auditoria", label: "Auditoria", icon: ShieldCheck, comp: <AuditoriaFechamento /> },
        { v: "relatorios", label: "Relatórios", icon: FileText, comp: <Relatorios /> },
        { v: "config", label: "Configurações", icon: Settings, comp: <Configuracoes />, hubBadge: "Em breve" as const },
      ] as const,
    [],
  );

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden bg-background text-foreground antialiased">
      <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex min-w-0 flex-col gap-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              OmniGestão Pro
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Financeiro HUB
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Contas a receber/pagar, fluxo de caixa, carteiras e auditoria usam a loja ativa (cabeçalho{" "}
              <code className="rounded bg-muted px-1 text-[11px]">x-assistec-loja-id</code>
              ). Relatórios agregam dados reais da API. A aba Configurações ainda não persiste preferências.
            </p>
          </div>
          <div className="flex min-w-0 flex-col items-end gap-2">
            <Badge variant="outline" className="w-fit gap-1">
              <Store className="h-3 w-3" /> Multi-loja
            </Badge>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <span className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Tema: <span className="text-foreground">{theme}</span>
              </span>
            </div>
          </div>
        </header>

        {error ? (
          <Alert variant={error.includes("Nenhuma loja") ? "default" : "destructive"} className="mb-4">
            <AlertTitle>{error.includes("Nenhuma loja") ? "Loja ativa" : "Erro ao carregar"}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs defaultValue="visao" className="w-full min-w-0">
          <TabsList className="mb-6 grid w-full min-w-0 grid-cols-3 gap-1 sm:grid-cols-7">
            {tabs.map((t) => {
              const Icon = t.icon;
              const badge = "hubBadge" in t ? t.hubBadge : undefined;
              return (
                <TabsTrigger key={t.v} value={t.v} className="gap-1.5 text-xs">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                  {badge ? (
                    <Badge
                      variant="secondary"
                      className="hidden h-5 shrink-0 px-1.5 py-0 text-[9px] font-normal uppercase tracking-wide text-muted-foreground sm:inline-flex"
                    >
                      {badge}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.v} value={t.v} className="space-y-4 min-w-0 overflow-x-hidden">
              {t.comp}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function NovoRecebimentoModal({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (data: NovoReceberInput) => Promise<void>;
}) {
  const { receber } = useFinanceiroReal();
  const clientesUnicos = useMemo(
    () => Array.from(new Set(receber.map((r) => r.cliente).filter(Boolean))).sort(),
    [receber],
  );
  const [saving, setSaving] = useState(false);
  const clienteRef = useRef<HTMLInputElement>(null);
  const descricaoRef = useRef<HTMLInputElement>(null);
  const valorRef = useRef<HTMLInputElement>(null);
  const vencimentoRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    const cliente = clienteRef.current?.value.trim() ?? "";
    const descricao = descricaoRef.current?.value.trim() ?? "";
    const valor = parseFloat((valorRef.current?.value ?? "0").replace(",", "."));
    const vencimento = vencimentoRef.current?.value ?? "";
    if (!cliente || !valor || !vencimento) {
      toast.error("Preencha cliente, valor e vencimento");
      return;
    }
    setSaving(true);
    try {
      await onSave({ cliente, descricao: descricao || cliente, valor, vencimento });
      toast.success("Recebimento criado");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo recebimento</DialogTitle>
          <DialogDescription>
            Campos com * são gravados na API. Categoria, forma de pagamento, carteira e parcelamento múltiplo: em breve.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Cliente *</Label>
            <Input ref={clienteRef} list="clientes-list" placeholder="Buscar cliente..." />
            <datalist id="clientes-list">
              {clientesUnicos.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Título / descrição</Label>
            <Input ref={descricaoRef} placeholder="Ex.: OS #882 — troca de óleo" />
          </div>
          <div className="space-y-1.5">
            <Label>Valor (R$) *</Label>
            <Input ref={valorRef} type="number" step="0.01" placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimento *</Label>
            <Input ref={vencimentoRef} type="date" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovaContaModal({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (data: NovoPagarInput) => Promise<void>;
}) {
  const { pagar, carteiras: listaCarteiras } = useFinanceiroReal();
  const fornecedoresUnicos = useMemo(
    () => Array.from(new Set(pagar.map((p) => p.fornecedor).filter(Boolean))).sort(),
    [pagar],
  );
  const [parcelar, setParcelar] = useState(false);
  const [fixa, setFixa] = useState(false);
  const [saving, setSaving] = useState(false);
  const fornecedorRef = useRef<HTMLInputElement>(null);
  const descricaoRef = useRef<HTMLInputElement>(null);
  const valorRef2 = useRef<HTMLInputElement>(null);
  const vencimentoRef2 = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    const fornecedor = fornecedorRef.current?.value.trim() ?? "";
    const descricao = descricaoRef.current?.value.trim() ?? "";
    const valor = parseFloat((valorRef2.current?.value ?? "0").replace(",", "."));
    const vencimento = vencimentoRef2.current?.value ?? "";
    if (!fornecedor || !valor || !vencimento) {
      toast.error("Preencha fornecedor, valor e vencimento");
      return;
    }
    setSaving(true);
    try {
      await onSave({ fornecedor, descricao: descricao || fornecedor, valor, vencimento });
      toast.success("Conta a pagar criada");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova conta a pagar</DialogTitle>
          <DialogDescription>
            Cadastre uma despesa com fornecedor, vencimento e recorrência.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Fornecedor *</Label>
            <Input ref={fornecedorRef} list="fornecedores-list" placeholder="Buscar fornecedor..." />
            <datalist id="fornecedores-list">
              {fornecedoresUnicos.map((f) => <option key={f} value={f} />)}
            </datalist>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descrição</Label>
            <Input ref={descricaoRef} placeholder="Ex.: Compra de peças NF 1234" />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fornecedores">Fornecedores</SelectItem>
                <SelectItem value="folha">Folha</SelectItem>
                <SelectItem value="aluguel">Aluguel</SelectItem>
                <SelectItem value="utilidades">Utilidades</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor (R$) *</Label>
            <Input ref={valorRef2} type="number" step="0.01" placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimento *</Label>
            <Input ref={vencimentoRef2} type="date" />
          </div>
          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="credito">Cartão de crédito</SelectItem>
                <SelectItem value="debito">Cartão de débito</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Carteira</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {listaCarteiras.filter((c) => c.ativo).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select defaultValue="pendente">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Recorrência</Label>
            <Select defaultValue="nenhuma">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Nenhuma</SelectItem>
                <SelectItem value="semanal">Semanal</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Despesa fixa</p>
              <p className="text-xs text-muted-foreground">Repete todo período</p>
            </div>
            <Switch checked={fixa} onCheckedChange={setFixa} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Parcelar</p>
              <p className="text-xs text-muted-foreground">Gera múltiplas parcelas</p>
            </div>
            <Switch checked={parcelar} onCheckedChange={setParcelar} />
          </div>
          {parcelar && (
            <>
              <div className="space-y-1.5">
                <Label>Quantidade de parcelas</Label>
                <Input type="number" min={2} max={36} defaultValue={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Intervalo (dias)</Label>
                <Input type="number" min={1} defaultValue={30} />
              </div>
            </>
          )}
          <div className="rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Baixa parcial / histórico</p>
              <Badge variant="outline" className="gap-1">
                <History className="h-3 w-3" /> 0 pagamentos
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Valor pago</Label>
                <Input type="number" step="0.01" placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor restante</Label>
                <Input type="number" step="0.01" placeholder="0,00" disabled />
              </div>
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={3} placeholder="Notas internas..." />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Anexo (opcional)</Label>
            <Input type="file" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CORES_CARTEIRA = [
  { label: "Índigo", value: "#6366f1" },
  { label: "Verde", value: "#22c55e" },
  { label: "Azul", value: "#3b82f6" },
  { label: "Laranja", value: "#f97316" },
  { label: "Rosa", value: "#ec4899" },
  { label: "Roxo", value: "#a855f7" },
  { label: "Âmbar", value: "#f59e0b" },
  { label: "Ciano", value: "#06b6d4" },
];

function NovaCarteiraModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { criarCarteira } = useFinanceiroReal();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoCarteira>("caixa");
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [cor, setCor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNome("");
    setTipo("caixa");
    setSaldoInicial(0);
    setCor("#6366f1");
  };

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Nome da carteira é obrigatório."); return; }
    setSaving(true);
    try {
      await criarCarteira({ nome: nome.trim(), tipo, saldoInicial, cor });
      toast.success("Carteira criada com sucesso!");
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar carteira");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova carteira</DialogTitle>
          <DialogDescription>
            Cadastre uma carteira financeira para movimentar entradas e saídas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome da carteira *</Label>
            <Input
              placeholder="Ex.: Banco Inter PJ, Caixa Loja..."
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoCarteira)} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="caixa">Caixa</SelectItem>
                <SelectItem value="banco">Banco</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="credito">Cartão de Crédito</SelectItem>
                <SelectItem value="debito">Cartão de Débito</SelectItem>
                <SelectItem value="investimento">Investimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Saldo inicial (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={saldoInicial}
              onChange={(e) => setSaldoInicial(Number(e.target.value))}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Cor da carteira</Label>
            <div className="flex flex-wrap gap-2">
              {CORES_CARTEIRA.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setCor(c.value)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.value,
                    borderColor: cor === c.value ? "var(--color-foreground)" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !nome.trim()}>
            {saving ? "Salvando..." : "Criar carteira"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Receber / Recibo / Estorno / Histórico / Renegociar ===================== */

function ReceberContaModal({
  open,
  onOpenChange,
  conta,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: ContaReceber | null;
  onConfirm: (valor: number, total: boolean) => void;
}) {
  const { carteiras: listaCarteiras } = useFinanceiroReal();
  const [valorAgora, setValorAgora] = useState<number>(0);
  const [desconto, setDesconto] = useState<number>(0);
  const [juros, setJuros] = useState<number>(0);
  const [multa, setMulta] = useState<number>(0);
  const [forma, setForma] = useState("pix");
  const [carteira, setCarteira] = useState("2");
  const [parcial, setParcial] = useState(true);

  useEffect(() => {
    if (open && conta) {
      const restante = conta.valor - conta.recebido;
      setValorAgora(parcial ? 0 : restante);
    }
  }, [open, conta, parcial]);

  if (!conta) return null;
  const restanteAtual = conta.valor - conta.recebido;
  const saldoFinal = restanteAtual - valorAgora - desconto + juros + multa;
  const totalReceberAgora = parcial ? valorAgora : restanteAtual;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receber conta — {conta.id}</DialogTitle>
          <DialogDescription>
            {conta.cliente} • Valor total {fmt(conta.valor)}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Total</p>
              <p className="text-sm font-semibold">{fmt(conta.valor)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Já recebido</p>
              <p className="text-sm font-semibold text-primary">{fmt(conta.recebido)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Pendente</p>
              <p className="text-sm font-semibold text-destructive">{fmt(restanteAtual)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Baixa parcial</p>
              <p className="text-xs text-muted-foreground">Desligue para quitar totalmente</p>
            </div>
            <Switch checked={parcial} onCheckedChange={setParcial} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor recebido agora</Label>
            <Input
              type="number"
              step="0.01"
              value={valorAgora}
              disabled={!parcial}
              onChange={(e) => setValorAgora(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Desconto</Label>
            <Input type="number" step="0.01" value={desconto} onChange={(e) => setDesconto(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Juros</Label>
            <Input type="number" step="0.01" value={juros} onChange={(e) => setJuros(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Multa</Label>
            <Input type="number" step="0.01" value={multa} onChange={(e) => setMulta(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Forma de recebimento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="credito">Cartão crédito</SelectItem>
                <SelectItem value="debito">Cartão débito</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Carteira destino</Label>
            <Select value={carteira} onValueChange={setCarteira}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {listaCarteiras.filter((c) => c.ativo).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data do recebimento</Label>
            <Input type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={2} placeholder="Notas internas..." />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Comprovante (opcional)</Label>
            <Input type="file" />
          </div>
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recebendo agora</span>
            <span className="font-semibold text-primary">{fmt(totalReceberAgora)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saldo restante</span>
            <span className="font-semibold">{fmt(Math.max(0, saldoFinal))}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Status final: {saldoFinal <= 0 ? "Pago" : "Parcial"}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onConfirm(totalReceberAgora, !parcial || saldoFinal <= 0)}>
            Confirmar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReciboModal({
  open,
  onOpenChange,
  conta,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: ContaReceber | null;
}) {
  if (!conta) return null;
  const numero = `REC-${conta.id}-${new Date().getFullYear()}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emitir recibo</DialogTitle>
          <DialogDescription>Recibo nº {numero}</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-card p-5 text-sm">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground">OmniGestão Pro</p>
              <p className="text-base font-semibold">Recibo de pagamento</p>
            </div>
            <Badge variant="outline">{numero}</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="font-medium">{conta.cliente}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Documento</span><span>—</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Forma</span><span>PIX</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Carteira</span><span>Banco Inter PJ</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span>{new Date().toLocaleDateString("pt-BR")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Descrição</span><span>Pagamento ref. {conta.id}</span></div>
            <div className="flex justify-between border-t border-border pt-2 text-base"><span className="font-medium">Valor recebido</span><span className="font-semibold text-primary">{fmt(conta.recebido || conta.valor)}</span></div>
          </div>
          <div className="mt-6 border-t border-border pt-3 text-center text-xs text-muted-foreground">
            Recebemos a importância acima descrita, dando plena quitação.
            <br />______________________________
            <br />Assinatura
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="gap-1" onClick={() => toast.success("Enviado para impressão")}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="outline" className="gap-1" onClick={() => toast.success("PDF gerado")}>
            <Download className="h-4 w-4" /> Baixar PDF
          </Button>
          <Button className="gap-1" onClick={() => toast.success("Compartilhado via WhatsApp")}>
            <Share2 className="h-4 w-4" /> WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EstornoModal({
  open,
  onOpenChange,
  conta,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: ContaReceber | null;
  onConfirm: () => void;
}) {
  if (!conta) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Estornar recebimento</DialogTitle>
          <DialogDescription>{conta.cliente} — {conta.id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Esta ação reverte o pagamento. O título voltará para pendente/parcial.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Valor a estornar</Label>
            <Input type="number" step="0.01" defaultValue={conta.recebido} />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select defaultValue="erro">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="erro">Erro de lançamento</SelectItem>
                <SelectItem value="devolucao">Devolução ao cliente</SelectItem>
                <SelectItem value="duplicado">Pagamento duplicado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm}>Confirmar estorno</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type HistoricoEvento = {
  at?: string;
  tipo?: string;
  userLabel?: string;
  valor?: number;
  observacao?: string;
  [k: string]: unknown;
};

function fmtEvtLabel(tipo?: string): string {
  const map: Record<string, string> = {
    liquidacao: "Liquidação total",
    pagamento: "Pagamento parcial",
    cancelamento: "Cancelamento",
    estorno_titulo: "Estorno do título",
    estorno_pagamento: "Estorno de pagamento",
  };
  return map[tipo ?? ""] ?? (tipo ? tipo.replace(/_/g, " ") : "Evento");
}

function fmtEvtDate(at?: string): string {
  if (!at) return "—";
  try {
    return new Date(at).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return at;
  }
}

function HistoricoModal({
  open,
  onOpenChange,
  conta,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: ContaReceber | null;
}) {
  const { getActiveStoreId } = useFinanceiroReal();
  const [eventos, setEventos] = useState<HistoricoEvento[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    if (!open || !conta) return;
    const sid = getActiveStoreId();
    if (!sid) {
      setEventos([]);
      setLoadingHist(false);
      return;
    }
    setLoadingHist(true);
    void fetch(`/api/financeiro/receber?localKey=${encodeURIComponent(conta.id)}`, {
      headers: { [ASSISTEC_LOJA_HEADER]: sid },
    })
      .then((r) => r.json())
      .then((j: Record<string, unknown>) => {
        const hist = Array.isArray((j.titulo as { historico?: unknown })?.historico)
          ? (j.titulo as { historico: HistoricoEvento[] }).historico
          : [];
        setEventos(hist.length > 0 ? hist : [{ tipo: "criacao", at: undefined, userLabel: "Sistema", observacao: `Conta registrada — valor ${fmt(conta.valor)}` }]);
      })
      .catch(() => setEventos([{ tipo: "criacao", at: undefined, userLabel: "Sistema", observacao: `Conta registrada — valor ${fmt(conta.valor)}` }]))
      .finally(() => setLoadingHist(false));
  }, [open, conta, getActiveStoreId]);

  if (!conta) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico — {conta.id}</DialogTitle>
          <DialogDescription>{conta.cliente}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {loadingHist ? (
            <p className="text-sm text-muted-foreground">Carregando histórico...</p>
          ) : (
            eventos.map((e, i) => (
              <div key={i} className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{fmtEvtLabel(e.tipo)}</p>
                    <span className="text-xs text-muted-foreground">{fmtEvtDate(e.at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">por {e.userLabel ?? "Sistema"}</p>
                  {(e.valor != null || e.observacao) && (
                    <p className="mt-1 text-sm">{e.valor != null ? fmt(e.valor) : ""}{e.observacao ? ` — ${e.observacao}` : ""}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenegociarModal({
  open,
  onOpenChange,
  conta,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: ContaReceber | null;
}) {
  if (!conta) return null;
  const saldo = conta.valor - conta.recebido;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renegociação</DialogTitle>
          <DialogDescription>
            Saldo em aberto: {fmt(saldo)}. O fluxo de renegociação (novo valor, parcelas, juros) ainda não está disponível no servidor.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Em preparação: quando liberado, as alterações passarão por confirmação e auditoria como as demais operações financeiras.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Pagar / Estorno / Histórico (contas a pagar) ===================== */

function PagarContaModal({
  open,
  onOpenChange,
  conta,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: ContaPagar | null;
  onConfirm: (valor: number, total: boolean) => void;
}) {
  const [valor, setValor] = useState(0);
  const [parcial, setParcial] = useState(false);

  useEffect(() => {
    if (open && conta) setValor(conta.valor - conta.pago);
  }, [open, conta]);

  if (!conta) return null;
  const restante = conta.valor - conta.pago;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar pagamento — {conta.id}</DialogTitle>
          <DialogDescription>{conta.fornecedor}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Total</p>
              <p className="text-sm font-semibold">{fmt(conta.valor)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Pago</p>
              <p className="text-sm font-semibold text-primary">{fmt(conta.pago)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Restante</p>
              <p className="text-sm font-semibold text-destructive">{fmt(restante)}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Pagamento parcial</p>
              <p className="text-xs text-muted-foreground">Desligue para quitar total</p>
            </div>
            <Switch checked={parcial} onCheckedChange={setParcial} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor pago</Label>
            <Input type="number" step="0.01" value={valor} disabled={!parcial} onChange={(e) => setValor(Number(e.target.value))} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">O que é gravado no servidor</p>
          <p className="mt-1">
            Apenas o <strong>valor</strong> e se a quitação é <strong>total ou parcial</strong>. Forma de pagamento, carteira de origem, data do comprovante e anexo ainda{" "}
            <Badge variant="secondary" className="mx-0.5 align-middle text-[10px]">Em breve</Badge>
            {" "}— não alteram o registo enviado hoje.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onConfirm(parcial ? valor : restante, !parcial)}>Confirmar pagamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EstornoPagarModal({
  open,
  onOpenChange,
  conta,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: ContaPagar | null;
  onConfirm: () => void;
}) {
  if (!conta) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Estornar pagamento</DialogTitle>
          <DialogDescription>{conta.fornecedor} — {conta.id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>O pagamento será revertido e a conta voltará a constar como pendente.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm}>Confirmar estorno</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoricoPagarModal({
  open,
  onOpenChange,
  conta,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: ContaPagar | null;
}) {
  const { getActiveStoreId } = useFinanceiroReal();
  const [eventos, setEventos] = useState<HistoricoEvento[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    if (!open || !conta) return;
    const sid = getActiveStoreId();
    if (!sid) {
      setEventos([]);
      setLoadingHist(false);
      return;
    }
    setLoadingHist(true);
    void fetch(`/api/financeiro/pagar?localKey=${encodeURIComponent(conta.id)}`, {
      headers: { [ASSISTEC_LOJA_HEADER]: sid },
    })
      .then((r) => r.json())
      .then((j: Record<string, unknown>) => {
        const hist = Array.isArray((j.titulo as { historico?: unknown })?.historico)
          ? (j.titulo as { historico: HistoricoEvento[] }).historico
          : [];
        setEventos(hist.length > 0 ? hist : [{ tipo: "criacao", at: undefined, userLabel: "Sistema", observacao: `Conta registrada — valor ${fmt(conta.valor)}` }]);
      })
      .catch(() => setEventos([{ tipo: "criacao", at: undefined, userLabel: "Sistema", observacao: `Conta registrada — valor ${fmt(conta.valor)}` }]))
      .finally(() => setLoadingHist(false));
  }, [open, conta, getActiveStoreId]);

  if (!conta) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico — {conta.id}</DialogTitle>
          <DialogDescription>{conta.fornecedor}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {loadingHist ? (
            <p className="text-sm text-muted-foreground">Carregando histórico...</p>
          ) : (
            eventos.map((e, i) => (
              <div key={i} className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{fmtEvtLabel(e.tipo)}</p>
                    <span className="text-xs text-muted-foreground">{fmtEvtDate(e.at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">por {e.userLabel ?? "Sistema"}</p>
                  {(e.valor != null || e.observacao) && (
                    <p className="mt-1 text-sm">{e.valor != null ? fmt(e.valor) : ""}{e.observacao ? ` — ${e.observacao}` : ""}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Carteiras: Movimentação / Transferência ===================== */

type CarteiraItem = CarteiraRef;

function MovimentacaoModal({
  open,
  onOpenChange,
  tipo,
  carteiraId,
  carteiras: lista,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: "entrada" | "saida";
  carteiraId: string;
  carteiras: CarteiraItem[];
  onConfirm: (payload: RegistrarMovimentacaoCarteiraInput) => void | Promise<void>;
}) {
  const [valor, setValor] = useState(0);
  const [carteira, setCarteira] = useState(carteiraId);
  const [descricao, setDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCarteira(carteiraId);
      setValor(0);
      setDescricao("");
      setObservacao("");
      setData(new Date().toISOString().slice(0, 10));
    }
  }, [open, carteiraId]);

  const submit = async () => {
    if (!carteira || busy) return;
    if (!descricao.trim()) {
      toast.error("Informe a descrição");
      return;
    }
    if (!(valor > 0)) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    setBusy(true);
    try {
      const payload: RegistrarMovimentacaoCarteiraInput = {
        tipo,
        valor,
        descricao: descricao.trim(),
        carteiraId: carteira,
        data: data || undefined,
        observacao: observacao.trim() || undefined,
      };
      await onConfirm(payload);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{tipo === "entrada" ? "Nova entrada" : "Nova saída"}</DialogTitle>
          <DialogDescription>
            {tipo === "entrada" ? "Crédito na carteira (persistido)" : "Débito na carteira (persistido)"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{tipo === "entrada" ? "Carteira destino" : "Carteira origem"}</Label>
            <Select value={carteira} onValueChange={setCarteira}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {lista.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" value={valor || ""} onChange={(e) => setValor(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descrição *</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Suprimento de caixa" />
          </div>
          <div className="space-y-1.5">
            <Label>Data do lançamento</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observação (opcional)</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2 rounded-md border border-border bg-muted/30 p-2">
            Categoria, forma de pagamento e anexo: em breve. O lançamento acima grava em movimentações financeiras e atualiza o saldo da carteira.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Salvando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferenciaModal({
  open,
  onOpenChange,
  carteiras: lista,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  carteiras: CarteiraItem[];
  onConfirm: (origem: string, destino: string, valor: number) => void;
}) {
  const [origem, setOrigem] = useState(lista[0]?.id ?? "");
  const [destino, setDestino] = useState(lista[1]?.id ?? "");
  const [valor, setValor] = useState(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Transferência entre carteiras</DialogTitle>
          <DialogDescription>Movimentação interna sem afetar resultado</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Carteira origem</Label>
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {lista.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Carteira destino</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {lista.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor</Label>
            <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Taxa (R$)</Label>
            <Input type="number" step="0.01" defaultValue={0} />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observação</Label>
            <Textarea rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={origem === destino || valor <= 0}
            onClick={() => onConfirm(origem, destino, valor)}
          >
            Confirmar transferência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
