"use client";

import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Music2, Volume2, BadgeCheck, Tag } from "lucide-react";
import { useStudioPreviewOptional } from "./studio-preview-context";
import {
  PREVIEW_CENTER_LABEL,
  PREVIEW_HASHTAGS,
  TEMPLATES,
  type StudioMood,
} from "./studio/studio-templates";

const MOOD_TRACK: Record<StudioMood, string> = {
  animado: "Pop energético · marca",
  relaxante: "Lo-fi calmante · marca",
  promocao: "Beat promocional · urgência",
};

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
  const mood = preview?.mood ?? "animado";
  const showLogo = preview?.showLogo ?? true;
  const showPrice = preview?.showPrice ?? false;

  const tpl = TEMPLATES[template];
  const takeTitle = preview
    ? tpl.takes[activeTake]?.title ?? "NOVA COLEÇÃO"
    : "NOVA COLEÇÃO";
  const centerLabel = preview ? PREVIEW_CENTER_LABEL[template] : "Bom dia";
  const hashtags = preview ? PREVIEW_HASHTAGS[template] : hashtagsProp;
  const currentMedia = preview ? takeMedia[activeTake] : null;
  const trackLabel = preview ? MOOD_TRACK[mood] : "Áudio original · Marca";
  const subline = preview
    ? `Take ${activeTake + 1}/3 · ${tpl.title}`
    : "15s · Story automático";

  const headline =
    takeTitle.length > 28 ? `${takeTitle.slice(0, 26).trim()}…` : takeTitle;

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
          {/* Reel background + optional media */}
          <div className="relative h-full w-full bg-gradient-to-br from-primary/40 via-accent/30 to-primary-glow/40">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary-glow)/0.5),transparent_55%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent)/0.5),transparent_55%)]" />

            {currentMedia ? (
              <img
                src={currentMedia}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}

            {/* Top bar */}
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-8 text-primary-foreground">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-gradient-primary ring-2 ring-primary-foreground/80" />
                <div className="leading-tight">
                  <p className="text-[11px] font-semibold drop-shadow">{brand}</p>
                  <p className="text-[9px] opacity-80">Patrocinado · Reels</p>
                </div>
              </div>
              <MoreHorizontal className="h-4 w-4 drop-shadow" />
            </div>

            {preview && showLogo ? (
              <div className="absolute left-3 top-16 z-20 flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-md backdrop-blur-sm ring-1 ring-border">
                <BadgeCheck className="h-3 w-3 text-primary" />
                SUA MARCA
              </div>
            ) : null}

            {preview && showPrice ? (
              <div className="absolute bottom-28 right-3 z-20 flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-lg">
                <Tag className="h-3 w-3" />
                R$ 99,90
              </div>
            ) : null}

            {/* Center content */}
            <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none">
              <div className="rounded-2xl bg-background/15 px-4 py-3 text-center backdrop-blur-md ring-1 ring-primary-foreground/30 max-w-[90%]">
                <p className="text-[9px] uppercase tracking-widest text-primary-foreground/80">
                  {centerLabel}
                </p>
                <p className="mt-1 text-base font-black uppercase leading-tight text-primary-foreground drop-shadow-lg sm:text-lg">
                  {headline}
                </p>
                <p className="text-[9px] text-primary-foreground/90">{subline}</p>
              </div>
            </div>

            {/* Right action rail */}
            <div className="absolute right-2 bottom-24 z-10 flex flex-col items-center gap-3 text-primary-foreground">
              {[Heart, MessageCircle, Send, Bookmark].map((Icon, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <Icon className="h-5 w-5 drop-shadow" />
                  <span className="text-[9px] font-semibold drop-shadow">
                    {["12k", "284", "1.1k", ""][i]}
                  </span>
                </div>
              ))}
            </div>

            {/* Bottom caption */}
            <div className="absolute inset-x-0 bottom-0 z-10 space-y-1.5 bg-gradient-to-t from-foreground/70 to-transparent px-3 pb-4 pt-8 text-primary-foreground">
              <p className="text-[11px] font-semibold leading-snug drop-shadow">{caption}</p>
              <p className="text-[10px] leading-snug opacity-90">{hashtags}</p>
              <div className="flex items-center gap-1.5 text-[10px]">
                <Music2 className="h-3 w-3 shrink-0" />
                <span className="opacity-90 truncate">{trackLabel}</span>
                <Volume2 className="ml-auto h-3 w-3 shrink-0" />
              </div>
            </div>
          </div>

          {/* Home indicator */}
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
