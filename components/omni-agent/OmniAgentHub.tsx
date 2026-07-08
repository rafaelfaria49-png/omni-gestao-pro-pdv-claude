"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Toaster, toast } from "sonner";
import {
  Activity, Bot, Check, X, Play, Plus, Copy, MessageCircle,
  Power, RefreshCw, Sparkles, Star, Send, Trash2, Download, Save,
  Wallet, ShoppingCart, Package, Users, Bell, BarChart3,
  Settings as SettingsIcon, Eye, QrCode, Phone, Zap, Brain, Lightbulb,
  Inbox, Search, Command as CmdIcon, Clock, FileText,
  AlertTriangle, UserCog, Maximize2, Minimize2,
  CheckCircle2, XCircle, Loader2, Circle, Cpu, ChevronRight,
  Archive, Pencil,
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
import { useLojaAtiva } from "@/lib/loja-ativa";
import { interpretOmniAgentCommand } from "@/lib/omni-agent/interpret";
import { listClientes, type ClienteDTO } from "@/app/actions/cadastros";
import {
  submitOmniAgentCommand,
  listOmniAgentCommands,
  getOmniAgentHubStats,
  getOmniAgentWhatsAppCloudStatus,
  getOmniAgentReportsSnapshot,
  type OmniAgentHubStatsDTO,
  type OmniAgentCommandDTO,
  type OmniAgentReportsSnapshotDTO,
  listOmniAgentAutomations,
  createOmniAgentAutomation,
  updateOmniAgentAutomation,
  setOmniAgentAutomationEnabled,
  deleteOmniAgentAutomation,
  listOmniAgentAutomationRuns,
  type OmniAgentAutomationDTO,
  type OmniAgentAutomationRunDTO,
  getOmniAgentConfig,
  upsertOmniAgentConfig,
  resetOmniAgentConfig,
} from "@/app/actions/omni-agent";
import {
  createOmniAgentMemory,
  updateOmniAgentMemory,
  archiveOmniAgentMemory,
  listOmniAgentMemoriesByCliente,
  listRecentOmniAgentMemories,
  searchOmniAgentMemories,
} from "@/app/actions/omni-agent-memory";
import {
  DEFAULT_OMNI_AGENT_CONFIG,
  OMNI_AGENT_TONES,
  OMNI_AGENT_AUTONOMY_LEVELS,
  OMNI_AGENT_WEEK_DAYS,
  OMNI_AGENT_CONFIRMABLE_READ_INTENTS,
  type OmniAgentConfigDTO,
} from "@/lib/omni-agent/config";
import { OMNI_AGENT_MEMORY_TYPES, type OmniAgentMemoryDTO, type OmniAgentMemoryType } from "@/lib/omni-agent/memory";
import type { OmniAgentIntentKind } from "@/lib/omni-agent/types";
import {
  OMNI_AGENT_AUTOMATION_TRIGGERS,
  OMNI_AGENT_TRIGGER_LABELS,
  type OmniAgentAutomationTriggerKey,
} from "@/lib/omni-agent/omni-automation-triggers";
import { canalDisplayLabel, dtoToBellItem, dtoToHubFeedRow, type HubFeedRow } from "@/lib/omni-agent/hub-display";
import { normalizeOmniAgentCanal, type OmniAgentCanal } from "@/lib/omni-agent/canal";
import { OmniAgentInboxReal } from "@/components/omni-agent/OmniAgentInboxReal";

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

const RANDOM_CMDS = [
  "vendi capinha R$ 25 dinheiro",
  "registrar despesa R$ 80 almoço",
  "abrir OS Samsung S20 tela quebrada",
  "lembrar de ligar para Carlos",
  "entrada de 10 películas no estoque",
  "cliente Maria deve R$ 280",
  "qual foi meu faturamento hoje?",
];

/* ---------- localStorage helper ---------- */
function useLS<T>(key: string, def: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    if (typeof window === "undefined") return def;
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

function uid() { return Math.random().toString(36).slice(2, 9); }
function nowTime() { return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function relTime(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return `há ${d}s`;
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)}h`;
  return `há ${Math.floor(d / 86400)}d`;
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
function OmniAgentStoreRequired({ storesLoaded }: { storesLoaded: boolean }) {
  return (
    <Card className="mx-auto max-w-lg border-dashed p-10 text-center space-y-3">
      <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
      <h2 className="text-lg font-semibold">Unidade não selecionada</h2>
      <p className="text-sm text-muted-foreground">
        Selecione a loja no cabeçalho do dashboard antes de enviar comandos ao Omni Agent.
        O pipeline não usa fallback automático para outra unidade.
      </p>
      {!storesLoaded && (
        <p className="text-xs text-muted-foreground">A carregar lista de unidades…</p>
      )}
    </Card>
  );
}

export default function OmniAgentHub() {
  const { lojaAtivaId, storesLoaded } = useLojaAtiva();
  const storeId = (lojaAtivaId ?? "").trim();
  const storeReady = storeId.length > 0;
  const [tab, setTab] = useState<TabId>("overview");
  const [agentOnline, setAgentOnline] = useLS<boolean>("omni-agent-online", true);
  const [compact, setCompact] = useLS<boolean>("omni-compact", false);
  const [feedRows, setFeedRows] = useState<HubFeedRow[]>([]);
  const [hubStats, setHubStats] = useState<OmniAgentHubStatsDTO | null>(null);
  const [audit, setAudit] = useState<string[]>([`${nowTime()} · Sistema iniciado`, `${nowTime()} · Agente online`]);
  const [newCmdOpen, setNewCmdOpen] = useState(false);
  const [details, setDetails] = useState<HubFeedRow | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [floatingOpen, setFloatingOpen] = useState(false);
  const [waUnread, setWaUnread] = useState(0);
  const [now, setNow] = useState(Date.now());
  const onlineSince = useRef(Date.now());

  const refreshHubData = useCallback(async () => {
      if (!storeId?.trim()) return;
      try {
        const [rows, stats] = await Promise.all([
          listOmniAgentCommands(storeId, 80),
          getOmniAgentHubStats(storeId),
        ]);
        setFeedRows(rows.map(dtoToHubFeedRow));
        setHubStats(stats)
      } catch (e) {
        setFeedRows([])
        setHubStats(null)
        toast.error(e instanceof Error ? e.message : "Falha ao carregar dados do Agent")
      }
    }, [storeId])

  useEffect(() => {
    void refreshHubData()
  }, [refreshHubData, tab])

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

  const pendingCount = hubStats ? hubStats.pending + hubStats.awaitingConfirmation : 0;
  const bellPreview = useMemo(() => {
    return feedRows
      .filter((r) => r.dto.status === "PENDENTE" || r.dto.status === "AGUARDANDO_CONFIRMACAO")
      .slice(0, 5)
      .map((r) => dtoToBellItem(r.dto))
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [feedRows]);

  const waTodayCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return feedRows.filter((r) => r.dto.canal === "whatsapp" && new Date(r.dto.createdAt) >= start).length;
  }, [feedRows]);
  const waAllCount = useMemo(() => feedRows.filter((r) => r.dto.canal === "whatsapp").length, [feedRows]);

  const logAudit = (msg: string) => { setAudit(a => [`${nowTime()} · ${msg}`, ...a].slice(0, 50)); }

  async function enqueueInboxText(text: string) {
    await submitOmniAgentCommand({ storeId, comandoOriginal: text.trim(), mode: "inbox" });
    await refreshHubData();
  }

  async function submitWhatsappOmni(text: string) {
    await submitOmniAgentCommand({
      storeId,
      canal: "whatsapp",
      comandoOriginal: text.trim(),
      mode: "run",
    });
    await refreshHubData();
  }

  async function submitAgentReportQuestion(text: string) {
    await submitOmniAgentCommand({
      storeId,
      canal: "texto_interno",
      comandoOriginal: text.trim(),
      mode: "run",
    });
    await refreshHubData();
  }

  async function simulate() {
    if (!storeReady) {
      toast.error("Selecione uma unidade no cabeçalho do dashboard.")
      return
    }
    const t = RANDOM_CMDS[Math.floor(Math.random() * RANDOM_CMDS.length)];
    try {
      await submitOmniAgentCommand({ storeId, comandoOriginal: t, mode: "run" });
      logAudit(`Comando simulado (pipeline real): "${t}"`);
      await refreshHubData();
      const interp = interpretOmniAgentCommand(t);
      if (interp.confidence < 0.85) toast.warning("Baixa confiança — verifique na Inbox");
      else toast.success("Comando processado no servidor");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na simulação");
    }
  }

  return (
    <div className={cn("min-h-screen w-full bg-background text-foreground", compact && "text-[13px]")}>
      <Toaster position="top-right" theme="system" richColors />
      <Header
        agentOnline={agentOnline}
        setAgentOnline={(v: boolean) => { setAgentOnline(v); if (v) onlineSince.current = Date.now(); logAudit(v ? "Agente ativado" : "Agente pausado"); }}
        onSimulate={simulate}
        onNewCmd={() => setNewCmdOpen(true)}
        notifications={bellPreview}
        pendingCount={pendingCount}
        onGotoInbox={() => setTab("inbox")}
        compact={compact}
        setCompact={setCompact}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className={cn("mx-auto w-full max-w-7xl px-4", compact ? "pb-12" : "pb-16")}>
        {!storeReady ? (
          <div className="mt-10">
            <OmniAgentStoreRequired storesLoaded={storesLoaded} />
          </div>
        ) : (
          <>
        <Tabs current={tab} onChange={(t) => { setTab(t); if (t === "inbox" || t === "whatsapp") setWaUnread(0); }} pendingCount={pendingCount} waUnread={waUnread} />

        <div className="mt-6 min-w-0 animate-fade-in" key={tab}>
          {tab === "overview" && (
            <OverviewTab
              stats={hubStats}
              feed={feedRows}
              onDetails={setDetails}
              onSimulate={simulate}
              onRefresh={() => void refreshHubData()}
              logAudit={logAudit}
              onEnqueueInbox={enqueueInboxText}
              onReexecute={async (row) => {
                try {
                  await submitOmniAgentCommand({ storeId, comandoOriginal: row.text, mode: "run" });
                  logAudit(`Reexecutar: ${row.text}`);
                  await refreshHubData();
                  toast.success("Comando reenviado ao pipeline");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao reenviar");
                }
              }}
              now={now}
              onlineSince={onlineSince.current}
              agentOnline={agentOnline}
            />
          )}
          {tab === "inbox" && (
            <OmniAgentInboxReal storeId={storeId} logAudit={logAudit} onCommandsChanged={refreshHubData} />
          )}
          {tab === "whatsapp" && (
            <WhatsAppTab
              storeId={storeId}
              waTodayCount={waTodayCount}
              waAllCount={waAllCount}
              onSubmitCommand={async (t) => {
                await submitWhatsappOmni(t);
                logAudit(`WhatsApp → Agent: ${t}`);
              }}
              bumpUnread={() => setWaUnread((n) => n + 1)}
            />
          )}
          {tab === "commands" && (
            <CommandsTab
              storeId={storeId}
              onAfterPipeline={async () => {
                await refreshHubData();
              }}
            />
          )}
          {tab === "auto" && (
            <AutomationsTab storeId={storeId} logAudit={logAudit} onInboxMayChange={() => void refreshHubData()} />
          )}
          {tab === "memory" && <MemoryTab storeId={storeId} logAudit={logAudit} />}
          {tab === "reports" && (
            <ReportsTab
              storeId={storeId}
              onSubmitQuestion={async (text) => {
                try {
                  await submitAgentReportQuestion(text);
                  logAudit(`Relatórios IA → pergunta: ${text}`);
                  toast.success("Pergunta enviada ao Agent — veja resultado na Inbox ou feed");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha");
                }
              }}
              onEnqueueFromReport={async (text) => {
                try {
                  await enqueueInboxText(text);
                  toast.success("Comando na Inbox (Prisma)");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha");
                }
              }}
              logAudit={logAudit}
            />
          )}
          {tab === "settings" && <SettingsTab storeId={storeId} audit={audit} logAudit={logAudit} />}
        </div>
          </>
        )}
      </div>

      <NewCommandModal
        open={newCmdOpen && storeReady} onClose={() => setNewCmdOpen(false)}
        storeId={storeId}
        onSendInbox={async (t, canal) => {
          try {
            await submitOmniAgentCommand({ storeId, canal, comandoOriginal: t, mode: "inbox" });
            logAudit(`Inbox real (${canalDisplayLabel(canal)}): ${t}`);
            toast.success("Comando registado (pendente)");
            await refreshHubData();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha ao registar");
          }
        }}
        onExecute={async (t, canal) => {
          try {
            const row = await submitOmniAgentCommand({ storeId, canal, comandoOriginal: t, mode: "run" });
            logAudit(`Pipeline real: ${t} → ${row.status}`);
            toast.success(
              row.status === "EXECUTADO"
                ? "Executado no servidor"
                : row.status === "AGUARDANDO_CONFIRMACAO"
                  ? "Aguardando confirmação na Inbox"
                  : row.status === "PENDENTE"
                    ? "Registado como pendente"
                    : row.status === "ERRO"
                      ? "Registado com erro — ver Inbox"
                      : "Registado",
            );
            await refreshHubData();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha ao executar");
          }
        }}
      />

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalhes do comando</DialogTitle></DialogHeader>
          {details && (
            <div className="space-y-2 text-sm">
              <Row k="Texto" v={details.text} />
              <Row k="Ação" v={details.category} />
              <Row k="Módulo" v={details.module} />
              <Row k="Intenção" v={details.intent} />
              <Row k="Status" v={details.statusLabel} />
              <Row k="Confiança" v={`${(details.confidence * 100).toFixed(0)}%`} />
              <Row k="Horário" v={details.time} />
              <Row k="Canal" v={canalDisplayLabel(details.dto.canal)} />
              <Row k="ID" v={details.id} />
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

      {/* Floating status button */}
      <button
        onClick={() => setFloatingOpen(o => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold shadow-lg ring-2 transition-all hover:scale-105",
          agentOnline
            ? "bg-primary text-primary-foreground ring-primary/30"
            : "bg-muted text-muted-foreground ring-border",
        )}
      >
        {agentOnline
          ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
          : <Zap className="h-3.5 w-3.5" />
        }
        {pendingCount > 0 ? `${pendingCount} pendente${pendingCount > 1 ? "s" : ""}` : agentOnline ? "Online" : "Pausado"}
      </button>
      {floatingOpen && (
        <div className="fixed bottom-20 right-6 z-40 w-72 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold">Status do Agent</span>
            </div>
            <button
              onClick={() => setFloatingOpen(false)}
              className="rounded-md p-1 hover:bg-accent transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Agente</span>
              <div className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                agentOnline
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border bg-muted text-muted-foreground",
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", agentOnline ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
                {agentOnline ? "Online" : "Pausado"}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pendências</span>
              <span className={cn("font-bold tabular-nums", pendingCount > 0 && "text-amber-600 dark:text-amber-400")}>
                {pendingCount}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Último</span>
              <span className="text-xs font-medium">{feedRows[0] ? relTime(feedRows[0].ts) : "—"}</span>
            </div>
            <Button size="sm" className="w-full gap-1.5 mt-1" onClick={() => { setTab("inbox"); setFloatingOpen(false); }}>
              <Inbox className="h-3.5 w-3.5" /> Abrir Inbox IA
            </Button>
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
function Header({
  agentOnline,
  setAgentOnline,
  onSimulate,
  onNewCmd,
  notifications,
  pendingCount,
  onGotoInbox,
  compact,
  setCompact,
  onOpenPalette,
}: {
  agentOnline: boolean;
  setAgentOnline: (v: boolean) => void;
  onSimulate: () => void;
  onNewCmd: () => void;
  notifications: { id: string; desc: string; module: string; confidence: number }[];
  pendingCount: number;
  onGotoInbox: () => void;
  compact: boolean;
  setCompact: (v: boolean | ((p: boolean) => boolean)) => void;
  onOpenPalette: () => void;
}) {
  const [clock, setClock] = useState(nowTime());
  const [bellOpen, setBellOpen] = useState(false);
  useEffect(() => { const id = setInterval(() => setClock(nowTime()), 30000); return () => clearInterval(id); }, []);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">Omni Agent HUB</h1>
            <p className="truncate text-xs text-muted-foreground">Central operacional de IA</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            agentOnline
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-border bg-muted text-muted-foreground",
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", agentOnline ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
            {agentOnline ? "Online" : "Pausado"}
          </div>

          <Badge variant="outline" className="gap-1 hidden sm:inline-flex">
            <Clock className="h-3 w-3" /> {clock}
          </Badge>
          <Badge variant="outline" className="hidden md:inline-flex text-[10px]">Pipeline Prisma · real</Badge>

          <div className="relative">
            <Button variant="outline" size="sm" className="relative h-8 w-8 p-0" onClick={() => setBellOpen(o => !o)}>
              <Bell className="h-3.5 w-3.5" />
              {(pendingCount > 0) && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </Button>
            {bellOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-popover shadow-xl z-50 overflow-hidden">
                <div className="border-b border-border px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">Pendências</span>
                  <span className="text-[10px] text-muted-foreground">{pendingCount} itens</span>
                </div>
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 p-6 text-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500/60" />
                    <div className="text-sm text-muted-foreground">Nenhuma pendência</div>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map((n) => (
                      <button key={n.id} onClick={() => { setBellOpen(false); onGotoInbox(); }}
                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors border-b border-border/50 last:border-0">
                        <div className="truncate font-medium text-xs">{n.desc}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span>{n.module}</span>
                          <span>·</span>
                          <span className="tabular-nums">{(n.confidence * 100).toFixed(0)}% confiança</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="border-t border-border p-2">
                  <button onClick={() => { setBellOpen(false); onGotoInbox(); }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent transition-colors">
                    Ver Inbox completa <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onOpenPalette} title='Atalho: "/"'>
            <Search className="h-3.5 w-3.5" />
          </Button>

          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setCompact(!compact)} title="Modo compacto">
            {compact ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </Button>

          <Button variant="outline" size="sm" className="h-8 gap-1.5 hidden sm:inline-flex" onClick={onSimulate}>
            <Play className="h-3.5 w-3.5" /> Simular
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 hidden sm:inline-flex"
            title="Preferência local — não bloqueia o pipeline no servidor"
            onClick={() => setAgentOnline(!agentOnline)}
          >
            <Power className="h-3.5 w-3.5" /> {agentOnline ? "Pausar" : "Ativar"}
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={onNewCmd}>
            <Plus className="h-3.5 w-3.5" /> Novo
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ---------- Tabs ---------- */
function Tabs({ current, onChange, pendingCount, waUnread }: { current: TabId; onChange: (t: TabId) => void; pendingCount: number; waUnread: number }) {
  return (
    <div className="mt-5 flex w-full gap-0.5 overflow-x-auto rounded-xl border border-border bg-card p-1 scrollbar-none">
      {TABS.map(t => {
        const Icon = t.icon;
        const active = current === t.id;
        const badge = t.id === "inbox" ? pendingCount : t.id === "whatsapp" ? waUnread : 0;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{t.label}</span>
            {badge > 0 && (
              <span className={cn(
                "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-destructive text-destructive-foreground animate-pulse",
              )}>
                {badge > 9 ? "9+" : badge}
              </span>
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
function Stat({ icon: Icon, label, value, hint, loading, accent }: any) {
  if (loading) return (
    <Card className="flex items-center gap-3">
      <div className="h-10 w-10 shrink-0 rounded-lg bg-muted animate-pulse" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
        <div className="h-6 w-14 rounded bg-muted animate-pulse" />
      </div>
    </Card>
  );
  return (
    <Card className="flex items-center gap-3">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", accent ?? "bg-primary/10 text-primary")}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums leading-tight mt-0.5">{value}</div>
        {hint && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</div>}
      </div>
    </Card>
  );
}

/* ---------- Onboarding ---------- */
function OnboardingChecklist() {
  const [done, setDone] = useLS<Record<string, boolean>>("omni-onboarding", {});
  const items = [
    { id: "wa", label: "Conectar WhatsApp (manual)" },
    { id: "cmd", label: "Criar primeiro comando (manual)" },
    { id: "approve", label: "Aprovar primeira ação (manual)" },
    { id: "auto", label: "Configurar automação (manual)" },
  ];
  const completed = items.filter(i => done[i.id]).length;
  if (completed === items.length) return null;
  return (
    <Card className="bg-gradient-to-br from-primary/10 to-accent/40">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-semibold">Comece em 4 passos</h3>
          <p className="text-xs text-muted-foreground">{completed}/{items.length} marcados (só neste navegador)</p>
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

type OverviewSuggestion = { id: string; icon: typeof Inbox; title: string; hint: string };

function buildOverviewSuggestions(stats: OmniAgentHubStatsDTO | null): OverviewSuggestion[] {
  if (!stats) return [];
  const items: OverviewSuggestion[] = [];
  const pend = stats.pending + stats.awaitingConfirmation;
  if (pend > 0) {
    items.push({
      id: "s-inbox",
      icon: Inbox,
      title: "Revisar pendências na Inbox IA",
      hint: `${pend} comando(s) aguardando (${stats.pending} pendente · ${stats.awaitingConfirmation} confirmação)`,
    });
  }
  if (stats.error > 0) {
    items.push({
      id: "s-errors",
      icon: XCircle,
      title: "Analisar comandos com erro",
      hint: `${stats.error} registro(s) com status ERRO — ver filtro na Inbox`,
    });
  }
  if (stats.todayCount > 0 && stats.accuracyPercent != null && stats.accuracyPercent < 70) {
    items.push({
      id: "s-accuracy",
      icon: BarChart3,
      title: "Taxa de execução baixa hoje",
      hint: `Acerto ${stats.accuracyPercent}% (executados / executados+erros) — revise frases ou confirmações`,
    });
  }
  return items;
}

function OverviewTab({
  stats,
  feed,
  onDetails,
  onSimulate,
  onRefresh,
  logAudit,
  onEnqueueInbox,
  onReexecute,
  now,
  onlineSince,
  agentOnline,
}: {
  stats: OmniAgentHubStatsDTO | null;
  feed: HubFeedRow[];
  onDetails: (c: HubFeedRow) => void;
  onSimulate: () => void;
  onRefresh: () => void;
  logAudit: (m: string) => void;
  onEnqueueInbox: (text: string) => Promise<void>;
  onReexecute: (c: HubFeedRow) => Promise<void>;
  now: number;
  onlineSince: number;
  agentOnline: boolean;
}) {
  const [suggestions, setSuggestions] = useState<OverviewSuggestion[]>([]);

  useEffect(() => {
    setSuggestions(buildOverviewSuggestions(stats));
  }, [stats]);

  const uptimeMin = Math.floor((now - onlineSince) / 60000);
  const uptimeStr = agentOnline ? `${Math.floor(uptimeMin / 60)}h ${uptimeMin % 60}min` : "—";

  const today = stats?.todayCount ?? 0;
  const executed = stats?.executed ?? 0;
  const pendAll = stats ? stats.pending + stats.awaitingConfirmation : 0;
  const err = stats?.error ?? 0;
  const acc = stats?.accuracyPercent;

  const lastHighlight = feed.find((f) => f.prismaStatus === "EXECUTADO") ?? feed[0];

  function badgeVariantForRow(b: HubFeedRow["badgeKind"]) {
    if (b === "ok") return "default" as const;
    if (b === "error") return "destructive" as const;
    return "secondary" as const;
  }

  return (
    <div className="space-y-6">
      <OnboardingChecklist />

      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-primary">Central IA Operacional</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">Omni Agent HUB</h2>
            <p className="text-sm text-muted-foreground">Comandos em linguagem natural, interpretação determinística, execução controlada.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onSimulate} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Simular
            </Button>
            <Button variant="outline" size="sm" onClick={() => void onRefresh()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          icon={MessageCircle}
          label="Comandos hoje"
          value={today}
          hint={stats ? `Total: ${stats.total}` : undefined}
          loading={!stats}
          accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />
        <Stat
          icon={CheckCircle2}
          label="Executados"
          value={executed}
          hint="status EXECUTADO"
          loading={!stats}
          accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        <Stat
          icon={Bell}
          label="Pendentes"
          value={pendAll}
          hint={stats ? `${stats.pending} pend. · ${stats.awaitingConfirmation} conf.` : undefined}
          loading={!stats}
          accent={pendAll > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary"}
        />
        <Stat
          icon={BarChart3}
          label="Acerto"
          value={acc != null ? `${acc}%` : "—"}
          hint={`Erros: ${err} · UI ${uptimeStr}`}
          loading={!stats}
          accent="bg-primary/10 text-primary"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Distribuição por status</h3>
            <Badge variant="secondary" className="tabular-nums">{stats?.total ?? "—"} total</Badge>
          </div>
          {!stats ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-2.5 w-28 rounded bg-muted animate-pulse" />
                  <div className="h-2 flex-1 rounded bg-muted animate-pulse" />
                  <div className="h-2.5 w-8 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          ) : stats.total === 0 ? (
            <div className="flex h-24 flex-col items-center justify-center gap-2 text-center">
              <Circle className="h-6 w-6 text-muted-foreground/40" />
              <div className="text-sm text-muted-foreground">Nenhum comando registrado ainda</div>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: "Executado", count: stats.executed, colorClass: "bg-emerald-500/80" },
                { label: "Ag. confirmação", count: stats.awaitingConfirmation, colorClass: "bg-blue-500/80" },
                { label: "Pendente", count: stats.pending, colorClass: "bg-amber-500/80" },
                { label: "Erro", count: stats.error, colorClass: "bg-destructive/80" },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 text-xs">
                  <span className="w-32 shrink-0 text-muted-foreground">{row.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", row.colorClass)}
                      style={{ width: `${Math.round((row.count / (stats.total || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-medium tabular-nums">{row.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Resumo do período</h3>
            <Badge variant="outline" className="text-[10px]">dados reais</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Hoje", value: today, sub: "comandos", urgent: false },
              { label: "Total histórico", value: stats?.total ?? "—", sub: "registros", urgent: false },
              { label: "Taxa de acerto", value: acc != null ? `${acc}%` : "—", sub: "exec / exec+erro", urgent: false },
              { label: "Pendentes", value: pendAll, sub: pendAll > 0 ? "atenção necessária" : "tudo em dia", urgent: pendAll > 0 },
            ].map((m) => (
              <div key={m.label} className={cn("rounded-lg p-3 text-center", m.urgent ? "bg-amber-500/10" : "bg-muted/40")}>
                <div className={cn("text-2xl font-bold tabular-nums leading-tight", m.urgent && "text-amber-600 dark:text-amber-400")}>
                  {!stats && m.label !== "Pendentes" ? (
                    <div className="mx-auto h-6 w-12 rounded bg-muted animate-pulse" />
                  ) : m.value}
                </div>
                <div className="mt-1 text-xs font-medium">{m.label}</div>
                <div className="text-[10px] text-muted-foreground">{m.sub}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {lastHighlight && (
        <Card className={cn(
          "flex items-center gap-4 border-l-4",
          lastHighlight.badgeKind === "ok" && "border-l-emerald-500",
          lastHighlight.badgeKind === "error" && "border-l-destructive",
          lastHighlight.badgeKind === "awaiting" && "border-l-blue-500",
          lastHighlight.badgeKind === "pending" && "border-l-amber-500",
        )}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs text-muted-foreground">Último comando</span>
              <Badge
                variant={lastHighlight.badgeKind === "ok" ? "default" : lastHighlight.badgeKind === "error" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {lastHighlight.statusLabel}
              </Badge>
            </div>
            <div className="font-medium truncate text-sm">{lastHighlight.text}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{relTime(lastHighlight.ts)}</span>
              <span>·</span>
              <span>{lastHighlight.module}</span>
              <span>·</span>
              <span className="tabular-nums">{(lastHighlight.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" onClick={() => onDetails(lastHighlight)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Sugestões operacionais</h3>
          <Badge variant="outline" className="text-[10px]">Dados reais (Inbox / stats)</Badge>
        </div>
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
                  <Button
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        try {
                          await onEnqueueInbox(`Sugestão Omni Agent: ${s.title}`);
                          logAudit(`Sugestão: ${s.title}`);
                          setSuggestions((p) => p.filter((x) => x.id !== s.id));
                          toast.success("Registado na Inbox (Prisma)");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Falha");
                        }
                      })();
                    }}
                  >
                    <Play /> Executar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSuggestions(p => p.filter(x => x.id !== s.id)); toast("Ignorada"); }}><X /> Ignorar</Button>
                </div>
              </div>
            );
          })}
          {suggestions.length === 0 && (
            <div className="text-sm text-muted-foreground md:col-span-3">
              {stats
                ? "Nenhuma pendência ou alerta com base nos comandos desta unidade. Use «Novo» ou «Simular» para testar o pipeline."
                : "Carregando estatísticas…"}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Comandos recentes</h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void onRefresh()}><RefreshCw /> Atualizar</Button>
            <Button variant="ghost" size="sm" onClick={onSimulate}><Sparkles /> Simular</Button>
          </div>
        </div>
        <div className="space-y-2">
          {feed.slice(0, 8).map((c) => (
            <div
              key={c.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg border-l-2 border border-border bg-background/40 p-3 transition-colors hover:bg-accent/40",
                c.badgeKind === "ok" && "border-l-emerald-500",
                c.badgeKind === "error" && "border-l-destructive",
                c.badgeKind === "awaiting" && "border-l-blue-500",
                c.badgeKind === "pending" && "border-l-amber-500",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.text}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {canalDisplayLabel(c.dto.canal)}
                  </Badge>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{c.intent}</span>
                  <span>·</span>
                  <span>{c.module}</span>
                  <span>·</span>
                  <span>{c.time}</span>
                  <span>·</span>
                  <span className="tabular-nums">{(c.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
              <Badge variant={badgeVariantForRow(c.badgeKind)} className="shrink-0 text-[10px]">
                {c.statusLabel}
              </Badge>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDetails(c)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void onReexecute(c)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {feed.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/30" />
              <div className="text-sm font-medium text-muted-foreground">Nenhum comando registrado</div>
              <div className="text-xs text-muted-foreground/70">Use &quot;Novo&quot; ou &quot;Simular&quot; para testar o pipeline real</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function modalChannelToOmniCanal(channel: "texto" | "whatsapp" | "voz"): OmniAgentCanal {
  return normalizeOmniAgentCanal(
    channel === "whatsapp" ? "whatsapp" : channel === "voz" ? "voz" : "texto_interno",
  );
}

/* ---------- New Command Modal ---------- */
function NewCommandModal({ open, onClose, storeId, onSendInbox, onExecute }: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  onSendInbox: (t: string, canal: OmniAgentCanal) => void | Promise<void>;
  onExecute: (t: string, canal: OmniAgentCanal) => void | Promise<void>;
}) {
  const [channel, setChannel] = useState<"texto" | "whatsapp" | "voz">("texto");
  const [text, setText] = useState("");
  const [client, setClient] = useState("");
  const [moduleHint, setModuleHint] = useState<string>("auto");
  const [result, setResult] = useState<{ module: string; action: string; fields: Record<string, string>; confidence: number } | null>(null);
  function reset() { setText(""); setClient(""); setResult(null); setModuleHint("auto"); setChannel("texto"); }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo comando</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Unidade ativa: {storeId}</p>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="mb-1 block">Canal</Label>
            <div className="flex flex-wrap gap-2">
              {([["texto", "Texto interno"], ["whatsapp", "WhatsApp"], ["voz", "Voz"]] as const).map(([v, l]) =>
                v === "voz" ? (
                  <span key={v} className="inline-flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={channel === v ? "default" : "outline"}
                      onClick={() => setChannel(v)}
                    >
                      {l}
                    </Button>
                    <Badge variant="outline" className="text-[10px]">Persistido; execução igual a texto</Badge>
                  </span>
                ) : (
                  <Button
                    key={v}
                    size="sm"
                    variant={channel === v ? "default" : "outline"}
                    onClick={() => setChannel(v)}
                  >
                    {l}
                  </Button>
                ),
              )}
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
            const r = interpretOmniAgentCommand(text);
            setResult({
              module: moduleHint === "auto" ? r.intent : moduleHint,
              action: r.action,
              fields: r.fields,
              confidence: r.confidence,
            });
            toast.success("Interpretado");
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
          <Button variant="outline" onClick={async () => {
            if (!text.trim()) return toast.error("Digite");
            await onSendInbox(text.trim(), modalChannelToOmniCanal(channel));
            reset(); onClose();
          }}><Inbox /> Inbox</Button>
          <Button onClick={async () => {
            if (!text.trim()) return toast.error("Digite");
            await onExecute(text.trim(), modalChannelToOmniCanal(channel));
            reset(); onClose();
          }}><Play /> Executar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- WhatsApp ---------- */
type ChatMsg = { from: "cliente" | "sistema"; text: string; at: number };
function WhatsAppTab({
  storeId,
  waTodayCount,
  waAllCount,
  onSubmitCommand,
  bumpUnread,
}: {
  storeId: string;
  waTodayCount: number;
  waAllCount: number;
  onSubmitCommand: (t: string) => Promise<void>;
  bumpUnread: () => void;
}) {
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);
  const [phoneLast4, setPhoneLast4] = useState<string | undefined>();
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [humanMode, setHumanMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getOmniAgentWhatsAppCloudStatus(storeId)
      .then((s) => {
        if (!cancelled) {
          setCloudOk(s.configured);
          setPhoneLast4(s.phoneNumberIdLast4);
        }
      })
      .catch(() => {
        if (!cancelled) setCloudOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function copyIdSuffix() {
    const id = phoneLast4 ?? "";
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      toast.success("ID (últimos dígitos) copiado");
    } catch {
      toast("Copiado");
    }
  }

  async function simIncoming() {
    const msgs = ["gastei 50 em uber", "abrir OS Moto G defeito carga", "vendi película R$ 40 pix", "lembrar de ligar Ana"];
    const t = msgs[Math.floor(Math.random() * msgs.length)];
    try {
      await onSubmitCommand(t);
      const at = Date.now();
      setChat((c) => [...c, { from: "cliente", text: t, at }]);
      if (!humanMode) {
        setChat((c) => [
          ...c,
          {
            from: "sistema",
            text: "Comando gravado (canal whatsapp, pipeline real). Consulte a Inbox IA para confirmar ou ver resultado.",
            at: Date.now(),
          },
        ]);
      }
      bumpUnread();
      beep();
      toast.success(`Mensagem enviada ao Agent: "${t}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registar");
    }
  }

  async function runQuick(ex: string) {
    try {
      await onSubmitCommand(ex);
      const at = Date.now();
      setChat((c) => [
        ...c,
        { from: "cliente", text: ex, at },
        {
          from: "sistema",
          text: "Comando enviado — Inbox IA / feed.",
          at: Date.now(),
        },
      ]);
      bumpUnread();
      toast.success("Comando enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  }

  if (cloudOk === null) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        A verificar estado do WhatsApp Cloud API…
      </Card>
    );
  }

  const cloudDisconnected = !cloudOk;

  return (
    <div className="space-y-4">
      {cloudDisconnected && (
        <Card className="border-dashed p-6 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Em preparação</Badge>
            <span className="text-sm font-medium">WhatsApp Cloud API</span>
          </div>
          <p className="text-sm text-muted-foreground">
            WhatsApp IA ainda não conectado ao WhatsApp Cloud API no ambiente deste servidor (credenciais Meta em falta ou incompletas).
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Phone}
          label="Cloud API (servidor)"
          value={cloudOk ? "Variáveis OK" : "Não configurado"}
          hint={cloudOk ? "Token + phone_number_id" : "WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID"}
        />
        <Stat icon={MessageCircle} label="Comandos whatsapp hoje" value={String(waTodayCount)} />
        <Stat icon={Brain} label="Comandos whatsapp (feed)" value={String(waAllCount)} />
        <Stat icon={Bell} label="Inbox + confirmação" value="Ver aba Inbox IA" hint="Pendências reais" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-32 w-32 items-center justify-center rounded-lg border-2 border-dashed border-border bg-accent">
            <QrCode className="h-16 w-16 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Phone className="h-4 w-4 text-primary" />
              {cloudOk ? (
                <>
                  <span className="font-mono text-sm text-muted-foreground">phone_number_id ···{phoneLast4 ?? "—"}</span>
                  <Badge variant="default">Credenciais no servidor</Badge>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Sem número Cloud API configurado no ambiente</span>
              )}
              {humanMode && (
                <Badge variant="destructive">
                  <UserCog className="h-3 w-3 mr-1" /> Modo humano (local)
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              O painel WhatsApp HUB continua a ser o local para conversas reais com clientes. Aqui apenas comandos Omni Agent com canal «whatsapp».
            </p>
            <div className="flex flex-wrap gap-2">
              {cloudOk && (
                <Button size="sm" variant="outline" onClick={() => void copyIdSuffix()}>
                  <Copy /> Copiar sufixo ID
                </Button>
              )}
              <Button size="sm" onClick={() => void simIncoming()}>
                <MessageCircle /> Simular mensagem
              </Button>
              <Badge variant="outline">Canal whatsapp → Prisma</Badge>
              <Button
                size="sm"
                variant={humanMode ? "destructive" : "outline"}
                onClick={() => {
                  setHumanMode(!humanMode);
                  toast(humanMode ? "Respostas automáticas locais reativadas" : "Modo humano: sem resposta automática local");
                }}
              >
                <UserCog /> {humanMode ? "Reativar painel" : "Modo humano"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_1fr]">
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Conversas Meta</h3>
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground">
            Lista de conversas do WhatsApp Business não está integrada a este painel. Use o{" "}
            <span className="font-medium text-foreground">WhatsApp HUB</span> do dashboard para threads reais.
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold">Simulação (mensagens → Agent)</h3>
            {cloudDisconnected && <Badge variant="secondary">Demo / teste motor</Badge>}
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {chat.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                Nenhuma simulação nesta sessão. Use «Simular mensagem» ou os atalhos abaixo — tudo é persistido como OmniAgentCommand.
              </div>
            ) : (
              chat.map((m, i) => (
                <div
                  key={`${m.at}-${i}`}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    m.from === "cliente"
                      ? "bg-muted rounded-bl-sm"
                      : "ml-auto border border-border bg-accent text-foreground rounded-br-sm",
                  )}
                >
                  {m.text}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { t: "Triagem despesa", e: "gastei 50 em uber" },
          { t: "Triagem venda", e: "vendi capa R$ 30 pix" },
          { t: "OS (confirmação)", e: "abrir OS Moto G defeito carga" },
        ].map((c) => (
          <Card key={c.t}>
            <div className="font-semibold">{c.t}</div>
            <div className="mt-1 text-xs text-muted-foreground">&quot;{c.e}&quot;</div>
            <Button size="sm" className="mt-3" variant="outline" onClick={() => void runQuick(c.e)}>
              <Play /> Enviar ao Agent
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- Commands ---------- */
type CmdAvailability = "real" | "triage";
type CmdDef = { name: string; example: string; result: string; availability: CmdAvailability };

const COMMAND_GROUPS_REAL: { cat: string; items: CmdDef[] }[] = [
  {
    cat: "Executável hoje (confirmação quando indicado)",
    items: [
      { name: "Abrir OS", example: "abrir OS para João", result: "Cria OS após confirmar na Inbox", availability: "real" },
      { name: "Consultar caixa", example: "consultar caixa", result: "Sessão aberta + saldo inicial", availability: "real" },
      { name: "Buscar cliente", example: "buscar cliente Rafael", result: "Lista clientes do cadastro", availability: "real" },
      { name: "Buscar produto", example: "buscar produto película", result: "Lista produtos", availability: "real" },
      { name: "Lembrete / auditoria", example: "criar lembrete de cobrança", result: "Registo em logs_auditoria após confirmar", availability: "real" },
      { name: "Financeiro hoje", example: "mostrar financeiro hoje", result: "Resumo via serviço de relatórios (leitura)", availability: "real" },
      {
        name: "Registrar despesa",
        example: "gastei 120 reais com película",
        result: "Movimentação financeira (saída) após confirmar na Inbox",
        availability: "real",
      },
      {
        name: "Registrar recebimento",
        example: "recebi 200 de João no pix",
        result: "Movimentação financeira (entrada) após confirmar na Inbox",
        availability: "real",
      },
    ],
  },
];

const COMMAND_GROUPS_TRIAGE: { cat: string; items: CmdDef[] }[] = [
  {
    cat: "Triagem na Inbox (sem execução automática de venda/estoque)",
    items: [
      {
        name: "Registrar venda (triagem)",
        example: "vendi película por R$ 40 no Pix",
        result: "Vira lembrete operacional — não registra venda no PDV",
        availability: "triage",
      },
      {
        name: "Entrada estoque (triagem)",
        example: "entrada de 10 películas no estoque",
        result: "Vira lembrete operacional — não movimenta estoque",
        availability: "triage",
      },
      {
        name: "Lembrete livre",
        example: "lembrar de cobrar Maria amanhã",
        result: "Auditoria após confirmar na Inbox",
        availability: "triage",
      },
    ],
  },
];

const COMMAND_GROUPS = [...COMMAND_GROUPS_REAL, ...COMMAND_GROUPS_TRIAGE];

function CommandsTab({ storeId, onAfterPipeline }: { storeId: string; onAfterPipeline: () => Promise<void> }) {
  const [favs, setFavs] = useLS<string[]>("omni-favs", []);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("Todos");
  const [showFavs, setShowFavs] = useState(false);
  const [history, setHistory] = useState<OmniAgentCommandDTO[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const cats = ["Todos", ...COMMAND_GROUPS.map((g) => g.cat)];

  const loadHist = useCallback(async () => {
    if (!storeId?.trim()) return;
    setLoadingHist(true);
    try {
      const rows = await listOmniAgentCommands(storeId, 40);
      setHistory(rows);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHist(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadHist();
  }, [loadHist]);

  async function runExample(ex: string) {
    try {
      await submitOmniAgentCommand({ storeId, comandoOriginal: ex, mode: "run" });
      const interp = interpretOmniAgentCommand(ex);
      if (interp.confidence < 0.85) toast.warning("Baixa confiança — verifique na Inbox");
      else toast.success("Pipeline real executado");
      await onAfterPipeline();
      await loadHist();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar comando");
    }
  }

  function toggleFav(k: string) {
    const has = favs.includes(k);
    setFavs(has ? favs.filter((f) => f !== k) : [...favs, k]);
    toast(has ? "Removido dos favoritos" : "Favoritado");
  }

  const groups = COMMAND_GROUPS
    .filter((g) => cat === "Todos" || g.cat === cat)
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        const k = `${g.cat}:${it.name}`;
        if (showFavs && !favs.includes(k)) return false;
        const q = search.toLowerCase();
        return !q || it.name.toLowerCase().includes(q) || it.example.toLowerCase().includes(q);
      }),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Histórico recente (Prisma)</h3>
          <Button size="sm" variant="outline" onClick={() => void loadHist()} disabled={loadingHist}>
            <RefreshCw className={cn("h-4 w-4", loadingHist && "animate-spin")} /> Atualizar
          </Button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {history.length === 0 && !loadingHist && (
            <div className="text-sm text-muted-foreground">Nenhum comando registado ainda.</div>
          )}
          {history.slice(0, 20).map((row) => {
            const r = dtoToHubFeedRow(row);
            return (
              <div key={row.id} className="rounded-lg border border-border bg-background/40 p-2 text-xs">
                <div className="font-medium truncate">{row.comandoOriginal}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{canalDisplayLabel(row.canal)}</Badge>
                  <Badge variant="outline">{row.interpretacao.intent}</Badge>
                  <span>{Math.round(row.interpretacao.confidence * 100)}%</span>
                  <span>· {new Date(row.createdAt).toLocaleString("pt-BR")}</span>
                </div>
                <Badge className="mt-1" variant={r.badgeKind === "ok" ? "default" : r.badgeKind === "error" ? "destructive" : "secondary"}>
                  {r.statusLabel}
                </Badge>
              </div>
            );
          })}
        </div>
      </Card>

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
          {cats.map((c) => (
            <Button key={c} size="sm" variant={cat === c ? "default" : "outline"} onClick={() => setCat(c)}>
              {c}
            </Button>
          ))}
        </div>
      </Card>

      {groups.map((g) => (
        <Card key={g.cat}>
          <h3 className="mb-3 font-semibold">{g.cat}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.items.map((it) => {
              const k = `${g.cat}:${it.name}`;
              const fav = favs.includes(k);
              return (
                <div key={k} className="rounded-lg border border-border p-3 space-y-2 transition-colors hover:bg-accent/40">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        {it.name}
                        {it.availability === "real" ? (
                          <Badge variant="default" className="text-[10px]">Executável</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Triagem</Badge>
                        )}
                        {fav && <Star className="h-3 w-3 fill-primary text-primary" />}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">&quot;{it.example}&quot;</div>
                      <div className="mt-1 text-xs text-muted-foreground italic">→ {it.result}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void runExample(it.example)}>
                      <Play /> Enviar (real)
                    </Button>
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
      {groups.length === 0 && (
        <Card>
          <div className="text-sm text-muted-foreground">Nenhum comando encontrado.</div>
        </Card>
      )}
    </div>
  );
}

/* ---------- Automations ---------- */
function AutomationsTab({
  storeId,
  logAudit,
  onInboxMayChange,
}: {
  storeId: string;
  logAudit: (m: string) => void;
  onInboxMayChange: () => void;
}) {
  const [rows, setRows] = useState<OmniAgentAutomationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<OmniAgentAutomationDTO | null>(null);
  const [logFor, setLogFor] = useState<OmniAgentAutomationDTO | null>(null);
  const [runs, setRuns] = useState<OmniAgentAutomationRunDTO[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState<OmniAgentAutomationTriggerKey>("venda_finalizada");
  const [newTpl, setNewTpl] = useState(
    "[Automação Omni] Venda finalizada (venda id {{entityId}}). Revisar conciliação.",
  );

  const [editName, setEditName] = useState("");
  const [editTpl, setEditTpl] = useState("");
  const [editPriority, setEditPriority] = useState(0);

  const load = useCallback(async () => {
    if (!storeId?.trim()) return;
    setLoading(true);
    try {
      const list = await listOmniAgentAutomations(storeId);
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!logFor) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    setRunsLoading(true);
    void listOmniAgentAutomationRuns(storeId, { automationId: logFor.id, take: 30 })
      .then((r) => {
        if (!cancelled) setRuns(r);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      })
      .finally(() => {
        if (!cancelled) setRunsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logFor, storeId]);

  return (
    <div className="space-y-4">
      <Card className="border-dashed p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Event bus</Badge>
          <span className="text-sm font-medium">Automações persistidas</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Gatilhos ligados a eventos de domínio (<code className="text-foreground">venda_finalizada</code>,{" "}
          <code className="text-foreground">os_finalizada</code> → OS entregue via Server Actions Operações V2). Cada
          disparo cria um comando na <span className="font-medium text-foreground">Inbox IA</span> (PENDENTE) — sem
          execução automática perigosa. Variáveis no modelo: <code className="text-foreground">{"{{entityId}}"}</code>,{" "}
          <code className="text-foreground">{"{{status}}"}</code>, campos do payload da venda/OS.
        </p>
        <p className="text-xs text-muted-foreground">
          <code className="text-foreground">conta_receber_vencida</code> —{" "}
          <Badge variant="secondary" className="align-middle text-[10px]">sem emissor automático</Badge>{" "}
          O financeiro calcula títulos vencidos na leitura (data de vencimento + saldo aberto), mas não há rotina
          agendada nem hook de persistência que emita este evento. Pode criar a regra Omni; só disparará após implementar
          emissor (cron/job — fora do escopo atual).
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            setNewName("");
            setNewTrigger("venda_finalizada");
            setNewTpl(
              "[Automação Omni] Venda finalizada (venda id {{entityId}}). Revisar conciliação e próximos passos.",
            );
            setCreateOpen(true);
          }}
        >
          <Plus /> Nova automação
        </Button>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="border-l-4 border-l-muted p-4">
              <div className="space-y-2.5">
                <div className="flex gap-2">
                  <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-3 w-full rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="rounded-full bg-muted p-3">
            <Zap className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Nenhuma automação configurada</div>
            <div className="text-xs text-muted-foreground">
              Recarregue a página ou verifique permissões — o servidor cria regras padrão na primeira consulta.
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card
              key={r.id}
              className={cn(
                "border-l-4 transition-all",
                r.enabled ? "border-l-emerald-500/70" : "border-l-border",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">{r.name}</span>
                    <Badge
                      variant={r.enabled ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {r.enabled ? "Ativa" : "Inativa"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {OMNI_AGENT_TRIGGER_LABELS[r.triggerKey as OmniAgentAutomationTriggerKey] ?? r.triggerKey}
                    </Badge>
                  </div>
                  <div className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs font-mono text-muted-foreground break-all">
                    {r.commandTemplate}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Prioridade: <span className="font-medium text-foreground tabular-nums">{r.priority}</span></span>
                    <span>Execuções: <span className="font-medium text-foreground tabular-nums">{r.runCount}</span></span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Switch
                    id={`en-${r.id}`}
                    checked={r.enabled}
                    onCheckedChange={async (v) => {
                      try {
                        const updated = await setOmniAgentAutomationEnabled(storeId, r.id, v);
                        setRows((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
                        logAudit(`Automação ${updated.name}: ${v ? "ativada" : "desativada"}`);
                        toast.success(v ? "Automação ativa" : "Automação desativada");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Falha");
                      }
                    }}
                  />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => {
                    setEditRow(r);
                    setEditName(r.name);
                    setEditTpl(r.commandTemplate);
                    setEditPriority(r.priority);
                  }}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setLogFor(r);
                      logAudit(`Log automação: ${r.name}`);
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={async () => {
                      if (!confirm(`Remover automação «${r.name}»?`)) return;
                      try {
                        await deleteOmniAgentAutomation(storeId, r.id);
                        logAudit(`Automação removida: ${r.name}`);
                        toast.success("Removida");
                        await load();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Falha");
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova automação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Minha triagem de vendas" />
            </div>
            <div>
              <Label>Gatilho</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value as OmniAgentAutomationTriggerKey)}
              >
                {OMNI_AGENT_AUTOMATION_TRIGGERS.map((k) => (
                  <option key={k} value={k}>
                    {OMNI_AGENT_TRIGGER_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Modelo do comando (Inbox)</Label>
              <Textarea rows={4} value={newTpl} onChange={(e) => setNewTpl(e.target.value)} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                try {
                  const created = await createOmniAgentAutomation(storeId, {
                    name: newName || "Nova automação",
                    triggerKey: newTrigger,
                    commandTemplate: newTpl,
                    enabled: false,
                  });
                  logAudit(`Automação criada: ${created.name}`);
                  toast.success("Criada (inativa por defeito)");
                  setCreateOpen(false);
                  await load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha");
                }
              }}
            >
              <Save /> Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editRow}
        onOpenChange={(o) => {
          if (!o) setEditRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar automação</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Gatilho: <span className="font-mono text-foreground">{editRow.triggerKey}</span> (não editável)
              </div>
              <div>
                <Label>Nome</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  value={editPriority}
                  onChange={(e) => setEditPriority(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>Modelo do comando</Label>
                <Textarea rows={5} value={editTpl} onChange={(e) => setEditTpl(e.target.value)} className="font-mono text-xs" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!editRow) return;
                try {
                  const updated = await updateOmniAgentAutomation(storeId, editRow.id, {
                    name: editName,
                    commandTemplate: editTpl,
                    priority: editPriority,
                  });
                  setRows((prev) => prev.map((x) => (x.id === editRow.id ? updated : x)));
                  logAudit(`Automação atualizada: ${updated.name}`);
                  toast.success("Guardado");
                  setEditRow(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha");
                }
              }}
            >
              <Save /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Execuções — {logFor?.name}</DialogTitle>
          </DialogHeader>
          {runsLoading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Ainda não houve disparos com comando criado.</div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto text-xs">
              {runs.map((x) => (
                <div key={x.id} className="rounded border border-border bg-muted/40 p-2 space-y-1">
                  <div className="text-muted-foreground">{new Date(x.createdAt).toLocaleString("pt-BR")}</div>
                  <div>
                    <span className="font-medium">Evento:</span> {x.eventKey}{" "}
                    {x.entityId ? <span className="font-mono">· {x.entityId}</span> : null}
                  </div>
                  <div className="font-mono break-all text-[11px]">{x.comandoGerado}</div>
                  {x.commandId ? (
                    <div className="text-muted-foreground">
                      Comando: <span className="font-mono">{x.commandId}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                onInboxMayChange();
                toast.info("Abra a Inbox IA para processar comandos pendentes.");
              }}
            >
              Ir à Inbox
            </Button>
            <Button onClick={() => setLogFor(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Memory ---------- */
const MEMORY_TYPE_LABELS: Record<OmniAgentMemoryType, string> = {
  nota: "Nota",
  decisao: "Decisão",
  lembrete: "Lembrete",
  incidente: "Incidente",
  preferencia: "Preferência",
  observacao: "Observação",
};

function MemoryItemCard({
  memory,
  onEdit,
  onArchive,
}: {
  memory: OmniAgentMemoryDTO;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Badge variant="outline">{MEMORY_TYPE_LABELS[memory.tipo]}</Badge>
          {memory.origem === "omni_agent" && <Badge variant="secondary">via Agent</Badge>}
          <span className="text-sm font-medium truncate">{memory.titulo}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={onEdit} title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onArchive} title="Arquivar">
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{memory.conteudo}</p>
      {memory.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {memory.tags.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground">
        {memory.criadoPor || "—"} · {new Date(memory.createdAt).toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

function MemoryFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial: { tipo: OmniAgentMemoryType; titulo: string; conteudo: string; tags: string };
  onSubmit: (v: { tipo: OmniAgentMemoryType; titulo: string; conteudo: string; tags: string[] }) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<OmniAgentMemoryType>(initial.tipo);
  const [titulo, setTitulo] = useState(initial.titulo);
  const [conteudo, setConteudo] = useState(initial.conteudo);
  const [tagsText, setTagsText] = useState(initial.tags);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo(initial.tipo);
      setTitulo(initial.titulo);
      setConteudo(initial.conteudo);
      setTagsText(initial.tags);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Memória operacional persistida no servidor (registro manual). IA/LLM ainda não ativo para inferências
          automáticas.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">Tipo</Label>
            <div className="flex flex-wrap gap-2">
              {OMNI_AGENT_MEMORY_TYPES.map((t) => (
                <Button key={t} size="sm" variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)}>
                  {MEMORY_TYPE_LABELS[t]}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Prefere contato de manhã" />
          </div>
          <div>
            <Label>Conteúdo</Label>
            <Textarea rows={4} value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
          </div>
          <div>
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Ex.: vip, manhã" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (!titulo.trim() || !conteudo.trim()) {
                toast.error("Título e conteúdo são obrigatórios");
                return;
              }
              setSaving(true);
              try {
                await onSubmit({
                  tipo,
                  titulo,
                  conteudo,
                  tags: tagsText
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            <Save /> {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemoryTab({ storeId, logAudit }: { storeId: string; logAudit: (m: string) => void }) {
  const [rows, setRows] = useState<ClienteDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [memories, setMemories] = useState<OmniAgentMemoryDTO[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editMemory, setEditMemory] = useState<OmniAgentMemoryDTO | null>(null);

  const [recentSearch, setRecentSearch] = useState("");
  const [recent, setRecent] = useState<OmniAgentMemoryDTO[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!storeId?.trim()) {
      setRows([]);
      setSel(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void listClientes(storeId)
      .then((list) => {
        if (!cancelled) {
          setRows(list);
          setSel((prev) => {
            if (prev && list.some((c) => c.id === prev)) return prev;
            return list[0]?.id ?? null;
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    if (!nq) return rows;
    return rows.filter(
      (c) =>
        c.nome.toLowerCase().includes(nq) ||
        c.telefone.toLowerCase().includes(nq) ||
        c.documento.toLowerCase().includes(nq),
    );
  }, [rows, q]);

  const c = sel ? rows.find((x) => x.id === sel) : undefined;

  const loadMemories = useCallback(async () => {
    if (!storeId?.trim() || !c?.id) {
      setMemories([]);
      return;
    }
    setMemoriesLoading(true);
    try {
      const list = await listOmniAgentMemoriesByCliente(storeId, c.id);
      setMemories(list);
    } catch {
      setMemories([]);
    } finally {
      setMemoriesLoading(false);
    }
  }, [storeId, c?.id]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const loadRecent = useCallback(
    async (term: string) => {
      if (!storeId?.trim()) {
        setRecent([]);
        return;
      }
      setRecentLoading(true);
      try {
        const list = term.trim()
          ? await searchOmniAgentMemories(storeId, term)
          : await listRecentOmniAgentMemories(storeId);
        setRecent(list);
      } catch {
        setRecent([]);
      } finally {
        setRecentLoading(false);
      }
    },
    [storeId],
  );

  useEffect(() => {
    void loadRecent(recentSearch);
  }, [loadRecent, recentSearch]);

  async function handleArchive(memory: OmniAgentMemoryDTO) {
    try {
      await archiveOmniAgentMemory(storeId, memory.id);
      logAudit(`Memória arquivada: ${memory.titulo}`);
      toast.success("Memória arquivada");
      void loadMemories();
      void loadRecent(recentSearch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao arquivar");
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_1fr]">
        <Card className="space-y-3">
          <div className="text-sm font-semibold">Clientes (cadastro)</div>
          <Input placeholder="Buscar nome, telefone, documento…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="space-y-1 max-h-[480px] overflow-y-auto min-w-0">
            {loading && (
              <div className="space-y-1.5 p-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-2">
                    <div className="h-7 w-7 shrink-0 rounded-full bg-muted animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                      <div className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Users className="h-5 w-5 text-muted-foreground/40" />
                <div className="text-xs text-muted-foreground">Sem clientes ou sem correspondência</div>
              </div>
            )}
            {!loading &&
              filtered.map((cl) => (
                <button
                  key={cl.id}
                  type="button"
                  onClick={() => setSel(cl.id)}
                  className={cn(
                    "w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors min-w-0",
                    sel === cl.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase",
                      sel === cl.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary",
                    )}>
                      {cl.nome.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate text-xs">{cl.nome}</div>
                      <div className="text-[10px] opacity-70 truncate">{cl.telefone}</div>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </Card>

        <div className="space-y-3 min-w-0">
          {!c ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Selecione um cliente na lista.</Card>
          ) : (
            <>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold flex flex-wrap items-center gap-2">
                      {c.nome}
                      <Badge variant="outline">Cadastro</Badge>
                    </h3>
                    <div className="text-xs text-muted-foreground">
                      {c.tipo} · {c.telefone} · última compra: {c.ultimaCompra}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                      <Plus /> Nova memória
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const texto = `Lembrete operacional: acompanhar cliente ${c.nome} (id ${c.id}).`;
                        try {
                          await submitOmniAgentCommand({ storeId, comandoOriginal: texto, mode: "run" });
                          logAudit(`Lembrete Agent → ${c.nome}`);
                          toast.success("Comando enviado — ver Inbox IA");
                          void loadRecent(recentSearch);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Falha");
                        }
                      }}
                    >
                      <Bell /> Lembrete (Agent)
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSummaryOpen(true)}>
                      <Brain /> Resumo (dados de cadastro)
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat icon={Wallet} label="Total gasto (cad.)" value={`R$ ${Number(c.totalGasto).toFixed(2)}`} />
                  <Stat icon={ShoppingCart} label="Status" value={c.status} />
                  <Stat icon={Package} label="Cidade" value={c.cidade || "—"} />
                  <Stat icon={Users} label="Tags" value={c.tags.length ? `${c.tags.length}` : "—"} />
                </div>
              </Card>

              <ClientList title="Tags (cadastro)" items={c.tags} />

              <Card>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">Memória operacional</div>
                  <Badge variant="secondary">Servidor · persistida</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Registros manuais e eventos básicos deste cliente. IA/LLM ainda não ativo para inferências
                  automáticas — sem timeline unificada de PDV/OS/WhatsApp nesta fase.
                </p>
                {memoriesLoading ? (
                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : memories.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground">
                    Nenhuma memória registrada para este cliente ainda.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {memories.map((m) => (
                      <MemoryItemCard
                        key={m.id}
                        memory={m}
                        onEdit={() => setEditMemory(m)}
                        onArchive={() => void handleArchive(m)}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">Últimas memórias da loja</div>
          <Input
            className="max-w-xs"
            placeholder="Buscar por termo…"
            value={recentSearch}
            onChange={(e) => setRecentSearch(e.target.value)}
          />
        </div>
        {recentLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground">
            {recentSearch.trim() ? "Nenhuma memória encontrada para este termo." : "Nenhuma memória registrada nesta loja ainda."}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {recent.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
                <Badge variant="outline" className="shrink-0">{MEMORY_TYPE_LABELS[m.tipo]}</Badge>
                <span className="font-medium truncate">{m.titulo}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {c && (
        <>
          <MemoryFormDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            title={`Nova memória — ${c.nome}`}
            initial={{ tipo: "nota", titulo: "", conteudo: "", tags: "" }}
            onSubmit={async (v) => {
              try {
                await createOmniAgentMemory(storeId, { clienteId: c.id, ...v });
                logAudit(`Memória criada (${v.tipo}): ${v.titulo}`);
                toast.success("Memória gravada no servidor");
                setCreateOpen(false);
                void loadMemories();
                void loadRecent(recentSearch);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha ao gravar memória");
              }
            }}
          />

          <MemoryFormDialog
            open={!!editMemory}
            onOpenChange={(o) => !o && setEditMemory(null)}
            title={`Editar memória — ${c.nome}`}
            initial={{
              tipo: editMemory?.tipo ?? "nota",
              titulo: editMemory?.titulo ?? "",
              conteudo: editMemory?.conteudo ?? "",
              tags: editMemory?.tags.join(", ") ?? "",
            }}
            onSubmit={async (v) => {
              if (!editMemory) return;
              try {
                await updateOmniAgentMemory(storeId, editMemory.id, v);
                logAudit(`Memória editada: ${v.titulo}`);
                toast.success("Memória atualizada");
                setEditMemory(null);
                void loadMemories();
                void loadRecent(recentSearch);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha ao editar memória");
              }
            }}
          />

          <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Resumo — dados de cadastro</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Não há modelo de IA a gerar narrativa nesta fase. Apenas campos reais do cadastro:
              </p>
              <div className="rounded-lg border border-border bg-muted p-3 text-sm space-y-1">
                <div>
                  <span className="font-medium">Nome:</span> {c.nome}
                </div>
                <div>
                  <span className="font-medium">Total gasto (cadastro):</span> R$ {Number(c.totalGasto).toFixed(2)}
                </div>
                <div>
                  <span className="font-medium">Última compra:</span> {c.ultimaCompra}
                </div>
                <div>
                  <span className="font-medium">Telefone:</span> {c.telefone}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setSummaryOpen(false)}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
function ClientList({ title, items, emptyHint }: { title: string; items: string[]; emptyHint?: string }) {
  return (
    <Card>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">{emptyHint ?? "Nenhum"}</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((i, idx) => (
            <li key={idx} className="rounded bg-background/40 px-2 py-1">
              {i}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Reports ---------- */
function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ReportsTab({
  storeId,
  onSubmitQuestion,
  onEnqueueFromReport,
  logAudit,
}: {
  storeId: string;
  onSubmitQuestion: (text: string) => Promise<void>;
  onEnqueueFromReport: (text: string) => Promise<void>;
  logAudit: (m: string) => void;
}) {
  const examples = ["qual foi meu faturamento hoje?", "mostrar financeiro hoje", "consultar caixa", "buscar cliente Ana"];
  const [snap, setSnap] = useState<OmniAgentReportsSnapshotDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [last, setLast] = useState<{ q: string; ok: boolean; detail: string } | null>(null);

  const load = useCallback(async () => {
    if (!storeId?.trim()) return;
    setLoading(true);
    try {
      const s = await getOmniAgentReportsSnapshot(storeId);
      setSnap(s);
    } catch {
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function ask() {
    const q = text.trim();
    if (!q) return toast.error("Digite uma pergunta");
    try {
      await onSubmitQuestion(q);
      setLast({
        q,
        ok: true,
        detail:
          "Comando enviado (canal texto interno, interpretação determinística). Veja a Inbox IA ou o feed para estado e resultado.",
      });
      setText("");
      logAudit(`Relatórios IA — pergunta: ${q}`);
      void load();
    } catch (e) {
      setLast({ q, ok: false, detail: e instanceof Error ? e.message : "Erro" });
    }
  }

  const stats = snap?.stats;
  const indicadores = snap?.financeiroHoje?.indicadores;
  const maxIntent = Math.max(1, ...(snap?.intentCounts.map((x) => x.count) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Activity}
          label="Comandos hoje"
          value={stats ? String(stats.todayCount) : "—"}
          hint="OmniAgentCommand"
          loading={loading}
          accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />
        <Stat
          icon={CheckCircle2}
          label="Executados"
          value={stats ? String(stats.executed) : "—"}
          loading={loading}
          accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        <Stat
          icon={Inbox}
          label="Pendentes + conf."
          value={stats ? String(stats.pending + stats.awaitingConfirmation) : "—"}
          loading={loading}
          accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
        <Stat
          icon={XCircle}
          label="Erros"
          value={stats ? String(stats.error) : "—"}
          loading={loading}
          accent="bg-destructive/10 text-destructive"
        />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Resumo financeiro (hoje)</h3>
          {snap?.financeiroSemPermissao ? (
            <Badge variant="secondary">Sem permissão</Badge>
          ) : (
            <Badge variant="outline">Serviço real</Badge>
          )}
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : snap?.financeiroSemPermissao ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            Esta conta não tem permissão para indicadores financeiros.
          </div>
        ) : !snap?.financeiroHoje ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Circle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            Sem dados ou serviço indisponível para o período.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Receita", val: indicadores?.receitaTotal, accent: "text-emerald-600 dark:text-emerald-400" },
              { label: "Despesa", val: indicadores?.despesaTotal, accent: "text-destructive" },
              { label: "Lucro líquido", val: indicadores?.lucroLiquido, accent: "" },
              { label: "A receber pend.", val: indicadores?.receberPendente, accent: "text-amber-600 dark:text-amber-400" },
            ].map(({ label, val, accent }) => (
              <div key={label} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
                <div className={cn("text-sm font-bold tabular-nums", accent)}>
                  {typeof val === "number" ? fmtBrl(val) : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Intenções (comandos recentes)</h3>
          <Badge variant="secondary">Até 400 mais recentes</Badge>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-36 rounded bg-muted animate-pulse" />
                <div className="h-2 flex-1 rounded bg-muted animate-pulse" />
                <div className="h-3 w-8 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : !snap?.intentCounts.length ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <BarChart3 className="h-6 w-6 text-muted-foreground/40" />
            <div className="text-sm text-muted-foreground">Nenhum comando registrado ainda</div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {snap.intentCounts.map((row) => (
              <div key={row.intent} className="flex items-center gap-3 text-xs min-w-0">
                <span className="w-36 shrink-0 font-mono text-[10px] text-muted-foreground truncate">{row.intent}</span>
                <div className="h-2 flex-1 min-w-0 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all duration-500"
                    style={{ width: `${Math.round((row.count / maxIntent) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-medium tabular-nums">{row.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="border-dashed">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Sem LLM</Badge>
          <span className="text-sm font-medium">Pergunta ao Agent</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Não há modelo de linguagem nesta fase: o texto é interpretado por regras e vira OmniAgentCommand real (canal texto interno).
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="flex-1 min-w-[200px]"
            placeholder="Pergunte algo ao seu negócio…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask();
            }}
          />
          <Button onClick={() => void ask()}>
            <Send /> Perguntar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setLast(null);
              toast("Painel local limpo");
            }}
          >
            <Trash2 /> Limpar
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((e) => (
            <Button
              key={e}
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await onSubmitQuestion(e);
                  setLast({ q: e, ok: true, detail: "Enviado — veja Inbox / feed." });
                  logAudit(`Relatórios — exemplo: ${e}`);
                  void load();
                } catch (err) {
                  setLast({ q: e, ok: false, detail: err instanceof Error ? err.message : "Erro" });
                }
              }}
            >
              {e}
            </Button>
          ))}
        </div>
        {last && (
          <div
            className={cn(
              "mt-4 rounded-lg border p-3 text-sm",
              last.ok ? "border-border bg-muted/50" : "border-destructive/50 bg-destructive/5",
            )}
          >
            <div className="text-xs text-muted-foreground mb-1">{last.ok ? "Último envio" : "Erro"}</div>
            <div className="font-medium">{last.q}</div>
            <div className="mt-1 text-xs">{last.detail}</div>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => void onEnqueueFromReport(`Triagem manual a partir de relatório: ${last.q}`)}
            >
              <Zap /> Enfileirar na Inbox
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Settings ---------- */
const CONFIRMABLE_INTENT_LABELS: Record<OmniAgentIntentKind, string> = {
  OS_OPEN: "Abrir OS",
  CLIENT_SEARCH: "Buscar cliente",
  PRODUCT_SEARCH: "Buscar produto",
  REMINDER_CREATE: "Lembrete / triagem",
  EXPENSE_CREATE: "Registrar despesa",
  RECEIVABLE_CREATE: "Registrar recebível",
  CASHBOX_QUERY: "Consultar caixa",
  FINANCE_SUMMARY: "Resumo financeiro",
  UNKNOWN: "Não reconhecido",
};

function SettingsTab({
  storeId,
  audit,
  logAudit,
}: {
  storeId: string;
  audit: string[];
  logAudit: (m: string) => void;
}) {
  const [config, setConfig] = useState<OmniAgentConfigDTO>(DEFAULT_OMNI_AGENT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const load = useCallback(async () => {
    if (!storeId?.trim()) return;
    setLoading(true);
    try {
      const c = await getOmniAgentConfig(storeId);
      setConfig(c);
    } catch {
      setConfig(DEFAULT_OMNI_AGENT_CONFIG);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleDay(d: string) {
    const days = config.businessHoursDays.includes(d)
      ? config.businessHoursDays.filter((x) => x !== d)
      : [...config.businessHoursDays, d];
    setConfig({ ...config, businessHoursDays: days });
  }

  function toggleExtraConfirm(intent: OmniAgentIntentKind) {
    const list = config.extraConfirmIntents.includes(intent)
      ? config.extraConfirmIntents.filter((i) => i !== intent)
      : [...config.extraConfirmIntents, intent];
    setConfig({ ...config, extraConfirmIntents: list });
  }

  async function save() {
    if (!storeId?.trim()) return;
    setSaving(true);
    try {
      const updated = await upsertOmniAgentConfig(storeId, {
        agentName: config.agentName,
        tone: config.tone,
        basePrompt: config.basePrompt,
        autonomyLevel: config.autonomyLevel,
        defaultChannel: config.defaultChannel,
        businessHoursStart: config.businessHoursStart,
        businessHoursEnd: config.businessHoursEnd,
        businessHoursDays: config.businessHoursDays,
        extraConfirmIntents: config.extraConfirmIntents,
      });
      setConfig(updated);
      logAudit("Configuração do agente: gravada no servidor");
      toast.success("Configuração gravada no servidor (Prisma, por loja)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gravar configuração");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!storeId?.trim()) return;
    setSaving(true);
    try {
      const def = await resetOmniAgentConfig(storeId);
      setConfig(def);
      logAudit("Configuração do agente: restaurada ao padrão");
      toast("Configuração restaurada ao padrão");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao restaurar configuração");
    } finally {
      setSaving(false);
    }
  }

  const allDays = OMNI_AGENT_WEEK_DAYS as readonly string[];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2 border-primary/20 bg-primary/5">
        <h3 className="mb-2 text-sm font-semibold">O que afeta o pipeline real (servidor)</h3>
        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
          <li><span className="text-foreground">Inbox IA</span>, botão <span className="text-foreground">Novo</span>, <span className="text-foreground">Simular</span> → Server Actions + Prisma (<span className="font-mono">OmniAgentCommand</span>)</li>
          <li>Confirmação de escrita (OS, lembrete, despesa, recebível) → sempre obrigatória no servidor, não configurável nesta tela</li>
          <li>Automações ativas → event bus → comando PENDENTE na Inbox (sem execução automática)</li>
          <li>Permissões efetivas → papel NextAuth + <span className="font-mono">INTENT_MODULE</span> (não editável aqui)</li>
          <li>Autonomia <span className="font-mono">baixo</span>, canal padrão e confirmações extra abaixo → gravados no servidor (<span className="font-mono">OmniAgentConfig</span>) e aplicados no próximo comando</li>
        </ul>
      </Card>
      <Card className="lg:col-span-2 border-dashed">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="secondary">Servidor · por loja</Badge>
          <span className="text-sm font-medium">Configuração real (Prisma), sem LLM</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Canal padrão, autonomia, confirmações extra, horário e perfil do agente gravam em{" "}
          <span className="font-mono text-foreground">OmniAgentConfig</span> — persistem entre navegadores e dispositivos
          para esta loja. Nome/tom/prompt ainda não alimentam um modelo de linguagem: são preferências reais, mas sem
          efeito de interpretação enquanto não existir um provider LLM (fase futura).
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Canal padrão</h3>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["texto_interno", "Texto"],
              ["whatsapp", "WhatsApp"],
              ["voz", "Voz"],
            ] as const
          ).map(([v, l]) =>
            v === "voz" ? (
              <span key={v} className="inline-flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled className="opacity-70">
                  {l}
                </Button>
                <Badge variant="outline">Em preparação</Badge>
              </span>
            ) : (
              <Button
                key={v}
                type="button"
                variant={config.defaultChannel === v ? "default" : "outline"}
                size="sm"
                onClick={() => setConfig({ ...config, defaultChannel: v })}
              >
                {l}
              </Button>
            ),
          )}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Usado como canal do comando quando nenhum canal é informado explicitamente (ex.: modal Novo).
        </p>

        <div className="mt-4 rounded-md border border-border p-2.5">
          <Label className="mb-1 block">Aprovação automática</Label>
          <p className="text-[10px] text-muted-foreground">
            Não existe: toda ação com efeito colateral (OS, lembrete, despesa, recebível) exige confirmação humana, por
            desenho de segurança. Isto nunca pode ser desligado por esta tela.
          </p>
        </div>

        <div className="mt-4">
          <Label className="mb-2 block">Autonomia</Label>
          <div className="flex gap-2">
            {OMNI_AGENT_AUTONOMY_LEVELS.map((a) => (
              <Button
                key={a}
                variant={config.autonomyLevel === a ? "default" : "outline"}
                size="sm"
                onClick={() => setConfig({ ...config, autonomyLevel: a })}
              >
                {a}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">baixo</span>: toda leitura (busca de cliente/produto, caixa,
            resumo financeiro) também passa por confirmação. <span className="font-medium text-foreground">medio</span>:
            padrão (só escritas + confirmações extra abaixo). <span className="font-medium text-foreground">alto</span>:
            igual a médio nesta fase — não existe execução sem confirmação para escritas, em nenhum nível.
          </p>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Confirmações extra (leitura)</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Marque para exigir confirmação humana também nestas leituras. Escritas já exigem sempre — não aparecem aqui
          porque não podem ser desmarcadas.
        </p>
        <div className="space-y-2">
          {OMNI_AGENT_CONFIRMABLE_READ_INTENTS.map((intent) => (
            <div key={intent} className="flex items-center justify-between rounded-md border border-border p-2">
              <span className="text-sm">{CONFIRMABLE_INTENT_LABELS[intent]}</span>
              <Switch
                checked={config.extraConfirmIntents.includes(intent)}
                onCheckedChange={() => toggleExtraConfirm(intent)}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Perfil do agente (sem LLM ainda)</h3>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={config.agentName} onChange={(e) => setConfig({ ...config, agentName: e.target.value })} />
          </div>
          <div>
            <Label className="mb-2 block">Tom</Label>
            <div className="flex flex-wrap gap-2">
              {OMNI_AGENT_TONES.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={config.tone === t ? "default" : "outline"}
                  onClick={() => setConfig({ ...config, tone: t })}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Prompt base</Label>
            <Textarea rows={3} value={config.basePrompt} onChange={(e) => setConfig({ ...config, basePrompt: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Horário de atendimento</h3>
        <div className="grid gap-3 grid-cols-2">
          <div>
            <Label>Início</Label>
            <Input
              type="time"
              value={config.businessHoursStart}
              onChange={(e) => setConfig({ ...config, businessHoursStart: e.target.value })}
            />
          </div>
          <div>
            <Label>Fim</Label>
            <Input
              type="time"
              value={config.businessHoursEnd}
              onChange={(e) => setConfig({ ...config, businessHoursEnd: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {allDays.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={config.businessHoursDays.includes(d) ? "default" : "outline"}
              onClick={() => toggleDay(d)}
            >
              {d}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Gravado no servidor; ainda não aplicado a nenhuma regra automática (sem execução autônoma fora de horário
          nesta fase).
        </p>

        <div className="mt-5 rounded-lg border border-border bg-muted/40 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Em preparação</Badge>
            <span className="text-sm font-medium">Plano / créditos IA</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Controlo de plano e quotas por modelo ainda não está ligado a esta página. Use a consola de faturação da sua conta.
          </p>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Auditoria (sessão)</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving || loading}>
              <Save /> {saving ? "Salvando…" : "Salvar"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void reset()} disabled={saving || loading}>
              <RefreshCw /> Restaurar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTestOpen(true)}>
              <Play /> Testar config
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setExportOpen(true);
                logAudit("Export: pré-visualização aberta");
              }}
            >
              <Download /> Exportar log
            </Button>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/30 p-1.5 space-y-0.5">
          {audit.length === 0 && (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              Sem atividade registrada nesta sessão
            </div>
          )}
          {audit.map((l, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md px-2 py-1 text-xs hover:bg-background/60 transition-colors">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
              <span className="font-mono text-muted-foreground leading-relaxed">{l}</span>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teste de configuração</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Não há LLM: mostra apenas a classificação determinística de uma frase de exemplo. Nome, tom e prompt acima são
            preferências gravadas no servidor — ainda não alteram a interpretação.
          </p>
          <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
            <div className="text-xs text-muted-foreground">Texto de exemplo</div>
            <div className="font-mono">&quot;vendi capa por R$ 30 no pix&quot;</div>
          </div>
          <div className="rounded-lg border border-border p-3 text-xs space-y-1 font-mono">
            {(() => {
              const interp = interpretOmniAgentCommand("vendi capa por R$ 30 no pix");
              return (
                <>
                  <div>intent: {interp.intent}</div>
                  <div>action: {interp.action}</div>
                  <div>confidence: {interp.confidence}</div>
                  <div>requiresConfirmation: {String(interp.requiresConfirmation)}</div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button onClick={() => setTestOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar configuração + auditoria</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-2">
            JSON inclui a configuração real gravada no servidor e as linhas de auditoria desta sessão. Use «Descarregar»
            para guardar ficheiro real.
          </p>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({ config, audit }, null, 2)}</pre>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(JSON.stringify({ config, audit }, null, 2));
                  toast.success("Copiado para a área de transferência");
                  logAudit("Export: JSON copiado");
                } catch {
                  toast("Copiado");
                }
              }}
            >
              <Copy /> Copiar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const body = JSON.stringify({ config, audit }, null, 2);
                const blob = new Blob([body], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `omni-agent-settings-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                logAudit("Export: ficheiro JSON descarregado");
                toast.success("Ficheiro descarregado");
              }}
            >
              <Download /> Descarregar
            </Button>
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
    { type: "simulate", label: "Simular comando", hint: "Pipeline real", icon: Play },
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

