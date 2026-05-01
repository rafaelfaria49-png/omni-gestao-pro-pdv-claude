"use client"

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Cpu, Sparkles } from "lucide-react";

export type ModelId =
  | "openai/gpt-5.5-pro"
  | "openai/gpt-5.5-thinking"
  | "openai/gpt-5"
  | "openai/gpt-4o"
  | "anthropic/claude-opus-4.7"
  | "anthropic/claude-3.5-sonnet"
  | "google/gemini-3.1-pro"
  | "google/gemini-1.5-flash"
  | "meta-llama/llama-3-70b-instruct"
  | "mistralai/mixtral-8x22b-instruct";

const MODELS: {
  id: ModelId;
  name: string;
  provider: string;
  tag: string;
  description: string;
  auto?: boolean;
}[] = [
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    tag: "Criatividade",
    description: "Especialista em Criatividade e Copywriting Humano.",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-o1 Pro",
    provider: "OpenAI",
    tag: "Estratégia",
    description: "Especialista em Lógica, Estratégia e ROI.",
  },
  {
    id: "google/gemini-1.5-flash",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    tag: "Flash",
    description: "Ultra-velocidade para tarefas rápidas e automações.",
  },
];

export function ModelSelect({ value, onChange }: { value: ModelId; onChange: (v: ModelId) => void; }) {
  const current = MODELS.find((m) => m.id === value);
  if (!current) {
    return <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />;
  }
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as ModelId)}>
      <Select.Trigger className="group flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-sm font-medium backdrop-blur-md transition hover:border-primary/40 hover:shadow-elegant">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground">
          {current?.auto ? <Sparkles className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
        </span>
        <Select.Value>
          <span className="flex items-center gap-2"><span>{current?.name || "Selecionando..."}</span><span className="hidden text-xs text-muted-foreground sm:inline">· {current?.provider || ""}</span></span>
        </Select.Value>
        <Select.Icon><ChevronDown className="h-4 w-4 text-muted-foreground transition group-data-[state=open]:rotate-180" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={8} className="z-50 min-w-[280px] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-elegant data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <Select.Viewport>
            {MODELS.map((m) => (
              <Select.Item key={m.id} value={m.id} className="relative flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-muted data-[state=checked]:bg-muted/60">
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${m.auto ? "bg-gradient-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    {m.auto ? <Sparkles className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
                  </span>
                  <div className="flex flex-col">
                    <Select.ItemText><span className="font-medium">{m.name}</span></Select.ItemText>
                    <span className="text-xs text-muted-foreground">{m.description}</span>
                  </div>
                </div>
                <Select.ItemIndicator><Check className="h-4 w-4 text-primary" /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

