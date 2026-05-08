"use client";

import { useState } from "react";
import {
  Camera,
  Sparkles,
  Wand2,
  AlertTriangle,
  Check,
  X,
  Clock,
  TrendingDown,
  Zap,
  Smile,
  Briefcase,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const MOODS = [
  { key: "animado",       label: "Animado",       icon: Smile     },
  { key: "profissional",  label: "Profissional",  icon: Briefcase },
  { key: "motivacional",  label: "Motivacional",  icon: Flame     },
] as const;

export const QuickCreationTab = () => {
  const [mood, setMood] = useState<(typeof MOODS)[number]["key"]>("animado");

  return (
    <div className="space-y-5">
      {/* Bom Dia Automático */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero p-5 shadow-elegant animate-fade-in-up">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-primary opacity-15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-accent/20 blur-3xl pointer-events-none" />

        <div className="relative">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge className="bg-gradient-primary text-primary-foreground border-0 text-[10px]">
                  <Sparkles className="mr-1 h-2.5 w-2.5" /> Automação diária
                </Badge>
                <Badge variant="outline" className="border-success/40 text-success text-[10px]">
                  <Clock className="mr-1 h-2.5 w-2.5" /> 07:30
                </Badge>
              </div>
              <h2 className="text-2xl font-bold tracking-tight gradient-text">
                Bom Dia Automático
              </h2>
              <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">
                Gera vídeo de{" "}
                <span className="font-semibold text-foreground">15 segundos</span> para
                Stories com música, logo e CTA da sua marca.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/70 px-3 py-2 text-center backdrop-blur shrink-0">
              <p className="text-[10px] text-muted-foreground">Stories hoje</p>
              <p className="text-xl font-bold text-foreground">12</p>
            </div>
          </div>

          {/* Mood selector */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Humor do dia
            </p>
            <div className="flex flex-wrap gap-2">
              {MOODS.map(({ key, label, icon: Icon }) => {
                const active = mood === key;
                return (
                  <button
                    key={key}
                    onClick={() => setMood(key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                      active
                        ? "bg-gradient-primary text-primary-foreground border-transparent shadow-glow"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ações */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button
              size="lg"
              className="btn-glow h-auto justify-start gap-3 bg-gradient-primary py-3.5 text-sm text-primary-foreground hover:opacity-95 shadow-glow"
            >
              <Camera className="h-5 w-5 shrink-0" />
              <div className="text-left">
                <p className="font-semibold">Foto / Vídeo Real</p>
                <p className="text-[10px] opacity-75">Estou na loja agora</p>
              </div>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="btn-glow h-auto justify-start gap-3 border-border bg-card/70 py-3.5 text-sm hover:bg-card"
            >
              <Wand2 className="h-5 w-5 shrink-0 text-accent" />
              <div className="text-left">
                <p className="font-semibold">Gerar com IA</p>
                <p className="text-[10px] text-muted-foreground">Tô sem tempo · fundo IA</p>
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Alerta da IA Mestre */}
      <div className="glass-card rounded-2xl p-5 animate-fade-in-up [animation-delay:80ms]">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-muted p-2.5 text-primary animate-neon-pulse shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="text-lg font-semibold text-primary">Alerta da IA Mestre</h3>
              <Badge variant="outline" className="border-accent/40 text-accent text-[10px]">
                <Zap className="mr-1 h-2.5 w-2.5" /> Preditivo
              </Badge>
            </div>
            <p className="text-sm text-foreground mb-0.5">
              Identificamos{" "}
              <span className="font-semibold text-destructive">30 jaquetas paradas</span>{" "}
              há mais de 45 dias.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Gerar campanha de{" "}
              <span className="font-medium text-foreground">queima de estoque</span> agora?
            </p>

            {/* Stats */}
            <div className="grid gap-2 grid-cols-3 mb-4">
              {[
                { label: "Margem sugerida", value: "-25%" },
                { label: "Alcance estimado", value: "8.4k" },
                { label: "ROI projetado", value: "3.2×" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-border bg-card/50 p-2.5 text-center"
                >
                  <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="btn-glow gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 text-xs">
                <Check className="h-3.5 w-3.5" /> Criar Campanha
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <X className="h-3.5 w-3.5" /> Ignorar
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" /> Ver análise
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Créditos de IA */}
      <div className="glass-card rounded-2xl p-4 animate-fade-in-up [animation-delay:160ms]">
        <div className="flex items-center gap-3 mb-3">
          <div className="rounded-lg bg-gradient-primary p-2 text-primary-foreground shadow-glow shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary leading-tight">Créditos de IA</p>
            <p className="text-[11px] text-muted-foreground">
              Renovam em 5 dias · plano OmniGestão Pro
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-bold text-foreground">
              85<span className="text-sm font-normal text-muted-foreground">/100</span>
            </p>
          </div>
        </div>
        <Progress value={85} className="h-2" />
        <p className="mt-1.5 text-[10px] text-muted-foreground text-right">15 créditos restantes</p>
      </div>
    </div>
  );
};
