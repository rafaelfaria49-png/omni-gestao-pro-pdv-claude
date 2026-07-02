"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ArrowRight, Edit, Plus, PlayCircle, Zap } from "lucide-react"
import { PremiumEmptyState } from "./agentic-ui"
import {
  PreviewDrawer,
  PreviewFootnote,
  RiskBadge,
  previewToast,
  type RiskLevel,
} from "./whatsapp-preview-ui"
import Link from "next/link"

type Automation = {
  id: string
  name: string
  description: string
  enabled: boolean
  trigger: string
  action: string
  lastRun: string
  runs: number
  deliveryLabel?: string
  sendsMeta?: boolean
}

const TRIGGER_LABELS: Record<string, string> = {
  new_contact: "Novo contato",
  keyword: "Palavra-chave",
  os_created: "OS criada",
  os_status_changed: "OS mudou status",
  budget_approved: "Orçamento aprovado",
  os_ready: "OS pronta",
  payment_pending: "Pagamento pendente",
  no_reply: "Sem resposta",
}

const ACTION_LABELS: Record<string, string> = {
  send_message: "Enviar mensagem",
  create_os: "Criar OS",
  notify_team: "Notificar equipe",
  move_funnel: "Mover no funil",
  send_payment_link: "Link de pagamento",
  send_warranty: "Enviar garantia",
}

/**
 * Classificação heurística de risco só para exibição (preview) — não existe hoje
 * um campo de risco persistido para automações; deriva de trigger/ação reais.
 */
function classifyAutomationRisk(a: Automation): RiskLevel {
  if (a.action === "send_payment_link") return "approval"
  if (a.trigger === "budget_approved" || a.trigger === "payment_pending" || a.action === "create_os")
    return "ai"
  return "safe"
}

type RiskFilter = "all" | RiskLevel
type TriggerFilter = "all" | string

