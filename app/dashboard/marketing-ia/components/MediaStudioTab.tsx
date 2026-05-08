"use client";

import {
  Box,
  UserCircle2,
  Image as ImageIcon,
  MessageSquareReply,
  Mic,
  Upload,
  ArrowRight,
  Sparkles,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Tool = {
  icon: typeof Box;
  title: string;
  description: string;
  tag?: string;
  tagVariant?: "default" | "premium" | "new";
  accent?: boolean;
  featured?: boolean;
  extra?: "audio-upload";
  locked?: boolean;
};

const TOOLS: Tool[] = [
  {
    icon: Box,
    title: "Fábrica de Mascotes 3D",
    description:
      "Crie um mascote único da sua marca em segundos. Renderização 3D pronta para campanhas digitais.",
    tag: "Mais usado",
    tagVariant: "default",
    featured: true,
    accent: true,
  },
  {
    icon: ImageIcon,
    title: "Gerador de Imagens Pro",
    description: "Composição cinematográfica automática para produtos e promoções.",
    tag: "IA",
    tagVariant: "new",
  },
  {
    icon: UserCircle2,
    title: "Avatar Falante",
    description: "Sincronia labial perfeita. Faça upload do áudio e seu avatar fala pela sua marca.",
    tag: "Novo",
    tagVariant: "new",
    extra: "audio-upload",
  },
  {
    icon: MessageSquareReply,
    title: "Google Meu Negócio",
    description: "Respostas inteligentes a avaliações no tom da sua marca, em segundos.",
  },
  {
    icon: Mic,
    title: "Clonagem de Voz & Locução",
    description: "Clone sua voz e gere locuções profissionais em qualquer idioma.",
    tag: "Premium",
    tagVariant: "premium",
    accent: true,
    locked: true,
  },
];

function TagBadge({ tag, variant }: { tag: string; variant?: Tool["tagVariant"] }) {
  if (variant === "premium")
    return (
      <Badge className="border-0 bg-amber-500/15 text-amber-600 dark:text-amber-400 gap-1 text-[10px]">
        <Lock className="h-2.5 w-2.5" /> {tag}
      </Badge>
    );
  if (variant === "new")
    return (
      <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
        {tag}
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-accent/40 text-accent text-[10px]">
      {tag}
    </Badge>
  );
}

export const MediaStudioTab = () => {
  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Estúdio de Mídia</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Arsenal criativo com IA — escolha uma ferramenta para começar.
          </p>
        </div>
        <Badge variant="outline" className="hidden gap-1 sm:flex shrink-0">
          <Sparkles className="h-3 w-3" /> 5 ferramentas
        </Badge>
      </div>

      {/* Ferramenta destaque (featured) */}
      {TOOLS.filter((t) => t.featured).map(({ icon: Icon, title, description, tag, tagVariant, accent }) => (
        <div
          key={title}
          className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-hero p-6 shadow-elegant transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          {accent && (
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-primary opacity-20 blur-3xl pointer-events-none" />
          )}
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className={`shrink-0 rounded-2xl p-4 w-fit ${accent ? "bg-gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-foreground"}`}>
              <Icon className="h-9 w-9" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="text-xl font-bold text-foreground">{title}</h3>
                {tag && <TagBadge tag={tag} variant={tagVariant} />}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
            <Button
              className="shrink-0 gap-2 bg-gradient-primary text-primary-foreground hover:opacity-95 shadow-glow"
            >
              Abrir <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      {/* Demais ferramentas em grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.filter((t) => !t.featured).map(({ icon: Icon, title, description, tag, tagVariant, accent, extra, locked }, i) => (
          <div
            key={title}
            style={{ animationDelay: `${(i + 1) * 60}ms` }}
            className={`group relative flex flex-col gap-4 overflow-hidden rounded-xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-sm animate-scale-in
              ${accent ? "border-primary/20 bg-gradient-hero" : "border-border bg-card/60"}
              ${locked ? "opacity-90" : ""}
            `}
          >
            {accent && (
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-primary opacity-20 blur-2xl pointer-events-none" />
            )}
            {/* Header */}
            <div className="relative flex items-start justify-between">
              <div className={`rounded-xl p-2.5 ${accent ? "bg-gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-foreground"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-1.5">
                {tag && <TagBadge tag={tag} variant={tagVariant} />}
              </div>
            </div>

            {/* Conteúdo */}
            <div className="relative flex-1">
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {description}
              </p>
            </div>

            {/* Upload de áudio (Avatar) */}
            {extra === "audio-upload" && (
              <label className="relative flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                <Upload className="h-3.5 w-3.5 shrink-0" />
                <span>Enviar áudio (.mp3)</span>
                <input type="file" accept="audio/*" className="hidden" />
              </label>
            )}

            {/* Ação */}
            <Button
              size="sm"
              variant={accent ? "default" : "outline"}
              disabled={locked}
              className={`gap-2 w-full ${accent ? "bg-gradient-primary text-primary-foreground hover:opacity-95" : ""}`}
            >
              {locked ? (
                <><Lock className="h-3.5 w-3.5" /> Plano Premium</>
              ) : (
                <>Abrir ferramenta <ArrowRight className="h-3.5 w-3.5" /></>
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
