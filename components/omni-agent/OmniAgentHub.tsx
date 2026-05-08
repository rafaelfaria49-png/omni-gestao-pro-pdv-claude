"use client"

import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  Activity, Bot, Check, X, Edit3, Play, Plus, Copy, MessageCircle,
  Power, RefreshCw, Sparkles, Star, Send, Trash2, Download, Save,
  Wallet, ShoppingCart, Wrench, Package, Users, Bell, BarChart3,
  Settings as SettingsIcon, Eye, QrCode, Phone, Zap, Brain, Lightbulb,
  TrendingUp, FileText, Inbox, Search, Command as CmdIcon, Clock,
  GripVertical, AlertTriangle, CheckCheck, UserCog, Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CmdStatus = "executado" | "pendente" | "recusado" | "aprovado";
type ModuleId = "Financeiro" | "Vendas" | "OS" | "Estoque" | "Clientes" | "Lembretes" | "Relatórios" | "Geral";
type Cmd = { id: string; text: string; category: string; status: CmdStatus; confidence: number; time: string; ts: number; module: string };
type InboxItem = {
  id: string; desc: string; module: ModuleId; confidence: number;
  status: "pending" | "approved" | "rejected"; original: string;
  fields: Record<string, string>; ts: number;
};

const TABS = [
  { id: "overview", label: "Visão Geral", icon: Activity },
  { id: "inbox", label: "Inbox IA", icon: Inbox },
  { id: "whatsapp", label: "WhatsApp Agent", icon: MessageCircle },
  { id: "commands", label: "Comandos IA", icon: Sparkles },
  { id: "auto", label: "Automações", icon: Zap },
  { id: "memory", label: "Memória Cliente", icon: Users },
  { id: "reports", label: "Relatórios IA", icon: BarChart3 },
  { id: "settings", label: "Configurações", icon: SettingsIcon },
] as const;
type TabId = typeof TABS[number]["id"];

const SAMPLE_CMDS: Cmd[] = [
  { id: "c1", text: "gastei R$ 120 em combustível", category: "Despesa", module: "Financeiro", status: "executado", confidence: 0.96, time: "09:12", ts: Date.now() - 1000 * 60 * 18 },
  { id: "c2", text: "cliente João trouxe iPhone 12 sem áudio", category: "Pré-OS", module: "OS", status: "pendente", confidence: 0.88, time: "09:24", ts: Date.now() - 1000 * 60 * 12 },
  { id: "c3", text: "vendi película por R$ 40 no pix", category: "Venda", module: "Vendas", status: "executado", confidence: 0.94, time: "10:01", ts: Date.now() - 1000 * 60 * 6 },
  { id: "c4", text: "me lembre de cobrar Maria amanhã", category: "Lembrete", module: "Lembretes", status: "pendente", confidence: 0.91, time: "10:15", ts: Date.now() - 1000 * 60 * 3 },
];

const RANDOM_CMDS = [
  "vendi capinha R$ 25 dinheiro",
  "registrar despesa R$ 80 almoço",
  "abrir OS Samsung S20 tela quebrada",
  "lembrar de ligar para Carlos",
  "entrada de 10 películas no estoque",
  "cliente Maria deve R$ 280",
  "qual foi meu faturamento hoje?",
];

