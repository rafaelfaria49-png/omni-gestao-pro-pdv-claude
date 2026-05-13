"use client";

import { useState } from "react";
import { Loader2, Sparkles, ImageIcon, Save, Eraser, CalendarClock, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudioPreview, type PreviewSurface } from "../studio-preview-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const CONTENT_TEMPLATES = {
  promocao:
    "🔥 Promoção imperdível! Descontos especiais por tempo limitado — aproveite antes que acabe.",
  novoProduto:
    "✨ Novidade na loja! Venha conferir o que acabou de chegar. Qualidade e preço que você já conhece.",
  liquidacao: "🏷️ Liquidação total! Preços imbatíveis enquanto durar o estoque.",
  ofertaEspecial: "🎁 Oferta especial para quem acompanha a gente. Condições exclusivas hoje!",
} as const;

const POST_TYPES: Array<{
  id: PreviewSurface;
  label: string;
  iaLabel: string;
}> = [
  { id: "instagram", label: "Instagram", iaLabel: "publicação no Instagram (feed)" },
  { id: "whatsapp", label: "WhatsApp", iaLabel: "mensagem promocional no WhatsApp" },
  { id: "ad", label: "Anúncio", iaLabel: "anúncio patrocinado em redes sociais" },
];

function sanitizeForTextOrchestrate(s: string): string {
  return s
    .replace(/\bposts?\b/gi, "publicações")
    .replace(/\bpostagens?\b/gi, "publicações")
    .replace(/\banúncio\b/gi, "oferta")
    .replace(/\banuncio\b/gi, "oferta")
    .replace(/\bimagem\b/gi, "conceito visual em palavras")
    .replace(/\barte\b/gi, "mensagem")
    .replace(/\bbanner\b/gi, "destaque em texto")
    .replace(/\blogo\b/gi, "nome da marca")
    .replace(/\blogotipo\b/gi, "nome da marca")
    .replace(/\bfoto\b/gi, "descrição")
    .replace(/\bflyer\b/gi, "texto promocional")
    .trim();
}

function parseCampaignResponse(raw: string): { legend: string; cta: string } {
  const t = raw.trim();
  const parts = t.split(/\n\s*CTA\s*:\s*/i);
  let legend = parts[0]?.replace(/^\s*LEGENDA\s*:\s*/i, "").trim() ?? "";
  let cta = parts.length > 1 ? parts.slice(1).join("\n").trim() : "";

  if (!legend) legend = t.replace(/\n\s*CTA\s*:[\s\S]*$/i, "").trim() || t;
  if (!cta) cta = "Saiba mais";

  return { legend: legend.slice(0, 2000), cta: cta.slice(0, 120) };
}

