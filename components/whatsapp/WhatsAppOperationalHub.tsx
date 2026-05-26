"use client"

import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  BarChart3,
  Inbox,
  MessageSquare,
  Sparkles,
  Zap,
} from "lucide-react"
import WhatsAppInbox from "@/components/whatsapp/WhatsAppInbox"
import { WhatsAppInsightsPanel } from "@/components/whatsapp/WhatsAppInsightsPanel"
import { WhatsAppIaPanel } from "@/components/whatsapp/WhatsAppIaPanel"
import { WhatsAppAutomationsPanel } from "@/components/whatsapp/WhatsAppAutomationsPanel"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { cn } from "@/lib/utils"

export default function WhatsAppOperationalHub() {
  const [tab, setTab] = useState("inbox")
  const { lojaAtivaId } = useLojaAtiva()
  const apiHeaders = useMemo((): Record<string, string> | null => {
    const id = lojaAtivaId?.trim()
    if (!id) return null
    return { [ASSISTEC_LOJA_HEADER]: id, "Content-Type": "application/json" }
  }, [lojaAtivaId])

  return (
    <div className="flex min-h-0 w-full flex-col gap-3">
      <header className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 md:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/20">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-foreground md:text-lg">
                WhatsApp HUB
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Atendimento agentic · OmniGestão Pro
              </p>
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className="gap-1 border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200"
        >
          <Sparkles className="h-3 w-3" />
          Agentic AI
        </Badge>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="glass-card h-auto w-full justify-start gap-1 rounded-xl p-1 md:w-auto">
          <TabsTrigger value="inbox" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
            <Inbox className="h-3.5 w-3.5" />
            Inbox
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" />
            Painel
          </TabsTrigger>
          <TabsTrigger value="automacoes" className="gap-1.5 text-xs">
            <Zap className="h-3.5 w-3.5" />
            Automações
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            IA
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="inbox"
          className={cn("mt-2 min-h-0 flex-1 data-[state=inactive]:hidden")}
        >
          <WhatsAppInbox embedded />
        </TabsContent>

        <TabsContent value="insights" className="mt-2 min-h-0 flex-1 overflow-auto">
          <WhatsAppInboxInsightsBridge apiHeaders={apiHeaders} />
        </TabsContent>

        <TabsContent value="automacoes" className="mt-2 min-h-0 flex-1 overflow-auto">
          <WhatsAppAutomationsPanel apiHeaders={apiHeaders} />
        </TabsContent>

        <TabsContent value="ia" className="mt-2 min-h-0 flex-1 overflow-auto">
          <WhatsAppIaPanel apiHeaders={apiHeaders} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Bridge leve: reusa fetch do inbox via evento — implementação inline para painel. */
function WhatsAppInboxInsightsBridge({
  apiHeaders,
}: {
  apiHeaders: Record<string, string> | null
}) {
  const [conversations, setConversations] = useState<
    import("./WhatsAppInsightsPanel").InsightsConversation[]
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      if (!apiHeaders) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await fetch("/api/whatsapp/conversations", { headers: apiHeaders })
        const data = (await res.json()) as {
          conversations?: import("./WhatsAppInsightsPanel").InsightsConversation[]
        }
        setConversations(data.conversations ?? [])
      } catch {
        setConversations([])
      } finally {
        setLoading(false)
      }
    })()
  }, [apiHeaders])

  return <WhatsAppInsightsPanel conversations={conversations} loading={loading} />
}