export function WhatsAppAutomationsPanel({
  apiHeaders,
}: {
  apiHeaders: Record<string, string> | null
}) {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all")
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("all")
  const [drawer, setDrawer] = useState<
    | { mode: "new" }
    | { mode: "edit"; automation: Automation }
    | { mode: "simulate"; automation: Automation }
    | null
  >(null)

  const load = useCallback(async () => {
    if (!apiHeaders) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/whatsapp/automations", { headers: apiHeaders })
      const data = (await res.json()) as { ok?: boolean; automations?: Record<string, unknown>[] }
      if (data.ok && Array.isArray(data.automations)) {
        const mapped: Automation[] = data.automations.map((a) => {
          const acts =
            a.actions && typeof a.actions === "object" && !Array.isArray(a.actions)
              ? (a.actions as Record<string, unknown>)
              : {}
          return {
            id: String(a.id ?? ""),
            name: String(a.name ?? ""),
            description: String(acts.description ?? ""),
            enabled: Boolean(a.enabled),
            trigger: String(a.triggerType ?? "keyword"),
            action: String(acts.type ?? "send_message"),
            lastRun: String(acts.lastRun ?? "—"),
            runs: typeof acts.runs === "number" ? acts.runs : 0,
            deliveryLabel:
              typeof a.deliveryLabel === "string" ? a.deliveryLabel : undefined,
            sendsMeta: a.sendsMeta === true,
          }
        })
        setAutomations(mapped)
      }
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }, [apiHeaders])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(a: Automation) {
    if (!apiHeaders) return
    const next = !a.enabled
    setAutomations((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, enabled: next } : x))
    )
    try {
      const res = await fetch(`/api/whatsapp/automations/${a.id}`, {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify({ enabled: next }),
      })
      const j = (await res.json()) as { ok?: boolean }
      if (!j.ok) throw new Error("fail")
    } catch {
      setAutomations((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, enabled: !next } : x))
      )
    }
  }

  const filtered = useMemo(
    () =>
      automations.filter((a) => {
        const matchesRisk = riskFilter === "all" || classifyAutomationRisk(a) === riskFilter
        const matchesTrigger = triggerFilter === "all" || a.trigger === triggerFilter
        return matchesRisk && matchesTrigger
      }),
    [automations, riskFilter, triggerFilter]
  )

  if (!apiHeaders) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Selecione uma loja ativa.</p>
    )
  }

  if (loading) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card h-20 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Automações</h2>
          <p className="text-sm text-muted-foreground">
            {automations.filter((a) => a.enabled).length} ativas de {automations.length}
            {" · "}
            Automações de evento registram histórico interno — não enviam WhatsApp Meta ao cliente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/whatsapp-automation">Ferramentas admin (legado)</Link>
          </Button>
          <Button size="sm" onClick={() => setDrawer({ mode: "new" })}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Nova automação
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <RiskBadge level="safe" />
        <RiskBadge level="ai" />
        <RiskBadge level="approval" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", "safe", "ai", "approval"] as RiskFilter[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRiskFilter(r)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              riskFilter === r
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {r === "all" ? "Todas" : r === "safe" ? "🟢 Seguras" : r === "ai" ? "🟡 IA / Orçamento" : "🔴 Aprovação"}
          </button>
        ))}
        <select
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value)}
          className="rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px] text-foreground"
        >
          <option value="all">Todos os eventos</option>
          {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {automations.length === 0 ? (
        <PremiumEmptyState
          icon={Zap}
          title="Nenhuma automação configurada"
          description="Crie fluxos no HUB operacional (aba Automações) ou aguarde templates da loja."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/whatsapp">Abrir HUB operacional</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const risk = classifyAutomationRisk(a)
            return (
              <div
                key={a.id}
                className="glass-card flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl p-4 transition-colors hover:border-primary/25"
              >
                <div className="flex items-center gap-3 flex-none">
                  <Switch checked={a.enabled} onCheckedChange={() => void toggle(a)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="text-sm text-foreground">{a.name}</span>
                    <RiskBadge level={risk} />
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {TRIGGER_LABELS[a.trigger] ?? a.trigger}
                    </Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {ACTION_LABELS[a.action] ?? a.action}
                    </Badge>
                    {a.deliveryLabel ? (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300 shrink-0">
                        {a.deliveryLabel}
                      </Badge>
                    ) : null}
                  </div>
                  {a.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Última execução: {a.lastRun} · {a.runs} disparos
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-none sm:ml-auto justify-between sm:justify-start">
                  <Badge variant={a.enabled ? "default" : "outline"} className="shrink-0">
                    {a.enabled ? "Ativa" : "Pausada"}
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={() => setDrawer({ mode: "edit", automation: a })}>
                    <Edit className="mr-1 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={() => setDrawer({ mode: "simulate", automation: a })}>
                    <PlayCircle className="mr-1 h-3.5 w-3.5" />
                    Simular
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <PreviewFootnote>
        Simular apenas testa o fluxo da automação dentro do protótipo. Simulação não envia mensagem ao
        cliente. Criar/editar o formulário completo é uma prévia visual — o botão de ativar/pausar acima
        é a única ação que persiste de verdade.
      </PreviewFootnote>

      {drawer?.mode === "new" && (
        <AutomationFormDrawer mode="new" onClose={() => setDrawer(null)} />
      )}
      {drawer?.mode === "edit" && (
        <AutomationFormDrawer mode="edit" automation={drawer.automation} onClose={() => setDrawer(null)} />
      )}
      {drawer?.mode === "simulate" && (
        <SimulateDrawer automation={drawer.automation} onClose={() => setDrawer(null)} />
      )}
    </div>
  )
}

function AutomationFormDrawer({
  mode,
  automation,
  onClose,
}: {
  mode: "new" | "edit"
  automation?: Automation
  onClose: () => void
}) {
  return (
    <PreviewDrawer
      title={mode === "new" ? "Nova automação" : "Editar automação"}
      subtitle="Gatilho, ação e nível de risco"
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && (
            <Button
              variant="outline"
              className="mr-auto text-destructive"
              onClick={() => {
                previewToast("excluir automação")
                onClose()
              }}
            >
              Excluir
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              previewToast(mode === "new" ? "criar automação" : "salvar alterações")
              onClose()
            }}
          >
            {mode === "new" ? "Criar automação" : "Salvar alterações"}
          </Button>
        </>
      }
    >
      <PreviewFootnote>Prévia — a automação não é executada e nenhuma mensagem é enviada.</PreviewFootnote>
      <div className="space-y-1.5">
        <Label className="text-xs">Nome da automação</Label>
        <Input defaultValue={automation?.name ?? ""} placeholder="Ex.: OS pronta → avisar cliente" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Descrição</Label>
        <Textarea rows={2} defaultValue={automation?.description ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Evento / gatilho</Label>
        <select defaultValue={automation?.trigger ?? "new_contact"} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
          {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Ação</Label>
        <select defaultValue={automation?.action ?? "send_message"} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Nível de risco</Label>
        <div className="flex flex-wrap gap-2">
          <RiskBadge level="safe" />
          <RiskBadge level="ai" />
          <RiskBadge level="approval" />
        </div>
        <p className="text-[11px] text-muted-foreground">Ações sensíveis nunca executam sozinhas.</p>
      </div>
    </PreviewDrawer>
  )
}

function SimulateDrawer({ automation, onClose }: { automation: Automation; onClose: () => void }) {
  const steps = [
    { title: "Gatilho reconhecido", detail: TRIGGER_LABELS[automation.trigger] ?? automation.trigger },
    { title: "IA interpreta a intenção", detail: "Classifica a mensagem e mede a confiança." },
    { title: "Consulta ao ERP", detail: "Somente leitura — valida OS, estoque e preço." },
    { title: "Ação preparada", detail: ACTION_LABELS[automation.action] ?? automation.action },
    { title: "Resposta pronta para revisão", detail: "Aguarda envio manual ou aprovação." },
  ]
  return (
    <PreviewDrawer
      title="Simular automação"
      subtitle={automation.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={() => previewToast("rodar simulação")}>Rodar simulação</Button>
        </>
      }
    >
      <PreviewFootnote>
        A simulação roda apenas no protótipo. Nenhuma mensagem é enviada ao cliente.
      </PreviewFootnote>
      <div className="flex items-center gap-2">
        <RiskBadge level={classifyAutomationRisk(automation)} />
        <Badge variant="outline" className="text-[10px]">{TRIGGER_LABELS[automation.trigger] ?? automation.trigger}</Badge>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <Badge variant="secondary" className="text-[10px]">{ACTION_LABELS[automation.action] ?? automation.action}</Badge>
      </div>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={s.title} className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-[11px] font-semibold text-primary">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-xs font-medium text-foreground">{s.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{s.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </PreviewDrawer>
  )
}
