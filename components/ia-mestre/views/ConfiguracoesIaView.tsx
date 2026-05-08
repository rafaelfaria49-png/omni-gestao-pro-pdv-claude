"use client"

import { CreditCard, Download, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { IaMestreSubPageShell } from "@/components/ia-mestre/IaMestreSubPageShell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const LS_KEY = "ia-mestre-config-v1"

type Lang = "pt-BR" | "en" | "es"
type ModelChoice = "auto" | "gpt55" | "gpt4o" | "gpt35"
type ResponseLen = "short" | "medium" | "long" | "xl"
type PlanTier = "bronze" | "prata" | "ouro"

type UsageRow = { id: string; action: string; credits: number; at: string }

export type IaMestreConfigState = {
  agentName: string
  language: Lang
  timezone: string
  avatarEmoji: string
  avatarDataUrl: string | null
  modelChoice: ModelChoice
  temperature: number
  responseLength: ResponseLen
  notifyCreditsLow: boolean
  dailySummary: boolean
  importantAlerts: boolean
  emailNotif: boolean
  saveHistory: boolean
  useDataImprove: boolean
  plan: PlanTier
  creditsUsed: number
  creditsTotal: number
  usageHistory: UsageRow[]
}

const EMOJI_PRESETS = ["🤖", "✨", "📱", "🛠️", "💼", "🎯", "🌟", "⚡"]

const DEFAULT_HISTORY: UsageRow[] = [
  { id: "u1", action: "Chat — orçamento", credits: 2, at: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: "u2", action: "Imagem — banner mock", credits: 5, at: new Date(Date.now() - 86400000 * 1 + 3600000).toISOString() },
  { id: "u3", action: "Chat — estoque", credits: 1, at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: "u4", action: "Chat — campanha", credits: 3, at: new Date(Date.now() - 86400000 * 2 + 7200000).toISOString() },
  { id: "u5", action: "Análise — financeiro", credits: 4, at: new Date(Date.now() - 86400000 * 3).toISOString() },
  { id: "u6", action: "Chat — suporte", credits: 1, at: new Date(Date.now() - 86400000 * 4).toISOString() },
  { id: "u7", action: "Imagem — logo mock", credits: 5, at: new Date(Date.now() - 86400000 * 5).toISOString() },
  { id: "u8", action: "Chat — treino IA", credits: 2, at: new Date(Date.now() - 86400000 * 6).toISOString() },
  { id: "u9", action: "Chat — OS", credits: 2, at: new Date(Date.now() - 86400000 * 7).toISOString() },
  { id: "u10", action: "Resumo diário (mock)", credits: 0, at: new Date(Date.now() - 86400000 * 8).toISOString() },
]

const DEFAULT_STATE: IaMestreConfigState = {
  agentName: "IA Mestre",
  language: "pt-BR",
  timezone: "America/Sao_Paulo",
  avatarEmoji: "🤖",
  avatarDataUrl: null,
  modelChoice: "auto",
  temperature: 45,
  responseLength: "medium",
  notifyCreditsLow: true,
  dailySummary: false,
  importantAlerts: true,
  emailNotif: false,
  saveHistory: true,
  useDataImprove: false,
  plan: "prata",
  creditsUsed: 2405,
  creditsTotal: 5000,
  usageHistory: DEFAULT_HISTORY,
}

const CREDIT_PACKS = [
  { id: "p100", credits: 100, price: "R$ 9,90" },
  { id: "p500", credits: 500, price: "R$ 39,90" },
  { id: "p1000", credits: 1000, price: "R$ 69,90" },
  { id: "punl", credits: 999999, price: "R$ 99,90", label: "Ilimitado/mês" },
]

function modelBadgeLabel(choice: ModelChoice): string {
  switch (choice) {
    case "auto":
      return "Auto (recomendado)"
    case "gpt55":
      return "GPT-5.5 Pro"
    case "gpt4o":
      return "GPT-4o"
    default:
      return "GPT-3.5"
  }
}

function planLabel(plan: PlanTier): string {
  switch (plan) {
    case "bronze":
      return "Bronze"
    case "ouro":
      return "Ouro"
    default:
      return "Prata"
  }
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return iso
  }
}

