"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Sparkles, Wand2 } from "lucide-react"
import { AiAnalyzingPulse } from "./agentic-ui"

type AiSettings = {
  tone: string
  systemPrompt: string
  suggestionsEnabled: boolean
  maxContextMessages: number
}

export function WhatsAppIaPanel({
  apiHeaders,
}: {
  apiHeaders: Record<string, string> | null
}) {
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!apiHeaders) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/whatsapp/ai-settings", { headers: apiHeaders })
      const data = (await res.json()) as { ok?: boolean; aiSettings?: AiSettings }
      if (data.ok && data.aiSettings) setSettings(data.aiSettings)
    } catch {
      /* keep null */
    } finally {
      setLoading(false)
    }
  }, [apiHeaders])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!apiHeaders || !settings) return
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch("/api/whatsapp/ai-settings", {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify(settings),
      })
      const data = (await res.json()) as { ok?: boolean }
      if (data.ok) setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!apiHeaders) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Selecione uma loja ativa.</p>
    )
  }

  if (loading) {
    return (
      <div className="p-6">
        <AiAnalyzingPulse />
      </div>
    )
  }

  if (!settings) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Não foi possível carregar configurações de IA.
      </p>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Sparkles className="h-5 w-5 text-violet-500" />
          Painel IA operacional
        </h2>
        <p className="text-sm text-muted-foreground">
          Configurações reais da loja — sugestões no inbox usam heurísticas locais até integração completa.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card space-y-4 rounded-xl p-5">
          <h3 className="text-sm font-semibold">Comportamento</h3>
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Sugerir respostas</p>
              <p className="text-[11px] text-muted-foreground">
                Exibe sugestões no painel da conversa
              </p>
            </div>
            <Switch
              checked={settings.suggestionsEnabled}
              onCheckedChange={(v) =>
                setSettings((s) => (s ? { ...s, suggestionsEnabled: v } : s))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Tom de voz</Label>
            <Input
              className="mt-1 h-9"
              value={settings.tone}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, tone: e.target.value } : s))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Máx. mensagens de contexto</Label>
            <Input
              type="number"
              min={4}
              max={40}
              className="mt-1 h-9"
              value={settings.maxContextMessages}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? {
                        ...s,
                        maxContextMessages: Math.min(
                          40,
                          Math.max(4, Number(e.target.value) || 12)
                        ),
                      }
                    : s
                )
              }
            />
          </div>
        </div>

        <div className="glass-card space-y-3 rounded-xl p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Wand2 className="h-4 w-4 text-primary" />
            Prompt do sistema
          </h3>
          <Textarea
            rows={8}
            value={settings.systemPrompt}
            onChange={(e) =>
              setSettings((s) => (s ? { ...s, systemPrompt: e.target.value } : s))
            }
            className="text-sm"
          />
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {saving ? "Salvando…" : saved ? "Salvo ✓" : "Salvar treinamento"}
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-xl p-5">
        <h3 className="mb-3 text-sm font-semibold">Recursos visuais no inbox</h3>
        <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {[
            "IA analisando — ao abrir conversa",
            "Sugestão IA — baseada na intenção detectada",
            "Cliente prioritário — não lidas + etiquetas",
            "Possível venda / Lead quente — palavras-chave",
            "Risco de cancelamento — tom da mensagem",
            "OS atrasada — menções no preview",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
