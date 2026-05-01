"use client";

import { useState } from "react";
import { Sun, Wrench, Sparkles, ArrowRight, Wand2, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudioPreview, type PreviewSurface } from "../studio-preview-context";
import { BomDiaModal } from "./bom-dia-modal";
import type { StudioTemplate } from "./studio-templates";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";

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

/** Evita palavras que acionam `detectIntent` → imagem na rota orchestrate. */
function orchestratePromptForLegenda(userBrief: string): string {
  const safe = userBrief
    .replace(/\bposts?\b/gi, "publicações")
    .replace(/\bpostagens?\b/gi, "publicações")
    .replace(/\banúncio\b/gi, "oferta")
    .replace(/\banuncio\b/gi, "oferta")
    .replace(/\bimagem\b/gi, "mensagem visual em palavras")
    .replace(/\barte\b/gi, "mensagem")
    .replace(/\bbanner\b/gi, "texto de destaque")
    .replace(/\blogo\b/gi, "nome da marca")
    .replace(/\blogotipo\b/gi, "nome da marca")
    .replace(/\bfoto\b/gi, "descrição")
    .replace(/\bflyer\b/gi, "texto promocional")
    .replace(/\bmarca\b/gi, "negócio")
    .trim();
  return [
    "Escreva somente UMA legenda em português do Brasil para redes sociais.",
    "Máximo 320 caracteres. Tom comercial, claro e direto.",
    "Briefing do usuário:",
    safe || "(use um convite genérico para visitar a loja).",
  ].join("\n");
}

function orchestratePromptForImage(userBrief: string): string {
  const t = userBrief.trim();
  return t
    ? `Crie uma imagem promocional profissional para campanha em redes sociais. ${t}`
    : "Crie uma imagem promocional moderna para loja varejista brasileira, estilo limpo e comercial.";
}

const SURFACES: Array<{ id: PreviewSurface; label: string }> = [
  { id: "instagram", label: "Instagram" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "ad", label: "Anúncio" },
];

export function QuickCreationTab() {
  const [open, setOpen] = useState(false);
  const { preview, setPreview, resetForTemplate } = useStudioPreview();
  const { toast } = useToast();
  const { lojaAtivaId } = useLojaAtiva();
  const [loadingText, setLoadingText] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);

  const start = (id: StudioTemplate) => {
    resetForTemplate(id);
    setOpen(true);
  };

  const callOrchestrate = async (command: string) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (lojaAtivaId) headers[ASSISTEC_LOJA_HEADER] = lojaAtivaId;
    const res = await fetch("/api/ai/orchestrate", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ command, brandVoice: true }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      type?: string;
      data?: { message?: string; imageUrl?: string };
      message?: string;
      error?: string;
      tool?: { type?: string; url?: string };
    };
    if (!res.ok) {
      throw new Error(String(data.error || data.message || `Erro ${res.status}`));
    }
    return data;
  };

  const handleGerarTexto = async () => {
    const seed = preview.caption.trim();
    if (!seed) {
      toast({
        title: "Legenda vazia",
        description: "Digite um briefing ou rascunho na legenda antes de gerar.",
        variant: "destructive",
      });
      return;
    }
    setLoadingText(true);
    try {
      const command = orchestratePromptForLegenda(seed);
      const data = await callOrchestrate(command);
      const isImage = data.type === "image" || data.tool?.type === "image";
      if (isImage) {
        toast({
          title: "Resposta inesperada",
          description: "A IA retornou imagem. Tente ajustar o texto do briefing.",
          variant: "destructive",
        });
        return;
      }
      const text = String(data?.data?.message || data.message || "").trim();
      if (!text) throw new Error("Resposta vazia da IA.");
      setPreview((p) => ({ ...p, caption: text }));
      toast({ title: "Legenda gerada", description: "Preview atualizado." });
    } catch (e) {
      toast({
        title: "Falha ao gerar texto",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setLoadingText(false);
    }
  };

  const handleGerarImagem = async () => {
    const seed = preview.caption.trim() || "destaque da campanha da loja";
    setLoadingImage(true);
    try {
      const data = await callOrchestrate(orchestratePromptForImage(seed));
      const isImage = data.type === "image" || data.tool?.type === "image";
      const imageUrl = String(data?.data?.imageUrl || data?.tool?.url || "").trim();
      if (!isImage || !imageUrl) {
        throw new Error("A IA não retornou uma imagem. Tente de novo com outro briefing.");
      }
      setPreview((p) => {
        const prev0 = p.takeMedia[0];
        if (prev0?.startsWith("blob:")) URL.revokeObjectURL(prev0);
        return {
          ...p,
          activeTake: 0,
          takeMedia: [imageUrl, p.takeMedia[1], p.takeMedia[2]],
        };
      });
      toast({ title: "Imagem gerada", description: "Preview atualizado com a arte." });
    } catch (e) {
      toast({
        title: "Falha ao gerar imagem",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setLoadingImage(false);
    }
  };

  const onImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setPreview((p) => {
      const prev0 = p.takeMedia[0];
      if (prev0?.startsWith("blob:")) URL.revokeObjectURL(prev0);
      const url = URL.createObjectURL(file);
      return {
        ...p,
        activeTake: 0,
        takeMedia: [url, p.takeMedia[1], p.takeMedia[2]],
      };
    });
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Campanha ao vivo</p>
        <h2 className="mt-1 font-display text-xl font-bold text-foreground">Editor + preview em tempo real</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edite a legenda e a imagem; o celular ao lado atualiza na hora. Use a IA para gerar texto ou arte.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {SURFACES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPreview((p) => ({ ...p, previewSurface: s.id }))}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                preview.previewSurface === s.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="camp-caption">Legenda / texto do post</Label>
            <Textarea
              id="camp-caption"
              rows={5}
              value={preview.caption}
              onChange={(e) => setPreview((p) => ({ ...p, caption: e.target.value }))}
              placeholder="Escreva a mensagem que aparece no preview…"
              className="resize-y min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="camp-tags">Hashtags (Instagram / anúncio)</Label>
            <Textarea
              id="camp-tags"
              rows={2}
              value={preview.liveHashtags}
              onChange={(e) => setPreview((p) => ({ ...p, liveHashtags: e.target.value }))}
              placeholder="#promo #sualoja"
              className="resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="camp-img">Imagem (upload)</Label>
            <InputFile id="camp-img" onChange={onImageFile} />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" onClick={handleGerarTexto} disabled={loadingText || loadingImage}>
              {loadingText ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Gerar com IA
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleGerarImagem}
              disabled={loadingText || loadingImage}
            >
              {loadingImage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
              Gerar imagem IA
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl">
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
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
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

      <BomDiaModal open={open} onOpenChange={setOpen} />
    </div>
  );
}

function InputFile({ id, onChange }: { id: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <input
      id={id}
      type="file"
      accept="image/*"
      onChange={onChange}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
