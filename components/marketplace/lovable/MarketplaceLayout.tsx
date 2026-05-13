"use client";

import { ThemeSwitcher } from "./ThemeSwitcher";
import { StatusPill } from "./StatusPill";
import { AIBadge } from "./AIBadge";
import {
  Bell,
  Search,
  TrendingUp,
  ShoppingCart,
  Plug,
  Package,
  ArrowUpRight,
  Plus,
  RefreshCw,
  ChevronRight,
  Zap,
  BarChart3,
  Sparkles,
  Boxes,
  Tag,
  Tags,
  MessageSquare,
  AlertTriangle,
  AlertCircle,
  WifiOff,
  Clock,
  Upload,
  Download,
  Wand2,
  Filter,
  DollarSign,
  PieChart,
  Rocket,
  Settings,
  Eye,
  Truck,
  FileText,
  Send,
  Download as DownloadIcon,
  Search as SearchIcon,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { MarketplaceSettingsDrawer } from "./MarketplaceSettingsDrawer";
import { useToast } from "@/hooks/use-toast";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { useMarketplaceConnections } from "@/components/marketplace/use-marketplace-connections";
import { MarketplaceConnectionsReal } from "@/components/marketplace/MarketplaceConnectionsReal";
import { MarketplaceCatalogReal } from "@/components/marketplace/MarketplaceCatalogReal";
import { MarketplaceAnnouncementsPanel } from "@/components/marketplace/MarketplaceAnnouncementsPanel";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

function formatTimeAgoPt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "—";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  return `há ${days} d`;
}

const alerts = [
  {
    id: "stock",
    icon: AlertTriangle,
    tone: "warning" as const,
    title: "Produto sem estoque",
    msg: "Smartwatch Fit Series 7 zerou no Mercado Livre.",
    cta: "Repor estoque",
  },
  {
    id: "late",
    icon: Clock,
    tone: "warning" as const,
    title: "Pedido atrasado",
    msg: "Pedido #48198 ultrapassou o SLA de envio em 6h.",
    cta: "Ver pedido",
  },
  {
    id: "sync",
    icon: AlertCircle,
    tone: "error" as const,
    title: "Erro de sincronização",
    msg: "3 SKUs falharam ao atualizar preço na Shopee.",
    cta: "Reprocessar",
  },
  {
    id: "disc",
    icon: WifiOff,
    tone: "error" as const,
    title: "Conta desconectada",
    msg: "Token da Amazon expirou — reautentique para retomar.",
    cta: "Reconectar",
  },
];

/* ---------- Mock data (Fase 1: conexões reais em componente dedicado) ---------- */
const quickActions = [
  { id: "publish", label: "Publicar produto", icon: Plus, primary: true },
  { id: "sync", label: "Sincronizar agora", icon: RefreshCw },
  { id: "import", label: "Importar produtos", icon: Download },
  { id: "ai-desc", label: "Gerar descrição com IA", icon: Wand2, ai: true },
];

const orders = [
  { id: "#48201", customer: "Marina Costa", product: "Fone Bluetooth Pro X", channel: "Mercado Livre", value: "R$ 249,90", status: "Pago", date: "01/05" },
  { id: "#48200", customer: "João Pereira", product: "Mouse Gamer RGB Ultra", channel: "Shopee", value: "R$ 189,00", status: "Pago", date: "01/05" },
  { id: "#48199", customer: "Carla Souza", product: "Carregador Turbo 65W", channel: "Amazon", value: "R$ 129,90", status: "Enviado", date: "30/04" },
  { id: "#48198", customer: "Ricardo Lima", product: "Smartwatch Fit Series 7", channel: "Mercado Livre", value: "R$ 599,00", status: "Pago", date: "30/04" },
  { id: "#48197", customer: "Beatriz Alves", product: "Câmera Web Full HD", channel: "Magalu", value: "R$ 219,00", status: "Enviado", date: "29/04" },
  { id: "#48196", customer: "Felipe Rocha", product: "Teclado Mecânico K2", channel: "Instagram", value: "R$ 349,00", status: "Cancelado", date: "29/04" },
];

