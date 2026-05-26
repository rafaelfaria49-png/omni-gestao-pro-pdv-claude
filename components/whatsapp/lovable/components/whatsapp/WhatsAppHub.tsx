"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Search, Send, Phone, MoreVertical, Bot, User, Clock,
  FileText, Eye, DollarSign, Activity, Plus, Edit, Sparkles,
  MessageSquare, Users, CheckCircle2, TrendingUp, Bell, X,
  Paperclip, Wand2, AlertTriangle, Workflow, Settings as SettingsIcon,
  ArrowRight, Zap, ShieldCheck, CreditCard, Filter, Hash,
  Palette, BarChart3, Coins, ChevronRight, Trash2, Copy,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  variables,
  type Contact, type Automation, type QuickReply, type FunnelStage, type Trigger, type Action,
} from "./mockData";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import Link from "next/link";

// ───────── helpers ─────────
const THEMES = [
  { id: "light", label: "Light" },
  { id: "soft-ice", label: "Soft Ice" },
  { id: "midnight", label: "Midnight" },
  { id: "black", label: "Black" },
] as const;
type ThemeId = (typeof THEMES)[number]["id"];

const STAGES: { id: FunnelStage; label: string }[] = [
  { id: "novo", label: "Novo contato" },
  { id: "atendimento", label: "Em atendimento" },
  { id: "aguardando_cliente", label: "Aguardando cliente" },
  { id: "aguardando_orcamento", label: "Aguardando orçamento" },
  { id: "finalizado", label: "Finalizado" },
];

const TRIGGER_LABELS: Record<Trigger, string> = {
  new_contact: "Novo contato",
  keyword: "Palavra-chave",
  os_created: "OS criada",
  os_status_changed: "OS mudou status",
  budget_approved: "Orçamento aprovado",
  os_ready: "OS pronta",
  payment_pending: "Pagamento pendente",
  no_reply: "Cliente sem resposta",
};

const ACTION_LABELS: Record<Action, string> = {
  send_message: "Enviar mensagem",
  create_os: "Criar OS",
  notify_team: "Notificar equipe",
  move_funnel: "Mover no funil",
  send_payment_link: "Enviar link de pagamento",
  send_warranty: "Enviar garantia",
};

const CONDITION_OPTS = [
  "Cliente novo", "Cliente existente", "Tem OS aberta",
  "Tem orçamento pendente", "Fora do horário", "Valor acima de 50",
];

const statusLabel = (s: Contact["status"]) =>
  s === "auto" ? "Automático" : s === "human" ? "Humano" : "Aguardando";

function formatPhoneBr(digits: string) {
  const d = String(digits ?? "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) {
    return d.replace(/^55(\d{2})(\d{5})(\d{4})$/, "+55 $1 $2-$3");
  }
  return d || String(digits ?? "");
}

function formatMsgTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

function mapConversationsToContacts(rows: Record<string, unknown>[]): Contact[] {
  return rows.map((r) => {
    const contact = (r.contact && typeof r.contact === "object" ? r.contact : {}) as Record<string, unknown>;
    const phoneDigits = String(contact.phoneDigits ?? "");
    const meta =
      contact.metadata && typeof contact.metadata === "object" && !Array.isArray(contact.metadata)
        ? (contact.metadata as Record<string, unknown>)
        : {};
    const rawMsgs = Array.isArray(r.messages) ? (r.messages as Record<string, unknown>[]) : [];
    const messages: Contact["messages"] = rawMsgs.map((m) => ({
      id: String(m.id ?? ""),
      from: m.direction === "outbound" ? "me" : "them",
      text: String(m.body ?? ""),
      time: m.createdAt ? formatMsgTime(String(m.createdAt)) : "—",
    }));
    const lastAt = r.lastMessageAt ? String(r.lastMessageAt) : "";
    return {
      id: String(contact.id ?? ""),
      conversationId: String(r.id ?? ""),
      name: String(contact.displayName ?? phoneDigits ?? "—"),
      phone: formatPhoneBr(phoneDigits) || phoneDigits,
      lastMessage: String(r.lastMessagePreview ?? ""),
      lastTime: lastAt ? formatMsgTime(lastAt) : "—",
      unread: typeof r.unreadCount === "number" ? r.unreadCount : 0,
      status: r.humanMode === true ? "human" : "auto",
      stage: (["novo", "atendimento", "aguardando_cliente", "aguardando_orcamento", "finalizado"].includes(
        String(meta.stage)
      )
        ? meta.stage
        : "novo") as FunnelStage,
      responsible: String(meta.responsible ?? "—"),
      idleMinutes: typeof meta.idleMinutes === "number" ? meta.idleMinutes : 0,
      tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
      clientSince: String(
        meta.clientSince ?? new Date(String(contact.createdAt ?? "")).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      ),
      totalSpent: typeof meta.totalSpent === "number" ? meta.totalSpent : 0,
      notes: String(meta.notes ?? ""),
      messages,
      os: Array.isArray(meta.os) ? (meta.os as Contact["os"]) : [],
      history: Array.isArray(meta.history) ? (meta.history as Contact["history"]) : [],
    };
  });
}

