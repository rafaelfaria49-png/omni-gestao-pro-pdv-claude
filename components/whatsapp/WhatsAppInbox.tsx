"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
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
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

type WaContact = {
  id: string
  phoneDigits: string
  displayName: string
  profilePicUrl: string
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORE_ID = "loja-1"
const API_HEADERS = { "x-assistec-loja-id": STORE_ID, "Content-Type": "application/json" }
const POLL_MS = 5000

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
    "bg-emerald-500",
    "bg-sky-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-orange-500",
  ]
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

// ─── Avatar component ─────────────────────────────────────────────────────────

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

// ─── Conversation list item ────────────────────────────────────────────────────

function ConvItem({
  conv,
  selected,
  onClick,
}: {
  conv: WaConversation
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
        selected && "bg-muted"
      )}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <ContactAvatar contact={conv.contact} size="md" />
        {conv.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] rounded-full bg-emerald-500 text-[10px] text-white font-bold flex items-center justify-center px-1">
            {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={cn("text-sm font-medium truncate", conv.unreadCount > 0 ? "text-foreground" : "text-foreground/80")}>
            {conv.contact.displayName}
          </span>
          <span className={cn("text-[11px] flex-shrink-0", conv.unreadCount > 0 ? "text-emerald-500 font-semibold" : "text-muted-foreground")}>
            {formatTime(conv.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className={cn("text-xs truncate", conv.unreadCount > 0 ? "text-foreground/70 font-medium" : "text-muted-foreground")}>
            {conv.lastMessagePreview || "Sem mensagens"}
          </p>
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            {conv.clienteId && (
              <UserCheck className="h-3 w-3 text-emerald-500" aria-label="Cliente vinculado" />
            )}
            {conv.humanMode && (
              <span className="text-[10px] text-amber-500 font-semibold">Human</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: WaMessage }) {
  const out = msg.direction === "outbound"
  return (
    <div className={cn("flex mb-1", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          out
            ? "bg-emerald-600 text-white rounded-br-sm"
            : "bg-card border border-border text-foreground rounded-bl-sm"
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>
        <div className={cn("flex items-center gap-1 mt-1", out ? "justify-end" : "justify-start")}>
          <span className={cn("text-[10px]", out ? "text-emerald-100/80" : "text-muted-foreground")}>
            {formatTime(msg.createdAt)}
          </span>
          {out && <CheckCheck className="h-3 w-3 text-emerald-200/80" />}
        </div>
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
      <p className="text-sm text-muted-foreground">
        Escolha um contato à esquerda para ver as mensagens.
      </p>
    </div>
  )
}

// ─── Main inbox ───────────────────────────────────────────────────────────────

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState<WaConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [inputText, setInputText] = useState("")
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sending, setSending] = useState(false)
  const [online, setOnline] = useState(true)
  const [lastPoll, setLastPoll] = useState(Date.now())

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null

  // ── Fetch conversations ──
  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setLoadingConvs(true)
    try {
      const res = await fetch("/api/whatsapp/conversations", { headers: API_HEADERS })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setConversations(data.conversations ?? [])
      setOnline(true)
    } catch {
      setOnline(false)
    } finally {
      if (!silent) setLoadingConvs(false)
      setLastPoll(Date.now())
    }
  }, [])

  // ── Fetch messages for selected conversation ──
  const fetchMessages = useCallback(async (convId: string, silent = false) => {
    if (!silent) setLoadingMsgs(true)
    try {
      const res = await fetch(`/api/whatsapp/messages?conversationId=${convId}&take=100`, {
        headers: API_HEADERS,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMessages(data.messages ?? [])
    } catch {
      /* keep existing messages */
    } finally {
      if (!silent) setLoadingMsgs(false)
    }
  }, [])

  // ── Select conversation + mark read ──
  const selectConversation = useCallback(
    async (conv: WaConversation) => {
      setSelectedId(conv.id)
      setMessages([])
      await fetchMessages(conv.id)
      // Mark as read if there are unread messages
      if (conv.unreadCount > 0) {
        await fetch(`/api/whatsapp/conversations/${conv.id}`, {
          method: "PATCH",
          headers: API_HEADERS,
          body: JSON.stringify({ unreadCount: 0 }),
        })
        setConversations((prev) =>
          prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
        )
      }
      inputRef.current?.focus()
    },
    [fetchMessages]
  )

  // ── Send message ──
  const sendMessage = useCallback(async () => {
    const text = inputText.trim()
    if (!text || !selectedId || sending) return
    setSending(true)
    setInputText("")
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify({ conversationId: selectedId, text }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error("[WhatsAppInbox] send error:", err)
        setInputText(text) // restore on failure
        return
      }
      // Optimistically add message then refresh
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
      // Update last preview in sidebar
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, lastMessagePreview: text, lastMessageAt: new Date().toISOString() }
            : c
        )
      )
      // Refresh messages from server after short delay
      setTimeout(() => fetchMessages(selectedId, true), 1200)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [inputText, selectedId, sending, fetchMessages])

  // ── Auto-scroll to bottom on new messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Initial load ──
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // ── Polling ──
  useEffect(() => {
    pollTimerRef.current = setInterval(async () => {
      await fetchConversations(true)
      if (selectedId) await fetchMessages(selectedId, true)
    }, POLL_MS)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [fetchConversations, fetchMessages, selectedId])

  // ── Keyboard send ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Filtered conversations ──
  const filtered = searchQuery
    ? conversations.filter(
        (c) =>
          c.contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.contact.phoneDigits.includes(searchQuery.replace(/\D/g, "")) ||
          c.lastMessagePreview.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      {/* ── Sidebar ── */}
      <aside className="w-80 flex-shrink-0 flex flex-col border-r border-border">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-foreground leading-none">WhatsApp</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {online ? "Conectado" : "Sem conexão"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {totalUnread > 0 && (
                <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] px-1.5 py-0 h-4">
                  {totalUnread}
                </Badge>
              )}
              {online ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <button
                onClick={() => fetchConversations()}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Atualizar"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar contato ou mensagem…"
              className="pl-8 h-8 text-xs bg-muted/40 border-border/60"
            />
          </div>
        </div>

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
                onClick={() => selectConversation(conv)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── Chat panel ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!selectedConv ? (
          <EmptyChat />
        ) : (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 bg-background/80 backdrop-blur-sm">
              <div className="flex items-center gap-3 min-w-0">
                <ContactAvatar contact={selectedConv.contact} size="md" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {selectedConv.contact.displayName}
                    </p>
                    {selectedConv.clienteId && (
                      <div title="Cliente cadastrado vinculado" className="flex items-center gap-0.5">
                        <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-[10px] text-emerald-500 font-medium">Cadastrado</span>
                      </div>
                    )}
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
                <button className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5 bg-muted/20">
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
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input area */}
            <div className="px-4 py-3 border-t border-border bg-background">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite uma mensagem… (Enter para enviar)"
                  disabled={sending}
                  className="flex-1 h-10 text-sm bg-muted/40 border-border/60 focus-visible:ring-emerald-500/50"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!inputText.trim() || sending}
                  size="sm"
                  className="h-10 w-10 p-0 bg-emerald-600 hover:bg-emerald-700 text-white flex-shrink-0"
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
                Atualiza automaticamente a cada {POLL_MS / 1000}s
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