/* SAC mock */
type SacMessage = { from: "client" | "me"; text: string; time: string };
type SacConversation = {
  id: string;
  customer: string;
  channel: string;
  channelColor: string;
  last: string;
  time: string;
  unread?: number;
  messages: SacMessage[];
};
const conversations: SacConversation[] = [
  {
    id: "c1",
    customer: "Marina Costa",
    channel: "Mercado Livre",
    channelColor: "bg-yellow-400 text-black",
    last: "Quando chega meu pedido?",
    time: "09:42",
    unread: 2,
    messages: [
      { from: "client", text: "Olá, comprei o Fone Bluetooth Pro X.", time: "09:40" },
      { from: "client", text: "Quando chega meu pedido?", time: "09:42" },
    ],
  },
  {
    id: "c2",
    customer: "João Pereira",
    channel: "Shopee",
    channelColor: "bg-orange-500 text-white",
    last: "O produto é original?",
    time: "09:15",
    messages: [
      { from: "client", text: "Boa, o produto é original?", time: "09:15" },
      { from: "me", text: "Sim! 100% original com nota fiscal.", time: "09:17" },
    ],
  },
  {
    id: "c3",
    customer: "Beatriz Alves",
    channel: "Instagram",
    channelColor: "bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 text-white",
    last: "Vocês têm em outra cor?",
    time: "Ontem",
    unread: 1,
    messages: [{ from: "client", text: "Oi! Vocês têm a câmera em outra cor?", time: "18:22" }],
  },
  {
    id: "c4",
    customer: "Carla Souza",
    channel: "Amazon",
    channelColor: "bg-zinc-900 text-white",
    last: "Obrigada, recebi tudo certinho.",
    time: "Ontem",
    messages: [
      { from: "client", text: "Obrigada, recebi tudo certinho.", time: "16:05" },
      { from: "me", text: "Que ótimo! Avalie o vendedor sempre que possível 💛", time: "16:07" },
    ],
  },
];

/* NF-e mock */
type NfeStatus = "Pendente" | "Emitida" | "Erro";
const nfeRows: { order: string; customer: string; value: string; status: NfeStatus }[] = [
  { order: "#48201", customer: "Marina Costa", value: "R$ 249,90", status: "Pendente" },
  { order: "#48200", customer: "João Pereira", value: "R$ 189,00", status: "Emitida" },
  { order: "#48199", customer: "Carla Souza", value: "R$ 129,90", status: "Emitida" },
  { order: "#48198", customer: "Ricardo Lima", value: "R$ 599,00", status: "Erro" },
  { order: "#48197", customer: "Beatriz Alves", value: "R$ 219,00", status: "Pendente" },
];

const automations = [
  { id: "stock", title: "Sincronizar estoque automaticamente", desc: "Atualiza em todos os canais a cada 5 min", icon: Boxes, on: true },
  { id: "price", title: "Ajustar preço automaticamente", desc: "Reajuste com base em margem-alvo e concorrência", icon: Tag, on: true, ai: true },
  { id: "msg", title: "Responder clientes automaticamente", desc: "IA responde dúvidas frequentes em até 30s", icon: MessageSquare, on: false, ai: true },
  { id: "desc", title: "Gerar descrição com IA", desc: "Cria títulos e descrições otimizadas para SEO", icon: Sparkles, on: true, ai: true },
  { id: "reco", title: "Recomendar produtos com IA", desc: "Sugestões cruzadas para aumentar ticket médio", icon: Rocket, on: true, ai: true },
];

const channelPerf = [
  { name: "Mercado Livre", value: "R$ 14.820", pct: 51, color: "bg-yellow-400" },
  { name: "Shopee", value: "R$ 7.840", pct: 27, color: "bg-orange-500" },
  { name: "Amazon", value: "R$ 4.630", pct: 16, color: "bg-zinc-700" },
  { name: "Instagram", value: "R$ 1.650", pct: 6, color: "bg-pink-500" },
];