// ───────── small components ─────────
function StatCard({ icon: Icon, label, value, hint }: any) {
  return (
    <Card className="p-4 bg-card text-card-foreground border-border hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="text-2xl font-bold text-primary">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}

function ThemeSelector({ theme, setTheme }: { theme: ThemeId; setTheme: (t: ThemeId) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border bg-card p-1">
      <Palette className="h-4 w-4 mx-1 text-muted-foreground" />
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          className={`text-xs px-2 py-1 rounded transition ${
            theme === t.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ───────── main ─────────
// Classe CSS global que cada ThemeId mapeia (alinha com globals.css e ThemeProvider)
const THEME_TO_GLOBAL_CLASS: Record<ThemeId, string> = {
  light: "light",
  "soft-ice": "soft-ice",
  midnight: "midnight",
  black: "black-edition",
};
const GLOBAL_THEME_CLASSES = ["light", "soft-ice", "midnight", "black-edition"];
const GLOBAL_STORAGE_KEY = "omni-studio-dual-theme";

/**
 * Aplica o tema tanto no sistema interno do Hub (data-theme)
 * quanto no sistema global do OmniGestão (data-studio-theme + CSS classes),
 * garantindo que sidebar, header e demais elementos do layout herdem o tema.
 */
function applyHubTheme(t: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Hub: data-theme (para qualquer CSS local que dependa dele)
  root.setAttribute("data-theme", t);
  // Global: classe CSS (black-edition, soft-ice, midnight, light)
  root.classList.remove(...GLOBAL_THEME_CLASSES);
  root.classList.add(THEME_TO_GLOBAL_CLASS[t]);
  // Global: data-studio-theme (usado por outros componentes do shell)
  root.setAttribute("data-studio-theme", t === "black" ? "black" : t);
  try {
    localStorage.setItem("omni-theme", t);
    localStorage.setItem(GLOBAL_STORAGE_KEY, t === "black" ? "black" : t);
  } catch { /* ignore */ }
}

export default function WhatsAppHub() {
  const { lojaAtivaId } = useLojaAtiva();
  const storeHeader = lojaAtivaId?.trim() ?? "";
  const apiHeaders = useMemo(
    () => (storeHeader ? { [ASSISTEC_LOJA_HEADER]: storeHeader } : null),
    [storeHeader]
  );

  // theme — lê do sistema global primeiro, depois do storage local do hub
  const [theme, setThemeState] = useState<ThemeId>("light");
  useEffect(() => {
    const globalSaved = typeof window !== "undefined"
      ? (localStorage.getItem(GLOBAL_STORAGE_KEY) ?? "")
      : "";
    const hubSaved = typeof window !== "undefined"
      ? (localStorage.getItem("omni-theme") ?? "")
      : "";
    const raw = globalSaved || hubSaved;
    const t: ThemeId = (THEMES.find((x) => x.id === raw) ? raw : "light") as ThemeId;
    setThemeState(t);
    applyHubTheme(t);
  }, []);
  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    applyHubTheme(t);
  };

  // state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!apiHeaders) {
      setDataLoading(false);
      setContacts([]);
      setAutomations([]);
      setReplies([]);
      return;
    }
    async function loadData() {
      const hdr = apiHeaders!
      setDataLoading(true);
      try {
        const [convRes, aRes, qRes] = await Promise.all([
          fetch("/api/whatsapp/conversations?includeMessages=1", { headers: hdr, credentials: "include" }),
          fetch("/api/whatsapp/automations", { headers: hdr, credentials: "include" }),
          fetch("/api/whatsapp/quick-replies", { headers: hdr, credentials: "include" }),
        ]);
        const [convJson, aJson, qJson] = await Promise.all([convRes.json(), aRes.json(), qRes.json()]);

        let mappedContacts: Contact[] = [];

        if (convJson.ok && Array.isArray(convJson.conversations) && convJson.conversations.length > 0) {
          mappedContacts = mapConversationsToContacts(convJson.conversations as Record<string, unknown>[]);
        } else {
          const cRes = await fetch("/api/whatsapp/contacts", { headers: hdr, credentials: "include" });
          const cJson = await cRes.json();
          if (cJson.ok && Array.isArray(cJson.contacts) && cJson.contacts.length > 0) {
            mappedContacts = (cJson.contacts as Record<string, unknown>[]).map((c) => {
              const meta = c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
                ? (c.metadata as Record<string, unknown>) : {};
              const phone = String(c.phoneDigits ?? "").replace(/^55(\d{2})(\d{5})(\d{4})$/, "+55 $1 $2-$3");
              return {
                id: String(c.id ?? ""),
                name: String(c.displayName ?? c.phoneDigits ?? "—"),
                phone: phone || String(c.phoneDigits ?? ""),
                lastMessage: String(meta.lastMessage ?? ""),
                lastTime: String(meta.lastTime ?? "—"),
                unread: typeof meta.unread === "number" ? meta.unread : 0,
                status: (["auto","human","waiting"].includes(String(meta.status)) ? meta.status : "auto") as Contact["status"],
                stage: (["novo","atendimento","aguardando_cliente","aguardando_orcamento","finalizado"].includes(String(meta.stage)) ? meta.stage : "novo") as FunnelStage,
                responsible: String(meta.responsible ?? "—"),
                idleMinutes: typeof meta.idleMinutes === "number" ? meta.idleMinutes : 0,
                tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
                clientSince: String(meta.clientSince ?? new Date(String(c.createdAt ?? "")).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })),
                totalSpent: typeof meta.totalSpent === "number" ? meta.totalSpent : 0,
                notes: String(meta.notes ?? ""),
                messages: Array.isArray(meta.messages) ? (meta.messages as Contact["messages"]) : [],
                os: Array.isArray(meta.os) ? (meta.os as Contact["os"]) : [],
                history: Array.isArray(meta.history) ? (meta.history as Contact["history"]) : [],
              };
            });
          }
        }

        setContacts(mappedContacts);
        if (mappedContacts.length > 0) setSelectedId(mappedContacts[0].id);

        if (aJson.ok && Array.isArray(aJson.automations)) {
          const mapped: Automation[] = (aJson.automations as Record<string, unknown>[]).map((a) => {
            const acts = a.actions && typeof a.actions === "object" && !Array.isArray(a.actions)
              ? (a.actions as Record<string, unknown>) : {};
            const conds = a.conditions && typeof a.conditions === "object" && !Array.isArray(a.conditions)
              ? (a.conditions as Record<string, unknown>) : {};
            return {
              id: String(a.id ?? ""),
              name: String(a.name ?? ""),
              description: String(acts.description ?? ""),
              enabled: Boolean(a.enabled),
              trigger: (String(a.triggerType ?? "keyword")) as Trigger,
              conditions: Array.isArray(conds.list) ? (conds.list as string[]) : [],
              action: (String(acts.type ?? "send_message")) as Action,
              message: String(acts.replyText ?? acts.message ?? ""),
              lastRun: String(acts.lastRun ?? "—"),
              runs: typeof acts.runs === "number" ? acts.runs : 0,
            };
          });
          setAutomations(mapped);
        }

        if (qJson.ok && Array.isArray(qJson.quickReplies)) {
          const mapped: QuickReply[] = (qJson.quickReplies as Record<string, unknown>[]).map((q) => ({
            id: String(q.id ?? ""),
            title: String(q.title ?? ""),
            category: (String(q.category ?? "Boas-vindas")) as QuickReply["category"],
            shortcut: String(q.shortcut ?? ""),
            message: String(q.body ?? ""),
          }));
          setReplies(mapped);
        }
      } catch {
        setContacts([]);
      } finally {
        setDataLoading(false);
      }
    }
    void loadData();
  }, [apiHeaders]);
  const [search, setSearch] = useState("");
  const [convFilter, setConvFilter] = useState<"all" | "auto" | "human" | "waiting">("all");
  const [draft, setDraft] = useState("");
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [tab, setTab] = useState("dashboard");

  // modals
  const [editingAuto, setEditingAuto] = useState<Automation | null>(null);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [osModal, setOsModal] = useState<null | "open" | "status" | "budget">(null);

  const selected = contacts.find((c) => c.id === selectedId) ?? contacts[0];
  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) &&
      (convFilter === "all" || c.status === convFilter)
  );

  const sendMessage = useCallback(async (text?: string) => {
    const t = (text ?? draft).trim();
    if (!t || !apiHeaders) return;
    const convId = selected?.conversationId;
    if (convId) {
      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...apiHeaders },
          body: JSON.stringify({ conversationId: convId, text: t }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string; messageId?: string };
        if (!j.ok) {
          toast.error(typeof j.error === "string" ? j.error : "Falha ao enviar");
          return;
        }
        setContacts((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    { id: j.messageId ?? `tmp-${Date.now()}`, from: "me", text: t, time: "agora" },
                  ],
                  lastMessage: t,
                  lastTime: "agora",
                  unread: 0,
                }
              : c
          )
        );
        setDraft("");
        return;
      } catch {
        toast.error("Erro de rede ao enviar");
        return;
      }
    }
    setContacts((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? {
              ...c,
              messages: [...c.messages, { id: Date.now().toString(), from: "me", text: t, time: "agora" }],
              lastMessage: t,
              lastTime: "agora",
              unread: 0,
            }
          : c
      )
    );
    setDraft("");
  }, [apiHeaders, draft, selected?.conversationId, selectedId]);

  const applyAiSuggestion = useCallback(async () => {
    if (!apiHeaders) return;
    const convId = selected?.conversationId;
    if (!convId) {
      toast.info("Selecione uma conversa da API para gerar sugestão IA");
      return;
    }
    setAiSuggestLoading(true);
    try {
      const res = await fetch("/api/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ mode: "ai_suggestion", conversationId: convId }),
      });
      const j = (await res.json()) as {
        suggestion?: string
        source?: string
        error?: string
      };
      if (!res.ok || !j.suggestion) {
        toast.error(typeof j.error === "string" ? j.error : "IA indisponível");
        return;
      }
      setDraft(j.suggestion);
      if (j.source === "llm") {
        toast.success("Sugestão IA real — revise antes de enviar");
      } else {
        toast.info("Sugestão local (fallback — IA indisponível no servidor)");
      }
    } catch {
      toast.error("Erro ao buscar sugestão");
    } finally {
      setAiSuggestLoading(false);
    }
  }, [apiHeaders, selected?.conversationId]);

  const moveStage = (id: string, dir: 1 | -1) => {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const idx = STAGES.findIndex((s) => s.id === c.stage);
        const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, idx + dir))];
        return { ...c, stage: next.id };
      })
    );
  };

  const totalUnread = contacts.reduce((s, c) => s + c.unread, 0);
  const waiting = contacts.filter((c) => c.status === "waiting").length;
  const activeAutos = automations.filter((a) => a.enabled).length;

  // alerts
  const alerts = useMemo(() => {
    const a: { type: "warn" | "info" | "danger"; text: string }[] = [];
    contacts.forEach((c) => {
      if (c.idleMinutes > 10 && c.status === "waiting")
        a.push({ type: "danger", text: `${c.name} aguarda há ${c.idleMinutes} min` });
      if (c.responsible === "—")
        a.push({ type: "warn", text: `Conversa de ${c.name} sem responsável` });
    });
    return a;
  }, [contacts]);

  if (!storeHeader) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
        <Badge variant="outline">Protótipo Lovable · legado</Badge>
        <p className="text-sm text-muted-foreground max-w-md">
          Selecione uma unidade ativa no menu superior ou use o HUB operacional para atendimento real com envio Meta.
        </p>
        <Button asChild size="sm">
          <Link href="/dashboard/whatsapp">Abrir HUB operacional</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-amber-500/30 bg-amber-500/5 px-6 py-2 text-center text-[11px] text-muted-foreground">
        Protótipo legado — preferir{" "}
        <Link href="/dashboard/whatsapp" className="font-medium text-primary underline-offset-2 hover:underline">
          HUB operacional
        </Link>{" "}
        para inbox, CRM e envio Meta.
      </div>
      {/* HEADER */}
      <div className="px-6 py-4 border-b bg-background">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              WhatsApp — protótipo Lovable
            </h1>
            <p className="text-sm text-muted-foreground">UI legada · simulações e tabs experimentais</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ThemeSelector theme={theme} setTheme={setTheme} />
            {totalUnread > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Bell className="h-3 w-3" /> {totalUnread} novas
              </Badge>
            )}
            {waiting > 0 && (
              <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/20">
                <Clock className="h-3 w-3" /> {waiting} aguardando
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full flex flex-col">
        <div className="px-6 pt-3 border-b bg-background">
          <TabsList>
            <TabsTrigger value="dashboard"><BarChart3 className="h-3.5 w-3.5 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="funil"><Workflow className="h-3.5 w-3.5 mr-1" />Funil</TabsTrigger>
            <TabsTrigger value="conversas"><MessageSquare className="h-3.5 w-3.5 mr-1" />Conversas</TabsTrigger>
            <TabsTrigger value="automacoes"><Zap className="h-3.5 w-3.5 mr-1" />Automações</TabsTrigger>
            <TabsTrigger value="builder"><Workflow className="h-3.5 w-3.5 mr-1" />Fluxos</TabsTrigger>
            <TabsTrigger value="ia"><Sparkles className="h-3.5 w-3.5 mr-1" />IA</TabsTrigger>
            <TabsTrigger value="respostas"><Hash className="h-3.5 w-3.5 mr-1" />Respostas</TabsTrigger>
            <TabsTrigger value="config"><SettingsIcon className="h-3.5 w-3.5 mr-1" />Configurações</TabsTrigger>
          </TabsList>
        </div>

        {/* ───────── DASHBOARD ───────── */}
        <TabsContent value="dashboard" className="p-6 m-0">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <StatCard icon={MessageSquare} label="Conversas" value={contacts.length} hint={`${totalUnread} não lidas`} />
            <StatCard icon={Clock} label="Em aberto" value={waiting} hint="Aguardando resposta" />
            <StatCard icon={Bot} label="Automações ativas" value={activeAutos} hint={`${automations.length} no total`} />
            <StatCard icon={CheckCircle2} label="Modo humano" value={contacts.filter((c) => c.status === "human").length} hint="Conversas" />
            <StatCard icon={TrendingUp} label="Com mensagens" value={contacts.filter((c) => c.lastMessage).length} hint="Ativas" />
            <StatCard icon={FileText} label="Com OS (meta)" value={contacts.filter((c) => c.os.length > 0).length} hint="Metadata contato" />
            <StatCard icon={Users} label="Novo funil" value={contacts.filter((c) => c.stage === "novo").length} hint="Estágio inicial" />
            <StatCard icon={DollarSign} label="Orçamento pend." value={contacts.filter((c) => c.stage === "aguardando_orcamento").length} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-6 lg:col-span-2 bg-card text-card-foreground">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-foreground">
                <Activity className="h-4 w-4 text-primary" /> Atividade recente
              </h3>
              <div className="space-y-3">
                {contacts.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 text-sm">
                    <Avatar className="h-8 w-8"><AvatarFallback>{c.name[0]}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-muted-foreground truncate">{c.lastMessage}</div>
                    </div>
                    <Badge variant="outline">{statusLabel(c.status)}</Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 bg-card text-card-foreground">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" /> Alertas de atendimento
              </h3>
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-md border bg-muted/40">
                    <AlertTriangle className={`h-4 w-4 mt-0.5 ${a.type === "danger" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="flex-1">{a.text}</span>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-primary">
                <Coins className="h-4 w-4" /> Uso do mês
              </h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Mensagens enviadas</span><span>1.284</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Automações executadas</span><span>312</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Respostas IA</span><span>87</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Créditos consumidos</span><span>420 / 1000</span></div>
              </div>
              <Button size="sm" className="w-full mt-3" variant="outline">Fazer upgrade de plano</Button>
            </Card>
          </div>
        </TabsContent>

        {/* ───────── FUNIL ───────── */}
        <TabsContent value="funil" className="p-6 m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {STAGES.map((stage) => {
              const items = contacts.filter((c) => c.stage === stage.id);
              return (
                <div key={stage.id} className="flex flex-col bg-muted/40 rounded-lg p-2 min-h-[300px]">
                  <div className="flex items-center justify-between px-2 py-2">
                    <span className="text-sm font-semibold">{stage.label}</span>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map((c) => (
                      <Card key={c.id} className="p-3 bg-card text-card-foreground space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">{c.name[0]}</AvatarFallback></Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{c.name}</div>
                            <div className="text-xs text-muted-foreground">{c.phone}</div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{c.lastMessage}</div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground"><Clock className="inline h-3 w-3 mr-0.5" />{c.idleMinutes}m</span>
                          <span className="text-muted-foreground">{c.responsible}</span>
                        </div>
                        <div className="flex items-center justify-between gap-1 pt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {c.status === "auto" ? <Bot className="h-2.5 w-2.5 mr-1" /> : <User className="h-2.5 w-2.5 mr-1" />}
                            {statusLabel(c.status)}
                          </Badge>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveStage(c.id, -1)}>
                              <ChevronRight className="h-3 w-3 rotate-180" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveStage(c.id, 1)}>
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ───────── CONVERSAS ───────── */}
        <TabsContent value="conversas" className="m-0">
          {!selected ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">Nenhuma conversa disponível</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Conecte o WhatsApp ou aguarde mensagens de clientes para iniciar o atendimento.
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-[300px_1fr_280px]">
            {/* LIST */}
            <div className="border-r flex flex-col bg-background">
              <div className="p-3 border-b space-y-2">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input placeholder="Buscar contato..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="flex gap-1">
                  {(["all","auto","human","waiting"] as const).map((f) => (
                    <button key={f} onClick={() => setConvFilter(f)}
                      className={`text-[10px] px-2 py-1 rounded-md border transition ${convFilter===f?"bg-primary text-primary-foreground border-primary":"bg-card hover:bg-muted"}`}>
                      <Filter className="h-2.5 w-2.5 inline mr-1" />
                      {f === "all" ? "Todos" : f === "auto" ? "Auto" : f === "human" ? "Humano" : "Aguard."}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {filteredContacts.map((c) => (
                  <button key={c.id} onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-3 py-3 flex gap-3 hover:bg-muted/50 border-b transition ${selectedId === c.id ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}>
                    <Avatar>
                      <AvatarFallback className={selectedId === c.id ? "bg-primary text-primary-foreground" : ""}>
                        {c.name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className={`font-medium truncate ${selectedId === c.id ? "text-primary" : ""}`}>{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.lastTime}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-sm text-muted-foreground truncate">{c.lastMessage}</span>
                        {c.unread > 0 && (
                          <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-semibold">
                            {c.unread}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {c.status === "auto" ? <Bot className="h-2.5 w-2.5 mr-1 text-primary" /> : <User className="h-2.5 w-2.5 mr-1" />}
                          {statusLabel(c.status)}
                        </Badge>
                        {c.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* CHAT */}
            <div className="flex flex-col bg-muted/20 border-r">
              <div className="px-4 py-3 border-b bg-background flex items-center justify-between">
                <button onClick={() => setProfileOpen(true)} className="flex items-center gap-3 hover:opacity-80">
                  <Avatar><AvatarFallback className="bg-primary/20 text-primary">{selected.name[0]}</AvatarFallback></Avatar>
                  <div className="text-left">
                    <div className="font-medium">{selected.name}</div>
                    <div className="text-xs text-primary/70">{selected.phone}</div>
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon"><Phone className="h-4 w-4 text-primary" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setProfileOpen(true)}><MoreVertical className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* OS quick actions */}
              <div className="px-4 py-2 border-b bg-background flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setOsModal("open")}><FileText className="h-3.5 w-3.5 mr-1 text-primary" />Abrir OS</Button>
                <Button size="sm" variant="outline" onClick={() => toast.info("Visualizando OS")}><Eye className="h-3.5 w-3.5 mr-1" />Ver OS</Button>
                <Button size="sm" variant="outline" onClick={() => setOsModal("budget")}><DollarSign className="h-3.5 w-3.5 mr-1 text-primary" />Enviar orçamento</Button>
                <Button size="sm" variant="outline" onClick={() => setOsModal("status")}><Activity className="h-3.5 w-3.5 mr-1" />Enviar status</Button>
                <Button size="sm" variant="outline" onClick={() => toast.success("Cobrança enviada")}><CreditCard className="h-3.5 w-3.5 mr-1" />Cobrar</Button>
                <Button size="sm" variant="outline" onClick={() => toast.success("Garantia enviada")}><ShieldCheck className="h-3.5 w-3.5 mr-1 text-primary" />Garantia</Button>
              </div>

              <div className="px-4 py-4 space-y-2">
                {selected.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                    <div className={`rounded-lg px-3 py-2 max-w-[75%] text-sm shadow-sm ${
                      m.from === "me" ? "bg-primary text-primary-foreground" : "bg-card border text-card-foreground"
                    }`}>
                      {m.text}
                      <div className="text-[10px] mt-1 opacity-70">{m.time}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick replies */}
              <div className="px-4 py-2 border-t bg-background flex flex-wrap gap-2">
                {replies.slice(0, 6).map((r) => (
                  <Button key={r.id} size="sm" variant="secondary" className="shrink-0 text-xs" onClick={() => sendMessage(r.message)}>
                    {r.title}
                  </Button>
                ))}
              </div>

              {/* Input */}
              <div className="p-3 border-t bg-background flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => toast.info("Anexar (em breve)")}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={
                    selected?.conversationId
                      ? "Sugestão IA (LLM ou fallback local)"
                      : "Requer conversa vinculada à API"
                  }
                  disabled={!selected?.conversationId || aiSuggestLoading}
                  onClick={() => void applyAiSuggestion()}
                >
                  <Wand2 className="h-4 w-4 text-primary" />
                </Button>
                <Input
                  placeholder="Digite uma mensagem..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                />
                <Button onClick={() => sendMessage()} className="bg-primary text-primary-foreground hover:opacity-90">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* CONTACT PANEL */}
            <div className="hidden md:flex flex-col bg-background">
              <div className="p-4 space-y-4">
                <div className="flex flex-col items-center text-center pb-2">
                  <Avatar className="h-16 w-16"><AvatarFallback className="text-lg bg-primary/20 text-primary">{selected.name[0]}</AvatarFallback></Avatar>
                  <div className="font-semibold mt-2">{selected.name}</div>
                  <div className="text-xs text-primary/70">{selected.phone}</div>
                </div>
                <Separator />
                <div className="text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Cliente desde</span><span className="text-primary font-medium">{selected.clientSince}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total gasto</span><span className="font-medium">R$ {selected.totalSpent}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Responsável</span><span>{selected.responsible}</span></div>
                </div>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-primary flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />OS vinculadas</h4>
                  {selected.os.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma OS</p> :
                    <div className="space-y-2">
                      {selected.os.map((o) => (
                        <Card key={o.id} className="p-2 text-xs bg-card border-primary/20">
                          <div className="font-medium text-primary">{o.id}</div>
                          <div className="text-muted-foreground">{o.title}</div>
                          <Badge variant="outline" className="mt-1 border-primary/40 text-primary">{o.status}</Badge>
                        </Card>
                      ))}
                    </div>
                  }
                </div>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-2">Observações internas</h4>
                  <Textarea defaultValue={selected.notes} rows={3} className="text-xs" />
                </div>
              </div>
            </div>
          </div>
          )}
        </TabsContent>

        {/* ───────── AUTOMAÇÕES ───────── */}
        <TabsContent value="automacoes" className="p-6 m-0">
          <div className="space-y-3">
            {automations.map((a) => (
              <Card key={a.id} className="p-4 flex items-center gap-4 bg-card text-card-foreground flex-wrap">
                <Switch checked={a.enabled} onCheckedChange={async () => {
                  const newEnabled = !a.enabled;
                  setAutomations((p) => p.map((x) => x.id===a.id?{...x,enabled:newEnabled}:x));
                  try {
                    const res = await fetch(`/api/whatsapp/automations/${a.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", ...apiHeaders },
                      body: JSON.stringify({ enabled: newEnabled }),
                    });
                    const j = (await res.json()) as { ok?: boolean; error?: string };
                    if (!j.ok) throw new Error(j.error ?? "Falha ao salvar");
                  } catch {
                    setAutomations((p) => p.map((x) => x.id===a.id?{...x,enabled:!newEnabled}:x));
                    toast.error("Falha ao atualizar automação");
                  }
                }} />
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium flex items-center gap-2">
                    {a.name}
                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">{TRIGGER_LABELS[a.trigger]}</Badge>
                    <ArrowRight className="h-3 w-3 text-primary" />
                    <Badge variant="outline" className="text-[10px]">{ACTION_LABELS[a.action]}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">{a.description}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Última execução: {a.lastRun} · {a.runs} disparos
                  </div>
                </div>
                <Badge variant={a.enabled ? "default" : "outline"}>{a.enabled ? "Ativa" : "Pausada"}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setEditingAuto({ ...a })}>
                  <Edit className="h-4 w-4 mr-1" /> Editar
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ───────── BUILDER ───────── */}
        <TabsContent value="builder" className="p-6 m-0">
          <div className="w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Construtor de fluxos</h3>
                <p className="text-sm text-muted-foreground">Monte fluxos visuais: Gatilho → Condição → Ação → Mensagem</p>
              </div>
              <Button><Plus className="h-4 w-4 mr-1" />Novo fluxo</Button>
            </div>

            <Card className="p-6 bg-card text-card-foreground">
              <div className="text-sm font-medium mb-4">Exemplo: Cliente pede orçamento</div>
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                {[
                  { icon: Zap, title: "Gatilho", body: "Mensagem contém 'orçamento'", color: "bg-primary/10 text-primary border border-primary/30" },
                  { icon: Filter, title: "Condição", body: "Cliente possui OS aberta", color: "bg-muted" },
                  { icon: Activity, title: "Ação", body: "Enviar status da OS", color: "bg-muted" },
                  { icon: Bell, title: "Notificar", body: "Atendente Lucas", color: "bg-muted" },
                ].map((step, i, arr) => (
                  <div key={i} className="flex items-center gap-3 flex-1">
                    <Card className={`p-3 flex-1 ${step.color}`}>
                      <div className="flex items-center gap-2 text-xs font-semibold mb-1">
                        <step.icon className="h-3.5 w-3.5" />
                        {step.title}
                      </div>
                      <div className="text-sm">{step.body}</div>
                    </Card>
                    {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground hidden md:block" />}
                  </div>
                ))}
              </div>
              <Separator className="my-6" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" />Adicionar passo</Button>
                <Button variant="outline" size="sm">Duplicar</Button>
                <Button variant="outline" size="sm" onClick={() => toast.success("Fluxo salvo")}>Salvar fluxo</Button>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ───────── IA ───────── */}
        <TabsContent value="ia" className="p-6 m-0">
          <div className="grid lg:grid-cols-2 gap-4 w-full">
            <Card className="p-6 bg-card text-card-foreground">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Recursos da IA</h3>
                  <p className="text-sm text-muted-foreground">Ative os assistentes inteligentes</p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  "Responder automaticamente",
                  "Sugerir respostas",
                  "Resumir conversa",
                  "Detectar intenção",
                  "Criar OS a partir da conversa",
                  "Gerar orçamento a partir do relato",
                  "Detectar cliente irritado",
                  "Sugerir próxima ação",
                ].map((opt, i) => (
                  <div key={opt} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <span className="text-sm">{opt}</span>
                    <Switch defaultChecked={i < 3} />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 bg-card text-card-foreground">
              <h3 className="font-semibold mb-1">Treinamento da IA</h3>
              <p className="text-sm text-muted-foreground mb-4">Personalize o comportamento do assistente</p>
              <div className="space-y-3">
                <div><Label>Nome da loja</Label><Input defaultValue="OmniGestão Tech" /></div>
                <div><Label>Serviços oferecidos</Label><Textarea rows={2} defaultValue="Conserto de celulares, notebooks, tablets" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Horário</Label><Input defaultValue="Seg-Sex 9h-18h" /></div>
                  <div><Label>Garantia</Label><Input defaultValue="90 dias" /></div>
                </div>
                <div>
                  <Label>Tom de voz</Label>
                  <Select defaultValue="amigavel">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profissional">Profissional</SelectItem>
                      <SelectItem value="amigavel">Amigável</SelectItem>
                      <SelectItem value="direto">Direto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Mensagens proibidas</Label><Textarea rows={2} placeholder="Ex: nunca prometer prazo abaixo de 24h" /></div>
                <div><Label>Quando transferir para humano</Label><Textarea rows={2} defaultValue="Cliente irritado, valor acima de R$ 500, cobranças" /></div>
                <Button onClick={() => toast.success("Treinamento salvo")}>Salvar treinamento</Button>
              </div>
            </Card>

            <Card className="p-6 lg:col-span-2 bg-card text-card-foreground">
              <h3 className="font-semibold mb-2">Sugestão de resposta no chat</h3>
              <p className="text-sm text-muted-foreground">
                Use o botão <Wand2 className="inline h-3.5 w-3.5 text-primary" /> na conversa: o servidor
                gera sugestão via LLM quando a API está configurada, ou aplica fallback local com aviso
                honesto quando a IA estiver indisponível. Não há exemplos fictícios nesta tela.
              </p>
            </Card>
          </div>
        </TabsContent>

        {/* ───────── RESPOSTAS ───────── */}
        <TabsContent value="respostas" className="p-6 m-0">
          <div className="w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Respostas rápidas</h3>
                <p className="text-sm text-muted-foreground">Mensagens prontas com atalhos e variáveis</p>
              </div>
              <Button onClick={() => setEditingReply({ id: "", title: "", category: "Boas-vindas", shortcut: "", message: "" })}>
                <Plus className="h-4 w-4 mr-1" /> Nova resposta
              </Button>
            </div>
            <div className="space-y-2">
              {replies.map((r) => (
                <Card key={r.id} className="p-3 flex items-center gap-3 bg-card text-card-foreground">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.title}</span>
                      <Badge variant="secondary" className="text-[10px]">{r.category}</Badge>
                      <code className="text-[10px] text-muted-foreground">{r.shortcut}</code>
                    </div>
                    <div className="text-sm text-muted-foreground truncate">{r.message}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditingReply({ ...r })}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(r.message); toast.success("Copiado"); }}><Copy className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={async () => {
                    if (!apiHeaders) return;
                    try {
                      const res = await fetch(`/api/whatsapp/quick-replies/${r.id}`, {
                        method: "DELETE",
                        headers: apiHeaders,
                        credentials: "include",
                      });
                      const j = (await res.json()) as { ok?: boolean; error?: string };
                      if (!j.ok) throw new Error(j.error ?? "Falha ao excluir");
                      setReplies((prev) => prev.filter((x) => x.id !== r.id));
                      toast.success("Resposta excluída");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Falha ao excluir resposta");
                    }
                  }}><Trash2 className="h-4 w-4" /></Button>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ───────── CONFIG ───────── */}
        <TabsContent value="config" className="p-6 m-0">
          <div className="space-y-4 w-full">
            <Card className="p-6 bg-card text-card-foreground">
              <h3 className="font-semibold mb-1">Conexão WhatsApp</h3>
              <p className="text-sm text-muted-foreground mb-4">Provedor: WhatsApp Cloud API</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline">Não conectado</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Número</span><span>—</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Webhook</span><code className="text-xs">https://api.omni.app/wa/webhook</code></div>
              </div>
              <Button className="mt-4" disabled>Conectar WhatsApp (em breve)</Button>
            </Card>

            <Card className="p-6 bg-card text-card-foreground">
              <h3 className="font-semibold mb-3">Horário de atendimento</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Início</Label><Input type="time" defaultValue="09:00" /></div>
                <div><Label>Fim</Label><Input type="time" defaultValue="18:00" /></div>
              </div>
              <div className="mt-3">
                <Label>Dias</Label>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map((d, i) => (
                    <Badge key={d} variant={i<5?"default":"outline"} className="cursor-pointer">{d}</Badge>
                  ))}
                </div>
              </div>
              <div className="mt-3"><Label>Mensagem fora do horário</Label>
                <Textarea rows={2} defaultValue="Estamos fora do horário. Retornaremos em breve." />
              </div>
            </Card>

            <Card className="p-6 bg-card text-card-foreground">
              <h3 className="font-semibold mb-3">Equipe</h3>
              <div className="space-y-2">
                {["Lucas (admin)", "Mariana", "Pedro"].map((m) => (
                  <div key={m} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                    <span>{m}</span>
                    <Switch defaultChecked />
                  </div>
                ))}
              </div>
              <div className="mt-3"><Label>Responsável padrão</Label>
                <Select defaultValue="lucas">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lucas">Lucas</SelectItem>
                    <SelectItem value="mari">Mariana</SelectItem>
                    <SelectItem value="pedro">Pedro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <Card className="p-6 bg-card text-card-foreground">
              <h3 className="font-semibold mb-3">Regras</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span>Tempo máx. sem resposta (min)</span><Input className="w-24" defaultValue="10" /></div>
                <div className="flex items-center justify-between"><span>Alertar após (min)</span><Input className="w-24" defaultValue="15" /></div>
                <div className="flex items-center justify-between"><span>Encerrar conversa após (h)</span><Input className="w-24" defaultValue="24" /></div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ───────── AUTOMATION EDITOR ───────── */}
      <Dialog open={!!editingAuto} onOpenChange={(o) => !o && setEditingAuto(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar automação</DialogTitle>
            <DialogDescription>Configure gatilho, condições, ação e mensagem</DialogDescription>
          </DialogHeader>
          {editingAuto && (
            <div className="space-y-4">
              <div><Label>Nome</Label>
                <Input value={editingAuto.name} onChange={(e) => setEditingAuto({ ...editingAuto, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Gatilho</Label>
                  <Select value={editingAuto.trigger} onValueChange={(v: Trigger) => setEditingAuto({ ...editingAuto, trigger: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Ação</Label>
                  <Select value={editingAuto.action} onValueChange={(v: Action) => setEditingAuto({ ...editingAuto, action: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTION_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Condições</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {CONDITION_OPTS.map((c) => {
                    const active = editingAuto.conditions.includes(c);
                    return (
                      <Badge key={c} variant={active ? "default" : "outline"} className="cursor-pointer"
                        onClick={() => setEditingAuto({
                          ...editingAuto,
                          conditions: active ? editingAuto.conditions.filter((x) => x !== c) : [...editingAuto.conditions, c],
                        })}>
                        {c}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Mensagem</Label>
                <Textarea rows={3} value={editingAuto.message} onChange={(e) => setEditingAuto({ ...editingAuto, message: e.target.value })} />
                <div className="mt-2 flex flex-wrap gap-1">
                  {variables.map((v) => (
                    <Badge key={v} variant="secondary" className="cursor-pointer text-[10px]"
                      onClick={() => setEditingAuto({ ...editingAuto, message: editingAuto.message + " " + v })}>
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
              <Card className="p-3 bg-muted/40">
                <div className="text-[10px] text-muted-foreground mb-1">PRÉVIA</div>
                <div className="text-sm">{editingAuto.message
                  .replaceAll("{cliente_nome}", "João")
                  .replaceAll("{os_numero}", "OS-1042")
                  .replaceAll("{status_os}", "Em análise")
                  .replaceAll("{valor_orcamento}", "320,00")
                  .replaceAll("{prazo}", "3 dias")
                  .replaceAll("{nome_loja}", "OmniGestão Tech")
                  .replaceAll("{telefone_loja}", "(11) 99999-9999")}</div>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAuto(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (!editingAuto) return;
              try {
                const res = await fetch(`/api/whatsapp/automations/${editingAuto.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", ...apiHeaders },
                  body: JSON.stringify({
                    name: editingAuto.name,
                    triggerType: editingAuto.trigger,
                    actions: { replyText: editingAuto.message, type: editingAuto.action },
                    conditions: { list: editingAuto.conditions },
                  }),
                });
                const j = (await res.json()) as { ok?: boolean; error?: string };
                if (!j.ok) throw new Error(j.error ?? "Falha ao salvar");
                setAutomations((p) => p.map((x) => x.id===editingAuto.id?editingAuto:x));
                setEditingAuto(null);
                toast.success("Automação atualizada");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha ao salvar automação");
              }
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────── REPLY EDITOR ───────── */}
      <Dialog open={!!editingReply} onOpenChange={(o) => !o && setEditingReply(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReply?.id ? "Editar resposta" : "Nova resposta rápida"}</DialogTitle>
          </DialogHeader>
          {editingReply && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={editingReply.title} onChange={(e) => setEditingReply({ ...editingReply, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Categoria</Label>
                  <Select value={editingReply.category} onValueChange={(v: any) => setEditingReply({ ...editingReply, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Boas-vindas","Status OS","Orçamento","Pagamento","Garantia","Pós-venda"].map((c) =>
                        <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Atalho</Label><Input value={editingReply.shortcut} onChange={(e) => setEditingReply({ ...editingReply, shortcut: e.target.value })} placeholder="/atalho" /></div>
              </div>
              <div><Label>Mensagem</Label>
                <Textarea rows={3} value={editingReply.message} onChange={(e) => setEditingReply({ ...editingReply, message: e.target.value })} />
                <div className="mt-2 flex flex-wrap gap-1">
                  {variables.map((v) => (
                    <Badge key={v} variant="secondary" className="cursor-pointer text-[10px]"
                      onClick={() => setEditingReply({ ...editingReply, message: editingReply.message + " " + v })}>{v}</Badge>
                  ))}
                </div>
              </div>
              <Card className="p-3 bg-muted/40">
                <div className="text-[10px] text-muted-foreground mb-1">PRÉVIA</div>
                <div className="text-sm">{editingReply.message || "—"}</div>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingReply(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (!editingReply) return;
              const payload = {
                title: editingReply.title,
                body: editingReply.message,
                category: editingReply.category,
                shortcut: editingReply.shortcut,
              };
              try {
                if (editingReply.id) {
                  const res = await fetch(`/api/whatsapp/quick-replies/${editingReply.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", ...apiHeaders },
                    body: JSON.stringify(payload),
                  });
                  const j = (await res.json()) as { ok?: boolean; error?: string };
                  if (!j.ok) throw new Error(j.error ?? "Falha ao salvar");
                  setReplies((p) => p.map((x) => x.id === editingReply.id ? editingReply : x));
                } else {
                  const res = await fetch("/api/whatsapp/quick-replies", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...apiHeaders },
                    body: JSON.stringify(payload),
                  });
                  const j = (await res.json()) as { ok?: boolean; error?: string; quickReply?: { id: string } };
                  if (!j.ok) throw new Error(j.error ?? "Falha ao criar");
                  const newId = j.quickReply?.id ?? Date.now().toString();
                  setReplies((p) => [...p, { ...editingReply, id: newId }]);
                }
                setEditingReply(null);
                toast.success("Resposta salva");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha ao salvar resposta");
              }
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────── OS MODAL ───────── */}
      <Dialog open={!!osModal} onOpenChange={(o) => !o && setOsModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {osModal === "open" && "Abrir nova OS"}
              {osModal === "status" && "Enviar status da OS"}
              {osModal === "budget" && "Enviar orçamento"}
            </DialogTitle>
          </DialogHeader>
          {osModal === "open" && (
            <div className="space-y-3">
              <div><Label>Cliente</Label><Input defaultValue={selected.name} /></div>
              <div><Label>Telefone</Label><Input defaultValue={selected.phone} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Equipamento</Label><Input placeholder="Ex: iPhone 12" /></div>
                <div><Label>Prioridade</Label>
                  <Select defaultValue="normal"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Defeito relatado</Label><Textarea rows={2} defaultValue={selected.lastMessage} /></div>
              <div><Label>Técnico responsável</Label>
                <Select defaultValue="lucas"><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lucas">Lucas</SelectItem>
                    <SelectItem value="mari">Mariana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {osModal === "status" && (
            <div className="space-y-3">
              <div><Label>OS vinculada</Label>
                <Select defaultValue={selected.os[0]?.id || ""}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {selected.os.map((o) => <SelectItem key={o.id} value={o.id}>{o.id} — {o.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Status atual</Label>
                <Select defaultValue="analise"><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="analise">Em análise</SelectItem>
                    <SelectItem value="reparo">Em reparo</SelectItem>
                    <SelectItem value="pronto">Pronto para retirada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Mensagem</Label><Textarea rows={3} defaultValue={`Olá ${selected.name}, sua OS está em análise técnica.`} /></div>
            </div>
          )}
          {osModal === "budget" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Serviço</Label><Input placeholder="Troca de tela" /></div>
                <div><Label>Valor (R$)</Label><Input type="number" placeholder="320" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Itens/Peças</Label><Input placeholder="Tela original" /></div>
                <div><Label>Prazo</Label><Input placeholder="3 dias úteis" /></div>
              </div>
              <div><Label>Mensagem</Label><Textarea rows={3} defaultValue={`Olá ${selected.name}, segue seu orçamento. Aguardo aprovação 😉`} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOsModal(null)}>Cancelar</Button>
            <Button onClick={() => {
              toast.success(
                osModal === "open" ? "OS criada" :
                osModal === "status" ? "Status enviado" : "Orçamento enviado"
              );
              setOsModal(null);
            }}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────── PROFILE MODAL ───────── */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Perfil do contato</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14"><AvatarFallback>{selected.name[0]}</AvatarFallback></Avatar>
              <div>
                <div className="font-semibold">{selected.name}</div>
                <div className="text-sm text-muted-foreground">{selected.phone}</div>
                <div className="flex gap-1 mt-1">
                  {selected.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                </div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-muted-foreground text-xs">Cliente desde</div>{selected.clientSince}</div>
              <div><div className="text-muted-foreground text-xs">Total gasto</div>R$ {selected.totalSpent}</div>
              <div><div className="text-muted-foreground text-xs">Responsável</div>{selected.responsible}</div>
              <div><div className="text-muted-foreground text-xs">Última OS</div>{selected.os[0]?.status || "—"}</div>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium text-sm mb-2">OS vinculadas</h4>
              {selected.os.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma OS</p> :
                <div className="space-y-2">
                  {selected.os.map((o) => (
                    <Card key={o.id} className="p-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{o.id} — {o.title}</div>
                        <div className="text-xs text-muted-foreground">{o.status}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => toast.info(`Visualizando ${o.id}`)}>Ver</Button>
                    </Card>
                  ))}
                </div>
              }
            </div>
            <div>
              <h4 className="font-medium text-sm mb-2">Histórico</h4>
              {selected.history.length === 0 ? <p className="text-sm text-muted-foreground">Sem histórico</p> :
                <ul className="text-sm space-y-1">
                  {selected.history.map((h, i) => (
                    <li key={i} className="flex gap-2"><span className="text-muted-foreground">{h.date}</span><span>{h.summary}</span></li>
                  ))}
                </ul>
              }
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
