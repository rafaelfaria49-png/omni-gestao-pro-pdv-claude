"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  TEMPLATES,
  type StudioMood,
  type StudioTemplate,
} from "./studio/studio-templates";
import type {
  ConnectedAccount,
  MarketingSavedPost,
  PostStatus,
  PreviewSurface,
} from "../lib/marketing-ia-types";
import { blobUrlToDataUrl, loadConnectedAccounts, persistConnectedAccounts } from "../lib/marketing-ia-storage";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import {
  dtoToSavedPost,
  surfaceToCanal,
  tituloFromCaption,
  uiStatusToDb,
  type MarketingPostDTO,
} from "@/lib/marketing/hub-post-mapper";

export type { PreviewSurface, MarketingSavedPost, ConnectedAccount, PostStatus } from "../lib/marketing-ia-types";

export type StudioPreviewState = {
  template: StudioTemplate;
  activeTake: number;
  takeMedia: (string | null)[];
  caption: string;
  mood: StudioMood;
  showLogo: boolean;
  showPrice: boolean;
  previewSurface: PreviewSurface;
  liveHashtags: string;
  campaignCta: string;
  /** Origem do texto para metadata `iaSimulated` ao persistir. */
  contentSource: "manual" | "simulated";
};

function defaultPreview(): StudioPreviewState {
  return {
    template: "bomDia",
    activeTake: 0,
    takeMedia: [null, null, null],
    caption: TEMPLATES.bomDia.caption,
    mood: "animado",
    showLogo: true,
    showPrice: false,
    previewSurface: "instagram",
    liveHashtags: "#promo #negócio #oferta",
    campaignCta: "Saiba mais",
    contentSource: "simulated",
  };
}

function normalizeSurface(s: PreviewSurface | string): PreviewSurface {
  if (s === "whatsapp" || s === "ad") return s;
  if (s === "story") return "instagram";
  return "instagram";
}

type StudioPreviewContextValue = {
  preview: StudioPreviewState;
  setPreview: Dispatch<SetStateAction<StudioPreviewState>>;
  resetForTemplate: (template: StudioTemplate) => void;
  savedPosts: MarketingSavedPost[];
  setSavedPosts: Dispatch<SetStateAction<MarketingSavedPost[]>>;
  postsLoading: boolean;
  refetchPosts: () => Promise<void>;
  seedMonthDemoPosts: (year: number, month: number) => Promise<void>;
  connectedAccounts: ConnectedAccount[];
  setConnectedAccounts: Dispatch<SetStateAction<ConnectedAccount[]>>;
  currentEditingPostId: string | null;
  setCurrentEditingPostId: Dispatch<SetStateAction<string | null>>;
  saveCurrentPost: () => Promise<string>;
  loadPostIntoPreview: (id: string) => void;
  deleteSavedPost: (id: string) => Promise<void>;
  updatePostSchedule: (postId: string, scheduledAtIso: string | null) => Promise<void>;
  scheduleCurrentPostForDate: (scheduledAtIso: string) => Promise<void>;
  publishNowSimulated: () => Promise<{ ok: boolean; markedPublished: boolean }>;
  clearCurrentCreation: () => void;
};

const StudioPreviewContext = createContext<StudioPreviewContextValue | null>(null);