const topProducts = [
  { name: "Fone Bluetooth Pro X", sales: 184, revenue: "R$ 45.916" },
  { name: "Carregador Turbo 65W", sales: 142, revenue: "R$ 18.445" },
  { name: "Mouse Gamer RGB Ultra", sales: 98, revenue: "R$ 19.122" },
  { name: "Smartwatch Fit Series 7", sales: 64, revenue: "R$ 38.336" },
];

const profitByChannel = [
  { name: "Mercado Livre", profit: "R$ 5.920", margin: "28%", tone: "text-success" },
  { name: "Shopee", profit: "R$ 2.430", margin: "22%", tone: "text-success" },
  { name: "Amazon", profit: "R$ 1.180", margin: "18%", tone: "text-warning" },
  { name: "Instagram", profit: "R$ 760", margin: "32%", tone: "text-success" },
];

/* ---------- Helpers ---------- */
function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function orderBadge(status: string) {
  const map: Record<string, string> = {
    Pago: "bg-info/15 text-info border-info/30",
    "Em preparo": "bg-warning/15 text-warning border-warning/30",
    Enviado: "bg-success/15 text-success border-success/30",
    Cancelado: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return map[status] ?? "bg-muted text-muted-foreground border-border";
}

function nfeBadge(status: NfeStatus) {
  const map: Record<NfeStatus, string> = {
    Pendente: "bg-warning/15 text-warning border-warning/30",
    Emitida: "bg-success/15 text-success border-success/30",
    Erro: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return map[status];
}

export default function MarketplaceLayout() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const { lojaAtivaId } = useLojaAtiva();
  const mpHub = useMarketplaceConnections(lojaAtivaId);

  useEffect(() => {
    if (!lojaAtivaId?.trim()) setCatalogProductCount(null);
  }, [lojaAtivaId]);

  const lastGlobalSync = useMemo(() => {
    let max: string | null = null;
    for (const c of mpHub.connections) {
      if (!c.lastSyncAt) continue;
      if (!max || new Date(c.lastSyncAt) > new Date(max)) max = c.lastSyncAt;
    }
    return max;
  }, [mpHub.connections]);

  const [catalogProductCount, setCatalogProductCount] = useState<number | null>(null);

  const summary = useMemo(
    () => [
      { label: "Vendas hoje", value: "R$ 28.940", delta: "+12,4%", icon: TrendingUp, tone: "text-success" },
      { label: "Pedidos ativos", value: "146", delta: "+8 novos", icon: ShoppingCart, tone: "text-info" },
      {
        label: "Marketplaces conectados",
        value: String(mpHub.connectedCount),
        delta: mpHub.connectedCount > 0 ? "Canais ativos" : "Nenhum canal",
        icon: Plug,
        tone: "text-primary",
      },
      {
        label: "Produtos ativos (cadastro)",
        value: catalogProductCount != null ? String(catalogProductCount) : "—",
        delta: "Catálogo da unidade",
        icon: Package,
        tone: "text-warning",
      },
    ],
    [mpHub.connectedCount, catalogProductCount],
  );

  const showPendingToast = () =>
    toast({
      title: "Integração pendente",
      description: PENDING_TOAST_DESCRIPTION,
    });

  const syncAllConnected = async () => {
    const sid = lojaAtivaId?.trim();
    if (!sid) {
      toast({
        title: "Unidade não selecionada",
        description: "Selecione a loja no cabeçalho para sincronizar.",
        variant: "destructive",
      });
      return;
    }
    const targets = mpHub.connections.filter((c) => c.status === "CONNECTED");
    if (targets.length === 0) {
      toast({ title: "Nada para sincronizar", description: "Conecte ao menos um canal primeiro." });
      return;
    }
    for (const c of targets) {
      const r = await fetch(`/api/marketplace/connections/${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: sid,
        },
        body: JSON.stringify({ simulateSync: true }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        toast({
          title: "Sincronização interrompida",
          description: j?.error || `Erro ${r.status}`,
          variant: "destructive",
        });
        await mpHub.refetch();
        return;
      }
    }
    await mpHub.refetch();
    toast({ title: "Sincronização concluída", description: "Todos os canais conectados foram processados." });
  };

  const [autos, setAutos] = useState(() => Object.fromEntries(automations.map((a) => [a.id, a.on])));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [orderFilterChannel, setOrderFilterChannel] = useState<string>("all");
  const [orderFilterStatus, setOrderFilterStatus] = useState<string>("all");
  const [activeConv, setActiveConv] = useState<string>(conversations[0].id);
  const [draft, setDraft] = useState("");

  const orderChannelOptions = useMemo(
    () => ["all", ...Array.from(new Set(orders.map((o) => o.channel)))],
    [],
  );

  const filteredOrders = orders.filter(
    (o) =>
      (orderFilterChannel === "all" || o.channel === orderFilterChannel) &&
      (orderFilterStatus === "all" || o.status === orderFilterStatus),
  );

  const currentConv = conversations.find((c) => c.id === activeConv) ?? conversations[0];

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 sm:px-8 py-3 backdrop-blur-md">
          <div className="hidden md:flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground w-72">
            <Search className="h-4 w-4" />
            <input
              className="bg-transparent outline-none flex-1 placeholder:text-muted-foreground"
              placeholder="Buscar pedidos, SKUs, anúncios..."
            />
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border">
              ⌘K
            </kbd>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeSwitcher />
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            </button>
            <div className="flex items-center gap-2 rounded-full border border-border bg-card pr-3 pl-1 py-1">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                {(() => {
                  const raw = (session?.user?.name || session?.user?.email || "?").trim();
                  const parts = raw.split(/\s+/).filter(Boolean);
                  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
                  return raw.slice(0, 2).toUpperCase() || "?";
                })()}
              </div>
              <span className="text-xs font-medium max-w-[10rem] truncate">
                {(session?.user?.name || session?.user?.email || "Conta").trim()}
              </span>
            </div>
          </div>
        </header>

        {/* Page header */}
        <div className="px-4 sm:px-8 pt-8 pb-4 animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft" />
            {mpHub.connectedCount}{" "}
            {mpHub.connectedCount === 1 ? "canal conectado" : "canais conectados"} · Última sincronização{" "}
            {formatTimeAgoPt(lastGlobalSync)}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Marketplace</h1>
              <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-3xl">
                Gerencie canais de venda, produtos, pedidos e automações em um só lugar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void syncAllConnected()}
                title="Sincronizar todos os canais conectados"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                <RefreshCw className="h-4 w-4" /> Sincronizar agora
              </button>
              <button
                onClick={showPendingToast}
                title="Integração pendente"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-[var(--shadow-glow)]"
              >
                <Plus className="h-4 w-4" /> Publicar produto
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                aria-label="Configurações do Marketplace"
              >
                <Settings className="h-4 w-4" /> Configurações
              </button>
            </div>
          </div>
        </div>

        <MarketplaceSettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />

        <main className="flex-1 px-4 sm:px-8 pb-16 space-y-10">
          {/* ============ TOPO — Resumo ============ */}
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {summary.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="surface-card surface-card-hover relative overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-md p-5"
                >
                  <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                    <div className={cn("grid h-8 w-8 place-items-center rounded-lg bg-muted/60", s.tone)}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-3 font-display text-3xl font-bold tracking-tight">{s.value}</div>
                  <div className={cn("mt-1 inline-flex items-center gap-1 text-xs font-medium", s.tone)}>
                    <ArrowUpRight className="h-3 w-3" />
                    {s.delta}
                  </div>
                </div>
              );
            })}
          </section>

          {/* ============ Central de alertas ============ */}
          <section>
            <SectionHeader
              icon={Bell}
              title="Central de alertas"
              subtitle="Itens críticos que precisam da sua atenção"
              action={
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                  {alerts.length} ativos
                </span>
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alerts.map((a) => {
                const Icon = a.icon;
                const toneCls =
                  a.tone === "error"
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-warning/10 text-warning border-warning/30";
                return (
                  <div
                    key={a.id}
                    className="surface-card surface-card-hover flex items-start gap-4 rounded-2xl border border-border bg-card p-5"
                  >
                    <div className={cn("grid h-11 w-11 place-items-center rounded-xl border", toneCls)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm">{a.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.msg}</p>
                    </div>
                    <button
                      onClick={showPendingToast}
                      title="Integração pendente"
                      className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      {a.cta} <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ============ Conexões (dados reais) ============ */}
          <section>
            <SectionHeader
              icon={Plug}
              title="Conexões de marketplace"
              subtitle="Contas vinculadas a esta unidade, com histórico de sincronização persistido"
            />
            <MarketplaceConnectionsReal storeId={lojaAtivaId} hub={mpHub} />
          </section>

          {/* ============ Ações rápidas ============ */}
          <section>
            <SectionHeader icon={Zap} title="Ações rápidas" subtitle="Operações comuns em um clique" />
            <div className="surface-card rounded-2xl border border-border bg-card p-3 flex flex-wrap gap-2">
              {quickActions.map((q) => {
                const Icon = q.icon;
                return (
                  <button
                    key={q.id}
                    onClick={showPendingToast}
                    title="Integração pendente"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                      q.primary
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-border bg-muted/40 hover:bg-muted text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {q.label}
                    {q.ai && <AIBadge className="ml-1" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ============ Produtos (cadastro real + vínculos simulados) ============ */}
          <section>
            <SectionHeader
              icon={Package}
              title="Catálogo e publicação simulada"
              subtitle="Produtos do cadastro (estoque) por unidade — exportação e sync gravam MarketplaceProductLink e MarketplaceSyncLog"
            />
            <MarketplaceCatalogReal
              storeId={lojaAtivaId}
              connections={mpHub.connections}
              onProductCount={setCatalogProductCount}
              onCatalogActivity={() => mpHub.refetch()}
            />
          </section>

          {/* ============ Anúncios por canal (Fase 3) ============ */}
          <section>
            <SectionHeader
              icon={Tags}
              title="Anúncios por canal"
              subtitle="Painel operacional dos vínculos MarketplaceProductLink — filtros, ações simuladas e logs por produto/canal"
            />
            <MarketplaceAnnouncementsPanel
              storeId={lojaAtivaId}
              connections={mpHub.connections}
              onActivity={() => mpHub.refetch()}
            />
          </section>

          {/* ============ Pedidos ============ */}
          <section>
            <SectionHeader
              icon={ShoppingCart}
              title="Pedidos"
              subtitle="Todos os pedidos consolidados dos seus canais"
              action={
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                    <Filter className="h-3 w-3" />
                    <select
                      value={orderFilterChannel}
                      onChange={(e) => setOrderFilterChannel(e.target.value)}
                      className="bg-transparent outline-none text-foreground"
                    >
                      {orderChannelOptions.map((c) => (
                        <option key={c} value={c}>
                          {c === "all" ? "Todos os canais" : c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                    <Filter className="h-3 w-3" />
                    <select
                      value={orderFilterStatus}
                      onChange={(e) => setOrderFilterStatus(e.target.value)}
                      className="bg-transparent outline-none text-foreground"
                    >
                      <option value="all">Todos os status</option>
                      <option value="Pago">Pago</option>
                      <option value="Enviado">Enviado</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </div>
                </div>
              }
            />
            <div className="surface-card rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-5 py-3">Pedido</th>
                      <th className="text-left font-medium px-5 py-3">Cliente</th>
                      <th className="text-left font-medium px-5 py-3">Canal</th>
                      <th className="text-left font-medium px-5 py-3">Status</th>
                      <th className="text-left font-medium px-5 py-3">Valor</th>
                      <th className="text-left font-medium px-5 py-3">Data</th>
                      <th className="text-right font-medium px-5 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5 font-semibold">{o.id}</td>
                        <td className="px-5 py-3.5">
                          <div className="font-medium">{o.customer}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{o.product}</div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">{o.channel}</td>
                        <td className="px-5 py-3.5">
                          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", orderBadge(o.status))}>
                            {o.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold whitespace-nowrap">{o.value}</td>
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{o.date}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={showPendingToast}
                              title="Integração pendente"
                              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                              aria-label="Ver detalhes (integração pendente)"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={showPendingToast}
                              title="Integração pendente"
                              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                              aria-label="Emitir NF-e (integração pendente)"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={showPendingToast}
                              title="Integração pendente"
                              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                              aria-label="Marcar como enviado (integração pendente)"
                            >
                              <Truck className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                          Nenhum pedido encontrado com os filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ============ SAC Unificado ============ */}
          <section>
            <SectionHeader
              icon={MessageSquare}
              title="SAC unificado"
              subtitle="Todas as conversas dos seus canais em um só inbox"
              action={<AIBadge label="Resposta IA" />}
            />
            <div className="surface-card rounded-2xl border border-border bg-card overflow-hidden grid grid-cols-1 md:grid-cols-[300px_1fr] min-h-[480px]">
              {/* Lista de conversas */}
              <aside className="border-b md:border-b-0 md:border-r border-border bg-muted/20 flex flex-col">
                <div className="p-3 border-b border-border">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                    <SearchIcon className="h-3.5 w-3.5" />
                    <input
                      placeholder="Buscar conversa..."
                      className="bg-transparent outline-none flex-1 text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-border">
                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveConv(c.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/40 transition-colors",
                        activeConv === c.id && "bg-muted/60",
                      )}
                    >
                      <div className={cn("grid h-10 w-10 place-items-center rounded-full text-xs font-bold shrink-0", c.channelColor)}>
                        {c.customer.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm truncate">{c.customer}</p>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{c.time}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{c.last}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] font-medium text-muted-foreground">{c.channel}</span>
                          {c.unread && (
                            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                              {c.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>

              {/* Conversa ativa */}
              <div className="flex flex-col">
                <div className="px-5 py-3 border-b border-border flex items-center gap-3">
                  <div className={cn("grid h-9 w-9 place-items-center rounded-full text-xs font-bold", currentConv.channelColor)}>
                    {currentConv.customer.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{currentConv.customer}</p>
                    <p className="text-xs text-muted-foreground">{currentConv.channel}</p>
                  </div>
                </div>
                <div className="flex-1 p-5 space-y-3 overflow-y-auto bg-muted/10">
                  {currentConv.messages.map((m, i) => (
                    <div key={i} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                          m.from === "me"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-card border border-border rounded-bl-sm",
                        )}
                      >
                        <p>{m.text}</p>
                        <p className={cn("text-[10px] mt-1", m.from === "me" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {m.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-border flex items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={showPendingToast}
                    title="Integração pendente"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Responder com IA <AIBadge className="ml-0.5" />
                  </button>
                  <button
                    onClick={showPendingToast}
                    title="Integração pendente"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" /> Enviar
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ============ NF-e ============ */}
          <section>
            <SectionHeader
              icon={FileText}
              title="Notas fiscais (NF-e)"
              subtitle="Emita e acompanhe o status fiscal dos seus pedidos"
              action={
                <button
                  onClick={showPendingToast}
                  title="Integração pendente"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Emitir em lote
                </button>
              }
            />
            <div className="surface-card rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-5 py-3">Pedido</th>
                      <th className="text-left font-medium px-5 py-3">Cliente</th>
                      <th className="text-left font-medium px-5 py-3">Valor</th>
                      <th className="text-left font-medium px-5 py-3">Status NF-e</th>
                      <th className="text-right font-medium px-5 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {nfeRows.map((n) => (
                      <tr key={n.order} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5 font-semibold">{n.order}</td>
                        <td className="px-5 py-3.5">{n.customer}</td>
                        <td className="px-5 py-3.5 font-semibold whitespace-nowrap">{n.value}</td>
                        <td className="px-5 py-3.5">
                          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", nfeBadge(n.status))}>
                            {n.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            {n.status !== "Emitida" && (
                              <button
                                onClick={showPendingToast}
                                title="Integração pendente"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                              >
                                <FileText className="h-3.5 w-3.5" /> Emitir NF-e
                              </button>
                            )}
                            {n.status === "Emitida" && (
                              <button
                                onClick={showPendingToast}
                                title="Integração pendente"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                              >
                                <DownloadIcon className="h-3.5 w-3.5" /> Baixar XML
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ============ Automação ============ */}
          <section>
            <SectionHeader
              icon={Sparkles}
              title="Automação inteligente"
              subtitle="Deixe a IA cuidar das tarefas repetitivas"
              action={<AIBadge label="IA Ativa" />}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {automations.map((a) => {
                const Icon = a.icon;
                const on = autos[a.id];
                return (
                  <div
                    key={a.id}
                    className="surface-card surface-card-hover flex items-center gap-4 rounded-2xl border border-border bg-card p-5"
                  >
                    <div
                      className={cn(
                        "grid h-11 w-11 place-items-center rounded-xl",
                        on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{a.title}</h3>
                        {a.ai && <AIBadge />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
                    </div>
                    <button
                      onClick={showPendingToast}
                      title="Integração pendente"
                      className={cn(
                        "relative h-6 w-11 rounded-full transition-colors shrink-0 opacity-60 cursor-not-allowed",
                        on ? "bg-primary" : "bg-muted",
                      )}
                      aria-pressed={on}
                      aria-disabled="true"
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                          on ? "translate-x-5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ============ Analytics ============ */}
          <section>
            <SectionHeader icon={BarChart3} title="Analytics" subtitle="Performance por canal e produtos campeões" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="surface-card rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Vendas por marketplace</h3>
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-3">
                  {channelPerf.map((c) => (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">
                          {c.value} <span className="ml-1 text-foreground/70 font-semibold">{c.pct}%</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full", c.color)} style={{ width: `${c.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="surface-card rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Produtos mais vendidos</h3>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
                <ul className="divide-y divide-border">
                  {topProducts.map((p, i) => (
                    <li key={p.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.sales} vendas</p>
                      </div>
                      <span className="text-sm font-semibold">{p.revenue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* ============ Lucro ============ */}
          <section>
            <SectionHeader
              icon={DollarSign}
              title="Visão de lucro"
              subtitle="Margem real consolidada e por canal"
              action={<AIBadge label="Insight IA" />}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="surface-card surface-card-hover rounded-2xl border border-border bg-card p-6 lg:col-span-1 relative overflow-hidden">
                <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-success/10 blur-2xl" />
                <p className="text-xs font-medium text-muted-foreground">Lucro total (mês)</p>
                <p className="mt-2 font-display text-4xl font-bold tracking-tight">R$ 10.290</p>
                <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
                  <ArrowUpRight className="h-3 w-3" />
                  +18,2% vs. mês anterior
                </div>
                <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                  <p className="font-semibold text-primary flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Recomendação IA
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Reajuste preços do top 3 produtos no Mercado Livre em +4% para ganhar até R$ 980 sem perder competitividade.
                  </p>
                </div>
              </div>

              <div className="surface-card rounded-2xl border border-border bg-card p-6 lg:col-span-2">
                <h3 className="font-semibold text-sm mb-4">Lucro por marketplace</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium pb-3">Canal</th>
                        <th className="text-left font-medium pb-3">Lucro</th>
                        <th className="text-left font-medium pb-3">Margem</th>
                        <th className="text-right font-medium pb-3">Tendência</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {profitByChannel.map((p) => (
                        <tr key={p.name}>
                          <td className="py-3 font-medium">{p.name}</td>
                          <td className="py-3 font-semibold">{p.profit}</td>
                          <td className={cn("py-3 font-semibold", p.tone)}>{p.margin}</td>
                          <td className="py-3 text-right">
                            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", p.tone)}>
                              <ArrowUpRight className="h-3 w-3" /> Saudável
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