export function MarketingContentEditor() {
  const {
    preview,
    setPreview,
    saveCurrentPost,
    clearCurrentCreation,
    currentEditingPostId,
    scheduleCurrentPostForDate,
    publishNowSimulated,
  } = useStudioPreview();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState("");

  const applyTemplate = (key: keyof typeof CONTENT_TEMPLATES) => {
    setPreview((p) => ({ ...p, caption: CONTENT_TEMPLATES[key], contentSource: "simulated" }));
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

  const handleGerarCampanha = async () => {
    const seed = preview.caption.trim();
    if (!seed) {
      toast({
        title: "Texto necessário",
        description: "Digite um rascunho ou escolha um template antes de gerar.",
        variant: "destructive",
      });
      return;
    }
    const iaLabel = POST_TYPES.find((p) => p.id === preview.previewSurface)?.iaLabel ?? POST_TYPES[0]!.iaLabel;
    setGenerating(true);
    try {
      const safe = sanitizeForTextOrchestrate(seed) || "destaque da loja";
      const fake = [
        `LEGENDA: Campanha (${iaLabel}): ${safe.slice(0, 280)}`,
        "CTA: Aproveitar agora na loja",
      ].join("\n");
      const { legend, cta: nextCta } = parseCampaignResponse(fake);
      setPreview((p) => ({ ...p, caption: legend, campaignCta: nextCta, contentSource: "simulated" }));
      toast({
        title: "IA simulada",
        description: "Texto gerado localmente (Fase 1). Salve para gravar no banco da unidade.",
      });
    } catch (e) {
      toast({
        title: "Falha ao gerar",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleGerarImagem = async () => {
    setGeneratingImage(true);
    try {
      toast({
        title: "Imagens por IA",
        description: "Fase 1: apenas conteúdo textual é persistido. Upload/geração de mídia virá depois.",
      });
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleSavePost = async () => {
    setSaving(true);
    try {
      await saveCurrentPost();
      toast({ title: "Post salvo com sucesso", description: "Você pode ver e editar na aba Posts." });
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLimpar = () => {
    clearCurrentCreation();
    toast({ title: "Criação limpa", description: "Novo rascunho no editor e no preview." });
  };

  const confirmQuickSchedule = async () => {
    if (!scheduleLocal) {
      toast({ title: "Escolha data e hora", variant: "destructive" });
      return;
    }
    try {
      await scheduleCurrentPostForDate(new Date(scheduleLocal).toISOString());
      setScheduleOpen(false);
      toast({ title: "Agendado", description: "Post salvo e agendado. Veja no Calendário." });
    } catch {
      toast({ title: "Erro ao agendar", variant: "destructive" });
    }
  };

  const handlePublishNow = async () => {
    const r = await publishNowSimulated();
    if (!r.ok) {
      toast({
        title: "Crie ou selecione um post primeiro",
        description: "Adicione texto ou imagem no preview.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Publicação simulada com sucesso",
      description: r.markedPublished
        ? "Post marcado como publicado no banco da unidade."
        : "Salve o post antes de publicar.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card/90 p-5 shadow-sm backdrop-blur-sm ring-1 ring-border/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Editor</p>
            <h2 className="mt-1 font-display text-xl font-bold text-foreground">Estúdio · conteúdo ao vivo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O preview à direita acompanha tudo. {currentEditingPostId ? "Editando post salvo." : "Rascunho novo."}
            </p>
          </div>
          <Sparkles className="h-8 w-8 shrink-0 text-primary opacity-80" />
        </div>

        <div className="mt-5 space-y-2">
          <Label className="text-xs text-muted-foreground">Templates rápidos</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONTENT_TEMPLATES) as Array<keyof typeof CONTENT_TEMPLATES>).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => applyTemplate(key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  "border-border bg-background/80 hover:border-primary hover:text-primary",
                )}
              >
                {key === "promocao" && "Promoção"}
                {key === "novoProduto" && "Novo produto"}
                {key === "liquidacao" && "Liquidação"}
                {key === "ofertaEspecial" && "Oferta especial"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label className="text-xs text-muted-foreground">Tipo de post (preview)</Label>
          <div className="flex flex-wrap gap-2">
            {POST_TYPES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreview((s) => ({ ...s, previewSurface: p.id, contentSource: "manual" }))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  preview.previewSurface === p.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="mkt-text">Texto da campanha</Label>
          <Textarea
            id="mkt-text"
            rows={6}
            value={preview.caption}
            onChange={(e) => setPreview((p) => ({ ...p, caption: e.target.value, contentSource: "manual" }))}
            placeholder="Descreva sua campanha, oferta ou tom de voz…"
            className="min-h-[140px] resize-y text-[15px] leading-relaxed"
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="mkt-cta">CTA (botão)</Label>
          <Textarea
            id="mkt-cta"
            rows={2}
            value={preview.campaignCta}
            onChange={(e) => setPreview((p) => ({ ...p, campaignCta: e.target.value, contentSource: "manual" }))}
            placeholder="Ex.: Comprar agora, Chamar no WhatsApp…"
            className="resize-none text-sm"
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="mkt-tags">Hashtags</Label>
          <Textarea
            id="mkt-tags"
            rows={2}
            value={preview.liveHashtags}
            onChange={(e) => setPreview((p) => ({ ...p, liveHashtags: e.target.value, contentSource: "manual" }))}
            placeholder="#sualoja #promo"
            className="resize-none text-sm"
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="mkt-img">Imagem</Label>
          <input
            id="mkt-img"
            type="file"
            accept="image/*"
            onChange={onImageFile}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              onClick={handleGerarCampanha}
              disabled={generating || generatingImage}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Gerar campanha (IA simulada)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleGerarImagem}
              disabled={generating || generatingImage}
            >
              {generatingImage ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="mr-2 h-4 w-4" />
              )}
              Gerar imagem IA
            </Button>
          </div>
          {generating ? (
            <p className="flex items-center gap-2 text-sm font-medium text-primary animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Gerando campanha...
            </p>
          ) : null}
          {generatingImage ? (
            <p className="flex items-center gap-2 text-sm font-medium text-primary animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Gerando imagem...
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={handleSavePost} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar post
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setScheduleLocal("");
                setScheduleOpen(true);
              }}
            >
              <CalendarClock className="mr-2 h-4 w-4" />
              Agendar
            </Button>
            <Button type="button" variant="outline" onClick={() => void handlePublishNow()}>
              <Send className="mr-2 h-4 w-4" />
              Publicar agora
            </Button>
            <Button type="button" variant="outline" onClick={handleLimpar}>
              <Eraser className="mr-2 h-4 w-4" />
              Limpar criação
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Salvar persiste na unidade selecionada (PostgreSQL). Geração de texto nesta fase é simulada localmente.
          </p>
        </div>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar post atual</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Salva o rascunho e define publicação simulada na data escolhida.
          </p>
          <Input
            type="datetime-local"
            value={scheduleLocal}
            onChange={(e) => setScheduleLocal(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmQuickSchedule}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

