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
  { key: "animado", label: "Animado", icon: Smile },
  { key: "profissional", label: "Profissional", icon: Briefcase },
  { key: "motivacional", label: "Motivacional", icon: Flame },
] as const;

export const QuickCreationTab = () => {
  const [mood, setMood] = useState<(typeof MOODS)[number]["key"]>("animado");

  return (
    <div className="space-y-6">
      {/* Bom Dia Automático — hero banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero p-6 shadow-elegant animate-fade-in-up">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-accent/30 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge className="bg-gradient-primary text-primary-foreground border-0">
                  <Sparkles className="mr-1 h-3 w-3" /> Automação diária
                </Badge>
                <Badge variant="outline" className="border-success/40 text-success">
                  <Clock className="mr-1 h-3 w-3" /> 07:30
                </Badge>
              </div>
              <h2 className="text-3xl font-bold tracking-tight gradient-text">
                Bom Dia Automático
              </h2>
              <p className="mt-2 max-w-xl text-base text-muted-foreground">
                Gera vídeo de{" "}
                <span className="font-semibold text-foreground">15 segundos</span> para
                Stories com música, logo e CTA da sua marca.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/60 px-3 py-2 text-center backdrop-blur">
              <p className="text-xs text-muted-foreground">Stories hoje</p>
              <p className="text-2xl font-bold text-foreground">12</p>
            </div>
          </div>

          {/* Mood selector */}
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-muted-foreground">
              Humor do dia
            </p>
            <div className="inline-flex flex-wrap gap-2 rounded-full border border-border bg-card/60 p-1.5 backdrop-blur">
              {MOODS.map(({ key, label, icon: Icon }) => {
                const active = mood === key;
                return (
                  <button
                    key={key}
                    onClick={() => setMood(key)}
                    className={cn(
                      "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
                      active
                        ? "bg-gradient-primary text-primary-foreground shadow-glow"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              className="btn-glow h-auto justify-start gap-3 bg-gradient-primary py-4 text-base text-primary-foreground hover:opacity-95 shadow-glow"
            >
              <Camera className="h-5 w-5" />
              <div className="text-left">
                <p className="font-semibold">Foto / Vídeo Real</p>
                <p className="text-xs opacity-80">Estou na loja agora</p>
              </div>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="btn-glow h-auto justify-start gap-3 border-border bg-card/70 py-4 text-base hover:bg-card"
            >
              <Wand2 className="h-5 w-5 text-accent" />
              <div className="text-left">
                <p className="font-semibold">Gerar com IA</p>
                <p className="text-xs text-muted-foreground">Tô sem tempo · fundo IA</p>
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Predictive automation — Alerta da IA Mestre */}
      <div className="glass-card rounded-2xl p-6 animate-fade-in-up [animation-delay:80ms]">
        <div className="flex items-start gap-4">
          <div className="relative">
            <div className="rounded-xl bg-destructive/10 p-3 text-destructive animate-neon-pulse">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-2xl font-semibold text-foreground">Alerta da IA Mestre</h3>
              <Badge variant="outline" className="border-accent/40 text-accent">
                <Zap className="mr-1 h-3 w-3" /> Preditivo
              </Badge>
            </div>
            <p className="mt-2 text-base text-foreground">
              Identificamos{" "}
              <span className="font-semibold text-destructive">
                30 jaquetas paradas
              </span>{" "}
              há mais de 45 dias.
            </p>
            <p className="text-base text-muted-foreground">
              Gerar campanha de{" "}
              <span className="font-medium text-foreground">queima de estoque</span>{" "}
              agora?
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Margem sugerida", value: "-25%" },
                { label: "Alcance estimado", value: "8.4k" },
                { label: "ROI projetado", value: "3.2x" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-border bg-card/50 p-3"
                >
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold text-foreground">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button className="btn-glow gap-2 bg-gradient-primary text-primary-foreground hover:opacity-95">
                <Check className="h-4 w-4" /> Criar Campanha Agora
              </Button>
              <Button variant="outline" className="gap-2">
                <X className="h-4 w-4" /> Ignorar
              </Button>
              <Button variant="ghost" className="gap-2 text-muted-foreground">
                <TrendingDown className="h-4 w-4" /> Ver análise
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Credits bar */}
      <div className="glass-card rounded-2xl p-5 animate-fade-in-up [animation-delay:160ms]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gradient-primary p-2 text-primary-foreground shadow-glow">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">Créditos de IA</p>
              <p className="text-xs text-muted-foreground">
                Renovam em 5 dias · plano OmniGestão Pro
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-foreground">
              85<span className="text-muted-foreground">/100</span>
            </p>
          </div>
        </div>
        <Progress value={85} className="mt-4 h-2.5" />
      </div>
    </div>
  );
};
