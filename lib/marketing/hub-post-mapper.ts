import type { MarketingSavedPost, PostStatus, PreviewSurface } from "@/app/dashboard/marketing-ia/lib/marketing-ia-types"
import type { StudioTemplate } from "@/app/dashboard/marketing-ia/components/studio/studio-templates"
import type { MarketingHubCanal } from "@/lib/marketing/hub-post-constants"

export type MarketingPostDTO = {
  id: string
  titulo: string
  canal: string
  status: string
  conteudo: string
  legenda: string
  hashtags: string
  cta: string
  imagemUrl: string
  scheduledAt: string | null
  publishedAt: string | null
  metadata: unknown
  createdAt: string
  updatedAt: string
}

function metaRecord(m: unknown): Record<string, unknown> {
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {}
}

export function surfaceToCanal(surface: PreviewSurface): MarketingHubCanal {
  if (surface === "whatsapp") return "whatsapp"
  if (surface === "ad") return "google"
  return "instagram"
}

export function canalToPreviewSurface(canal: string): PreviewSurface {
  if (canal === "whatsapp") return "whatsapp"
  if (canal === "google" || canal === "facebook") return "ad"
  return "instagram"
}

export function uiStatusToDb(s: PostStatus): "rascunho" | "agendado" | "publicado" {
  if (s === "published") return "publicado"
  if (s === "scheduled") return "agendado"
  return "rascunho"
}

export function dbStatusToUi(s: string): PostStatus {
  if (s === "publicado") return "published"
  if (s === "agendado") return "scheduled"
  return "draft"
}

export function dtoToSavedPost(row: MarketingPostDTO): MarketingSavedPost {
  const meta = metaRecord(row.metadata)
  const tpl = (meta.template as StudioTemplate) || "bomDia"
  return {
    id: row.id,
    caption: row.conteudo || row.legenda,
    hashtags: row.hashtags,
    imageUrl: row.imagemUrl?.trim() ? row.imagemUrl : null,
    previewSurface: canalToPreviewSurface(row.canal),
    cta: row.cta,
    template: tpl,
    createdAt: row.createdAt,
    scheduledAt: row.scheduledAt,
    status: dbStatusToUi(row.status),
    iaSimulated: Boolean(meta.iaSimulated),
    statusError: row.status === "erro",
  }
}

export function tituloFromCaption(caption: string): string {
  const line = caption.replace(/\s+/g, " ").trim()
  if (!line) return "Post"
  return line.length > 120 ? `${line.slice(0, 117)}…` : line
}
