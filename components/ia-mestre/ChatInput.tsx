"use client"

import { ImagePlus, Mic, Paperclip, Send, Sparkles } from "lucide-react";
import { type FormEvent } from "react";

const SUGGESTIONS = ["Gerar campanha de Black Friday", "Relatório de vendas da semana", "Criar logo para a loja"];

export function ChatInput({
  onSend,
  disabled,
  value,
  onValueChange,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    onValueChange("");
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onValueChange(s)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md transition hover:border-primary/40 hover:text-foreground" type="button">
            <Sparkles className="h-3 w-3" /> {s}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-border bg-surface/80 p-3 pl-4 shadow-elegant backdrop-blur-md focus-within:border-primary/50 focus-within:shadow-glow">
        <button type="button" className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"><Paperclip className="h-5 w-5" /></button>
        <button type="button" className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-primary"><ImagePlus className="h-5 w-5" /></button>
        <input value={value} onChange={(e) => onValueChange(e.target.value)} type="text" placeholder="Peça um relatório, uma imagem ou uma campanha…" className="flex-1 bg-transparent px-1 py-3 text-lg outline-none placeholder:text-muted-foreground" />
        <button type="button" className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"><Mic className="h-5 w-5" /></button>
        <button type="submit" disabled={!value.trim() || disabled} className="flex h-12 items-center gap-1.5 rounded-xl bg-gradient-primary px-5 text-base font-semibold text-primary-foreground shadow-elegant transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          <Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span>
        </button>
      </form>
    </div>
  );
}

