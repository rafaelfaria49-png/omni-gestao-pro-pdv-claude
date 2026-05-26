"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  MessageCircle,
  Phone,
  Search,
  Send,
  User,
  Wifi,
  WifiOff,
  CheckCheck,
  RefreshCw,
  MoreVertical,
  UserCheck,
  Zap,
  Tag,
  Plus,
  X,
  Pencil,
  Trash2,
  Check,
  Sparkles,
  Inbox,
  Bot,
  Link2,
} from "lucide-react"
import { scanSuggestedLinkConversationIds } from "@/components/whatsapp/use-whatsapp-cliente-context"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  AiSignalBadge,
  deriveInsights,
  PremiumEmptyState,
  waChatArea,
  waHubShell,
  waSidebar,
} from "@/components/whatsapp/agentic-ui"
import { WhatsAppContextPanel } from "@/components/whatsapp/WhatsAppContextPanel"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { toast } from "sonner"

// ─── Types ───────────────────────────────────────────────────────────────────

type WaContact = {
  id: string
  phoneDigits: string
  displayName: string
  profilePicUrl: string
}

type WaEtiqueta = {
  id: string
  nome: string
  cor: string
  ativo: boolean
}

type WaConvEtiqueta = {
  id: string
  etiquetaId: string
  etiqueta: WaEtiqueta
}

type WaConversation = {
  id: string
  storeId: string
  contactId: string
  contact: WaContact
  clienteId: string | null
  status: string
  lastMessagePreview: string
  lastMessageAt: string | null
  unreadCount: number
  humanMode: boolean
  etiquetas?: WaConvEtiqueta[]
}

type WaMessage = {
  id: string
  conversationId: string
  direction: string
  body: string
  messageType: string
  externalMessageId: string
  createdAt: string
}

