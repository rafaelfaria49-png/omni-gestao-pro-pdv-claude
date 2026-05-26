"use client"

import * as Select from "@radix-ui/react-select"
import { Check, ChevronDown, Cpu, Sparkles } from "lucide-react"
import { AI_MODELS_MOSAIC } from "@/lib/ai-models-list"

/** IDs aceitos pelo backend (`pickMestreModel` / OpenRouter). */
export const IA_MESTRE_UI_MODEL_IDS = [
  "openrouter/auto",
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-1.5-flash",
] as const

export type ModelId = (typeof IA_MESTRE_UI_MODEL_IDS)[number]

export const DEFAULT_IA_MESTRE_MODEL: ModelId = "openrouter/auto"

function labelForModelId(id: ModelId): string {
  const entry = AI_MODELS_MOSAIC.find((m) => m.id === id)
  return entry?.label ?? id
}

const MODELS: {
  id: ModelId
  name: string
  provider: string
  description: string
  auto?: boolean
}[] = [
  {
    id: "openrouter/auto",
    name: "Auto (recomendado)",
    provider: "OpenRouter",
    description: "O backend escolhe o melhor modelo disponível no seu plano.",
    auto: true,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    description: "Copy e respostas elaboradas (plano Ouro).",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "Raciocínio e estratégia (plano Ouro).",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "OpenAI",
    description: "Respostas rápidas e econômicas.",
  },
  {
    id: "google/gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "Google",
    description: "Velocidade para tarefas curtas.",
  },
]

export function ModelSelect({ value, onChange }: { value: ModelId; onChange: (v: ModelId) => void }) {
  const safeValue = IA_MESTRE_UI_MODEL_IDS.includes(value) ? value : DEFAULT_IA_MESTRE_MODEL
  const current = MODELS.find((m) => m.id === safeValue) ?? MODELS[0]

  return (
    <Select.Root value={safeValue} onValueChange={(v) => onChange(v as ModelId)}>
      <Select.Trigger className="group flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-[13px] font-medium backdrop-blur-md transition hover:border-primary/40 hover:shadow-elegant">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground">
          {current.auto ? <Sparkles className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
        </span>
        <Select.Value>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{current.name}</span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">· {current.provider}</span>
          </span>
        </Select.Value>
        <Select.Icon>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition group-data-[state=open]:rotate-180" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={8}
          className="z-50 min-w-[280px] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-elegant data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Select.Viewport>
            {MODELS.map((m) => (
              <Select.Item
                key={m.id}
                value={m.id}
                className="relative flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[13px] outline-none data-[highlighted]:bg-muted data-[state=checked]:bg-muted/60"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${m.auto ? "bg-gradient-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                  >
                    {m.auto ? <Sparkles className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex flex-col">
                    <Select.ItemText>
                      <span className="font-medium">{m.name}</span>
                    </Select.ItemText>
                    <span className="text-[11px] text-muted-foreground">{m.description}</span>
                    <span className="truncate text-[10px] text-muted-foreground/80" title={labelForModelId(m.id)}>
                      {m.id}
                    </span>
                  </div>
                </div>
                <Select.ItemIndicator>
                  <Check className="h-4 w-4 text-primary" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
