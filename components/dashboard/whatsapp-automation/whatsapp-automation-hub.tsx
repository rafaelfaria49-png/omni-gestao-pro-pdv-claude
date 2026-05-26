"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bot,
  Loader2,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import { cn } from "@/lib/utils"

type WContact = {
  id: string
  displayName: string
  phoneDigits: string
}

type WConversation = {
  id: string
  humanMode: boolean
  unreadCount: number
  lastMessagePreview: string | null
  lastMessageAt: string | null
  contact: WContact
}

type WMessage = {
  id: string
  direction: string
  body: string
  createdAt: string
}

type WQuickReply = {
  id: string
  shortcut: string
  title: string
  body: string
  category: string
  sortOrder: number
}

type WAutomationActions = {
  message?: string
  targetPhone?: string
  [key: string]: unknown
}

type WAutomation = {
  id: string
  name: string
  enabled: boolean
  priority: number
  triggerType: string
  conditions: unknown
  actions: WAutomationActions
}

type WAiSettings = {
  tone: string
  systemPrompt: string
  suggestionsEnabled: boolean
  maxContextMessages: number
}

function headersJson(lojaId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    [ASSISTEC_LOJA_HEADER]: lojaId,
  }
}

export function WhatsAppAutomationHub() {
  const { lojaAtivaId } = useLojaAtiva()
  const lojaId = lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<WConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<WMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  const [draft, setDraft] = useState("")
  const [simulateInput, setSimulateInput] = useState("Oi, qual o preço da troca de tela?")
  const [simulationOut, setSimulationOut] = useState<string | null>(null)
  const [aiOut, setAiOut] = useState<string | null>(null)
  const [aiSuggestionSource, setAiSuggestionSource] = useState<"llm" | "local" | null>(null)
  const [aiSuggestionCached, setAiSuggestionCached] = useState(false)

  const [quickReplies, setQuickReplies] = useState<WQuickReply[]>([])
  const [qrShortcut, setQrShortcut] = useState("")
  const [qrTitle, setQrTitle] = useState("")
  const [qrBody, setQrBody] = useState("")

  const [automations, setAutomations] = useState<WAutomation[]>([])
  // telefone de destino editável por automação (id → valor)
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({})
  const [phoneSaving, setPhoneSaving] = useState<Record<string, boolean>>({})

  const [aiSettings, setAiSettings] = useState<WAiSettings | null>(null)
  const [toneDraft, setToneDraft] = useState("")
  const [promptDraft, setPromptDraft] = useState("")

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  const refreshConversations = useCallback(async () => {
    const r = await fetch("/api/whatsapp/conversations", {
      credentials: "include",
      headers: { [ASSISTEC_LOJA_HEADER]: lojaId },
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || "Falha ao carregar conversas")
    const list = (j.conversations ?? []) as WConversation[]
    setConversations(list)
    return list
  }, [lojaId])

  const refreshQuickReplies = useCallback(async () => {
    const r = await fetch("/api/whatsapp/quick-replies", {
      credentials: "include",
      headers: { [ASSISTEC_LOJA_HEADER]: lojaId },
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || "Falha ao carregar respostas rápidas")
    setQuickReplies(j.quickReplies ?? [])
  }, [lojaId])

  const refreshAutomations = useCallback(async () => {
    const r = await fetch("/api/whatsapp/automations", {
      credentials: "include",
      headers: { [ASSISTEC_LOJA_HEADER]: lojaId },
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || "Falha ao carregar automações")
    const list = (j.automations ?? []) as WAutomation[]
    setAutomations(list)
    // inicializa rascunhos de telefone com o valor atual do banco
    setPhoneDrafts((prev) => {
      const next = { ...prev }
      for (const a of list) {
        if (!(a.id in next)) {
          next[a.id] = a.actions?.targetPhone ?? ""
        }
      }
      return next
    })
  }, [lojaId])

  const refreshAi = useCallback(async () => {
    const r = await fetch("/api/whatsapp/ai-settings", {
      credentials: "include",
      headers: { [ASSISTEC_LOJA_HEADER]: lojaId },
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || "Falha ao carregar IA")
    const s = j.aiSettings as WAiSettings
    setAiSettings(s)
    setToneDraft(s.tone)
    setPromptDraft(s.systemPrompt)
  }, [lojaId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const list = await refreshConversations()
        await Promise.all([refreshQuickReplies(), refreshAutomations(), refreshAi()])
        if (!cancelled) {
          setSelectedId((prev) => {
            if (prev && list.some((c) => c.id === prev)) return prev
            return list[0]?.id ?? null
          })
        }
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "WhatsApp HUB",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lojaId, refreshAi, refreshAutomations, refreshConversations, refreshQuickReplies, toast])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    let cancelled = false
    ;(async () => {
      setMessagesLoading(true)
      try {
        const r = await fetch(
          `/api/whatsapp/messages?conversationId=${encodeURIComponent(selectedId)}&take=120`,
          {
            credentials: "include",
            headers: { [ASSISTEC_LOJA_HEADER]: lojaId },
          }
        )
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || "Mensagens")
        if (!cancelled) setMessages(j.messages ?? [])
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Mensagens",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setMessagesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId, lojaId, toast])

  const sendOutbound = async () => {
    if (!selectedId || !draft.trim()) return
    const r = await fetch("/api/whatsapp/messages", {
      method: "POST",
      credentials: "include",
      headers: headersJson(lojaId),
      body: JSON.stringify({
        conversationId: selectedId,
        direction: "outbound",
        body: draft.trim(),
      }),
    })
    const j = await r.json()
    if (!r.ok) {
      toast({ title: "Envio", description: j.error || "Erro", variant: "destructive" })
      return
    }
    setDraft("")
    setMessages((prev) => [...prev, j.message])
    void refreshConversations()
    toast({ title: "Rascunho salvo", description: "Mensagem registrada localmente (sem envio à Meta)." })
  }

  const toggleHuman = async (next: boolean) => {
    if (!selectedId) return
    const r = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(selectedId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: headersJson(lojaId),
      body: JSON.stringify({ humanMode: next }),
    })
    const j = await r.json()
    if (!r.ok) {
      toast({ title: "Modo humano", description: j.error || "Erro", variant: "destructive" })
      return
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, humanMode: next } : c))
    )
  }

  const runSimulation = async () => {
    const r = await fetch("/api/whatsapp/messages", {
      method: "POST",
      credentials: "include",
      headers: headersJson(lojaId),
      body: JSON.stringify({
        mode: "simulate_automation",
        incomingText: simulateInput,
      }),
    })
    const j = await r.json()
    if (!r.ok) {
      toast({ title: "Simulação", description: j.error || "Erro", variant: "destructive" })
      return
    }
    setSimulationOut(j.simulation?.replyText ?? "")
  }

  const runAiSuggestion = async () => {
    if (!selectedId) return
    const r = await fetch("/api/whatsapp/messages", {
      method: "POST",
      credentials: "include",
      headers: headersJson(lojaId),
      body: JSON.stringify({
        mode: "ai_suggestion",
        conversationId: selectedId,
      }),
    })
    const j = await r.json()
    if (!r.ok) {
      toast({ title: "IA", description: j.error || "Erro", variant: "destructive" })
      return
    }
    setAiOut(j.suggestion ?? "")
    setAiSuggestionSource(j.source === "llm" ? "llm" : j.source === "local" ? "local" : null)
    setAiSuggestionCached(!!j.cached)
  }

  const addQuickReply = async () => {
    if (!qrShortcut.trim() || !qrTitle.trim() || !qrBody.trim()) return
    const r = await fetch("/api/whatsapp/quick-replies", {
      method: "POST",
      credentials: "include",
      headers: headersJson(lojaId),
      body: JSON.stringify({
        shortcut: qrShortcut.startsWith("/") ? qrShortcut : `/${qrShortcut}`,
        title: qrTitle,
        body: qrBody,
      }),
    })
    const j = await r.json()
    if (!r.ok) {
      toast({ title: "Resposta rápida", description: j.error || "Erro", variant: "destructive" })
      return
    }
    setQrShortcut("")
    setQrTitle("")
    setQrBody("")
    await refreshQuickReplies()
    toast({ title: "Salvo", description: "Resposta rápida persistida no banco." })
  }

  const deleteQuickReply = async (id: string) => {
    const r = await fetch(`/api/whatsapp/quick-replies/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: headersJson(lojaId),
    })
    const j = await r.json()
    if (!r.ok) {
      toast({ title: "Excluir", description: j.error || "Erro", variant: "destructive" })
      return
    }
    await refreshQuickReplies()
  }

  const toggleAutomation = async (row: WAutomation, enabled: boolean) => {
    const r = await fetch(`/api/whatsapp/automations/${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: headersJson(lojaId),
      body: JSON.stringify({ enabled }),
    })
    const j = await r.json()
    if (!r.ok) {
      toast({ title: "Automação", description: j.error || "Erro", variant: "destructive" })
      return
    }
    setAutomations((prev) => prev.map((a) => (a.id === row.id ? { ...a, enabled } : a)))
  }

  const saveTargetPhone = async (row: WAutomation) => {
    const rawPhone = (phoneDrafts[row.id] ?? "").trim()
    const digitsOnly = rawPhone.replace(/\D/g, "")
    if (!digitsOnly) {
      toast({
        title: "Telefone inválido",
        description: "Digite apenas dígitos (ex: 5511999990001).",
        variant: "destructive",
      })
      return
    }
    setPhoneSaving((prev) => ({ ...prev, [row.id]: true }))
    try {
      const updatedActions: WAutomationActions = {
        ...(typeof row.actions === "object" && row.actions !== null ? row.actions : {}),
        targetPhone: digitsOnly,
      }
      const r = await fetch(`/api/whatsapp/automations/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: headersJson(lojaId),
        body: JSON.stringify({ actions: updatedActions }),
      })
      const j = await r.json()
      if (!r.ok) {
        toast({ title: "Salvar telefone", description: j.error || "Erro", variant: "destructive" })
        return
      }
      const saved = j.automation as WAutomation
      setAutomations((prev) => prev.map((a) => (a.id === row.id ? { ...a, actions: saved.actions } : a)))
      setPhoneDrafts((prev) => ({ ...prev, [row.id]: digitsOnly }))
      toast({
        title: "Telefone salvo",
        description: `Destino atualizado: +${digitsOnly}. Próxima venda enviará para este número.`,
      })
    } finally {
      setPhoneSaving((prev) => ({ ...prev, [row.id]: false }))
    }
  }

  const saveAiSettings = async () => {
    const r = await fetch("/api/whatsapp/ai-settings", {
      method: "PATCH",
      credentials: "include",
      headers: headersJson(lojaId),
      body: JSON.stringify({
        tone: toneDraft,
        systemPrompt: promptDraft,
        suggestionsEnabled: aiSettings?.suggestionsEnabled ?? true,
      }),
    })
    const j = await r.json()
    if (!r.ok) {
      toast({ title: "IA", description: j.error || "Erro", variant: "destructive" })
      return
    }
    setAiSettings(j.aiSettings)
    toast({
      title: "Configuração IA",
      description:
        "Preferências salvas. Sugestões usam LLM quando configurado; fallback local quando indisponível.",
    })
  }

  const applyQuickReplyToDraft = (body: string) => {
    setDraft(body)
    toast({ title: "Texto aplicado", description: "Colado no campo de mensagem (rascunho)." })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando dados do WhatsApp…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Automação
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <MessageCircle className="h-7 w-7 text-green-600" />
            WhatsApp HUB
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Conversas, respostas rápidas e automações persistem no Postgres por unidade (
            <span className="font-mono text-xs">{lojaId}</span>). Nenhuma mensagem é enviada à Meta nesta
            versão.
          </p>
        </div>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="chat" className="gap-1">
            <MessageCircle className="h-4 w-4" /> Conversas
          </TabsTrigger>
          <TabsTrigger value="quick" className="gap-1">
            <Zap className="h-4 w-4" /> Respostas rápidas
          </TabsTrigger>
          <TabsTrigger value="auto" className="gap-1">
            <Sparkles className="h-4 w-4" /> Automações
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1">
            <Bot className="h-4 w-4" /> IA & sugestões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Caixa de entrada</CardTitle>
                <CardDescription>Últimas conversas da loja</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[420px]">
                  <div className="flex flex-col gap-1 p-3">
                    {conversations.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          selectedId === c.id
                            ? "border-primary/50 bg-primary/10"
                            : "border-border bg-muted/30 hover:bg-muted/60"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{c.contact.displayName}</span>
                          {c.unreadCount > 0 ? (
                            <span className="text-[10px] rounded-full bg-primary px-2 py-0.5 text-primary-foreground">
                              {c.unreadCount}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {c.lastMessagePreview || "—"}
                        </p>
                      </button>
                    ))}
                    {conversations.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1">Nenhuma conversa.</p>
                    ) : null}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2">
                <div>
                  <CardTitle className="text-base">
                    {selected ? selected.contact.displayName : "Selecione uma conversa"}
                  </CardTitle>
                  <CardDescription>
                    {selected ? (
                      <span className="font-mono text-xs">{selected.contact.phoneDigits}</span>
                    ) : (
                      "—"
                    )}
                  </CardDescription>
                </div>
                {selected ? (
                  <div className="flex items-center gap-2">
                    <Switch checked={selected.humanMode} onCheckedChange={(v) => void toggleHuman(v)} />
                    <span className="text-xs text-muted-foreground">Modo humano</span>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                <ScrollArea className="h-[280px] rounded-lg border border-border bg-muted/20 p-3">
                  {messagesLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando mensagens…
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                            m.direction === "outbound"
                              ? "ml-auto bg-primary text-primary-foreground"
                              : "mr-auto bg-card border border-border"
                          )}
                        >
                          {m.body}
                        </div>
                      ))}
                      {messages.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sem mensagens nesta conversa.</p>
                      ) : null}
                    </div>
                  )}
                </ScrollArea>

                <div className="space-y-2">
                  <Label htmlFor="wa-draft">Rascunho (não envia à Meta)</Label>
                  <Textarea
                    id="wa-draft"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Digite a resposta ao cliente…"
                    className="min-h-24"
                  />
                  <Button type="button" onClick={() => void sendOutbound()} disabled={!selectedId || !draft.trim()}>
                    <Send className="h-4 w-4 mr-2" />
                    Salvar mensagem localmente
                  </Button>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Simulação de automação
                  </p>
                  <Textarea value={simulateInput} onChange={(e) => setSimulateInput(e.target.value)} rows={2} />
                  <Button type="button" variant="secondary" size="sm" onClick={() => void runSimulation()}>
                    Testar palavras-chave
                  </Button>
                  {simulationOut ? (
                    <p className="text-sm rounded-md bg-background border border-border p-2 whitespace-pre-wrap">
                      {simulationOut}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Sugestão de resposta
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void runAiSuggestion()}
                    disabled={!selectedId}
                  >
                    Gerar sugestão pelo contexto
                  </Button>
                  {aiOut ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {aiSuggestionSource === "llm"
                          ? `Sugestão IA real${aiSuggestionCached ? " (cache)" : ""}`
                          : "Sugestão local (fallback — IA indisponível)"}
                      </p>
                      <p className="text-sm rounded-md bg-background border border-border p-2 whitespace-pre-wrap">
                        {aiOut}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Revise antes de enviar — não há envio automático.
                      </p>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="quick" className="mt-4 space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Nova resposta rápida</CardTitle>
              <CardDescription>Atalhos persistidos por loja (ex.: /horario)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Atalho</Label>
                <Input value={qrShortcut} onChange={(e) => setQrShortcut(e.target.value)} placeholder="/preco" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Título</Label>
                <Input value={qrTitle} onChange={(e) => setQrTitle(e.target.value)} placeholder="Tabela de preços" />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label>Texto</Label>
                <Textarea value={qrBody} onChange={(e) => setQrBody(e.target.value)} rows={3} />
              </div>
              <Button type="button" onClick={() => void addQuickReply()}>
                Adicionar
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            {quickReplies.map((qr) => (
              <Card key={qr.id} className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-mono">{qr.shortcut}</CardTitle>
                      <CardDescription>{qr.title}</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => void deleteQuickReply(qr.id)}>
                      Remover
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm whitespace-pre-wrap">{qr.body}</p>
                  <Button variant="outline" size="sm" type="button" onClick={() => applyQuickReplyToDraft(qr.body)}>
                    Usar no rascunho
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="auto" className="mt-4 space-y-3">
          {automations.map((a) => (
            <Card key={a.id} className="border-border">
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                <div>
                  <CardTitle className="text-base">{a.name}</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {a.triggerType} · prioridade {a.priority}
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={() => void toggleAutomation(a, !a.enabled)}
                >
                  {a.enabled ? (
                    <>
                      <ToggleRight className="h-5 w-5 text-green-600" /> Ativa
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-5 w-5 text-muted-foreground" /> Off
                    </>
                  )}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Campo editável de telefone de destino */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-green-600" />
                    Telefone de destino
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-8 text-sm font-mono max-w-xs"
                      placeholder="5511999990001"
                      value={phoneDrafts[a.id] ?? ""}
                      onChange={(e) =>
                        setPhoneDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={phoneSaving[a.id]}
                      onClick={() => void saveTargetPhone(a)}
                    >
                      {phoneSaving[a.id] ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Salvar"
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Somente dígitos, com DDI (ex: <span className="font-mono">5511999990001</span>).
                    Mensagens simuladas serão enviadas a este número.
                  </p>
                </div>
                {/* Visualização JSON das ações e condições */}
                <details className="text-xs font-mono text-muted-foreground">
                  <summary className="cursor-pointer select-none text-[11px]">Ver JSON completo</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(a.conditions, null, 2)}</pre>
                  <pre className="whitespace-pre-wrap break-all">{JSON.stringify(a.actions, null, 2)}</pre>
                </details>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Preferências de sugestão</CardTitle>
              <CardDescription>
                Tom e prompt usados na análise LLM e na sugestão de resposta (OpenRouter/OpenAI/Gemini no servidor).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-w-3xl">
              <div className="space-y-1">
                <Label>Tom</Label>
                <Input value={toneDraft} onChange={(e) => setToneDraft(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Prompt base (contexto interno)</Label>
                <Textarea value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} rows={5} />
              </div>
              <Button type="button" onClick={() => void saveAiSettings()}>
                Salvar
              </Button>
              {aiSettings ? (
                <p className="text-xs text-muted-foreground">
                  Sugestões: {aiSettings.suggestionsEnabled ? "ativadas" : "desativadas"} · contexto máx.:{" "}
                  {aiSettings.maxContextMessages} mensagens
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
