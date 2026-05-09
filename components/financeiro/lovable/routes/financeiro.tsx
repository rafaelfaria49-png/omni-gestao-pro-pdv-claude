import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useFinanceiroReal,
  FinanceiroRealProvider,
  type StatusReceber,
  type StatusPagar,
  type ContaReceber,
  type ContaPagar,
  type NovoReceberInput,
  type NovoPagarInput,
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
} from "recharts";

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

// carteiras não têm modelo Prisma — usadas apenas em GestaoCarteiras e selects de configuração.
const carteiras = [
  { id: "1", nome: "Caixa Loja Centro", tipo: "Caixa", icon: Store, saldo: 0 },
  { id: "2", nome: "Banco Inter PJ", tipo: "Banco", icon: Landmark, saldo: 0 },
  { id: "3", nome: "Dinheiro", tipo: "Dinheiro", icon: Banknote, saldo: 0 },
  { id: "4", nome: "Cartão Stone", tipo: "Cartão", icon: CreditCard, saldo: 0 },
];

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

function VisaoGeral() {
  const { summaryR, summaryP, analytics } = useFinanceiroReal();
  const totalCarteiras = carteiras.reduce((a, c) => a + c.saldo, 0);
  const totalReceber = summaryR?.totalAberto ?? 0;
  const totalPagar = summaryP?.totalAberto ?? 0;
  const mesAtual = analytics?.fluxoMensal?.at(-1);
  const entradas = mesAtual?.entrada ?? summaryR?.totalPago ?? 0;
  const saidas = mesAtual?.saida ?? summaryP?.totalPago ?? 0;
  const lucro = entradas - saidas;
  const fluxoMensal = analytics?.fluxoMensal ?? [];
  const periodoResultado =
    mesAtual?.mes?.trim() ||
    new Date().toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

  const alertItems = (
    [
      summaryP && summaryP.totalVencido > 0
        ? { msg: `${summaryP.quantidade} contas a pagar — ${fmt(summaryP.totalVencido)} em atraso`, val: fmt(summaryP.totalVencido) }
        : null,
      summaryR && summaryR.totalVencido > 0
        ? { msg: `A receber — ${fmt(summaryR.totalVencido)} vencido de clientes`, val: fmt(summaryR.totalVencido) }
        : null,
    ] as Array<{ msg: string; val: string } | null>
  ).filter((x): x is { msg: string; val: string } => x !== null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Saldo em carteiras" value={fmt(totalCarteiras)} hint={`${carteiras.length} carteiras ativas`} icon={Wallet} />
        <StatCard title="A receber" value={fmt(totalReceber)} hint="Em aberto" icon={ArrowDownCircle} tone="positive" />
        <StatCard title="A pagar" value={fmt(totalPagar)} hint="Em aberto" icon={ArrowUpCircle} tone="negative" />
        <StatCard title="Resultado do mês" value={fmt(lucro)} hint={periodoResultado} icon={TrendingUp} tone="positive" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Entradas" value={fmt(entradas)} icon={ArrowDownLeft} tone="positive" />
        <StatCard title="Saídas" value={fmt(saidas)} icon={ArrowUpRight} tone="negative" />
        <StatCard title="Lucro líquido" value={fmt(lucro)} hint="Consolidado no período exibido" icon={PiggyBank} tone="positive" />
      </div>

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
            <p className="text-sm text-muted-foreground py-1">Nenhum alerta com base nos dados atuais da loja.</p>
          ) : (
            alertItems.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-destructive/10 p-1.5 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <p className="text-sm text-foreground">{a.msg}</p>
                </div>
                <span className="text-sm font-medium text-muted-foreground">{a.val}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Evolução — entradas vs. saídas</CardTitle>
          <CardDescription>Últimos 6 meses</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
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
        </CardContent>
      </Card>

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
              { label: "Recebido OS", val: fmt(8420), icon: Wrench, tone: "primary" },
              { label: "Recebido PDV", val: fmt(12350), icon: ShoppingCart, tone: "primary" },
              { label: "Despesas fixas", val: fmt(16400), icon: Repeat, tone: "muted" },
              { label: "Parceladas", val: "12 ativas", icon: CalendarClock, tone: "muted" },
              { label: "Atrasados", val: fmt(1570), icon: TrendingDown, tone: "destructive" },
              { label: "Baixas parciais", val: "3 títulos", icon: Percent, tone: "muted" },
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

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Carregando títulos...</div>;
  if (error) return (
    <div className="space-y-3 py-8 text-center">
      <p className="text-sm text-destructive">{error}</p>
      <button className="text-xs text-primary underline" onClick={reload}>Tentar novamente</button>
    </div>
  );

  return (
    <div className="space-y-4">
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
          <div className="overflow-x-auto">
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
        onConfirm={() => {
          toast.success("Conta renegociada");
          setModal(null);
        }}
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

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Carregando títulos...</div>;
  if (error) return (
    <div className="space-y-3 py-8 text-center">
      <p className="text-sm text-destructive">{error}</p>
      <button className="text-xs text-primary underline" onClick={reload}>Tentar novamente</button>
    </div>
  );

  return (
    <>
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
        <div className="overflow-x-auto">
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
    </>
  );
}

function FluxoCaixa() {
  const { analytics } = useFinanceiroReal();
  const movimentacoes = analytics?.movimentacoes ?? [];
  const fluxoMensal = analytics?.fluxoMensal ?? [];
  const [periodo, setPeriodo] = useState("mes");
  const totEntrada = movimentacoes
    .filter((m) => m.tipo === "entrada")
    .reduce((a, m) => a + m.valor, 0);
  const totSaida = movimentacoes
    .filter((m) => m.tipo === "saida")
    .reduce((a, m) => a + m.valor, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Entradas (período)" value={fmt(totEntrada)} icon={ArrowDownLeft} tone="positive" />
        <StatCard title="Saídas (período)" value={fmt(totSaida)} icon={ArrowUpRight} tone="negative" />
        <StatCard title="Saldo do período" value={fmt(totEntrada - totSaida)} icon={Wallet} tone="positive" />
      </div>

      <Card className="rounded-xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Fluxo de Caixa</CardTitle>
            <CardDescription>Movimentações por período</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="mes">Mês</SelectItem>
                <SelectItem value="ano">Ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fluxoMensal}>
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
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Movimentações recentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {movimentacoes.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`rounded-md p-1.5 ${
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
                <div>
                  <p className="text-sm font-medium">{m.desc}</p>
                  <p className="text-xs text-muted-foreground">{m.data}</p>
                </div>
              </div>
              <span
                className={`text-sm font-semibold ${
                  m.tipo === "entrada" ? "text-primary" : "text-destructive"
                }`}
              >
                {m.tipo === "entrada" ? "+" : "-"}
                {fmt(m.valor)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function GestaoCarteiras() {
  const [openNova, setOpenNova] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [carteirasState, setCarteirasState] = useState(carteiras);
  const [movModal, setMovModal] = useState<{ tipo: "entrada" | "saida"; carteiraId: string } | null>(null);

  const handleMov = (carteiraId: string, valor: number, tipo: "entrada" | "saida") => {
    setCarteirasState((prev) =>
      prev.map((c) =>
        c.id === carteiraId ? { ...c, saldo: c.saldo + (tipo === "entrada" ? valor : -valor) } : c,
      ),
    );
    toast.success(tipo === "entrada" ? "Entrada registrada" : "Saída registrada");
    setMovModal(null);
  };

  const handleTransfer = (origem: string, destino: string, valor: number) => {
    setCarteirasState((prev) =>
      prev.map((c) => {
        if (c.id === origem) return { ...c, saldo: c.saldo - valor };
        if (c.id === destino) return { ...c, saldo: c.saldo + valor };
        return c;
      }),
    );
    toast.success("Transferência realizada");
    setOpenTransfer(false);
  };

  return (
    <div className="space-y-4">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {carteirasState.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">{c.tipo}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-2xl font-semibold tracking-tight">
                    {fmt(c.saldo)}
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
        </CardContent>
      </Card>
      <NovaCarteiraModal open={openNova} onOpenChange={setOpenNova} />
      <TransferenciaModal
        open={openTransfer}
        onOpenChange={setOpenTransfer}
        carteiras={carteirasState}
        onConfirm={handleTransfer}
      />
      <MovimentacaoModal
        open={movModal !== null}
        onOpenChange={(v) => !v && setMovModal(null)}
        tipo={movModal?.tipo ?? "entrada"}
        carteiraId={movModal?.carteiraId ?? ""}
        carteiras={carteirasState}
        onConfirm={handleMov}
      />
    </div>
  );
}

function Relatorios() {
  const { analytics } = useFinanceiroReal();
  const receitasOrigem = analytics?.receitasOrigem ?? [];
  const despesasCategoria = analytics?.despesasCategoria ?? [];
  const resultadoLoja = analytics?.resultadoLoja ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Receitas por origem</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={receitasOrigem}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
              >
                {receitasOrigem.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Despesas por categoria</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={despesasCategoria} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis dataKey="name" type="category" stroke="var(--color-muted-foreground)" fontSize={12} width={90} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="value" fill="var(--color-chart-2)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Resultado por loja</CardTitle>
          <CardDescription>Comparativo receita x despesa</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={resultadoLoja}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="loja" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Bar dataKey="receita" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="despesa" fill="var(--color-chart-3)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Fluxo por carteira</CardTitle>
          <CardDescription>Saldo atual de cada carteira</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {carteiras.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
              <span className="text-sm">{c.nome}</span>
              <span className="text-sm font-semibold">{fmt(c.saldo)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Inadimplência</CardTitle>
          <CardDescription>Contas vencidas e clientes em atraso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Vencidas</p>
              <p className="text-lg font-semibold text-destructive">{fmt(1570)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Clientes</p>
              <p className="text-lg font-semibold">2</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Taxa</p>
              <p className="text-lg font-semibold">3,2%</p>
            </div>
          </div>
          {[
            { c: "Auto Mecânica JL", v: 1250, d: 5 },
            { c: "Carlos Eduardo", v: 320, d: 3 },
          ].map((i) => (
            <div key={i.c} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
              <div>
                <p className="text-sm font-medium">{i.c}</p>
                <p className="text-xs text-muted-foreground">{i.d} dias em atraso</p>
              </div>
              <span className="text-sm font-semibold text-destructive">{fmt(i.v)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Lucro líquido</CardTitle>
          <CardDescription>Resumo consolidado do período</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receita bruta</p>
              <p className="text-lg font-semibold text-primary">{fmt(61000)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Despesas</p>
              <p className="text-lg font-semibold text-destructive">{fmt(42000)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lucro líquido</p>
              <p className="text-lg font-semibold text-primary">{fmt(19000)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Margem</p>
              <p className="text-lg font-semibold">31%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Configuracoes() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Categorias financeiras</CardTitle>
          <CardDescription>Gerencie categorias de receita e despesa</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {["Vendas", "Serviços", "Fornecedores", "Folha", "Marketing", "Utilidades"].map((c) => (
            <div key={c} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
              <span className="text-sm">{c}</span>
              <Badge variant="outline">ativa</Badge>
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-full gap-1">
            <Plus className="h-4 w-4" /> Adicionar categoria
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Formas de pagamento</CardTitle>
          <CardDescription>Disponíveis no PDV e cobranças</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {["Dinheiro", "PIX", "Cartão de crédito", "Cartão de débito", "Boleto"].map((c) => (
            <div key={c} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
              <span className="text-sm">{c}</span>
              <Switch defaultChecked />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Carteira padrão</CardTitle>
          <CardDescription>Usada como destino padrão de recebimentos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Recebimentos</Label>
            <Select defaultValue="2">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {carteiras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pagamentos</Label>
            <Select defaultValue="2">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {carteiras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Regras de vencimento e recibo</CardTitle>
          <CardDescription>Padrões aplicados automaticamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Dias até o vencimento padrão</Label>
            <Input type="number" defaultValue={30} />
          </div>
          <div className="space-y-1.5">
            <Label>Multa por atraso (%)</Label>
            <Input type="number" defaultValue={2} step="0.1" />
          </div>
          <div className="space-y-1.5">
            <Label>Juros ao mês (%)</Label>
            <Input type="number" defaultValue={1} step="0.1" />
          </div>
          <div className="space-y-1.5">
            <Label>Texto do recibo padrão</Label>
            <Textarea rows={2} defaultValue="Recebemos a importância referente ao serviço/produto..." />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Integrações</CardTitle>
          <CardDescription>Sincronização automática com outros módulos</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <ShoppingCart className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Integração com PDV</p>
                <p className="text-xs text-muted-foreground">Vendas viram recebimentos</p>
              </div>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Integração com OS</p>
                <p className="text-xs text-muted-foreground">Ordens viram títulos</p>
              </div>
            </div>
            <Switch defaultChecked />
          </div>
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
        { v: "visao", label: "Visão geral", icon: LayoutDashboard, comp: <VisaoGeral />, hubBadge: "Preview" as const },
        { v: "receber", label: "A receber", icon: ArrowDownCircle, comp: <ContasReceber /> },
        { v: "pagar", label: "A pagar", icon: ArrowUpCircle, comp: <ContasPagar /> },
        { v: "fluxo", label: "Fluxo de caixa", icon: BarChart3, comp: <FluxoCaixa />, hubBadge: "Preview" as const },
        { v: "carteiras", label: "Carteiras", icon: Wallet, comp: <GestaoCarteiras />, hubBadge: "Demo" as const },
        { v: "relatorios", label: "Relatórios", icon: FileText, comp: <Relatorios />, hubBadge: "Preview" as const },
        { v: "config", label: "Configurações", icon: Settings, comp: <Configuracoes />, hubBadge: "Demo" as const },
      ] as const,
    [],
  );

  return (
    <div className="w-full min-w-0 bg-background text-foreground antialiased">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              OmniGestão Pro
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Financeiro HUB
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Centralize carteiras, contas, fluxo e relatórios em um só lugar. Abas com selo Preview/Demo ainda
              misturam dados reais com trechos ilustrativos.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
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

        <Tabs defaultValue="visao" className="w-full">
          <TabsList className="mb-6 grid w-full grid-cols-3 gap-1 sm:grid-cols-7">
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
            <TabsContent key={t.v} value={t.v} className="space-y-4">
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
  const [parcelar, setParcelar] = useState(false);
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
            Registre um título a receber com cliente, valor e parcelamento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Cliente *</Label>
            <Input ref={clienteRef} list="clientes-list" placeholder="Buscar cliente..." />
            <datalist id="clientes-list">
              <option value="Auto Mecânica JL" />
              <option value="Maria Silva" />
              <option value="Frota Express" />
              <option value="João Souza" />
              <option value="TransLog Ltda" />
            </datalist>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Título / descrição</Label>
            <Input ref={descricaoRef} placeholder="Ex.: OS #882 — troca de óleo" />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vendas">Vendas</SelectItem>
                <SelectItem value="servicos">Serviços</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor (R$) *</Label>
            <Input ref={valorRef} type="number" step="0.01" placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimento *</Label>
            <Input ref={vencimentoRef} type="date" />
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
            <Label>Carteira destino</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {carteiras.map((c) => (
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
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Parcelar recebimento</p>
              <p className="text-xs text-muted-foreground">
                Gera múltiplas parcelas mensais
              </p>
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
                <History className="h-3 w-3" /> 0 movimentos
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Valor recebido</Label>
                <Input type="number" step="0.01" placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor restante</Label>
                <Input type="number" step="0.01" placeholder="0,00" disabled />
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" className="gap-1">
                <RotateCcw className="h-3.5 w-3.5" /> Estornar
              </Button>
              <Button size="sm" variant="outline" className="gap-1">
                <FileText className="h-3.5 w-3.5" /> Renegociar
              </Button>
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

function NovaContaModal({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (data: NovoPagarInput) => Promise<void>;
}) {
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
              <option value="Distrib. Peças Brasil" />
              <option value="Energia CEMIG" />
              <option value="Internet Vivo" />
              <option value="Aluguel Imóvel" />
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
                {carteiras.map((c) => (
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

function NovaCarteiraModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [ativa, setAtiva] = useState(true);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova carteira</DialogTitle>
          <DialogDescription>
            Cadastre uma carteira financeira para movimentar entradas e saídas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome da carteira</Label>
            <Input placeholder="Ex.: Banco Inter PJ" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select defaultValue="banco">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="caixa">Caixa</SelectItem>
                <SelectItem value="banco">Banco</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="digital">Digital</SelectItem>
                <SelectItem value="pessoal">Pessoal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Saldo inicial (R$)</Label>
            <Input type="number" step="0.01" placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Banco</Label>
            <Input placeholder="Ex.: Inter, Bradesco..." />
          </div>
          <div className="space-y-1.5">
            <Label>Agência</Label>
            <Input placeholder="0000" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Conta</Label>
            <Input placeholder="00000-0" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={3} placeholder="Notas internas..." />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Carteira ativa</p>
              <p className="text-xs text-muted-foreground">
                Carteiras inativas não aparecem nos lançamentos
              </p>
            </div>
            <Switch checked={ativa} onCheckedChange={setAtiva} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onOpenChange(false)}>Salvar</Button>
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
                {carteiras.map((c) => (
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

function HistoricoModal({
  open,
  onOpenChange,
  conta,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: ContaReceber | null;
}) {
  if (!conta) return null;
  const eventos = [
    { data: "01/04/2026 09:12", user: "Sistema", evt: "Conta criada", val: fmt(conta.valor) },
    { data: "10/04/2026 14:20", user: "Maria (caixa)", evt: "Baixa parcial", val: fmt(conta.valor * 0.4) },
    { data: "10/04/2026 14:21", user: "Maria (caixa)", evt: "Recibo emitido", val: "—" },
    { data: "20/04/2026 10:05", user: "Admin", evt: "Renegociação", val: "novo venc. 25/04" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico — {conta.id}</DialogTitle>
          <DialogDescription>{conta.cliente}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {eventos.map((e, i) => (
            <div key={i} className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{e.evt}</p>
                  <span className="text-xs text-muted-foreground">{e.data}</span>
                </div>
                <p className="text-xs text-muted-foreground">por {e.user}</p>
                <p className="mt-1 text-sm">{e.val}</p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenegociarModal({
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
  const saldo = conta.valor - conta.recebido;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Renegociar título</DialogTitle>
          <DialogDescription>Saldo atual: {fmt(saldo)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Novo valor</Label>
            <Input type="number" step="0.01" defaultValue={saldo} />
          </div>
          <div className="space-y-1.5">
            <Label>Novo vencimento</Label>
            <Input type="date" />
          </div>
          <div className="space-y-1.5">
            <Label>Parcelas</Label>
            <Input type="number" min={1} defaultValue={1} />
          </div>
          <div className="space-y-1.5">
            <Label>Intervalo (dias)</Label>
            <Input type="number" defaultValue={30} />
          </div>
          <div className="space-y-1.5">
            <Label>Juros (%)</Label>
            <Input type="number" step="0.1" defaultValue={1} />
          </div>
          <div className="space-y-1.5">
            <Label>Multa (%)</Label>
            <Input type="number" step="0.1" defaultValue={2} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observação</Label>
            <Textarea rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onConfirm}>Confirmar renegociação</Button>
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
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <Select defaultValue="pix">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Carteira origem</Label>
            <Select defaultValue="2">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {carteiras.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Comprovante</Label>
            <Input type="file" />
          </div>
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
  if (!conta) return null;
  const eventos = [
    { data: "02/04/2026 10:00", user: "Sistema", evt: "Conta criada", val: fmt(conta.valor) },
    { data: "08/04/2026 16:30", user: "Admin", evt: "Pagamento parcial", val: fmt(conta.valor * 0.5) },
    { data: "12/04/2026 11:00", user: "Admin", evt: "Comprovante anexado", val: "—" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico — {conta.id}</DialogTitle>
          <DialogDescription>{conta.fornecedor}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {eventos.map((e, i) => (
            <div key={i} className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{e.evt}</p>
                  <span className="text-xs text-muted-foreground">{e.data}</span>
                </div>
                <p className="text-xs text-muted-foreground">por {e.user}</p>
                <p className="mt-1 text-sm">{e.val}</p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Carteiras: Movimentação / Transferência ===================== */

type CarteiraItem = (typeof carteiras)[number];

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
  onConfirm: (carteiraId: string, valor: number, tipo: "entrada" | "saida") => void;
}) {
  const [valor, setValor] = useState(0);
  const [carteira, setCarteira] = useState(carteiraId);

  useEffect(() => {
    if (open) {
      setCarteira(carteiraId);
      setValor(0);
    }
  }, [open, carteiraId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{tipo === "entrada" ? "Nova entrada" : "Nova saída"}</DialogTitle>
          <DialogDescription>
            {tipo === "entrada" ? "Crédito em carteira" : "Débito em carteira"}
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
            <Label>Valor</Label>
            <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select defaultValue="outros">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vendas">Vendas</SelectItem>
                <SelectItem value="servicos">Serviços</SelectItem>
                <SelectItem value="fornecedores">Fornecedores</SelectItem>
                <SelectItem value="folha">Folha</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <Select defaultValue="pix">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descrição</Label>
            <Input placeholder="Descrição da movimentação" />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="space-y-1.5">
            <Label>Anexo</Label>
            <Input type="file" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observação</Label>
            <Textarea rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onConfirm(carteira, valor, tipo)}>Confirmar</Button>
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
