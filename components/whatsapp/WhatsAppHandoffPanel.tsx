"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, Shuffle, Users } from "lucide-react"
import { HubStatCard } from "./agentic-ui"
import { PreviewBadge, PreviewFootnote, previewToast } from "./whatsapp-preview-ui"

const QUEUE_EXAMPLE = [
  { name: "Cliente A", confidence: 52, reason: "Reclamação · garantia / reembolso", store: "Loja ativa", waitMin: 8 },
  { name: "Cliente B", confidence: 69, reason: "IA com confiança limítrofe", store: "Loja ativa", waitMin: 5 },
  { name: "Cliente C", confidence: 73, reason: "Orçamento · aguardando abertura de OS", store: "Loja ativa", waitMin: 3 },
]

const ATTENDANTS_EXAMPLE = [
  { name: "Atendente 1", status: "Online" as const, load: "3 / 5" },
  { name: "Atendente 2", status: "Online" as const, load: "2 / 4" },
  { name: "Atendente 3", status: "Ocupado" as const, load: "5 / 5" },
  { name: "Atendente 4", status: "Ausente" as const, load: "0 / 4" },
]

const ASSIGNMENT_RULES = [
  { title: "Reclamações e reembolso", detail: "Sempre encaminhadas a um humano — a IA nunca decide." },
  { title: "Confiança da IA abaixo de 70%", detail: "Entra na fila da loja de origem para revisão." },
  { title: "Distribuição por carga", detail: "Atribui ao atendente online com menor fila na loja." },
  { title: "Fora do horário", detail: "Mensagem de espera e entra na fila do próximo expediente." },
]

function statusClass(status: "Online" | "Ocupado" | "Ausente") {
  if (status === "Online") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  if (status === "Ocupado") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  return "border-border/60 bg-muted/30 text-muted-foreground"
}

export function WhatsAppHandoffPanel() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Shuffle className="h-5 w-5 text-primary" />
            Handoff
            <PreviewBadge />
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Fila de transferência da IA para atendentes humanos, disponibilidade da equipe e regras de
            atribuição.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => previewToast("definir regras de IA")}>
          Definir regras de IA
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <HubStatCard icon={Clock} label="Em espera" value={QUEUE_EXAMPLE.length} hint="Fila ilustrativa" />
        <HubStatCard icon={Clock} label="Tempo médio de espera" value="—" hint="Sem medição ao vivo ainda" />
        <HubStatCard icon={Users} label="Atendentes online" value="—" hint="Sem integração de presença ainda" />
      </div>

      <div className="glass-card rounded-xl p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Fila de espera</h3>
        <div className="space-y-2">
          {QUEUE_EXAMPLE.map((item) => (
            <div
              key={item.name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  IA {item.confidence}% · {item.reason} · {item.store}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Clock className="h-3 w-3" /> {item.waitMin} min
                </Badge>
                <Button variant="outline" size="sm" onClick={() => previewToast("abrir conversa")}>
                  Abrir
                </Button>
                <Button size="sm" onClick={() => previewToast("atribuir atendente")}>
                  Atribuir
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card rounded-xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Atendentes</h3>
          <div className="space-y-2">
            {ATTENDANTS_EXAMPLE.map((a) => (
              <div key={a.name} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{a.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={statusClass(a.status)}>
                    {a.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{a.load}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Regras de atribuição</h3>
            <Button variant="ghost" size="sm" onClick={() => previewToast("editar regras")}>
              Editar regras
            </Button>
          </div>
          <div className="space-y-2">
            {ASSIGNMENT_RULES.map((r) => (
              <div key={r.title} className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
                <p className="text-xs font-medium text-foreground">{r.title}</p>
                <p className="text-[11px] text-muted-foreground">{r.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PreviewFootnote>
        Protótipo visual com dados ilustrativos. Ainda não há integração real de presença de
        atendentes nem fila de transferência automática — atribuir e abrir conversas são ações de
        prévia; nada é enviado ao cliente.
      </PreviewFootnote>
    </div>
  )
}
