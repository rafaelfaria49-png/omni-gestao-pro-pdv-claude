"use client";

import { useState } from "react";
import { AIBadge } from "../AIBadge";
import { Upload, Sparkles, Trash2, Download, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

const scenes = ["Estúdio Profissional", "Minimalista", "Natureza", "Urbano", "Luxo"];

export function EstudioTab() {
  const { toast } = useToast();
  const showPendingToast = () =>
    toast({ title: "Integração pendente", description: PENDING_TOAST_DESCRIPTION });

  const [scene, setScene] = useState("Estúdio Profissional");
  const [loading, setLoading] = useState(false);

  const generate = () => {
    showPendingToast();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2 space-y-5">
        {/* Upload */}
        <div className="surface-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-display text-lg font-semibold">Estúdio de Fotos</h3>
            <AIBadge />
          </div>
          <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-10 text-center hover:border-primary/50 transition-colors cursor-pointer">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Upload className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold">Arraste sua foto aqui</p>
            <p className="mt-1 text-xs text-muted-foreground">PNG ou JPG — até 10MB</p>
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold hover:border-primary/40 hover:text-primary transition-colors cursor-not-allowed opacity-80"
            >
              Selecionar arquivo
            </button>
          </div>
        </div>

        {/* Cenários */}
        <div className="surface-card p-6">
          <h3 className="font-display text-base font-semibold">Cenário IA</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {scenes.map((s) => (
              <button key={s} onClick={() => setScene(s)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
                  scene === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
                )}>
                {s}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={generate}
              disabled={loading}
              title="Integração pendente"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-70 cursor-not-allowed"
            >
              <Sparkles className={cn("h-4 w-4", loading && "animate-pulse-soft")} />
              {loading ? "Gerando imagem com IA..." : "Gerar Foto Publicitária com IA"}
            </button>
            <span className="text-xs text-muted-foreground">Custo: <span className="font-semibold text-foreground">12 créditos</span></span>
          </div>
        </div>

        {/* Antes & Depois */}
        <div className="surface-card p-6">
          <h3 className="font-display text-base font-semibold">Antes & Depois</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">Antes</p>
              <div className="aspect-square rounded-xl border border-border bg-muted grid place-items-center text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">Depois</p>
              <div className={cn("relative aspect-square rounded-xl border border-primary/40 grid place-items-center overflow-hidden",
                "bg-gradient-to-br from-primary/20 via-primary/5 to-transparent")}>
                {loading ? (
                  <div className="text-xs text-muted-foreground animate-pulse-soft">Renderizando...</div>
                ) : (
                  <span className="text-xs font-semibold text-primary">{scene}</span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-destructive/40 hover:text-destructive transition-colors cursor-not-allowed opacity-80"
            >
              <Trash2 className="h-3.5 w-3.5" /> Limpar
            </button>
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:opacity-90 transition-opacity cursor-not-allowed opacity-80"
            >
              <Download className="h-3.5 w-3.5" /> Baixar
            </button>
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="surface-card p-6 h-fit">
        <h3 className="font-display text-base font-semibold">Histórico de gerações</h3>
        <p className="text-xs text-muted-foreground">Últimas 6 imagens</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl border border-border bg-gradient-to-br from-primary/15 via-muted to-primary/5 grid place-items-center text-[10px] text-muted-foreground">
              #{1234 + i}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