export function StudioPreviewProvider({ children }: { children: ReactNode }) {
  const { lojaAtivaId } = useLojaAtiva();
  const [preview, setPreview] = useState<StudioPreviewState>(defaultPreview);
  const [savedPosts, setSavedPosts] = useState<MarketingSavedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [currentEditingPostId, setCurrentEditingPostId] = useState<string | null>(null);
  const [accountsHydrated, setAccountsHydrated] = useState(false);

  const storeHeader = lojaAtivaId?.trim() || ""

  const refetchPosts = useCallback(async () => {
    if (!storeHeader) {
      setSavedPosts([])
      setPostsLoading(false)
      return
    }
    setPostsLoading(true)
    try {
      const res = await fetch("/api/marketing/posts", {
        credentials: "include",
        cache: "no-store",
        headers: { [ASSISTEC_LOJA_HEADER]: storeHeader },
      })
      const data = (await res.json().catch(() => ({}))) as { posts?: MarketingPostDTO[]; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const rows = Array.isArray(data.posts) ? data.posts : []
      setSavedPosts(rows.map(dtoToSavedPost))
    } catch {
      setSavedPosts([])
    } finally {
      setPostsLoading(false)
    }
  }, [storeHeader])

  useEffect(() => {
    void refetchPosts()
  }, [refetchPosts])

  useEffect(() => {
    setConnectedAccounts(loadConnectedAccounts())
    setAccountsHydrated(true)
  }, [])

  useEffect(() => {
    if (!accountsHydrated) return
    persistConnectedAccounts(connectedAccounts)
  }, [connectedAccounts, accountsHydrated])

  const resetForTemplate = useCallback((template: StudioTemplate) => {
    const tpl = TEMPLATES[template]
    setPreview({
      template,
      activeTake: 0,
      takeMedia: [null, null, null],
      caption: tpl.caption,
      mood: "animado",
      showLogo: true,
      showPrice: false,
      previewSurface: "instagram",
      liveHashtags: "#promo #negócio #oferta",
      campaignCta: "Saiba mais",
      contentSource: "simulated",
    })
    setCurrentEditingPostId(null)
  }, [])

  const buildMetadata = useCallback(() => {
    return {
      template: preview.template,
      previewSurface: preview.previewSurface,
      iaSimulated: preview.contentSource === "simulated",
    }
  }, [preview.template, preview.previewSurface, preview.contentSource])

  const saveCurrentPost = useCallback(async (): Promise<string> => {
    if (!storeHeader) throw new Error("Selecione a unidade no cabeçalho para salvar posts.")

    let imageUrl: string | null = preview.takeMedia[0]
    if (imageUrl?.startsWith("blob:")) {
      const data = await blobUrlToDataUrl(imageUrl)
      imageUrl = data
      if (imageUrl) {
        setPreview((p) => ({
          ...p,
          takeMedia: [imageUrl, p.takeMedia[1], p.takeMedia[2]],
        }))
      }
    }

    const titulo = tituloFromCaption(preview.caption)
    const canal = surfaceToCanal(normalizeSurface(preview.previewSurface))
    const imagemStr = (imageUrl ?? "").trim()
    const existing = currentEditingPostId ? savedPosts.find((p) => p.id === currentEditingPostId) : undefined
    const statusDb = existing ? uiStatusToDb(existing.status) : "rascunho"
    const scheduledAt = existing?.scheduledAt ? new Date(existing.scheduledAt) : null

    const metadata = buildMetadata()

    if (currentEditingPostId) {
      const res = await fetch(`/api/marketing/posts/${encodeURIComponent(currentEditingPostId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: storeHeader,
        },
        body: JSON.stringify({
          titulo,
          canal,
          status: statusDb,
          conteudo: preview.caption,
          legenda: preview.caption,
          hashtags: preview.liveHashtags,
          cta: preview.campaignCta,
          imagemUrl: imagemStr,
          scheduledAt: scheduledAt?.toISOString() ?? null,
          metadata,
        }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      await refetchPosts()
      return currentEditingPostId
    }

    const res = await fetch("/api/marketing/posts", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        [ASSISTEC_LOJA_HEADER]: storeHeader,
      },
      body: JSON.stringify({
        titulo,
        canal,
        status: "rascunho",
        conteudo: preview.caption,
        legenda: preview.caption,
        hashtags: preview.liveHashtags,
        cta: preview.campaignCta,
        imagemUrl: imagemStr,
        scheduledAt: null,
        publishedAt: null,
        metadata,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { post?: MarketingPostDTO; error?: string }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    const id = data.post?.id
    if (!id) throw new Error("Resposta sem id")
    setCurrentEditingPostId(id)
    await refetchPosts()
    return id
  }, [
    storeHeader,
    preview,
    currentEditingPostId,
    savedPosts,
    buildMetadata,
    refetchPosts,
  ])

  const loadPostIntoPreview = useCallback(
    (id: string) => {
      const post = savedPosts.find((p) => p.id === id)
      if (!post) return
      setCurrentEditingPostId(post.id)
      setPreview((p) => ({
        ...p,
        caption: post.caption,
        liveHashtags: post.hashtags,
        campaignCta: post.cta,
        previewSurface: normalizeSurface(post.previewSurface),
        template: post.template,
        takeMedia: [post.imageUrl, p.takeMedia[1], p.takeMedia[2]],
        activeTake: 0,
        contentSource: post.iaSimulated ? "simulated" : "manual",
      }))
    },
    [savedPosts],
  )

  const deleteSavedPost = useCallback(
    async (id: string) => {
      if (!storeHeader) {
        throw new Error("Selecione a unidade no cabeçalho.")
      }
      const res = await fetch(`/api/marketing/posts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { [ASSISTEC_LOJA_HEADER]: storeHeader },
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setCurrentEditingPostId((cur) => (cur === id ? null : cur))
      await refetchPosts()
    },
    [storeHeader, refetchPosts],
  )

  const updatePostSchedule = useCallback(
    async (postId: string, scheduledAtIso: string | null) => {
      if (!storeHeader) throw new Error("Selecione a unidade no cabeçalho.")
      const status = scheduledAtIso ? "agendado" : "rascunho"
      const res = await fetch(`/api/marketing/posts/${encodeURIComponent(postId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: storeHeader,
        },
        body: JSON.stringify({
          scheduledAt: scheduledAtIso,
          status,
        }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      await refetchPosts()
    },
    [storeHeader, refetchPosts],
  )

  const scheduleCurrentPostForDate = useCallback(
    async (scheduledAtIso: string) => {
      const id = await saveCurrentPost()
      await updatePostSchedule(id, scheduledAtIso)
    },
    [saveCurrentPost, updatePostSchedule],
  )

  const publishNowSimulated = useCallback(async (): Promise<{ ok: boolean; markedPublished: boolean }> => {
    const hasContent = Boolean(preview.caption.trim() || preview.takeMedia[0])
    if (!hasContent) return { ok: false, markedPublished: false }
    if (!storeHeader) return { ok: false, markedPublished: false }
    let pid = currentEditingPostId
    if (!pid) {
      try {
        pid = await saveCurrentPost()
      } catch {
        return { ok: false, markedPublished: false }
      }
    }
    const res = await fetch(`/api/marketing/posts/${encodeURIComponent(pid)}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        [ASSISTEC_LOJA_HEADER]: storeHeader,
      },
      body: JSON.stringify({
        status: "publicado",
        publishedAt: new Date().toISOString(),
      }),
    })
    if (!res.ok) return { ok: false, markedPublished: false }
    await refetchPosts()
    return { ok: true, markedPublished: true }
  }, [preview, currentEditingPostId, storeHeader, refetchPosts, saveCurrentPost])

  const seedMonthDemoPosts = useCallback(
    async (year: number, month: number) => {
      if (!storeHeader) throw new Error("Selecione a unidade no cabeçalho.")
      const surfaces: PreviewSurface[] = ["instagram", "whatsapp", "ad"]
      const captions = [
        "Semana de ofertas — aproveite antes que acabe!",
        "Novidade em destaque na vitrine.",
        "Liquidação relâmpago só hoje.",
      ]
      const extras = [5, 12, 19].map((d, i) => {
        const when = new Date(year, month, d, 14, 0, 0, 0).toISOString()
        const canal = surfaceToCanal(surfaces[i % surfaces.length]!)
        return {
          titulo: captions[i % captions.length]!.slice(0, 80),
          canal,
          status: "agendado" as const,
          conteudo: captions[i % captions.length]!,
          legenda: captions[i % captions.length]!,
          hashtags: "#promo #loja",
          cta: "Ver ofertas",
          imagemUrl: "",
          scheduledAt: when,
          publishedAt: null,
          metadata: { iaSimulated: true, template: "bomDia", previewSurface: surfaces[i % surfaces.length] },
        }
      })
      for (const body of extras) {
        const res = await fetch("/api/marketing/posts", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            [ASSISTEC_LOJA_HEADER]: storeHeader,
          },
          body: JSON.stringify(body),
        })
        if (!res.ok) break
      }
      await refetchPosts()
    },
    [storeHeader, refetchPosts],
  )

  const clearCurrentCreation = useCallback(() => {
    setPreview(defaultPreview())
    setCurrentEditingPostId(null)
  }, [])

  const value = useMemo(
    () => ({
      preview,
      setPreview,
      resetForTemplate,
      savedPosts,
      setSavedPosts,
      postsLoading,
      refetchPosts,
      seedMonthDemoPosts,
      connectedAccounts,
      setConnectedAccounts,
      currentEditingPostId,
      setCurrentEditingPostId,
      saveCurrentPost,
      loadPostIntoPreview,
      deleteSavedPost,
      updatePostSchedule,
      scheduleCurrentPostForDate,
      publishNowSimulated,
      clearCurrentCreation,
    }),
    [
      preview,
      resetForTemplate,
      savedPosts,
      postsLoading,
      refetchPosts,
      seedMonthDemoPosts,
      connectedAccounts,
      currentEditingPostId,
      saveCurrentPost,
      loadPostIntoPreview,
      deleteSavedPost,
      updatePostSchedule,
      scheduleCurrentPostForDate,
      publishNowSimulated,
      clearCurrentCreation,
    ],
  )

  return (
    <StudioPreviewContext.Provider value={value}>{children}</StudioPreviewContext.Provider>
  )
}

export function useStudioPreview() {
  const ctx = useContext(StudioPreviewContext)
  if (!ctx) {
    throw new Error("useStudioPreview must be used within StudioPreviewProvider")
  }
  return ctx
}

export function useStudioPreviewOptional() {
  return useContext(StudioPreviewContext)
}