function uid() { return Math.random().toString(36).slice(2, 9); }
function nowTime() { return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function relTime(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return `há ${d}s`;
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)}h`;
  return `há ${Math.floor(d / 86400)}d`;
}

/* ---------- localStorage helper ---------- */
function useLS<T>(key: string, def: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    if (typeof window === "undefined") return def;
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

/* ---------- mock NLP ---------- */
function interpret(text: string): { module: ModuleId; action: string; fields: Record<string, string>; confidence: number } {
  const t = text.toLowerCase();
  const valor = t.match(/r?\$?\s*(\d+[.,]?\d*)/)?.[1]?.replace(",", ".") ?? "";
  const qtd = t.match(/(\d+)\s*(capa|pelíc|unid|cabo|fone)/)?.[1] ?? "";
  if (/(gast|despesa|paguei|comprei combust|combustív|almoço|uber)/.test(t)) {
    const cat = /combust/.test(t) ? "Combustível" : /almoço|comida/.test(t) ? "Alimentação" : /uber/.test(t) ? "Transporte" : "Geral";
    return { module: "Financeiro", action: "Criar despesa", fields: { descrição: text, valor, categoria: cat, carteira: "Caixa", pagamento: /pix/.test(t) ? "Pix" : "Dinheiro", data: "hoje" }, confidence: 0.94 };
  }
  if (/(vendi|venda)/.test(t)) {
    const prod = /pelíc/.test(t) ? "Película" : /capa|capinha/.test(t) ? "Capa" : /cabo/.test(t) ? "Cabo" : "Produto";
    return { module: "Vendas", action: "Registrar venda", fields: { produto: prod, valor, quantidade: "1", pagamento: /pix/.test(t) ? "Pix" : /cart/.test(t) ? "Cartão" : "Dinheiro", cliente: "" }, confidence: 0.92 };
  }
  if (/(os|defeito|trouxe|conserto|iphone|samsung|moto g|sem áudio|tela)/.test(t)) {
    const cliente = t.match(/cliente\s+([a-záéíóúâê]+)/)?.[1] ?? "";
    const aparelho = (t.match(/(iphone\s*\d+|samsung\s*\w+|moto g\w*)/)?.[0] ?? "").trim();
    const defeito = /sem áudio/.test(t) ? "sem áudio" : /tela/.test(t) ? "tela quebrada" : /carga/.test(t) ? "não carrega" : "a verificar";
    return { module: "OS", action: "Criar pré-OS", fields: { cliente: cliente || "—", aparelho: aparelho || "—", defeito, prioridade: "normal", status: "aberto" }, confidence: 0.88 };
  }
  if (/(estoque|entrada|comprei \d|recebi \d)/.test(t)) {
    return { module: "Estoque", action: "Entrada de estoque", fields: { produto: /capa/.test(t) ? "Capa" : /pelíc/.test(t) ? "Película" : "Produto", quantidade: qtd || "1", custoUnit: valor || "0" }, confidence: 0.9 };
  }
  if (/(lembre|lembrar|cobrar|cobrança)/.test(t)) {
    return { module: "Lembretes", action: "Criar lembrete", fields: { pessoa: t.match(/(maria|joão|carlos|ana|pedro)/)?.[0] ?? "—", descrição: text, data: "amanhã", prioridade: "média" }, confidence: 0.86 };
  }
  if (/(faturamento|vendi hoje|relatório|quanto)/.test(t)) {
    return { module: "Relatórios", action: "Consultar relatório", fields: { pergunta: text }, confidence: 0.82 };
  }
  return { module: "Geral", action: "Comando livre", fields: { texto: text }, confidence: 0.6 };
}

/* simple beep without external file */
function beep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.05;
    o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 120);
  } catch {}
}

/* ============================================================ */
export default function OmniAgentHub() {
  const [tab, setTab] = useState<TabId>("overview");
  const [agentOnline, setAgentOnline] = useLS<boolean>("omni-agent-online", true);
  const [compact, setCompact] = useLS<boolean>("omni-compact", false);
  const [feed, setFeed] = useState<Cmd[]>(SAMPLE_CMDS);
  const [inbox, setInbox] = useState<InboxItem[]>([
    { id: "i1", desc: "Criar despesa de R$ 120 em Combustível", module: "Financeiro", confidence: 0.96, status: "pending", original: "gastei R$ 120 em combustível", fields: { descrição: "Combustível", valor: "120", categoria: "Combustível", carteira: "Caixa", pagamento: "Dinheiro", data: "hoje" }, ts: Date.now() - 60000 * 18 },
    { id: "i2", desc: "Criar pré-OS para João / iPhone 12 sem áudio", module: "OS", confidence: 0.88, status: "pending", original: "cliente João trouxe iPhone 12 sem áudio", fields: { cliente: "João", aparelho: "iPhone 12", defeito: "sem áudio", prioridade: "normal", status: "aberto" }, ts: Date.now() - 60000 * 12 },
    { id: "i3", desc: "Registrar venda de película R$ 40 Pix", module: "Vendas", confidence: 0.94, status: "pending", original: "vendi película por R$ 40 no pix", fields: { produto: "Película", valor: "40", quantidade: "1", pagamento: "Pix", cliente: "" }, ts: Date.now() - 60000 * 6 },
    { id: "i4", desc: "Criar lembrete de cobrança para Maria", module: "Lembretes", confidence: 0.91, status: "pending", original: "me lembre de cobrar Maria amanhã", fields: { pessoa: "Maria", descrição: "Cobrar", data: "amanhã", prioridade: "alta" }, ts: Date.now() - 60000 * 3 },
  ]);
  const [audit, setAudit] = useState<string[]>([`${nowTime()} · Sistema iniciado`, `${nowTime()} · Agente online`]);
  const [newCmdOpen, setNewCmdOpen] = useState(false);
  const [details, setDetails] = useState<Cmd | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [floatingOpen, setFloatingOpen] = useState(false);
  const [waUnread, setWaUnread] = useState(0);
  const [now, setNow] = useState(Date.now());
  const onlineSince = useRef(Date.now());

  // theme synced via global ThemeProvider
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stats = useMemo(() => ({
    received: feed.length + 12,
    executed: feed.filter(f => f.status === "executado" || f.status === "aprovado").length + 8,
    pending: inbox.filter(i => i.status === "pending").length,
    accuracy: 94,
  }), [feed, inbox]);

  function logAudit(msg: string) { setAudit(a => [`${nowTime()} · ${msg}`, ...a].slice(0, 50)); }
  function addCmd(text: string, category = "Comando", module = "Geral", status: CmdStatus = "executado", confidence = 0.9) {
    const c: Cmd = { id: uid(), text, category, module, status, confidence, time: nowTime(), ts: Date.now() };
    setFeed(prev => [c, ...prev]); return c;
  }
  function pushToInbox(text: string) {
    const r = interpret(text);
    const item: InboxItem = { id: uid(), desc: `${r.action} — ${text}`, module: r.module, confidence: r.confidence, status: "pending", original: text, fields: r.fields, ts: Date.now() };
    setInbox(prev => [item, ...prev]); setWaUnread(n => n + 1); return item;
  }
  function simulate() {
    const t = RANDOM_CMDS[Math.floor(Math.random() * RANDOM_CMDS.length)];
    const r = interpret(t);
    addCmd(t, r.action, r.module, "executado", r.confidence);
    logAudit(`Comando simulado: "${t}"`);
    if (r.confidence < 0.85) { pushToInbox(t); toast.warning("Baixa confiança — Inbox IA"); }
    else toast.success("Comando simulado executado");
  }

  const pendingCount = inbox.filter(i => i.status === "pending").length;

  return (
    <div className={cn("min-h-screen w-full bg-background text-foreground", compact && "text-[13px]")}>
      <Toaster position="top-right" theme="system" richColors />
      <Header
        agentOnline={agentOnline}
        setAgentOnline={(v: boolean) => { setAgentOnline(v); if (v) onlineSince.current = Date.now(); logAudit(v ? "Agente ativado" : "Agente pausado"); }}
        onSimulate={simulate}
        onNewCmd={() => setNewCmdOpen(true)}
        notifications={inbox.filter(i => i.status === "pending").slice(0, 5)}
        onGotoInbox={() => setTab("inbox")}
        compact={compact}
        setCompact={setCompact}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className={cn("mx-auto w-full max-w-7xl px-4", compact ? "pb-12" : "pb-16")}>
        <Tabs current={tab} onChange={(t) => { setTab(t); if (t === "inbox" || t === "whatsapp") setWaUnread(0); }} pendingCount={pendingCount} waUnread={waUnread} />

        <div className="mt-6 min-w-0 animate-fade-in" key={tab}>
          {tab === "overview" && (
            <OverviewTab
              stats={stats} feed={feed} setFeed={setFeed}
              onDetails={setDetails} onSimulate={simulate}
              logAudit={logAudit} pushToInbox={pushToInbox}
              now={now} onlineSince={onlineSince.current} agentOnline={agentOnline}
            />
          )}
          {tab === "inbox" && <InboxTab items={inbox} setItems={setInbox} logAudit={logAudit} />}
          {tab === "whatsapp" && <WhatsAppTab onTest={(t) => { const r = interpret(t); addCmd(t, r.action, r.module); logAudit(`WhatsApp: ${t}`); toast.success("Comando enviado"); }} pushToInbox={pushToInbox} bumpUnread={() => setWaUnread(n => n + 1)} />}
          {tab === "commands" && <CommandsTab onSimulate={(t) => { const r = interpret(t); addCmd(t, r.action, r.module, "executado", r.confidence); if (r.confidence < 0.85) pushToInbox(t); toast.success("Comando simulado"); logAudit(`Simulou: ${t}`); }} />}
          {tab === "auto" && <AutomationsTab logAudit={logAudit} />}
          {tab === "memory" && <MemoryTab logAudit={logAudit} />}
          {tab === "reports" && <ReportsTab pushToInbox={pushToInbox} logAudit={logAudit} />}
          {tab === "settings" && <SettingsTab audit={audit} />}
        </div>
      </div>

      <NewCommandModal
        open={newCmdOpen} onClose={() => setNewCmdOpen(false)}
        onSendInbox={(t) => { pushToInbox(t); logAudit(`Enviado p/ Inbox: ${t}`); toast.success("Enviado para Inbox IA"); }}
        onExecute={(t) => { const r = interpret(t); addCmd(t, r.action, r.module, "executado", r.confidence); logAudit(`Executado: ${t}`); toast.success("Comando executado"); }}
      />

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalhes do comando</DialogTitle></DialogHeader>
          {details && (
            <div className="space-y-2 text-sm">
              <Row k="Texto" v={details.text} />
              <Row k="Categoria" v={details.category} />
              <Row k="Módulo" v={details.module} />
              <Row k="Status" v={details.status} />
              <Row k="Confiança" v={`${(details.confidence * 100).toFixed(0)}%`} />
              <Row k="Horário" v={details.time} />
            </div>
          )}
          <DialogFooter><Button onClick={() => setDetails(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAction={(a) => {
        setPaletteOpen(false);
        if (a.type === "tab") setTab(a.value as TabId);
        if (a.type === "new") setNewCmdOpen(true);
        if (a.type === "simulate") simulate();
      }} />

      {/* Floating mini dashboard */}
      <button
        onClick={() => setFloatingOpen(o => !o)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <Zap className="h-4 w-4" /> Status
      </button>
      {floatingOpen && (
        <div className="fixed bottom-16 right-4 z-40 w-72 rounded-xl border border-border bg-card p-4 shadow-xl animate-scale-in">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-sm">Mini Dashboard</span>
            <button onClick={() => setFloatingOpen(false)}><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Agente</span><Badge variant={agentOnline ? "default" : "secondary"}>{agentOnline ? "Online" : "Pausado"}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pendências</span><span className="font-medium">{pendingCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Último</span><span className="font-medium text-xs">{feed[0] ? relTime(feed[0].ts) : "—"}</span></div>
            <Button size="sm" className="w-full" onClick={() => { setTab("inbox"); setFloatingOpen(false); }}><Inbox /> Ir p/ Inbox</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2"><span className="text-muted-foreground">{k}:</span><span className="font-medium">{v}</span></div>;
}

/* ---------- Header ---------- */
function Header({ agentOnline, setAgentOnline, onSimulate, onNewCmd, notifications, onGotoInbox, compact, setCompact, onOpenPalette }: any) {
  const [clock, setClock] = useState(nowTime());
  const [bellOpen, setBellOpen] = useState(false);
  useEffect(() => { const id = setInterval(() => setClock(nowTime()), 30000); return () => clearInterval(id); }, []);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">Omni Agent HUB</h1>
            <p className="truncate text-xs text-muted-foreground">Central operacional de IA do OmniGestão Pro</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <span className={cn("h-2 w-2 rounded-full", agentOnline ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
            {agentOnline ? "Online" : "Pausado"}
          </Badge>
          <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> {clock}</Badge>
          <Badge variant="outline">Mock</Badge>

          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setBellOpen(o => !o)}>
              <Bell />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">{notifications.length}</span>
              )}
            </Button>
            {bellOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border bg-popover p-2 shadow-xl z-50">
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Pendências</div>
                {notifications.length === 0 && <div className="p-3 text-sm text-muted-foreground">Nenhuma pendência</div>}
                {notifications.map((n: InboxItem) => (
                  <button key={n.id} onClick={() => { setBellOpen(false); onGotoInbox(); }} className="w-full rounded-md p-2 text-left text-sm hover:bg-accent">
                    <div className="truncate font-medium">{n.desc}</div>
                    <div className="text-[10px] text-muted-foreground">{n.module} · {(n.confidence * 100).toFixed(0)}%</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={onOpenPalette} title='Atalho: "/"'><Search /> <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">/</kbd></Button>

          <Button variant="ghost" size="sm" onClick={() => setCompact(!compact)} title="Modo compacto">
            {compact ? <Maximize2 /> : <Minimize2 />}
          </Button>

          <Button variant="outline" size="sm" onClick={onSimulate}><Play /> Simular</Button>
          <Button variant="outline" size="sm" onClick={() => setAgentOnline(!agentOnline)}><Power /> {agentOnline ? "Pausar" : "Ativar"}</Button>
          <Button size="sm" onClick={onNewCmd}><Plus /> Novo</Button>
        </div>
      </div>
    </header>
  );
}

/* ---------- Tabs ---------- */
function Tabs({ current, onChange, pendingCount, waUnread }: { current: TabId; onChange: (t: TabId) => void; pendingCount: number; waUnread: number }) {
  return (
    <div className="mt-6 flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
      {TABS.map(t => {
        const Icon = t.icon;
        const active = current === t.id;
        const badge = t.id === "inbox" ? pendingCount : t.id === "whatsapp" ? waUnread : 0;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={cn("relative inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
            <Icon className="h-4 w-4" /> {t.label}
            {badge > 0 && (
              <Badge className="ml-1 h-5 min-w-5 px-1 text-[10px] animate-pulse" variant={active ? "secondary" : "destructive"}>{badge}</Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Reusable ---------- */
function Card({ children, className }: any) {
  return <div className={cn("rounded-xl border border-border bg-card p-4", className)}>{children}</div>;
}
function Stat({ icon: Icon, label, value, hint }: any) {
  return (
    <Card className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="h-5 w-5" /></div>
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
    </Card>
  );
}

/* ---------- Onboarding ---------- */
function OnboardingChecklist() {
  const [done, setDone] = useLS<Record<string, boolean>>("omni-onboarding", {});
  const items = [
    { id: "wa", label: "Conectar WhatsApp" },
    { id: "cmd", label: "Criar primeiro comando" },
    { id: "approve", label: "Aprovar primeira ação" },
    { id: "auto", label: "Configurar uma automação" },
  ];
  const completed = items.filter(i => done[i.id]).length;
  if (completed === items.length) return null;
  return (
    <Card className="bg-gradient-to-br from-primary/10 to-accent/40">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-semibold">Comece em 4 passos</h3>
          <p className="text-xs text-muted-foreground">{completed}/{items.length} concluídos</p>
        </div>
        <Progress value={(completed / items.length) * 100} className="w-32" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(it => (
          <button key={it.id} onClick={() => setDone({ ...done, [it.id]: !done[it.id] })}
            className={cn("flex items-center gap-2 rounded-md border border-border p-2 text-sm text-left transition-colors hover:bg-accent",
              done[it.id] && "opacity-60")}>
            <div className={cn("h-4 w-4 rounded border border-border flex items-center justify-center", done[it.id] && "bg-primary border-primary")}>
              {done[it.id] && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            <span className={cn(done[it.id] && "line-through")}>{it.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---------- Overview ---------- */
function OverviewTab({ stats, feed, setFeed, onDetails, onSimulate, logAudit, pushToInbox, now, onlineSince, agentOnline }: any) {
  const [suggestions, setSuggestions] = useState([
    { id: "s1", icon: Inbox, title: "Revisar pendências de aprovação", hint: "4 itens aguardando aprovação na Inbox IA" },
    { id: "s2", icon: Package, title: "Conferir estoque baixo", hint: "Películas e cabos abaixo do mínimo" },
    { id: "s3", icon: Wallet, title: "Cobrar clientes vencidos", hint: "3 clientes com pagamento em atraso" },
  ]);

  // synthetic chart data: 24 hours
  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => Math.floor(2 + Math.sin(h / 3) * 4 + Math.random() * 5)), []);
  const maxH = Math.max(...hours, 1);
  const points = hours.map((v, i) => `${(i / 23) * 100},${100 - (v / maxH) * 100}`).join(" ");
  const heatmap = useMemo(() => Array.from({ length: 7 }, () => Math.random()), []);

  const uptimeMin = Math.floor((now - onlineSince) / 60000);
  const uptimeStr = agentOnline ? `${Math.floor(uptimeMin / 60)}h ${uptimeMin % 60}min` : "—";

  return (
    <div className="space-y-6">
      <OnboardingChecklist />

      <Card className="bg-gradient-to-br from-primary/10 to-accent/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold">Omni Agent HUB</h2>
            <p className="text-sm text-muted-foreground">Controle sua operação por WhatsApp, voz e IA.</p>
          </div>
          <Button onClick={onSimulate}><Sparkles /> Simular agora</Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={MessageCircle} label="Comandos hoje" value={stats.received} hint="+12 vs ontem" />
        <Stat icon={Check} label="Ações executadas" value={stats.executed} hint="auto + manual" />
        <Stat icon={Bell} label="Pendências IA" value={stats.pending} hint="aguardando aprovação" />
        <Stat icon={BarChart3} label="Acerto da IA" value={`${stats.accuracy}%`} hint={`Uptime ${uptimeStr}`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Comandos por hora</h3>
            <Badge variant="secondary">24h</Badge>
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-32 w-full">
            <polyline fill="none" stroke="var(--primary)" strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
            <polyline fill="color-mix(in oklab, var(--primary) 18%, transparent)" stroke="none" points={`0,100 ${points} 100,100`} />
          </svg>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>00h</span><span>12h</span><span>23h</span></div>
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Mapa de calor (semana)</h3>
          <div className="grid grid-cols-7 gap-1">
            {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
              <div key={i} className="text-center">
                <div className="text-[10px] text-muted-foreground mb-1">{d}</div>
                <div className="h-12 rounded" style={{ backgroundColor: `color-mix(in oklab, var(--primary) ${15 + heatmap[i] * 70}%, transparent)` }} title={`${Math.floor(heatmap[i] * 100)} comandos`} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>menos uso</span><span>mais uso</span>
          </div>
        </Card>
      </div>

      {feed[0] && (
        <Card className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Último comando executado</div>
            <div className="font-medium truncate">{feed[0].text}</div>
            <div className="text-xs text-muted-foreground">{relTime(feed[0].ts)}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onDetails(feed[0])}><Eye /> Ver</Button>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /><h3 className="font-semibold">Próximas ações sugeridas pela IA</h3></div>
        <div className="grid gap-2 md:grid-cols-3">
          {suggestions.map(s => {
            const I = s.icon;
            return (
              <div key={s.id} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-start gap-2">
                  <I className="h-4 w-4 mt-0.5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{s.hint}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => { pushToInbox(s.title); logAudit(`Sugestão: ${s.title}`); setSuggestions(p => p.filter(x => x.id !== s.id)); toast.success("Ação criada"); }}><Play /> Executar</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSuggestions(p => p.filter(x => x.id !== s.id)); toast("Ignorada"); }}><X /> Ignorar</Button>
                </div>
              </div>
            );
          })}
          {suggestions.length === 0 && <div className="text-sm text-muted-foreground md:col-span-3">Nenhuma sugestão pendente.</div>}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Comandos recentes</h3>
          <Button variant="ghost" size="sm" onClick={onSimulate}><RefreshCw /> Simular</Button>
        </div>
        <div className="space-y-2">
          {feed.slice(0, 8).map((c: Cmd) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 p-3 transition-colors hover:bg-accent/40">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{c.text}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{c.category}</Badge>
                  <span>{c.module}</span><span>· {c.time}</span><span>· {(c.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
              <Badge variant={c.status === "executado" || c.status === "aprovado" ? "default" : "secondary"}>{c.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => onDetails(c)}><Eye /> Detalhes</Button>
              <Button size="sm" variant="ghost" onClick={() => {
                const dup: Cmd = { ...c, id: uid(), time: nowTime(), ts: Date.now(), status: "pendente" };
                setFeed((p: Cmd[]) => [dup, ...p]); toast.success("Reexecutado");
              }}><RefreshCw /> Reexecutar</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Inbox ---------- */
const FIELDS_BY_MODULE: Record<string, string[]> = {
  Financeiro: ["descrição", "valor", "categoria", "carteira", "pagamento", "data", "observação"],
  OS: ["cliente", "aparelho", "defeito", "prioridade", "status", "observação"],
  Vendas: ["produto", "valor", "quantidade", "pagamento", "cliente", "observação"],
  Lembretes: ["pessoa", "descrição", "data", "prioridade", "observação"],
  Estoque: ["produto", "quantidade", "custoUnit", "observação"],
  Relatórios: ["pergunta", "observação"],
  Geral: ["texto", "observação"],
  Clientes: ["nome", "observação"],
};

function InboxTab({ items, setItems, logAudit }: { items: InboxItem[]; setItems: any; logAudit: (m: string) => void }) {
  const [editing, setEditing] = useState<InboxItem | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [sort, setSort] = useState<"recent" | "confidence" | "module">("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  function setStatus(id: string, status: InboxItem["status"]) {
    setRemoving(s => new Set(s).add(id));
    setTimeout(() => {
      setItems((prev: InboxItem[]) => prev.map(i => i.id === id ? { ...i, status } : i));
      setRemoving(s => { const n = new Set(s); n.delete(id); return n; });
    }, 200);
    logAudit(`Inbox ${status}: ${id}`);
    toast.success(status === "approved" ? "Aprovado" : "Recusado");
  }
  function bulkApprove() {
    selected.forEach(id => setItems((p: InboxItem[]) => p.map(i => i.id === id ? { ...i, status: "approved" } : i)));
    toast.success(`${selected.size} aprovados`);
    setSelected(new Set());
  }
  function openEdit(it: InboxItem) { setEditing(it); setDraft({ ...it.fields }); }
  function save(approveAfter = false) {
    if (!editing) return;
    setItems((prev: InboxItem[]) => prev.map(p => p.id === editing.id ? {
      ...p, fields: { ...draft },
      desc: `${editing.desc.split(" — ")[0]} — ${Object.values(draft).filter(Boolean).slice(0, 3).join(" / ")}`,
      status: approveAfter ? "approved" : p.status,
    } : p));
    toast.success(approveAfter ? "Salvo e aprovado" : "Edição salva");
    setEditing(null);
  }

  const counts = {
    pending: items.filter(i => i.status === "pending").length,
    approved: items.filter(i => i.status === "approved").length,
    rejected: items.filter(i => i.status === "rejected").length,
  };
  let visible = items.filter(i => filter === "all" || i.status === filter);
  if (sort === "recent") visible = [...visible].sort((a, b) => b.ts - a.ts);
  if (sort === "confidence") visible = [...visible].sort((a, b) => b.confidence - a.confidence);
  if (sort === "module") visible = [...visible].sort((a, b) => a.module.localeCompare(b.module));

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 text-xs">
            {(["all", "pending", "approved", "rejected"] as const).map(f => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f === "all" ? "Todos" : f === "pending" ? "Pendentes" : f === "approved" ? "Aprovados" : "Recusados"}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>{counts.pending} pendentes · {counts.approved} aprovados · {counts.rejected} recusados</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="recent">Mais recente</option>
              <option value="confidence">Maior confiança</option>
              <option value="module">Por módulo</option>
            </select>
            {selected.size > 0 && <Button size="sm" onClick={bulkApprove}><Check /> Aprovar {selected.size}</Button>}
          </div>
        </div>
      </Card>

      {visible.map(i => (
        <Card key={i.id} className={cn("transition-all", removing.has(i.id) && "opacity-0 -translate-x-4")}>
          <div className="flex flex-wrap items-start gap-3">
            {i.status === "pending" && (
              <input type="checkbox" checked={selected.has(i.id)} onChange={(e) => {
                setSelected(s => { const n = new Set(s); e.target.checked ? n.add(i.id) : n.delete(i.id); return n; });
              }} className="mt-1" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium">{i.desc}</div>
              <div className="mt-1 text-xs text-muted-foreground">Original: "{i.original}"</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{i.module}</Badge>
                <Badge variant="secondary">{(i.confidence * 100).toFixed(0)}%</Badge>
                <Badge variant={i.status === "approved" ? "default" : i.status === "rejected" ? "destructive" : "secondary"}>{i.status}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setStatus(i.id, "approved")} disabled={i.status !== "pending"}><Check /> Aprovar</Button>
              <Button size="sm" variant="outline" onClick={() => openEdit(i)}><Edit3 /> Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "rejected")} disabled={i.status !== "pending"}><X /> Recusar</Button>
            </div>
          </div>
        </Card>
      ))}
      {visible.length === 0 && <Card><div className="text-sm text-muted-foreground">Nenhum item</div></Card>}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar ação interpretada pela IA</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
                <div><span className="text-muted-foreground">Original:</span> "{editing.original}"</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline">Módulo: {editing.module}</Badge>
                  <Badge variant="secondary">{(editing.confidence * 100).toFixed(0)}%</Badge>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(FIELDS_BY_MODULE[editing.module] ?? Object.keys(editing.fields)).map(k => (
                  <div key={k} className="space-y-1">
                    <Label className="capitalize">{k}</Label>
                    {["observação", "descrição", "defeito", "pergunta", "texto"].includes(k)
                      ? <Textarea rows={2} value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                      : <Input value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />}
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="outline" onClick={() => save(false)}><Save /> Salvar</Button>
            <Button onClick={() => save(true)}><Check /> Salvar e aprovar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- New Command Modal ---------- */
function NewCommandModal({ open, onClose, onSendInbox, onExecute }: { open: boolean; onClose: () => void; onSendInbox: (t: string) => void; onExecute: (t: string) => void }) {
  const [channel, setChannel] = useState<"texto" | "whatsapp" | "voz">("texto");
  const [text, setText] = useState("");
  const [client, setClient] = useState("");
  const [moduleHint, setModuleHint] = useState<string>("auto");
  const [result, setResult] = useState<ReturnType<typeof interpret> | null>(null);
  function reset() { setText(""); setClient(""); setResult(null); setModuleHint("auto"); setChannel("texto"); }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo comando</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="mb-1 block">Canal</Label>
            <div className="flex flex-wrap gap-2">
              {([["texto", "Texto interno"], ["whatsapp", "WhatsApp mock"], ["voz", "Voz mock"]] as const).map(([v, l]) => (
                <Button key={v} size="sm" variant={channel === v ? "default" : "outline"} onClick={() => setChannel(v)}>{l}</Button>
              ))}
            </div>
          </div>
          <div><Label className="mb-1 block">Comando</Label>
            <Textarea rows={3} placeholder='Ex: "vendi 2 películas R$ 80 pix"' value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="mb-1 block">Cliente</Label><Input value={client} onChange={(e) => setClient(e.target.value)} /></div>
            <div><Label className="mb-1 block">Módulo</Label>
              <select value={moduleHint} onChange={(e) => setModuleHint(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {["auto", "Financeiro", "Vendas", "OS", "Estoque", "Clientes", "Lembretes", "Relatórios"].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={() => {
            if (!text.trim()) return toast.error("Digite um comando");
            const r = interpret(text); if (moduleHint !== "auto") r.module = moduleHint as ModuleId;
            setResult(r); toast.success("Interpretado");
          }}><Brain /> Interpretar</Button>
          {result && (
            <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{result.module}</Badge>
                <Badge variant="secondary">{(result.confidence * 100).toFixed(0)}%</Badge>
                <Badge>{result.action}</Badge>
              </div>
              <div className="text-xs grid gap-1 sm:grid-cols-2">
                {Object.entries(result.fields).map(([k, v]) => (
                  <div key={k}><span className="text-muted-foreground capitalize">{k}:</span> <span className="font-medium">{v || "—"}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button variant="outline" onClick={() => { if (!text.trim()) return toast.error("Digite"); onSendInbox(text.trim()); reset(); onClose(); }}><Inbox /> Inbox</Button>
          <Button onClick={() => { if (!text.trim()) return toast.error("Digite"); onExecute(text.trim()); reset(); onClose(); }}><Play /> Executar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- WhatsApp ---------- */
type ChatMsg = { from: "cliente" | "agente"; text: string; status?: "sent" | "delivered" | "read" };
function WhatsAppTab({ onTest, pushToInbox, bumpUnread }: { onTest: (t: string) => void; pushToInbox: (t: string) => any; bumpUnread: () => void }) {
  const [connected, setConnected] = useState(true);
  const [chat, setChat] = useState<ChatMsg[]>([
    { from: "cliente", text: "vendi capa por R$ 30 no pix" },
    { from: "agente", text: "Entendi. Deseja registrar essa venda?", status: "read" },
  ]);
  const [typing, setTyping] = useState(false);
  const [humanMode, setHumanMode] = useState(false);
  const number = "+55 11 98888-7777";

  async function copy() { try { await navigator.clipboard.writeText(number); toast.success("Copiado"); } catch { toast("Copiado"); } }

  function simIncoming() {
    const msgs = ["gastei 50 em uber", "abrir OS Moto G defeito carga", "vendi película R$ 40 pix", "lembrar de ligar Ana"];
    const t = msgs[Math.floor(Math.random() * msgs.length)];
    setChat(c => [...c, { from: "cliente", text: t }]);
    pushToInbox(t); bumpUnread(); beep();
    toast.success(`Nova mensagem: "${t}"`);
    if (!humanMode) {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setChat(c => [...c, { from: "agente", text: "Recebido. Vou registrar para sua aprovação.", status: "sent" }]);
        setTimeout(() => setChat(c => c.map((m, i) => i === c.length - 1 ? { ...m, status: "delivered" } : m)), 800);
        setTimeout(() => setChat(c => c.map((m, i) => i === c.length - 1 ? { ...m, status: "read" } : m)), 1800);
      }, 1200);
    }
  }

  const recentChats = [
    { name: "João Silva", last: "iPhone 12 sem áudio", time: "09:24", unread: 2 },
    { name: "Maria Souza", last: "Quanto pago?", time: "ontem", unread: 0 },
    { name: "Carlos R.", last: "Obrigado!", time: "2d", unread: 0 },
    { name: "Ana M.", last: "Pode entregar amanhã?", time: "3d", unread: 1 },
    { name: "Pedro L.", last: "Recebi o produto", time: "4d", unread: 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Phone} label="Conexão" value={connected ? "Ativa" : "Off"} />
        <Stat icon={MessageCircle} label="Mensagens hoje" value={chat.filter(c => c.from === "cliente").length + 8} />
        <Stat icon={Brain} label="Interpretadas" value={chat.filter(c => c.from === "cliente").length + 5} />
        <Stat icon={Bell} label="Pendências" value={3} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-32 w-32 items-center justify-center rounded-lg border-2 border-dashed border-border bg-accent">
            <QrCode className="h-16 w-16 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Phone className="h-4 w-4 text-primary" />
              <span className="font-mono text-lg">{number}</span>
              <Badge variant={connected ? "default" : "secondary"}>{connected ? "Conectado" : "Desconectado"}</Badge>
              {humanMode && <Badge variant="destructive"><UserCog className="h-3 w-3 mr-1" /> Modo humano</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copy}><Copy /> Copiar número</Button>
              {connected
                ? <Button size="sm" variant="ghost" onClick={() => { setConnected(false); toast("Desconectado"); }}>Desconectar</Button>
                : <Button size="sm" onClick={() => { setConnected(true); toast.success("Conectado"); }}>Conectar</Button>}
              <Button size="sm" onClick={simIncoming}><MessageCircle /> Simular mensagem</Button>
              <Button size="sm" variant={humanMode ? "destructive" : "outline"} onClick={() => { setHumanMode(!humanMode); toast(humanMode ? "Agente reativado" : "Modo humano ativo"); }}>
                <UserCog /> {humanMode ? "Reativar agente" : "Modo humano"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Conversas recentes</h3>
          <div className="space-y-1">
            {recentChats.map(r => (
              <button key={r.name} className="w-full rounded-md p-2 text-left text-sm hover:bg-accent">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{r.name}</span>
                  {r.unread > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px]">{r.unread}</Badge>}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="truncate">{r.last}</span><span>{r.time}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Conversa ativa</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {chat.map((m, i) => (
              <div key={i} className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                m.from === "cliente" ? "bg-muted rounded-bl-sm" : "ml-auto bg-primary text-primary-foreground rounded-br-sm")}>
                {m.text}
                {m.from === "agente" && m.status && (
                  <div className="mt-1 flex justify-end items-center gap-1 text-[10px] opacity-80">
                    {m.status === "sent" && <Check className="h-3 w-3" />}
                    {m.status === "delivered" && <CheckCheck className="h-3 w-3" />}
                    {m.status === "read" && <CheckCheck className="h-3 w-3 text-blue-300" />}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className="ml-auto bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2 text-sm w-16 inline-flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:0.3s]" />
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { t: "Financeiro", e: "gastei 50 em uber" },
          { t: "Vendas", e: "vendi capa R$ 30 pix" },
          { t: "OS", e: "abrir OS Moto G defeito carga" },
        ].map(c => (
          <Card key={c.t}>
            <div className="font-semibold">{c.t}</div>
            <div className="mt-1 text-xs text-muted-foreground">"{c.e}"</div>
            <Button size="sm" className="mt-3" variant="outline" onClick={() => onTest(c.e)}><Play /> Testar</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- Commands ---------- */
type CmdDef = { name: string; example: string; result: string };
const COMMAND_GROUPS: { cat: string; items: CmdDef[] }[] = [
  { cat: "Financeiro", items: [
    { name: "Registrar despesa", example: "gastei R$ 120 em combustível no dinheiro", result: "Cria despesa categorizada" },
    { name: "Criar conta a receber", example: "João vai pagar R$ 280 sexta-feira", result: "Cria recebimento previsto" },
  ]},
  { cat: "Vendas", items: [{ name: "Registrar venda", example: "vendi película por R$ 40 no Pix", result: "Registra venda" }] },
  { cat: "OS", items: [{ name: "Abrir OS", example: "cliente João trouxe iPhone 12 sem áudio", result: "Cria pré-OS" }] },
  { cat: "Estoque", items: [{ name: "Entrada de estoque", example: "comprei 10 capas por R$ 8 cada", result: "Adiciona entrada" }] },
  { cat: "Clientes", items: [{ name: "Cadastrar cliente", example: "cadastrar cliente Pedro 9999-9999", result: "Cria cliente" }] },
  { cat: "Lembretes", items: [{ name: "Criar cobrança", example: "lembrar de cobrar Maria amanhã", result: "Cria lembrete" }] },
];

function CommandsTab({ onSimulate }: { onSimulate: (t: string) => void }) {
  const [favs, setFavs] = useLS<string[]>("omni-favs", []);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("Todos");
  const [showFavs, setShowFavs] = useState(false);
  const cats = ["Todos", ...COMMAND_GROUPS.map(g => g.cat)];

  function toggleFav(k: string) {
    const has = favs.includes(k);
    setFavs(has ? favs.filter(f => f !== k) : [...favs, k]);
    toast(has ? "Removido dos favoritos" : "Favoritado");
  }

  const groups = COMMAND_GROUPS
    .filter(g => cat === "Todos" || g.cat === cat)
    .map(g => ({ ...g, items: g.items.filter(it => {
      const k = `${g.cat}:${it.name}`;
      if (showFavs && !favs.includes(k)) return false;
      const q = search.toLowerCase();
      return !q || it.name.toLowerCase().includes(q) || it.example.toLowerCase().includes(q);
    })}))
    .filter(g => g.items.length > 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar comando…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={showFavs ? "default" : "outline"} size="sm" onClick={() => setShowFavs(!showFavs)}>
            <Star /> Favoritos <Badge variant="secondary" className="ml-1">{favs.length}</Badge>
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {cats.map(c => (
            <Button key={c} size="sm" variant={cat === c ? "default" : "outline"} onClick={() => setCat(c)}>{c}</Button>
          ))}
        </div>
      </Card>

      {groups.map(g => (
        <Card key={g.cat}>
          <h3 className="mb-3 font-semibold">{g.cat}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.items.map(it => {
              const k = `${g.cat}:${it.name}`;
              const fav = favs.includes(k);
              return (
                <div key={k} className="rounded-lg border border-border p-3 space-y-2 transition-colors hover:bg-accent/40">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium flex items-center gap-2">{it.name}{fav && <Star className="h-3 w-3 fill-primary text-primary" />}</div>
                      <div className="mt-1 text-xs text-muted-foreground">"{it.example}"</div>
                      <div className="mt-1 text-xs text-muted-foreground italic">→ {it.result}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => onSimulate(it.example)}><Play /> Simular</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleFav(k)}>
                      <Star className={cn("h-4 w-4", fav && "fill-primary text-primary")} /> Favoritar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      {groups.length === 0 && <Card><div className="text-sm text-muted-foreground">Nenhum comando encontrado.</div></Card>}
    </div>
  );
}

/* ---------- Automations ---------- */
type Rule = { id: string; name: string; trigger: string; condition: string; action: string; module: string; active: boolean; runs: number; lastRun: string; logs: string[] };
function AutomationsTab({ logAudit }: { logAudit: (m: string) => void }) {
  const [rules, setRules] = useState<Rule[]>([
    { id: "r1", name: "Venda Pix → Financeiro", trigger: "Nova venda", condition: "pagamento = Pix", action: "Lançar no financeiro", module: "Vendas", active: true, runs: 124, lastRun: "10:01", logs: ["10:01 · executou para venda #482"] },
    { id: "r2", name: "OS entregue → Receber", trigger: "OS muda status", condition: "status = entregue", action: "Criar conta a receber", module: "OS", active: true, runs: 47, lastRun: "09:30", logs: ["09:30 · OS #102 entregue"] },
    { id: "r3", name: "Estoque baixo → Alerta", trigger: "Estoque mudou", condition: "qtd < mínimo", action: "Notificar dono", module: "Estoque", active: false, runs: 12, lastRun: "ontem", logs: [] },
    { id: "r4", name: "Inadimplente → Lembrete", trigger: "Recebimento vencido", condition: "atraso > 3 dias", action: "Criar lembrete", module: "Clientes", active: true, runs: 8, lastRun: "08:10", logs: [] },
  ]);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [logFor, setLogFor] = useState<Rule | null>(null);
  const [draft, setDraft] = useState<Rule | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [moduleFilter, setModuleFilter] = useState<string>("Todos");
  const [creating, setCreating] = useState(false);

  function update(id: string, fn: (r: Rule) => Rule) { setRules(p => p.map(x => x.id === id ? fn(x) : x)); }
  const maxRuns = Math.max(...rules.map(r => r.runs), 1);
  const modules = ["Todos", ...Array.from(new Set(rules.map(r => r.module)))];
  const visible = rules.filter(r => (filter === "all" || (filter === "active" ? r.active : !r.active)) && (moduleFilter === "Todos" || r.module === moduleFilter));

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "active", "inactive"] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "Todas" : f === "active" ? "Ativas" : "Inativas"}
            </Button>
          ))}
          <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
            {modules.map(m => <option key={m}>{m}</option>)}
          </select>
          <Button size="sm" className="ml-auto" onClick={() => { setDraft({ id: uid(), name: "", trigger: "", condition: "", action: "", module: "Vendas", active: true, runs: 0, lastRun: "—", logs: [] }); setCreating(true); }}><Plus /> Nova automação</Button>
        </div>
      </Card>

      {visible.map(r => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-start gap-3">
            <GripVertical className="h-5 w-5 text-muted-foreground mt-1 cursor-grab" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="font-medium">{r.name}</div>
              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                <div><span className="font-medium text-foreground">Gatilho:</span> {r.trigger}</div>
                <div><span className="font-medium text-foreground">Condição:</span> {r.condition}</div>
                <div><span className="font-medium text-foreground">Ação:</span> {r.action}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{r.module}</Badge>
                <Badge variant="secondary">{r.runs} execuções</Badge>
                <Badge>{r.active ? "ativo" : "inativo"}</Badge>
                <div className="flex items-center gap-2 ml-2 flex-1 max-w-[180px]">
                  <div className="h-1.5 flex-1 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(r.runs / maxRuns) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { update(r.id, x => ({ ...x, active: !x.active })); toast(r.active ? "Desativada" : "Ativada"); }}>{r.active ? "Desativar" : "Ativar"}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setDraft({ ...r }); }}><Edit3 /> Editar</Button>
              <Button size="sm" onClick={() => {
                const log = `${nowTime()} · teste manual`;
                update(r.id, x => ({ ...x, runs: x.runs + 1, lastRun: nowTime(), logs: [log, ...x.logs] }));
                logAudit(`Regra "${r.name}" testada`); toast.success("Teste OK");
              }}><Play /> Testar</Button>
              <Button size="sm" variant="outline" onClick={() => setLogFor(r)}><FileText /> Log</Button>
            </div>
          </div>
        </Card>
      ))}

      <Dialog open={!!editing || creating} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{creating ? "Nova automação" : "Editar regra"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Módulo</Label>
                  <select value={draft.module} onChange={(e) => setDraft({ ...draft, module: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                    {["Vendas", "OS", "Financeiro", "Estoque", "Clientes", "Lembretes"].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex items-end justify-between"><Label>Ativa</Label><Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} /></div>
              </div>
              <div><Label>Gatilho</Label><Input value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value })} /></div>
              <div><Label>Condição</Label><Input value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value })} /></div>
              <div><Label>Ação</Label><Input value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} /></div>
              <div className="rounded-lg border border-border bg-muted p-3 text-xs">
                <div className="font-medium mb-1">Preview</div>
                Quando <span className="font-medium">{draft.trigger || "—"}</span> e <span className="font-medium">{draft.condition || "—"}</span> → <span className="font-medium">{draft.action || "—"}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setCreating(false); }}>Cancelar</Button>
            <Button onClick={() => {
              if (!draft) return;
              if (creating) { setRules(p => [draft, ...p]); toast.success("Automação criada"); }
              else if (editing) { update(editing.id, () => draft); toast.success("Regra salva"); }
              setEditing(null); setCreating(false);
            }}><Save /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log — {logFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {(logFor?.logs ?? []).length === 0 && <div className="text-sm text-muted-foreground">Sem execuções</div>}
            {logFor?.logs.map((l, i) => <div key={i} className="rounded bg-muted px-2 py-1 text-xs">{l}</div>)}
          </div>
          <DialogFooter><Button onClick={() => setLogFor(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Memory ---------- */
type Client = {
  id: string; name: string; score: number; total: number; osCount: number; lastInteraction: string;
  buys: string[]; os: string[]; msgs: string[]; prefs: string[]; pendings: string[]; notes: string[];
  timeline: { time: string; text: string; type: "venda" | "os" | "msg" | "lembrete" }[];
  inadimplente: boolean;
};
function MemoryTab({ logAudit }: { logAudit: (m: string) => void }) {
  const [extraNotes, setExtraNotes] = useLS<Record<string, string[]>>("omni-notes", {});
  const baseClients: Client[] = [
    { id: "k1", name: "João Silva", score: 92, total: 1240, osCount: 3, lastInteraction: "hoje 09:24", buys: ["Película R$ 40", "Capa R$ 35"], os: ["iPhone 12 - sem áudio"], msgs: ["Quando fica pronto?"], prefs: ["WhatsApp", "Pix"], pendings: ["Pagar OS #102"], notes: ["Cliente pontual"], timeline: [{ time: "09:24", text: "Trouxe iPhone 12", type: "os" }, { time: "ontem", text: "Comprou película", type: "venda" }, { time: "3d", text: "Mensagem WhatsApp", type: "msg" }], inadimplente: false },
    { id: "k2", name: "Maria Souza", score: 48, total: 320, osCount: 0, lastInteraction: "ontem", buys: ["Cabo USB R$ 25"], os: [], msgs: ["Boa tarde!"], prefs: ["Pix"], pendings: ["Cobrar R$ 120"], notes: [], timeline: [{ time: "ontem", text: "Mensagem recebida", type: "msg" }], inadimplente: true },
    { id: "k3", name: "Rafael Cell", score: 88, total: 2400, osCount: 12, lastInteraction: "2 dias", buys: [], os: ["Moto G - tela"], msgs: [], prefs: ["Ligação"], pendings: [], notes: ["Revendedor"], timeline: [], inadimplente: false },
  ];
  const [clients, setClients] = useState<Client[]>(baseClients);
  const [sel, setSel] = useState("k1");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const c = clients.find(x => x.id === sel)!;
  const allNotes = [...c.notes, ...(extraNotes[c.id] ?? [])];

  function update(fn: (c: Client) => Client) { setClients(prev => prev.map(x => x.id === sel ? fn(x) : x)); }

  const summary = `${c.name} é um cliente com score ${c.score}/100, total comprado de R$ ${c.total.toLocaleString("pt-BR")}, ${c.osCount} OS realizadas. Prefere ${c.prefs.join(", ") || "—"}. Última interação: ${c.lastInteraction}. ${c.pendings.length ? `Possui ${c.pendings.length} pendência(s).` : "Sem pendências."}`;

  const scoreColor = c.score >= 80 ? "bg-primary" : c.score >= 50 ? "bg-yellow-500" : "bg-destructive";
  const prefColor = (p: string) => /pix/i.test(p) ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" : /whats/i.test(p) ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" : /lig/i.test(p) ? "bg-blue-500/20 text-blue-700 dark:text-blue-400" : "bg-muted";
  const typeIcon = (t: string) => t === "venda" ? ShoppingCart : t === "os" ? Wrench : t === "lembrete" ? Bell : MessageCircle;

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <Card>
        <div className="space-y-1">
          {clients.map(cl => (
            <button key={cl.id} onClick={() => setSel(cl.id)}
              className={cn("w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                sel === cl.id ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              <div className="font-medium flex items-center gap-1">{cl.name}{cl.inadimplente && <AlertTriangle className="h-3 w-3 text-destructive" />}</div>
              <div className="text-[10px] opacity-70">Score {cl.score}</div>
            </button>
          ))}
        </div>
      </Card>
      <div className="space-y-3 min-w-0">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {c.name}
                {c.inadimplente && <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Inadimplente</Badge>}
              </h3>
              <div className="text-xs text-muted-foreground">Última: {c.lastInteraction}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}><Plus /> Nota</Button>
              <Button size="sm" variant="outline" onClick={() => { update(x => ({ ...x, pendings: [...x.pendings, `Lembrete em ${nowTime()}`] })); logAudit(`Lembrete p/ ${c.name}`); toast.success("Adicionado"); }}><Bell /> Lembrete</Button>
              <Button size="sm" onClick={() => setSummaryOpen(true)}><Brain /> Resumo IA</Button>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Score do cliente</span><span className="font-medium">{c.score}/100</span></div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full transition-all", scoreColor)} style={{ width: `${c.score}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat icon={TrendingUp} label="Score" value={c.score} />
              <Stat icon={Wallet} label="Total" value={`R$ ${c.total}`} />
              <Stat icon={Wrench} label="OS" value={c.osCount} />
              <Stat icon={Bell} label="Pendências" value={c.pendings.length} />
            </div>
            <div className="flex flex-wrap gap-1">
              {c.prefs.map(p => <span key={p} className={cn("rounded-full px-2 py-0.5 text-xs", prefColor(p))}>{p}</span>)}
            </div>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          <ClientList title="Últimas compras" items={c.buys} />
          <ClientList title="Últimas OS" items={c.os} />
          <ClientList title="Pendências" items={c.pendings} />
          <ClientList title="Notas" items={allNotes} />
        </div>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Timeline</div>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>{expanded ? "Recolher" : "Ver histórico completo"}</Button>
          </div>
          {c.timeline.length === 0 ? <div className="text-xs text-muted-foreground">Sem interações</div> : (
            <ol className="relative border-l border-border pl-4 space-y-3">
              {(expanded ? c.timeline : c.timeline.slice(0, 3)).map((t, i) => {
                const I = typeIcon(t.type);
                return (
                  <li key={i} className="relative">
                    <span className="absolute -left-[1.4rem] flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><I className="h-3 w-3" /></span>
                    <div className="text-sm">{t.text}</div>
                    <div className="text-[10px] text-muted-foreground">{t.time}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar nota</DialogTitle></DialogHeader>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Ex: cliente prefere atendimento à tarde" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!noteText.trim()) return toast.error("Digite");
              setExtraNotes({ ...extraNotes, [c.id]: [...(extraNotes[c.id] ?? []), noteText.trim()] });
              setNoteText(""); setNoteOpen(false); toast.success("Salva");
            }}><Save /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resumo IA — {c.name}</DialogTitle></DialogHeader>
          <div className="rounded-lg border border-border bg-muted p-3 text-sm">{summary}</div>
          <DialogFooter>
            <Button onClick={() => setSummaryOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ClientList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {items.length === 0 ? <div className="text-xs text-muted-foreground">Nenhum</div> : (
        <ul className="space-y-1 text-sm">
          {items.map((i, idx) => <li key={idx} className="rounded bg-background/40 px-2 py-1">{i}</li>)}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Reports ---------- */
type ReportMsg = { q: string; answer: string; metrics: { label: string; value: string }[]; bars: { label: string; value: number }[]; insight: string };
function ReportsTab({ pushToInbox, logAudit }: { pushToInbox: (t: string) => any; logAudit: (m: string) => void }) {
  const examples = ["Quanto vendi hoje?", "Quais clientes estão devendo?", "Qual técnico tem mais OS?", "Quais produtos estão parados?"];
  const [history, setHistory] = useState<ReportMsg[]>([]);
  const [text, setText] = useState("");

  const week = useMemo(() => [320, 180, 410, 260, 380, 150, 140], []);
  const maxW = Math.max(...week);
  const days = ["S", "T", "Q", "Q", "S", "S", "D"];

  function build(q: string): ReportMsg {
    const total = 800 + Math.floor(Math.random() * 800);
    const qty = 10 + Math.floor(Math.random() * 20);
    return {
      q, answer: `Hoje você vendeu R$ ${total.toLocaleString("pt-BR")},00 em ${qty} vendas. Pix foi a forma mais usada.`,
      metrics: [
        { label: "Total vendido", value: `R$ ${total}` },
        { label: "Vendas", value: String(qty) },
        { label: "Ticket médio", value: `R$ ${(total / qty).toFixed(0)}` },
        { label: "Forma principal", value: "Pix" },
      ],
      bars: [
        { label: "Pix", value: 60 + Math.random() * 30 },
        { label: "Dinheiro", value: 30 + Math.random() * 30 },
        { label: "Cartão", value: 20 + Math.random() * 30 },
      ],
      insight: "Seu ticket médio subiu 12% comparado ao período anterior.",
    };
  }
  function ask(q: string) { if (!q.trim()) return; setHistory(h => [...h, build(q)]); setText(""); }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={TrendingUp} label="Vendas da semana" value="R$ 1.840" hint="+18%" />
        <Stat icon={Wallet} label="Ticket médio" value="R$ 58" hint="+12%" />
        <Stat icon={Wrench} label="OS abertas" value="12" hint="3 críticas" />
        <Stat icon={AlertTriangle} label="Inadimplência" value="R$ 450" hint="2 clientes" />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Vendas — últimos 7 dias</h3>
          <Badge variant="secondary">Mock</Badge>
        </div>
        <div className="flex items-end gap-2" style={{ height: 128 }}>
          {week.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary cursor-default"
                style={{ height: Math.max(4, Math.round((v / maxW) * 112)) }}
                title={`R$ ${v}`}
              />
              <span className="text-[10px] text-muted-foreground">{days[i]}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap gap-2">
          <Input className="flex-1 min-w-[200px]" placeholder="Pergunte algo ao seu negócio…" value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(text)} />
          <Button onClick={() => ask(text)}><Send /> Perguntar</Button>
          <Button variant="ghost" onClick={() => { setHistory([]); toast("Histórico limpo"); }}><Trash2 /> Limpar</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map(e => <Button key={e} variant="outline" size="sm" onClick={() => ask(e)}>{e}</Button>)}
        </div>
      </Card>

      {history.length === 0 && (
        <Card><div className="text-sm text-muted-foreground text-center py-6">Faça uma pergunta para gerar análise</div></Card>
      )}

      <div className="space-y-3">
        {history.map((m, i) => (
          <Card key={i} className="space-y-3">
            <div className="text-sm"><span className="text-muted-foreground">Você:</span> {m.q}</div>
            <div className="rounded-lg bg-muted p-3 text-sm">{m.answer}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {m.metrics.map(mm => (
                <div key={mm.label} className="rounded-lg border border-border bg-background/40 p-2">
                  <div className="text-[10px] text-muted-foreground">{mm.label}</div>
                  <div className="text-sm font-semibold">{mm.value}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {m.bars.map(b => (
                <div key={b.label} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-muted-foreground">{b.label}</span>
                  <div className="h-3 flex-1 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${b.value}%` }} /></div>
                  <span className="w-10 text-right">{b.value.toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-accent/30 p-3 text-sm">
              <Lightbulb className="h-4 w-4 mt-0.5 text-primary" /><div className="flex-1">{m.insight}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { logAudit(`Insight: ${m.q}`); toast.success("Salvo"); }}><Save /> Salvar</Button>
              <Button size="sm" onClick={() => { pushToInbox(`Ação a partir de relatório: ${m.q}`); toast.success("Ação na Inbox"); }}><Zap /> Gerar ação</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- Settings ---------- */
const DEFAULT_SETTINGS = {
  channel: "whatsapp",
  autoApprove: false,
  autonomy: "medio",
  perms: { financeiro: true, vendas: true, os: true, estoque: true, clientes: true, relatorios: true },
  agentName: "Omni",
  tone: "consultivo",
  prompt: "Responda de forma clara, objetiva e profissional. Sempre confirme antes de executar ações financeiras.",
  hours: { start: "08:00", end: "18:00", days: ["seg", "ter", "qua", "qui", "sex"] },
  plan: "Ouro",
};
function SettingsTab({ audit }: { audit: string[] }) {
  const [s, setS] = useLS("omni-settings", DEFAULT_SETTINGS);
  const [exportOpen, setExportOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const allDays = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

  function toggleDay(d: string) {
    const days = s.hours.days.includes(d) ? s.hours.days.filter(x => x !== d) : [...s.hours.days, d];
    setS({ ...s, hours: { ...s.hours, days } });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h3 className="mb-3 font-semibold">Canal padrão</h3>
        <div className="flex flex-wrap gap-2">
          {[["whatsapp", "WhatsApp"], ["texto", "Texto"], ["voz", "Voz"]].map(([v, l]) => (
            <Button key={v} variant={s.channel === v ? "default" : "outline"} size="sm" onClick={() => setS({ ...s, channel: v })}>{l}</Button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between"><Label>Aprovação automática</Label>
          <Switch checked={s.autoApprove} onCheckedChange={(v) => setS({ ...s, autoApprove: v })} /></div>
        <div className="mt-4">
          <Label className="mb-2 block">Autonomia</Label>
          <div className="flex gap-2">
            {["baixo", "medio", "alto"].map(a => (
              <Button key={a} variant={s.autonomy === a ? "default" : "outline"} size="sm" onClick={() => setS({ ...s, autonomy: a })}>{a}</Button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Permissões</h3>
        <div className="space-y-2">
          {Object.entries(s.perms).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-md border border-border p-2">
              <span className="text-sm capitalize">{k}</span>
              <Switch checked={v} onCheckedChange={(val) => setS({ ...s, perms: { ...s.perms, [k]: val } })} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Personalidade do agente</h3>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={s.agentName} onChange={(e) => setS({ ...s, agentName: e.target.value })} /></div>
          <div>
            <Label className="mb-2 block">Tom</Label>
            <div className="flex flex-wrap gap-2">
              {["formal", "consultivo", "amigável"].map(t => (
                <Button key={t} size="sm" variant={s.tone === t ? "default" : "outline"} onClick={() => setS({ ...s, tone: t })}>{t}</Button>
              ))}
            </div>
          </div>
          <div><Label>Prompt base</Label>
            <Textarea rows={3} value={s.prompt} onChange={(e) => setS({ ...s, prompt: e.target.value })} /></div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Horário de atendimento</h3>
        <div className="grid gap-3 grid-cols-2">
          <div><Label>Início</Label><Input type="time" value={s.hours.start} onChange={(e) => setS({ ...s, hours: { ...s.hours, start: e.target.value } })} /></div>
          <div><Label>Fim</Label><Input type="time" value={s.hours.end} onChange={(e) => setS({ ...s, hours: { ...s.hours, end: e.target.value } })} /></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {allDays.map(d => (
            <Button key={d} size="sm" variant={s.hours.days.includes(d) ? "default" : "outline"} onClick={() => toggleDay(d)}>{d}</Button>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-border bg-gradient-to-br from-primary/10 to-accent/30 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Plano atual</div>
              <div className="font-semibold flex items-center gap-2">{s.plan} <Badge>Pro</Badge></div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Créditos usados</div>
              <div className="font-semibold">68%</div>
            </div>
          </div>
          <Progress value={68} className="mt-2" />
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Auditoria</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => toast.success("Configurações salvas")}><Save /> Salvar</Button>
            <Button size="sm" variant="outline" onClick={() => { setS(DEFAULT_SETTINGS); toast("Restaurado"); }}><RefreshCw /> Restaurar</Button>
            <Button size="sm" variant="outline" onClick={() => setTestOpen(true)}><Play /> Testar config</Button>
            <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}><Download /> Exportar log</Button>
          </div>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground max-h-72 overflow-y-auto">
          {audit.map((l, i) => <div key={i} className="rounded bg-background/40 px-2 py-1">{l}</div>)}
        </div>
      </Card>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Teste de configuração</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="rounded-lg bg-muted p-3">
              <div className="text-xs text-muted-foreground mb-1">Cliente diz:</div>
              "vendi capa por R$ 30 no pix"
            </div>
            <div className="rounded-lg bg-primary text-primary-foreground p-3">
              <div className="text-xs opacity-80 mb-1">{s.agentName} responde ({s.tone}):</div>
              {s.tone === "formal" ? "Prezado, registrarei a venda de capa no valor de R$ 30,00 via Pix. Confirma?" :
                s.tone === "amigável" ? "Show! Já vou registrar essa venda de capa R$ 30 no Pix 😊 Confirma?" :
                "Identifiquei venda de capa R$ 30 (Pix). Posso registrar?"}
            </div>
          </div>
          <DialogFooter><Button onClick={() => setTestOpen(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log exportado</DialogTitle></DialogHeader>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({ settings: s, audit }, null, 2)}</pre>
          <DialogFooter>
            <Button variant="outline" onClick={async () => {
              try { await navigator.clipboard.writeText(JSON.stringify({ settings: s, audit }, null, 2)); toast.success("Copiado"); } catch { toast("Copiado"); }
            }}><Copy /> Copiar</Button>
            <Button onClick={() => setExportOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Command Palette ---------- */
type PaletteAction = { type: "tab" | "new" | "simulate"; value?: string; label: string; hint: string; icon: any };
function CommandPalette({ open, onClose, onAction }: { open: boolean; onClose: () => void; onAction: (a: PaletteAction) => void }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const actions: PaletteAction[] = [
    { type: "new", label: "Novo comando", hint: "Abrir modal", icon: Plus },
    { type: "simulate", label: "Simular comando", hint: "Gerar mock", icon: Play },
    { type: "tab", value: "inbox", label: "Ir para Inbox IA", hint: "Pendências", icon: Inbox },
    { type: "tab", value: "whatsapp", label: "Ir para WhatsApp Agent", hint: "Conversas", icon: MessageCircle },
    { type: "tab", value: "commands", label: "Ver Comandos IA", hint: "Catálogo", icon: Sparkles },
    { type: "tab", value: "auto", label: "Ver Automações", hint: "Regras", icon: Zap },
    { type: "tab", value: "memory", label: "Ver Memória Cliente", hint: "Clientes", icon: Users },
    { type: "tab", value: "reports", label: "Ver Relatórios IA", hint: "Análises", icon: BarChart3 },
    { type: "tab", value: "settings", label: "Configurações", hint: "Preferências", icon: SettingsIcon },
  ];
  const filtered = actions.filter(a => !q || a.label.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && filtered[idx]) onAction(filtered[idx]);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 max-w-lg">
        <div className="border-b border-border p-3 flex items-center gap-2">
          <CmdIcon className="h-4 w-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey}
            placeholder="Buscar comando, página, ação…" className="flex-1 bg-transparent outline-none text-sm" />
          <kbd className="rounded bg-muted px-1 text-[10px]">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {filtered.map((a, i) => {
            const I = a.icon;
            return (
              <button key={i} onClick={() => onAction(a)} onMouseEnter={() => setIdx(i)}
                className={cn("flex w-full items-center gap-3 rounded-md p-2 text-sm text-left", idx === i && "bg-accent")}>
                <I className="h-4 w-4 text-primary" />
                <span className="flex-1">{a.label}</span>
                <span className="text-xs text-muted-foreground">{a.hint}</span>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">Nenhum resultado</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