type WaQuickReply = {
  id: string
  shortcut: string
  title: string
  body: string
  category: string
  ativo: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_MS = 5000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" })
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function phoneLabel(digits: string): string {
  const d = digits.replace(/\D/g, "")
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return digits
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getAvatarColor(id: string): string {
  const colors = [
    "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500",
    "bg-rose-500", "bg-teal-500", "bg-indigo-500", "bg-orange-500",
  ]
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

function hexToRgba(hex: string, alpha = 0.15): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function ContactAvatar({ contact, size = "md" }: { contact: WaContact; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm"
  if (contact.profilePicUrl) {
    return (
      <img
        src={contact.profilePicUrl}
        alt={contact.displayName}
        className={cn("rounded-full object-cover flex-shrink-0", sz)}
      />
    )
  }
  return (
    <div className={cn("rounded-full flex-shrink-0 flex items-center justify-center text-white font-semibold", sz, getAvatarColor(contact.id))}>
      {getInitials(contact.displayName)}
    </div>
  )
}

// ─── Label chip (small) ────────────────────────────────────────────────────────

function EtiquetaChip({ etiqueta, onRemove }: { etiqueta: WaEtiqueta; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
      style={{ backgroundColor: hexToRgba(etiqueta.cor, 0.18), color: etiqueta.cor, border: `1px solid ${hexToRgba(etiqueta.cor, 0.4)}` }}
    >
      {etiqueta.nome}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70 transition-opacity ml-0.5">
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}

// ─── Conversation list item ────────────────────────────────────────────────────

type InboxFilter = "all" | "unread" | "human" | "client" | "priority" | "suggested"

const INBOX_FILTERS: { id: InboxFilter; label: string; icon: typeof Inbox }[] = [
  { id: "all", label: "Todas", icon: Inbox },
  { id: "unread", label: "Não lidas", icon: MessageCircle },
  { id: "suggested", label: "Vínculo sugerido", icon: Link2 },
  { id: "human", label: "Humano", icon: User },
  { id: "client", label: "Cadastrados", icon: UserCheck },
  { id: "priority", label: "Prioridade", icon: Sparkles },
]

function ConvItem({
  conv,
  selected,
  suggestedLink,
  onClick,
}: {
  conv: WaConversation
  selected: boolean
  suggestedLink?: boolean
  onClick: () => void
}) {
  const topInsight = deriveInsights(conv)[0]
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full flex items-start gap-3 px-3 py-3 text-left transition-all duration-200",
        "hover:bg-muted/50 border-l-2 border-transparent",
        selected && "border-l-primary bg-primary/5",
        conv.unreadCount > 0 && !selected && "bg-muted/20"
      )}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <ContactAvatar contact={conv.contact} size="md" />
        {conv.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm ring-2 ring-background">
            {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className={cn("truncate text-sm font-medium", conv.unreadCount > 0 ? "text-foreground" : "text-foreground/85")}>
            {conv.contact.displayName}
          </span>
          <span className={cn("shrink-0 text-[10px]", conv.unreadCount > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>
            {formatTime(conv.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <p className={cn("truncate text-xs", conv.unreadCount > 0 ? "font-medium text-foreground/75" : "text-muted-foreground")}>
            {conv.lastMessagePreview || "Sem mensagens"}
          </p>
          <div className="ml-1 flex shrink-0 items-center gap-1">
            {conv.humanMode && <Bot className="h-3 w-3 text-amber-500" />}
            {conv.clienteId && <UserCheck className="h-3 w-3 text-emerald-500" />}
          </div>
        </div>
        {(suggestedLink && !conv.clienteId) ||
        topInsight ||
        (conv.etiquetas && conv.etiquetas.length > 0) ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {suggestedLink && !conv.clienteId && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/25 bg-primary/8 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                <Link2 className="h-2.5 w-2.5" />
                Vínculo sugerido
              </span>
            )}
            {topInsight && <AiSignalBadge insight={topInsight} compact />}
            {conv.etiquetas?.slice(0, 2).map((ce) => (
              <EtiquetaChip key={ce.id} etiqueta={ce.etiqueta} />
            ))}
          </div>
        ) : null}
      </div>
    </button>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: WaMessage }) {
  const out = msg.direction === "outbound"
  return (
    <div className={cn("mb-2 flex animate-in fade-in-0 duration-200", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm transition-shadow",
          out
            ? "rounded-br-md bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-md shadow-primary/15"
            : "rounded-bl-md border border-border/70 bg-card/90 text-foreground backdrop-blur-sm"
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>
        <div className={cn("mt-1.5 flex items-center gap-1", out ? "justify-end" : "justify-start")}>
          <span className={cn("text-[10px]", out ? "text-primary-foreground/75" : "text-muted-foreground")}>
            {formatTime(msg.createdAt)}
          </span>
          {out && <CheckCheck className="h-3 w-3 text-primary-foreground/70" />}
        </div>
      </div>
    </div>
  )
}

// ─── Quick reply autocomplete ─────────────────────────────────────────────────

function QuickReplyDropdown({
  query,
  quickReplies,
  onSelect,
  onClose,
}: {
  query: string
  quickReplies: WaQuickReply[]
  onSelect: (body: string) => void
  onClose: () => void
}) {
  const q = query.slice(1).toLowerCase()
  const matches = quickReplies.filter(
    (r) => r.ativo && (q === "" || r.shortcut.replace("/", "").toLowerCase().startsWith(q))
  )

  if (matches.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-50 max-h-56 overflow-y-auto">
      <div className="px-3 py-1.5 border-b border-border/60 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
          <Zap className="h-3 w-3 text-emerald-500" /> Respostas rápidas
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {matches.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect(r.body)}
          className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
        >
          <div className="flex-shrink-0 mt-0.5">
            <span className="inline-block bg-emerald-500/10 text-emerald-600 text-[11px] font-semibold rounded px-1.5 py-0.5 font-mono">
              /{r.shortcut.replace(/^\//, "")}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{r.title}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{r.body}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Quick reply modal ────────────────────────────────────────────────────────

type QRFormState = { shortcut: string; title: string; body: string; category: string }

function QuickReplyModal({
  quickReplies,
  onClose,
  onRefresh,
  apiHeaders,
}: {
  quickReplies: WaQuickReply[]
  onClose: () => void
  onRefresh: () => void
  apiHeaders: Record<string, string>
}) {
  const [form, setForm] = useState<QRFormState>({ shortcut: "", title: "", body: "", category: "" })
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function openEdit(r: WaQuickReply) {
    setEditId(r.id)
    setForm({ shortcut: r.shortcut, title: r.title, body: r.body, category: r.category })
    setError("")
  }

  function resetForm() {
    setEditId(null)
    setForm({ shortcut: "", title: "", body: "", category: "" })
    setError("")
  }

  async function save() {
    const shortcut = form.shortcut.replace(/^\//, "").trim()
    if (!shortcut) { setError("Atalho obrigatório."); return }
    if (!form.title.trim()) { setError("Título obrigatório."); return }
    if (!form.body.trim()) { setError("Mensagem obrigatória."); return }

    setSaving(true)
    setError("")
    try {
      const url = editId
        ? `/api/whatsapp/quick-replies/${editId}`
        : "/api/whatsapp/quick-replies"
      const method = editId ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: apiHeaders,
        body: JSON.stringify({ shortcut, title: form.title.trim(), body: form.body, category: form.category.trim() }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? "Erro ao salvar."); return }
      resetForm()
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("Remover esta resposta rápida?")) return
    const res = await fetch(`/api/whatsapp/quick-replies/${id}`, { method: "DELETE", headers: apiHeaders })
    if (res.ok) onRefresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-md">
      <div className="glass-card flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Respostas Rápidas</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* List */}
          <div className="w-1/2 border-r border-border overflow-y-auto">
            {quickReplies.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                <Zap className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
              </div>
            ) : (
              quickReplies.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-start gap-2 px-4 py-3 border-b border-border/60 group hover:bg-muted/40 transition-colors",
                    editId === r.id && "bg-muted"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] bg-emerald-500/10 text-emerald-600 rounded px-1.5 py-0.5 font-semibold">
                        /{r.shortcut.replace(/^\//, "")}
                      </span>
                      {!r.ativo && (
                        <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">inativo</span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-foreground mt-1 truncate">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{r.body}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(r)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Form */}
          <div className="w-1/2 flex flex-col p-5 gap-3 overflow-y-auto">
            <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">
              {editId ? "Editar resposta" : "Nova resposta"}
            </p>
            {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Atalho</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">/</span>
                <Input
                  value={form.shortcut.replace(/^\//, "")}
                  onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value.replace(/\s/g, "") }))}
                  placeholder="garantia"
                  className="pl-6 h-9 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Título</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Informações de garantia"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Categoria (opcional)</label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="atendimento"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Mensagem</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Digite a mensagem completa aqui..."
                rows={5}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={save}
                disabled={saving}
                size="sm"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? "Salvando…" : editId ? "Salvar alterações" : "Criar resposta"}
              </Button>
              {editId && (
                <Button onClick={resetForm} variant="outline" size="sm" className="flex-shrink-0">
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Etiquetas modal ──────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#f97316",
]

function EtiquetasModal({
  etiquetas,
  onClose,
  onRefresh,
  apiHeaders,
}: {
  etiquetas: WaEtiqueta[]
  onClose: () => void
  onRefresh: () => void
  apiHeaders: Record<string, string>
}) {
  const [nome, setNome] = useState("")
  const [cor, setCor] = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState("")
  const [editCor, setEditCor] = useState("")

  async function create() {
    if (!nome.trim()) { setError("Nome obrigatório."); return }
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/whatsapp/etiquetas", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ nome: nome.trim(), cor }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? "Erro ao criar."); return }
      setNome(""); setCor(PRESET_COLORS[0])
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  function startEdit(e: WaEtiqueta) {
    setEditId(e.id); setEditNome(e.nome); setEditCor(e.cor)
  }

  async function saveEdit() {
    if (!editId || !editNome.trim()) return
    const res = await fetch(`/api/whatsapp/etiquetas/${editId}`, {
      method: "PATCH",
      headers: apiHeaders,
      body: JSON.stringify({ nome: editNome.trim(), cor: editCor }),
    })
    if (res.ok) { setEditId(null); onRefresh() }
  }

  async function remove(id: string) {
    if (!confirm("Remover esta etiqueta? Será removida de todas as conversas.")) return
    const res = await fetch(`/api/whatsapp/etiquetas/${id}`, { method: "DELETE", headers: apiHeaders })
    if (res.ok) onRefresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-md">
      <div className="glass-card flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Etiquetas</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Create */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nova etiqueta</p>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome da etiqueta"
                className="flex-1 h-9 text-sm"
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
              <Button
                onClick={create}
                disabled={saving}
                size="sm"
                className="h-9 px-3 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-transform",
                    cor === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* List */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {etiquetas.length} etiqueta{etiquetas.length !== 1 ? "s" : ""}
            </p>
            {etiquetas.map((e) =>
              editId === e.id ? (
                <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/40">
                  <div className="flex gap-1.5 flex-wrap flex-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditCor(c)}
                        className={cn("h-5 w-5 rounded-full border-2", editCor === c ? "border-foreground" : "border-transparent")}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <Input
                    value={editNome}
                    onChange={(ev) => setEditNome(ev.target.value)}
                    className="h-8 text-xs w-32"
                    onKeyDown={(ev) => ev.key === "Enter" && saveEdit()}
                  />
                  <button onClick={saveEdit} className="text-emerald-500 hover:text-emerald-600">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 group">
                  <span className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: e.cor }} />
                  <span className="flex-1 text-sm text-foreground truncate">{e.nome}</span>
                  {!e.ativo && <span className="text-[10px] text-muted-foreground">inativa</span>}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                    <button onClick={() => startEdit(e)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Add label popover ────────────────────────────────────────────────────────

function AddEtiquetaPopover({
  conversationId,
  currentEtiquetas,
  allEtiquetas,
  onClose,
  onChange,
  apiHeaders,
}: {
  conversationId: string
  currentEtiquetas: WaConvEtiqueta[]
  allEtiquetas: WaEtiqueta[]
  onClose: () => void
  onChange: () => void
  apiHeaders: Record<string, string>
}) {
  const currentIds = new Set(currentEtiquetas.map((ce) => ce.etiquetaId))

  async function toggle(etiqueta: WaEtiqueta) {
    if (currentIds.has(etiqueta.id)) {
      await fetch(`/api/whatsapp/conversations/${conversationId}/etiquetas/${etiqueta.id}`, {
        method: "DELETE",
        headers: apiHeaders,
      })
    } else {
      await fetch(`/api/whatsapp/conversations/${conversationId}/etiquetas`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ etiquetaId: etiqueta.id }),
      })
    }
    onChange()
  }

  return (
    <div className="absolute top-full right-0 mt-1 bg-background border border-border rounded-xl shadow-xl z-50 w-52 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/60">
        <p className="text-xs font-semibold text-muted-foreground">Adicionar etiqueta</p>
      </div>
      {allEtiquetas.filter((e) => e.ativo).length === 0 ? (
        <p className="text-xs text-muted-foreground px-3 py-3">Nenhuma etiqueta criada.</p>
      ) : (
        allEtiquetas.filter((e) => e.ativo).map((e) => (
          <button
            key={e.id}
            onClick={() => toggle(e)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
          >
            <span className="h-3.5 w-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.cor }} />
            <span className="text-sm text-foreground flex-1 truncate">{e.nome}</span>
            {currentIds.has(e.id) && <Check className="h-3.5 w-3.5 text-emerald-500" />}
          </button>
        ))
      )}
      <div className="border-t border-border/60">
        <button onClick={onClose} className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground text-center">
          Fechar
        </button>
      </div>
    </div>
  )
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyConversations() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
        <MessageCircle className="h-7 w-7 text-emerald-500" />
      </div>
      <p className="font-medium text-foreground">Nenhuma conversa ainda</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Conversas aparecerão aqui quando clientes enviarem mensagens pelo WhatsApp.
      </p>
    </div>
  )
}

function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">Selecione uma conversa</p>
      <p className="text-sm text-muted-foreground">Escolha um contato à esquerda para ver as mensagens.</p>
    </div>
  )
}

// ─── Main inbox ───────────────────────────────────────────────────────────────

export default function WhatsAppInbox({ embedded = false }: { embedded?: boolean }) {
  const { lojaAtivaId, lojas, storesRefreshNonce } = useLojaAtiva()
  const apiHeaders = useMemo((): Record<string, string> | null => {
    const id = lojaAtivaId?.trim()
    if (!id) return null
    return { [ASSISTEC_LOJA_HEADER]: id, "Content-Type": "application/json" }
  }, [lojaAtivaId])

  const [conversations, setConversations] = useState<WaConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [quickReplies, setQuickReplies] = useState<WaQuickReply[]>([])
  const [etiquetas, setEtiquetas] = useState<WaEtiqueta[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
  const [inputText, setInputText] = useState("")
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sending, setSending] = useState(false)
  const [online, setOnline] = useState(true)
  const [showQRModal, setShowQRModal] = useState(false)
  const [showEtiquetasModal, setShowEtiquetasModal] = useState(false)
  const [showAddLabel, setShowAddLabel] = useState(false)
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all")
  const [linkingCliente, setLinkingCliente] = useState(false)
  const [unlinkingCliente, setUnlinkingCliente] = useState(false)
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false)
  const [linkSuccessMessage, setLinkSuccessMessage] = useState<string | null>(null)
  const [contextRefreshKey, setContextRefreshKey] = useState(0)
  const [suggestedLinkConvIds, setSuggestedLinkConvIds] = useState<Set<string>>(
    () => new Set()
  )
  const [highlightLinkPanel, setHighlightLinkPanel] = useState(false)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const addLabelRef = useRef<HTMLDivElement>(null)
  const prevLojaRef = useRef<string | null>(null)

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null
  const showQRDropdown = inputText.startsWith("/") && quickReplies.length > 0

  // ── Close add-label popover on outside click ──
  useEffect(() => {
    if (!showAddLabel) return
    function handler(e: MouseEvent) {
      if (addLabelRef.current && !addLabelRef.current.contains(e.target as Node)) {
        setShowAddLabel(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showAddLabel])

  // ── Fetch conversations ──
  const fetchConversations = useCallback(async (silent = false) => {
    if (!apiHeaders) {
      if (!silent) setLoadingConvs(false)
      return
    }
    if (!silent) setLoadingConvs(true)
    try {
      const res = await fetch("/api/whatsapp/conversations", { headers: apiHeaders })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { conversations?: WaConversation[] }
      setConversations(data.conversations ?? [])
      setOnline(true)
    } catch {
      setOnline(false)
    } finally {
      if (!silent) setLoadingConvs(false)
    }
  }, [apiHeaders])

  // ── Fetch messages ──
  const fetchMessages = useCallback(async (convId: string, silent = false) => {
    if (!apiHeaders) return
    if (!silent) setLoadingMsgs(true)
    try {
      const res = await fetch(`/api/whatsapp/messages?conversationId=${convId}&take=100`, { headers: apiHeaders })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { messages?: WaMessage[] }
      setMessages(data.messages ?? [])
    } catch { /* keep existing */ }
    finally { if (!silent) setLoadingMsgs(false) }
  }, [apiHeaders])

  // ── Fetch quick replies ──
  const fetchQuickReplies = useCallback(async () => {
    if (!apiHeaders) return
    try {
      const res = await fetch("/api/whatsapp/quick-replies", { headers: apiHeaders })
      if (res.ok) {
        const data = await res.json() as { quickReplies?: WaQuickReply[] }
        setQuickReplies(data.quickReplies ?? [])
      }
    } catch { /* silent */ }
  }, [apiHeaders])

  // ── Fetch etiquetas ──
  const fetchEtiquetas = useCallback(async () => {
    if (!apiHeaders) return
    try {
      const res = await fetch("/api/whatsapp/etiquetas", { headers: apiHeaders })
      if (res.ok) {
        const data = await res.json() as { etiquetas?: WaEtiqueta[] }
        setEtiquetas(data.etiquetas ?? [])
      }
    } catch { /* silent */ }
  }, [apiHeaders])

  // ── Scan vínculo sugerido (lista) ──
  useEffect(() => {
    if (!apiHeaders) {
      setSuggestedLinkConvIds(new Set())
      return
    }
    let cancelled = false
    void scanSuggestedLinkConversationIds(conversations, apiHeaders).then((ids) => {
      if (!cancelled) setSuggestedLinkConvIds(ids)
    })
    return () => {
      cancelled = true
    }
  }, [conversations, apiHeaders])

  // ── Select conversation ──
  const selectConversation = useCallback(async (conv: WaConversation) => {
    if (!apiHeaders) return
    setSelectedId(conv.id)
    setMessages([])
    setShowAddLabel(false)
    setLinkSuccessMessage(null)
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    const showLinkHighlight = !conv.clienteId && suggestedLinkConvIds.has(conv.id)
    setHighlightLinkPanel(showLinkHighlight)
    if (showLinkHighlight) {
      highlightTimerRef.current = setTimeout(() => setHighlightLinkPanel(false), 5000)
    }
    await fetchMessages(conv.id)
    if (conv.unreadCount > 0) {
      await fetch(`/api/whatsapp/conversations/${conv.id}`, {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify({ unreadCount: 0 }),
      })
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
      )
    }
    inputRef.current?.focus()
  }, [apiHeaders, fetchMessages, suggestedLinkConvIds])

  // ── Send message ──
  const sendMessage = useCallback(async () => {
    const text = inputText.trim()
    if (!text || !selectedId || sending || !apiHeaders) return
    setSending(true)
    setInputText("")
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ conversationId: selectedId, text }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        const msg =
          typeof err.error === "string" && err.error.trim()
            ? err.error
            : res.status === 401
              ? "Sessão expirada. Faça login novamente."
              : res.status === 403
                ? "Selecione uma unidade ativa para enviar mensagens."
                : "Não foi possível enviar a mensagem. Tente novamente."
        console.error("[WhatsAppInbox] send error:", err)
        toast.error(msg)
        setInputText(text)
        return
      }
      const optimistic: WaMessage = {
        id: `opt-${Date.now()}`,
        conversationId: selectedId,
        direction: "outbound",
        body: text,
        messageType: "text",
        externalMessageId: "",
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimistic])
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, lastMessagePreview: text, lastMessageAt: new Date().toISOString() }
            : c
        )
      )
      setTimeout(() => fetchMessages(selectedId, true), 1200)
    } catch {
      toast.error("Erro de rede ao enviar mensagem. Verifique sua conexão.")
      setInputText(text)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [apiHeaders, inputText, selectedId, sending, fetchMessages])

  // ── After label change, refresh conversation list ──
  const onLabelChange = useCallback(async () => {
    await fetchConversations(true)
  }, [fetchConversations])

  const linkCliente = useCallback(
    async (clienteId: string): Promise<boolean> => {
      if (!selectedId || !apiHeaders) return false
      setLinkingCliente(true)
      setLinkSuccessMessage(null)
      try {
        const res = await fetch(`/api/whatsapp/conversations/${selectedId}`, {
          method: "PATCH",
          headers: apiHeaders,
          body: JSON.stringify({ clienteId }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          conversation?: { clienteId?: string | null }
        }
        if (!res.ok || !data.ok) {
          toast.error(
            typeof data.error === "string"
              ? data.error
              : "Não foi possível vincular o cliente"
          )
          return false
        }
        const linkedId = data.conversation?.clienteId ?? clienteId
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId ? { ...c, clienteId: linkedId } : c
          )
        )
        await fetchConversations(true)
        setSuggestedLinkConvIds((prev) => {
          const next = new Set(prev)
          next.delete(selectedId)
          return next
        })
        setHighlightLinkPanel(false)
        setContextRefreshKey((k) => k + 1)
        const msg = "Cliente vinculado à conversa. Dados do CRM atualizados."
        setLinkSuccessMessage(msg)
        toast.success(msg)
        return true
      } catch {
        toast.error("Erro de rede ao vincular cliente")
        return false
      } finally {
        setLinkingCliente(false)
      }
    },
    [apiHeaders, selectedId, fetchConversations]
  )

  const performUnlinkCliente = useCallback(async (): Promise<boolean> => {
    if (!selectedId || !apiHeaders) return false
    setUnlinkingCliente(true)
    setLinkSuccessMessage(null)
    try {
      const res = await fetch(`/api/whatsapp/conversations/${selectedId}`, {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify({ clienteId: null }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok || !data.ok) {
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Não foi possível desvincular o cliente"
        )
        return false
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, clienteId: null } : c))
      )
      await fetchConversations(true)
      setContextRefreshKey((k) => k + 1)
      toast.success("Cliente desvinculado desta conversa.")
      return true
    } catch {
      toast.error("Erro de rede ao desvincular cliente")
      return false
    } finally {
      setUnlinkingCliente(false)
    }
  }, [apiHeaders, selectedId, fetchConversations])

  const requestUnlinkCliente = useCallback(() => {
    if (!selectedConv?.clienteId) return
    setUnlinkConfirmOpen(true)
  }, [selectedConv?.clienteId])

  const confirmUnlinkCliente = useCallback(async () => {
    const ok = await performUnlinkCliente()
    if (ok) setUnlinkConfirmOpen(false)
  }, [performUnlinkCliente])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    }
  }, [])

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Initial load + troca de loja ──
  useEffect(() => {
    if (!apiHeaders || !lojaAtivaId?.trim()) return
    const id = lojaAtivaId.trim()
    const prev = prevLojaRef.current
    prevLojaRef.current = id
    if (prev !== null && prev !== id) {
      setSelectedId(null)
      setMessages([])
      setSearchQuery("")
      setLabelFilter(null)
      setShowAddLabel(false)
      setInputText("")
    }
    void fetchConversations()
    void fetchQuickReplies()
    void fetchEtiquetas()
  }, [apiHeaders, lojaAtivaId, fetchConversations, fetchQuickReplies, fetchEtiquetas])

  // ── Polling ──
  useEffect(() => {
    if (!apiHeaders) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      return
    }
    pollTimerRef.current = setInterval(async () => {
      await fetchConversations(true)
      if (selectedId) await fetchMessages(selectedId, true)
    }, POLL_MS)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [apiHeaders, fetchConversations, fetchMessages, selectedId])

  // ── Keyboard ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
    if (e.key === "Escape" && showQRDropdown) setInputText("")
  }

  // ── Filter conversations ──
  const filtered = conversations.filter((c) => {
    const matchesSearch = !searchQuery || (
      c.contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contact.phoneDigits.includes(searchQuery.replace(/\D/g, "")) ||
      c.lastMessagePreview.toLowerCase().includes(searchQuery.toLowerCase())
    )
    const matchesLabel = !labelFilter ||
      c.etiquetas?.some((ce) => ce.etiquetaId === labelFilter)
    const matchesInbox =
      inboxFilter === "all" ||
      (inboxFilter === "unread" && c.unreadCount > 0) ||
      (inboxFilter === "suggested" &&
        !c.clienteId &&
        suggestedLinkConvIds.has(c.id)) ||
      (inboxFilter === "human" && c.humanMode) ||
      (inboxFilter === "client" && !!c.clienteId) ||
      (inboxFilter === "priority" &&
        deriveInsights(c).some((i) => i.variant === "priority" || i.variant === "lead"))
    return matchesSearch && matchesLabel && matchesInbox
  })

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)
  const activeEtiquetas = etiquetas.filter((e) => e.ativo)

  if (!apiHeaders) {
    const waitingFirstStores = lojas.length === 0 && storesRefreshNonce === 0
    return (
      <div className="flex min-h-[280px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/20 px-6 py-12">
        {waitingFirstStores ? (
          <>
            <Skeleton className="h-10 w-10 rounded-full" />
            <p className="text-center text-sm text-muted-foreground">Carregando conversas da loja ativa…</p>
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Nenhuma loja ativa selecionada.</p>
        )}
      </div>
    )
  }

  const hdr = apiHeaders

  return (
    <>
      {/* ── Modals ── */}
      {showQRModal && (
        <QuickReplyModal
          quickReplies={quickReplies}
          onClose={() => setShowQRModal(false)}
          onRefresh={fetchQuickReplies}
          apiHeaders={hdr}
        />
      )}
      {showEtiquetasModal && (
        <EtiquetasModal
          etiquetas={etiquetas}
          onClose={() => setShowEtiquetasModal(false)}
          onRefresh={fetchEtiquetas}
          apiHeaders={hdr}
        />
      )}

      <AlertDialog open={unlinkConfirmOpen} onOpenChange={setUnlinkConfirmOpen}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Desvincular cliente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O cliente deixará de aparecer nesta conversa até você vincular novamente.
              As mensagens do WhatsApp não são apagadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinkingCliente}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={unlinkingCliente}
              onClick={() => void confirmUnlinkCliente()}
            >
              {unlinkingCliente ? "Desvinculando…" : "Desvincular"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        className={cn(
          waHubShell,
          "flex overflow-hidden",
          embedded ? "h-[calc(100vh-11rem)] min-h-[420px]" : "h-[calc(100vh-4rem)]"
        )}
      >
        {/* ── Sidebar ── */}
        <aside className={waSidebar}>
          {/* Header */}
          <div className="border-b border-border/60 px-3 py-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-violet-500/15">
                  <MessageCircle className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold leading-none text-foreground">Inbox</h1>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground")} />
                    {online ? "Conectado" : "Sem conexão"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {totalUnread > 0 && (
                  <Badge variant="default" className="h-4 px-1.5 py-0 text-[10px]">
                    {totalUnread}
                  </Badge>
                )}
                {online ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
                <button
                  onClick={() => void fetchConversations()}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Atualizar"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar contato ou mensagem…"
                className="h-9 border-border/60 bg-muted/30 pl-8 text-xs focus-visible:ring-primary/40"
              />
            </div>
            {/* Inbox filters */}
            <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              {INBOX_FILTERS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInboxFilter(id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-all",
                    inboxFilter === id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Label filter */}
          {activeEtiquetas.length > 0 && (
            <div className="px-4 py-2 border-b border-border/60 flex gap-1.5 flex-wrap">
              <button
                onClick={() => setLabelFilter(null)}
                className={cn(
                  "text-[11px] rounded-full px-2.5 py-1 font-medium transition-colors",
                  !labelFilter ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Todas
              </button>
              {activeEtiquetas.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setLabelFilter(labelFilter === e.id ? null : e.id)}
                  className={cn(
                    "text-[11px] rounded-full px-2.5 py-1 font-medium transition-all",
                    labelFilter === e.id
                      ? "ring-2 ring-offset-1"
                      : "opacity-80 hover:opacity-100"
                  )}
                  style={{
                    backgroundColor: hexToRgba(e.cor, labelFilter === e.id ? 0.25 : 0.12),
                    color: e.cor,
                    borderColor: e.cor,
                    border: `1px solid ${hexToRgba(e.cor, 0.35)}`,
                    ...(labelFilter === e.id ? { outlineColor: e.cor } : {}),
                  }}
                >
                  {e.nome}
                </button>
              ))}
            </div>
          )}

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyConversations />
            ) : (
              filtered.map((conv) => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  selected={conv.id === selectedId}
                  suggestedLink={suggestedLinkConvIds.has(conv.id)}
                  onClick={() => void selectConversation(conv)}
                />
              ))
            )}
          </div>

          {/* Sidebar tools */}
          <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2.5">
            <button
              onClick={() => setShowQRModal(true)}
              className="flex flex-1 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Respostas rápidas"
            >
              <Zap className="h-3.5 w-3.5 text-primary" />
              Atalhos
            </button>
            <button
              onClick={() => setShowEtiquetasModal(true)}
              className="flex flex-1 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Etiquetas"
            >
              <Tag className="h-3.5 w-3.5 text-primary" />
              Tags
            </button>
          </div>
        </aside>

        {/* ── Chat panel ── */}
        <div className={waChatArea}>
          {!selectedConv ? (
            <EmptyChat />
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-card/40 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center gap-3 min-w-0">
                  <ContactAvatar contact={selectedConv.contact} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {selectedConv.contact.displayName}
                      </p>
                      {selectedConv.clienteId && (
                        <div title="Cliente cadastrado vinculado" className="flex items-center gap-0.5">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-[10px] text-emerald-500 font-medium">Cadastrado</span>
                        </div>
                      )}
                      {/* Etiqueta chips on header */}
                      {selectedConv.etiquetas?.map((ce) => (
                        <EtiquetaChip
                          key={ce.id}
                          etiqueta={ce.etiqueta}
                          onRemove={() => {
                            void fetch(
                              `/api/whatsapp/conversations/${selectedConv.id}/etiquetas/${ce.etiquetaId}`,
                              { method: "DELETE", headers: hdr }
                            ).then(() => onLabelChange())
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">
                        {phoneLabel(selectedConv.contact.phoneDigits)}
                      </p>
                      {selectedConv.humanMode && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-400 text-amber-500">
                          Atendimento humano
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] h-5 px-1.5",
                      selectedConv.status === "open"
                        ? "border-emerald-500/40 text-emerald-500"
                        : "border-muted text-muted-foreground"
                    )}
                  >
                    {selectedConv.status === "open" ? "Aberta" : selectedConv.status}
                  </Badge>
                  {/* Add label button */}
                  <div className="relative" ref={addLabelRef}>
                    <button
                      onClick={() => setShowAddLabel((v) => !v)}
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Adicionar etiqueta"
                    >
                      <Tag className="h-4 w-4" />
                    </button>
                    {showAddLabel && (
                      <AddEtiquetaPopover
                        conversationId={selectedConv.id}
                        currentEtiquetas={selectedConv.etiquetas ?? []}
                        allEtiquetas={etiquetas}
                        onClose={() => setShowAddLabel(false)}
                        onChange={() => { void onLabelChange(); setShowAddLabel(false) }}
                        apiHeaders={hdr}
                      />
                    )}
                  </div>
                  <button className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-0.5 overflow-y-auto bg-muted/15 px-4 py-4">
                {loadingMsgs ? (
                  <div className="space-y-3 pt-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
                        <Skeleton className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-48" : "w-64")} />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input area */}
              <div className="border-t border-border/60 bg-card/30 px-4 py-3 backdrop-blur-sm">
                <div className="relative flex items-center gap-2">
                  {/* Quick reply dropdown */}
                  {showQRDropdown && (
                    <QuickReplyDropdown
                      query={inputText}
                      quickReplies={quickReplies}
                      onSelect={(body) => { setInputText(body); inputRef.current?.focus() }}
                      onClose={() => setInputText("")}
                    />
                  )}
                  <button
                    onClick={() => setShowQRModal(true)}
                    className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-emerald-500 transition-colors"
                    title="Respostas rápidas (ou digite /)"
                  >
                    <Zap className="h-4 w-4" />
                  </button>
                  <Input
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite uma mensagem ou / para respostas rápidas…"
                    disabled={sending}
                    className="h-10 flex-1 border-border/60 bg-muted/30 text-sm focus-visible:ring-primary/40"
                  />
                  <Button
                    onClick={() => void sendMessage()}
                    disabled={!inputText.trim() || sending}
                    size="sm"
                    className="h-10 w-10 shrink-0 p-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Enviando como{" "}
                  <span className="font-medium">
                    {process.env.NEXT_PUBLIC_APP_URL?.replace(/https?:\/\//, "") ?? "OmniGestão"}
                  </span>
                  {" · "}
                  Atualiza a cada {POLL_MS / 1000}s
                  {quickReplies.filter((r) => r.ativo).length > 0 && (
                    <> · <Zap className="h-2.5 w-2.5 text-emerald-500" /> {quickReplies.filter((r) => r.ativo).length} atalhos</>
                  )}
                </p>
              </div>
            </>
          )}
        </div>

        <WhatsAppContextPanel
          key={`${selectedConv?.id ?? "none"}-${contextRefreshKey}`}
          conv={selectedConv}
          messages={messages}
          apiHeaders={hdr}
          linkingCliente={linkingCliente}
          unlinkingCliente={unlinkingCliente}
          linkSuccessMessage={linkSuccessMessage}
          highlightLinkCard={highlightLinkPanel}
          onLinkCliente={linkCliente}
          onUnlinkCliente={requestUnlinkCliente}
          onApplySuggestion={(text) => {
            setInputText(text)
            inputRef.current?.focus()
          }}
          onQuickAction={(action) => {
            if (action === "human" && selectedConv && apiHeaders) {
              void fetch(`/api/whatsapp/conversations/${selectedConv.id}`, {
                method: "PATCH",
                headers: hdr,
                body: JSON.stringify({ humanMode: true }),
              }).then(() => void fetchConversations(true))
            }
          }}
        />
      </div>
    </>
  )
}
