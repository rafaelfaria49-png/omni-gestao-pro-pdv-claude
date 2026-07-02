"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ShieldAlert, Sparkles, Wand2 } from "lucide-react"
import { AiAnalyzingPulse } from "./agentic-ui"
import { PreviewBadge, PreviewFootnote, previewToast } from "./whatsapp-preview-ui"

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
          Configurações reais da loja. No painel da conversa e nas sugestões de resposta, o servidor usa
          LLM (OpenRouter/OpenAI/Gemini) quando há chave de API configurada. Se a IA estiver indisponível,
          o sistema aplica fallback local honesto — sem fingir análise por LLM.
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

      <AiGuardrailsPreviewCard />

      <div className="glass-card rounded-xl p-5">
        <h3 className="mb-3 text-sm font-semibold">Recursos visuais no inbox</h3>
        <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {[
            "Resumo IA — LLM no painel quando API configurada",
            "Sugestão de resposta — LLM real ou fallback local (rótulo explícito)",
            "Sinais no inbox — heurística sobre dados reais (não é LLM)",
            "Cliente prioritário — não lidas + etiquetas",
            "Possível venda / Lead quente — palavras-chave",
            "Risco de cancelamento — tom da mensagem",
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

const FORBIDDEN_TOPICS = [
  { label: "Reembolso e estorno", detail: "A IA encaminha ao humano, nunca decide." },
  { label: "Assuntos jurídicos", detail: "Processos, Procon e ações legais." },
  { label: "Dados sensíveis", detail: "Documentos, senhas e dados de cartão." },
  { label: "Negociação de desconto", detail: "Descontos acima da tabela aprovada." },
]

/**
 * Guardrails adicionais (limite de confiança, assuntos bloqueados) exibidos como prévia —
 * não existe hoje persistência para esses campos; a IA já nunca executa ações sensíveis
 * sozinha (handoff automático), mas os controles finos abaixo ainda não gravam no servidor.
 */
function AiGuardrailsPreviewCard() {
  return (
    <div className="glass-card space-y-4 rounded-xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="h-4 w-4 text-red-500" />
          Guardrails adicionais
        </h3>
        <PreviewBadge />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Limite de confiança da IA</p>
          <p className="text-[11px] text-muted-foreground">
            Conversas abaixo do limite são encaminhadas para Handoff.
          </p>
        </div>
        <span className="text-lg font-bold text-primary">70%</span>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-foreground/80">
          Assuntos que a IA nunca trata sozinha
        </p>
        <div className="space-y-1.5">
          {FORBIDDEN_TOPICS.map((t) => (
            <div key={t.label} className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
              <span className="mt-0.5 text-red-500">🔴</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{t.label}</p>
                <p className="text-[11px] text-muted-foreground">{t.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => previewToast("salvar guardrails")}>
        Salvar regras
      </Button>
      <PreviewFootnote>
        A IA sempre consulta o ERP em modo somente leitura e nunca executa ações sensíveis sem
        aprovação humana. Ajustar o limite de confiança e a lista de assuntos bloqueados aqui é uma
        prévia — o comportamento real de handoff já é aplicado no sistema.
      </PreviewFootnote>
    </div>
  )
}
