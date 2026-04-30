import { useState } from "react";
import { Sun, Wrench, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BomDiaModal, type StudioTemplate } from "@/components/bom-dia-modal";

const BANNERS: Array<{
  id: StudioTemplate;
  title: string;
  tagline: string;
  description: string;
  icon: typeof Sun;
  audience: string;
  accent: string;
}> = {
  // typed as record-friendly array below
} as never;

const ITEMS: Array<{
  id: StudioTemplate;
  title: string;
  tagline: string;
  description: string;
  icon: typeof Sun;
  audience: string;
}> = [
  {
    id: "bomDia",
    title: "Bom Dia Automático",
    tagline: "Abra o dia com energia",
    description:
      "3 takes guiados pra apresentar a peça do dia, com legenda e trilha prontas.",
    icon: Sun,
    audience: "Varejo · Loja",
  },
  {
    id: "servico",
    title: "Status de Serviço",
    tagline: "Mostre que tá rolando",
    description:
      "Diagnóstico, mãos à obra e entrega — confiança em vídeo curto.",
    icon: Wrench,
    audience: "Assistência · Geral",
  },
  {
    id: "antesDepois",
    title: "Showcase Antes e Depois",
    tagline: "A transformação vende",
    description:
      "O problema, a solução e o brilho final. Roteiro pronto pelo Diretor IA.",
    icon: Sparkles,
    audience: "Reforma · Transformação",
  },
];

export function QuickCreationTab() {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<StudioTemplate>("bomDia");

  const start = (id: StudioTemplate) => {
    setTemplate(id);
    setOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary mb-2">
            Estúdio de Mídia IA
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground tracking-tight">
            Criação Rápida
          </h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-2xl">
            Escolha um formato. A IA dirige, você só aperta gravar.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => start(item.id)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-border bg-card p-6 text-left",
                  "transition-all hover:border-primary hover:shadow-lg hover:-translate-y-0.5",
                )}
              >
                <div
                  className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-hidden
                />
                <div className="flex items-center justify-between mb-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.audience}
                  </span>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
                  {item.tagline}
                </p>
                <h3 className="font-display text-xl font-bold text-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  {item.description}
                </p>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  Começar agora
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <BomDiaModal open={open} onOpenChange={setOpen} template={template} />
    </div>
  );
}
