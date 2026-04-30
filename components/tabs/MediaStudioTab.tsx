import {
  Box,
  UserCircle2,
  Image as ImageIcon,
  MessageSquareReply,
  Mic,
  Upload,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Tool = {
  icon: typeof Box;
  title: string;
  description: string;
  tag?: string;
  span?: string;
  accent?: boolean;
  extra?: "audio-upload";
};

const TOOLS: Tool[] = [
  {
    icon: Box,
    title: "Fábrica de Mascotes 3D",
    description:
      "Crie um mascote único da sua marca em segundos. Renderização 3D pronta para campanhas.",
    tag: "Mais usado",
    span: "md:col-span-2 md:row-span-2",
    accent: true,
  },
  {
    icon: UserCircle2,
    title: "Avatar Falante",
    description: "Sincronia labial perfeita. Faça upload do áudio e seu avatar fala.",
    tag: "Novo",
    span: "md:col-span-2",
    extra: "audio-upload",
  },
  {
    icon: ImageIcon,
    title: "Gerador de Imagens Pro",
    description: "Composição cinematográfica automática para produtos.",
    span: "md:col-span-2",
  },
  {
    icon: MessageSquareReply,
    title: "Google Meu Negócio",
    description: "Respostas inteligentes a avaliações, no tom da sua marca.",
    span: "md:col-span-2",
  },
  {
    icon: Mic,
    title: "Clonagem de Voz & Locução",
    description: "Clone sua voz e gere locuções profissionais em qualquer idioma.",
    tag: "Premium",
    span: "md:col-span-2",
    accent: true,
  },
];

export const MediaStudioTab = () => {
  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Estúdio de Mídia</h2>
          <p className="mt-1 text-base text-muted-foreground">
            Seu arsenal criativo — escolha uma ferramenta para começar.
          </p>
        </div>
        <Badge variant="outline" className="hidden gap-1 sm:flex">
          <Sparkles className="h-3 w-3" /> 5 ferramentas ativas
        </Badge>
      </div>

      <div className="grid auto-rows-[210px] grid-cols-1 gap-4 md:grid-cols-4">
        {TOOLS.map(({ icon: Icon, title, description, tag, span, accent, extra }, i) => (
          <div
            key={title}
            style={{ animationDelay: `${i * 70}ms` }}
            className={`group glass-card relative flex flex-col justify-between overflow-hidden rounded-xl p-5 text-left transition-all hover:-translate-y-1 animate-scale-in ${
              span ?? ""
            }`}
          >
            {accent && (
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-primary opacity-25 blur-3xl transition-opacity group-hover:opacity-50" />
            )}
            <div className="relative flex items-start justify-between">
              <div
                className={`rounded-xl p-3 ${
                  accent
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : "bg-muted text-foreground"
                }`}
              >
                <Icon className="h-7 w-7" />
              </div>
              {tag && (
                <Badge variant="outline" className="border-accent/40 text-accent">
                  {tag}
                </Badge>
              )}
            </div>

            <div className="relative">
              <h3 className="text-xl font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-base text-muted-foreground line-clamp-2">
                {description}
              </p>

              {extra === "audio-upload" && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label className="flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card/60 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground">
                    <Upload className="h-4 w-4" />
                    Enviar áudio (.mp3)
                    <input type="file" accept="audio/*" className="hidden" />
                  </label>
                  <Button size="sm" variant="outline" className="btn-glow gap-2">
                    <Mic className="h-4 w-4" />
                    Gravar Áudio Agora
                  </Button>
                </div>
              )}

              <div className="mt-3">
                <Button
                  size="sm"
                  variant={accent ? "default" : "outline"}
                  className={
                    accent
                      ? "btn-glow gap-2 bg-gradient-primary text-primary-foreground hover:opacity-95"
                      : "btn-glow gap-2"
                  }
                >
                  Abrir Ferramenta <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
