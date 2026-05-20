"use client";

import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, BadgeCheck, Tag } from "lucide-react";
import { useStudioPreviewOptional } from "./studio-preview-context";
import { PREVIEW_HASHTAGS } from "./studio/studio-templates";

interface Props {
  brand?: string;
  /** Usado só fora do Marketing IA (sem StudioPreviewProvider). */
  caption?: string;
  hashtags?: string;
}

export const PhonePreview = ({
  brand = "@minha.loja",
  caption: captionProp = "Coleção Inverno chegou! 🔥",
  hashtags: hashtagsProp = "#novidades #moda #inverno2026",
}: Props) => {
  const ctx = useStudioPreviewOptional();
  const preview = ctx?.preview;

  const template = preview?.template ?? "bomDia";
  const activeTake = preview?.activeTake ?? 0;
  const takeMedia = preview?.takeMedia ?? [null, null, null];
  const caption = preview ? preview.caption : captionProp;
  const showLogo = preview?.showLogo ?? true;
  const showPrice = preview?.showPrice ?? false;

  const hashtags = preview ? preview.liveHashtags || PREVIEW_HASHTAGS[template] : hashtagsProp;
  const rawSurface = preview?.previewSurface ?? "instagram";
  const surface: "instagram" | "whatsapp" | "ad" =
    rawSurface === "whatsapp" ? "whatsapp" : rawSurface === "ad" ? "ad" : "instagram";
  const campaignCta = preview?.campaignCta?.trim() || "Saiba mais";
  const currentMedia = preview ? takeMedia[activeTake] : null;

  return (
    <div className="relative mx-auto w-full max-w-[400px] animate-float">
      {/* Glow halo */}
      <div className="absolute inset-0 -z-10 bg-gradient-primary opacity-25 blur-3xl" />

      {/* Phone frame — modern minimalist 9/16 */}
      <div className="relative aspect-[9/16] w-full rounded-[2.25rem] bg-foreground p-[8px] shadow-elegant ring-1 ring-foreground/10 shadow-[0_0_50px_-12px_hsl(var(--color-primary)/0.4)]">
        {/* Modern pill notch (Dynamic Island style) */}
        <div className="absolute left-1/2 top-2 z-30 flex h-5 w-20 -translate-x-1/2 items-center justify-center rounded-full bg-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-background/40 ring-1 ring-background/20" />
        </div>

        {/* Screen */}
        <div className="relative h-full w-full overflow-hidden rounded-[1.85rem] bg-background">
          {surface === "instagram" ? (
            <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 pb-2 pt-8">
                <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-primary ring-2 ring-border" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[12px] font-semibold">{brand}</p>
                  <p className="text-[10px] text-muted-foreground">Publicação patrocinada</p>
                </div>
                <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="relative aspect-square w-full shrink-0 bg-muted">
                {currentMedia ? (
                  <img src={currentMedia} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-muted/50 px-4 text-center text-[11px] text-muted-foreground">
                    Adicione uma imagem no editor
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-4 px-3 py-2 text-foreground">
                <Heart className="h-6 w-6" />
                <MessageCircle className="h-6 w-6" />
                <Send className="h-6 w-6" />
                <Bookmark className="ml-auto h-6 w-6" />
              </div>
              <p className="shrink-0 px-3 text-[11px] font-semibold">1.234 curtidas</p>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
                <p className="text-[12px] leading-snug">
                  <span className="font-semibold">{brand} </span>
                  {caption}
                </p>
                <p className="mt-1 text-[11px] text-primary">{hashtags}</p>
                {preview && showLogo ? (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <BadgeCheck className="h-3 w-3 text-primary" />
                    Conta verificada
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 border-t border-border px-3 pb-5 pt-2">
                <button
                  type="button"
                  className="w-full rounded-lg bg-primary py-2.5 text-center text-[12px] font-semibold text-primary-foreground shadow-sm"
                >
                  {campaignCta}
                </button>
              </div>
            </div>
          ) : surface === "whatsapp" ? (
            <div className="flex h-full flex-col bg-[#0b141a] text-white">
              <div className="flex shrink-0 items-center gap-2.5 bg-[#075e54] px-3 pb-2.5 pt-8">
                <div className="h-8 w-8 rounded-full bg-white/25 ring-2 ring-white/30" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight">{brand.replace(/^@/, "")}</p>
                  <p className="text-[10px] text-white/80">online</p>
                </div>
                <MoreHorizontal className="h-4 w-4 shrink-0 opacity-90" />
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto px-2 py-3"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg, #0b141a 0, #0b141a 8px, #0d1a22 8px, #0d1a22 16px)",
                }}
              >
                <div className="ml-auto max-w-[92%] overflow-hidden rounded-lg rounded-tr-sm bg-[#005c4b] shadow-md ring-1 ring-black/10">
                  {currentMedia ? (
                    <img src={currentMedia} alt="" className="max-h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center bg-black/20 px-2 text-center text-[10px] text-white/70">
                      Envie uma imagem no editor
                    </div>
                  )}
                  <p className="px-2.5 py-2 text-[12px] leading-snug text-white/95">{caption}</p>
                  <p className="px-2.5 text-[10px] text-white/60">{hashtags}</p>
                  <div className="px-2.5 pb-2.5 pt-2">
                    <span className="inline-flex rounded-md bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/20">
                      {campaignCta}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-muted/30 p-3 text-foreground">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                Patrocinado · Meta
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-foreground">{brand}</p>
              <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-md">
                {currentMedia ? (
                  <img src={currentMedia} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-muted text-center text-[10px] text-muted-foreground px-2">
                    Imagem do anúncio
                  </div>
                )}
                <div className="space-y-1.5 p-2.5">
                  <p className="text-[10px] font-bold leading-snug text-primary">Oferta · não perca</p>
                  <p className="text-[11px] leading-snug text-foreground">{caption}</p>
                  <p className="text-[10px] text-muted-foreground">{hashtags}</p>
                  <div className="pt-1">
                    <span className="inline-block w-full rounded-lg bg-primary py-2 text-center text-[11px] font-semibold text-primary-foreground">
                      {campaignCta}
                    </span>
                  </div>
                </div>
              </div>
              {preview && showPrice ? (
                <div className="mt-2 flex items-center justify-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                  <Tag className="h-3 w-3" />
                  R$ 99,90
                </div>
              ) : null}
            </div>
          )}

          <div className="absolute bottom-1 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full bg-background/70" />
        </div>
      </div>

      {/* Live indicator */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        Pré-visualização ao vivo
      </div>
    </div>
  );
};
