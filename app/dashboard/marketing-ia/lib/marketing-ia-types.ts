import type { StudioTemplate } from "../components/studio/studio-templates";

/** Superfície do preview: feed Instagram, WhatsApp ou anúncio patrocinado. */
export type PreviewSurface = "instagram" | "whatsapp" | "ad";

export type PostStatus = "draft" | "scheduled" | "published";

export type MarketingSavedPost = {
  id: string;
  caption: string;
  hashtags: string;
  imageUrl: string | null;
  previewSurface: PreviewSurface;
  cta: string;
  template: StudioTemplate;
  createdAt: string;
  scheduledAt: string | null;
  status: PostStatus;
  /** Conteúdo gerado em modo simulado (Fase 1). */
  iaSimulated?: boolean;
  /** Registro com status `erro` no banco. */
  statusError?: boolean;
};

export type ConnectedAccount = {
  id: string;
  network: "instagram" | "tiktok" | "facebook" | "whatsapp";
  username: string;
};