export function ConfiguracoesIaView() {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<IaMestreConfigState>(DEFAULT_STATE)
  const [buyOpen, setBuyOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return
      const p = JSON.parse(raw) as Partial<IaMestreConfigState>
      if (p && typeof p === "object") {
        setState({
          ...DEFAULT_STATE,
          ...p,
          usageHistory: Array.isArray(p.usageHistory) && p.usageHistory.length ? p.usageHistory : DEFAULT_STATE.usageHistory,
        })
      }
    } catch {
      /* ignore */
    }
  }, [])

  const persist = useCallback(
    (next: IaMestreConfigState) => {
      try {
        const nextStr = JSON.stringify(next)
        localStorage.setItem(LS_KEY, nextStr)
        window.dispatchEvent(new StorageEvent("storage", { key: LS_KEY, newValue: nextStr }))
      } catch {
        toast({ title: "Erro ao salvar", variant: "destructive" })
      }
    },
    [toast],
  )

  const saveAll = useCallback(() => {
    persist(state)
    toast({ title: "Configurações salvas", description: "Preferências atualizadas com sucesso." })
  }, [persist, state, toast])

  const pct = useMemo(() => {
    if (state.creditsTotal <= 0) return 0
    return Math.min(100, Math.round((state.creditsUsed / state.creditsTotal) * 100))
  }, [state.creditsUsed, state.creditsTotal])

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null
      setState((s) => ({ ...s, avatarDataUrl: dataUrl }))
    }
    reader.readAsDataURL(f)
    e.target.value = ""
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ config: state, exportedAt: new Date().toISOString() }, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "ia-mestre-dados-mock.json"
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: "Exportação concluída", description: "Arquivo JSON baixado (mock)." })
  }

  return (
    <IaMestreSubPageShell
      title="Configurações"
      subtitle="Preferências do agente, modelo e privacidade"
      actions={
        <Button type="button" className="h-9 gap-1.5 rounded-xl" onClick={saveAll}>
          Salvar configurações
        </Button>
      }
    >
      <Tabs defaultValue="geral" className="w-full max-w-5xl">
        <TabsList className="mb-4 flex h-auto min-h-9 w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="geral" className="text-[12px]">
            Geral
          </TabsTrigger>
          <TabsTrigger value="modelo" className="text-[12px]">
            Modelo
          </TabsTrigger>
          <TabsTrigger value="notif" className="text-[12px]">
            Notificações
          </TabsTrigger>
          <TabsTrigger value="priv" className="text-[12px]">
            Privacidade
          </TabsTrigger>
          <TabsTrigger value="creditos" className="text-[12px]">
            Créditos
          </TabsTrigger>
          <TabsTrigger value="perigo" className="text-[12px] text-destructive data-[state=active]:text-destructive">
            Perigo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-[11px]">Nome do agente</Label>
              <Input
                value={state.agentName}
                onChange={(e) => setState((s) => ({ ...s, agentName: e.target.value }))}
                className="mt-1 h-9 text-[13px]"
              />
            </div>
            <div>
              <Label className="text-[11px]">Idioma</Label>
              <select
                value={state.language}
                onChange={(e) => setState((s) => ({ ...s, language: e.target.value as Lang }))}
                className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-[13px] text-foreground"
              >
                <option value="pt-BR">Português BR</option>
                <option value="en">Inglês</option>
                <option value="es">Espanhol</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Fuso horário</Label>
              <select
                value={state.timezone}
                onChange={(e) => setState((s) => ({ ...s, timezone: e.target.value }))}
                className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-[13px] text-foreground"
              >
                <option value="America/Sao_Paulo">America/São Paulo</option>
                <option value="America/Manaus">America/Manaus</option>
                <option value="America/Fortaleza">America/Fortaleza</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[11px]">Avatar do agente</Label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/30 text-2xl">
                  {state.avatarDataUrl ? (
                    <img src={state.avatarDataUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                  ) : (
                    state.avatarEmoji
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {EMOJI_PRESETS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-lg transition hover:bg-muted"
                      onClick={() => setState((s) => ({ ...s, avatarEmoji: em, avatarDataUrl: null }))}
                    >
                      {em}
                    </button>
                  ))}
                </div>
                <div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
                  <Button type="button" variant="outline" size="sm" className="h-9 text-[12px]" onClick={() => fileRef.current?.click()}>
                    Upload (mock)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="modelo" className="rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Modelo atual:</span>
            <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-semibold">
              {modelBadgeLabel(state.modelChoice)}
            </span>
          </div>
          <Label className="text-[11px]">Opções</Label>
          <RadioGroup
            value={state.modelChoice}
            onValueChange={(v) => setState((s) => ({ ...s, modelChoice: v as ModelChoice }))}
            className="mt-3 gap-3"
          >
            {(
              [
                ["auto", "Auto (recomendado)"],
                ["gpt55", "GPT-5.5 Pro (melhor qualidade)"],
                ["gpt4o", "GPT-4o (equilibrado)"],
                ["gpt35", "GPT-3.5 (econômico)"],
              ] as const
            ).map(([val, label]) => (
              <div key={val} className="flex items-center gap-2">
                <RadioGroupItem value={val} id={`m-${val}`} />
                <Label htmlFor={`m-${val}`} className="cursor-pointer text-[13px] font-normal">
                  {label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <div className="mt-6">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[11px]">Temperatura / criatividade</Label>
              <span className="text-[12px] font-medium tabular-nums text-muted-foreground">{state.temperature}</span>
            </div>
            <Slider
              className="mt-3"
              min={0}
              max={100}
              step={1}
              value={[state.temperature]}
              onValueChange={(v) => setState((s) => ({ ...s, temperature: v[0] ?? 0 }))}
            />
          </div>
          <div className="mt-6">
            <Label className="text-[11px]">Tamanho máximo de resposta</Label>
            <select
              value={state.responseLength}
              onChange={(e) => setState((s) => ({ ...s, responseLength: e.target.value as ResponseLen }))}
              className="mt-1 h-9 w-full max-w-md rounded-xl border border-border bg-background px-3 text-[13px] text-foreground"
            >
              <option value="short">Curto</option>
              <option value="medium">Médio</option>
              <option value="long">Longo</option>
              <option value="xl">Muito longo</option>
            </select>
          </div>
        </TabsContent>

        <TabsContent value="notif" className="rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <div className="space-y-4">
            {(
              [
                ["notifyCreditsLow", "Notificar quando créditos < 20%"],
                ["dailySummary", "Resumo diário de conversas"],
                ["importantAlerts", "Alertas de ações importantes"],
                ["emailNotif", "Notificações por email"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-background/40 px-3 py-3">
                <span className="text-[13px]">{label}</span>
                <Switch
                  checked={state[key]}
                  onCheckedChange={(c) => setState((s) => ({ ...s, [key]: c }))}
                />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="priv" className="rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-background/40 px-3 py-3">
              <span className="text-[13px]">Salvar histórico de conversas</span>
              <Switch checked={state.saveHistory} onCheckedChange={(c) => setState((s) => ({ ...s, saveHistory: c }))} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-background/40 px-3 py-3">
              <span className="text-[13px]">Usar dados para melhorar IA</span>
              <Switch checked={state.useDataImprove} onCheckedChange={(c) => setState((s) => ({ ...s, useDataImprove: c }))} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-9 gap-1.5 text-[12px]" onClick={exportJson}>
                <Download className="h-3.5 w-3.5" /> Exportar meus dados
              </Button>
              <Button type="button" variant="outline" className="h-9 gap-1.5 text-[12px] text-destructive" onClick={() => setConfirmClear(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Limpar histórico
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="creditos" className="rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Plano atual</p>
              <p className="text-lg font-semibold">{planLabel(state.plan)}</p>
            </div>
            <select
              value={state.plan}
              onChange={(e) => setState((s) => ({ ...s, plan: e.target.value as PlanTier }))}
              className="h-9 rounded-xl border border-border bg-background px-3 text-[13px]"
            >
              <option value="bronze">Bronze</option>
              <option value="prata">Prata</option>
              <option value="ouro">Ouro</option>
            </select>
          </div>
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">Uso de créditos</span>
            <span className="font-medium tabular-nums">
              {state.creditsUsed.toLocaleString("pt-BR")} / {state.creditsTotal.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <Button type="button" className="mb-6 h-10 gap-2" onClick={() => setBuyOpen(true)}>
            <CreditCard className="h-4 w-4" /> Comprar créditos
          </Button>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-3 py-2 font-semibold">Ação</th>
                  <th className="px-3 py-2 font-semibold">Créditos</th>
                  <th className="px-3 py-2 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody>
                {state.usageHistory.slice(0, 10).map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">{row.action}</td>
                    <td className="px-3 py-2 tabular-nums">{row.credits}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(row.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="perigo" className="rounded-2xl border border-destructive/30 bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="outline" className="h-10 border-destructive/40 text-destructive" onClick={() => setConfirmReset(true)}>
              Resetar configurações
            </Button>
            <Button type="button" variant="destructive" className="h-10" onClick={() => setConfirmDisable(true)}>
              Desativar IA Mestre
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pacotes de créditos</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {CREDIT_PACKS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3 text-left text-[13px] transition hover:bg-muted/50"
                onClick={() => {
                  setState((s) => {
                    const bump = p.id === "punl" ? 5000 : p.credits
                    const nextTotal = s.creditsTotal + bump
                    const row: UsageRow = {
                      id: crypto.randomUUID(),
                      action: `Compra: ${p.label || `${p.credits} créditos`} (mock)`,
                      credits: bump,
                      at: new Date().toISOString(),
                    }
                    const next: IaMestreConfigState = {
                      ...s,
                      creditsTotal: nextTotal,
                      usageHistory: [row, ...s.usageHistory].slice(0, 20),
                    }
                    persist(next)
                    return next
                  })
                  toast({ title: "Compra simulada", description: `${p.label || `${p.credits} créditos`} · ${p.price}` })
                  setBuyOpen(false)
                }}
              >
                <span className="font-medium">{p.label || `${p.credits} créditos`}</span>
                <span className="text-muted-foreground">{p.price}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setBuyOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar configurações?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as preferências voltam ao padrão neste dispositivo (mock local).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setState(DEFAULT_STATE)
                persist(DEFAULT_STATE)
                setConfirmReset(false)
                toast({ title: "Configurações restauradas" })
              }}
            >
              Resetar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar IA Mestre?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é apenas simulada no protótipo; nada é alterado no servidor.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDisable(false)
                toast({ title: "IA Mestre desativada (mock)", variant: "destructive" })
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar histórico?</AlertDialogTitle>
            <AlertDialogDescription>Remove o histórico de uso mock desta tela.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setState((s) => {
                  const next = { ...s, usageHistory: [] as UsageRow[] }
                  persist(next)
                  return next
                })
                setConfirmClear(false)
                toast({ title: "Histórico limpo" })
              }}
            >
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </IaMestreSubPageShell>
  )
}
