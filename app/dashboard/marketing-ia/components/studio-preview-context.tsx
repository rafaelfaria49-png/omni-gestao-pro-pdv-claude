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
import {
  blobUrlToDataUrl,
  loadConnectedAccounts,
  loadMarketingPosts,
  persistConnectedAccounts,
  persistMarketingPosts,
} from "../lib/marketing-ia-storage";

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
  connectedAccounts: ConnectedAccount[];
  setConnectedAccounts: Dispatch<SetStateAction<ConnectedAccount[]>>;
  currentEditingPostId: string | null;
  setCurrentEditingPostId: Dispatch<SetStateAction<string | null>>;
  saveCurrentPost: () => Promise<string>;
  loadPostIntoPreview: (id: string) => void;
  deleteSavedPost: (id: string) => void;
  updatePostSchedule: (postId: string, scheduledAtIso: string | null) => void;
  scheduleCurrentPostForDate: (scheduledAtIso: string) => Promise<void>;
  publishNowSimulated: () => { ok: boolean; markedPublished: boolean };
  clearCurrentCreation: () => void;
};

const StudioPreviewContext = createContext<StudioPreviewContextValue | null>(null);

export function StudioPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<StudioPreviewState>(defaultPreview);
  const [savedPosts, setSavedPosts] = useState<MarketingSavedPost[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [currentEditingPostId, setCurrentEditingPostId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSavedPosts(loadMarketingPosts());
    setConnectedAccounts(loadConnectedAccounts());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistMarketingPosts(savedPosts);
  }, [savedPosts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    persistConnectedAccounts(connectedAccounts);
  }, [connectedAccounts, hydrated]);

  const resetForTemplate = useCallback((template: StudioTemplate) => {
    const tpl = TEMPLATES[template];
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
    });
    setCurrentEditingPostId(null);
  }, []);

  const saveCurrentPost = useCallback(async (): Promise<string> => {
    let imageUrl: string | null = preview.takeMedia[0];
    if (imageUrl?.startsWith("blob:")) {
      const data = await blobUrlToDataUrl(imageUrl);
      imageUrl = data;
      if (imageUrl) {
        setPreview((p) => ({
          ...p,
          takeMedia: [imageUrl, p.takeMedia[1], p.takeMedia[2]],
        }));
      }
    }

    const id = currentEditingPostId ?? crypto.randomUUID();

    setSavedPosts((prev) => {
      const existing = prev.find((p) => p.id === id);
      const post: MarketingSavedPost = {
        id,
        caption: preview.caption,
        hashtags: preview.liveHashtags,
        imageUrl,
        previewSurface: normalizeSurface(preview.previewSurface),
        cta: preview.campaignCta,
        template: preview.template,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        scheduledAt: existing?.scheduledAt ?? null,
        status:
          existing?.status === "published"
            ? "published"
            : existing?.status === "scheduled"
              ? "scheduled"
              : "draft",
      };
      const i = prev.findIndex((p) => p.id === id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = post;
        return next;
      }
      return [...prev, post];
    });
    setCurrentEditingPostId(id);
    return id;
  }, [preview, currentEditingPostId]);

  const loadPostIntoPreview = useCallback(
    (id: string) => {
      const post = savedPosts.find((p) => p.id === id);
      if (!post) return;
      setCurrentEditingPostId(post.id);
      setPreview((p) => ({
        ...p,
        caption: post.caption,
        liveHashtags: post.hashtags,
        campaignCta: post.cta,
        previewSurface: normalizeSurface(post.previewSurface),
        template: post.template,
        takeMedia: [post.imageUrl, p.takeMedia[1], p.takeMedia[2]],
        activeTake: 0,
      }));
    },
    [savedPosts],
  );

  const deleteSavedPost = useCallback((id: string) => {
    setSavedPosts((prev) => prev.filter((p) => p.id !== id));
    setCurrentEditingPostId((cur) => (cur === id ? null : cur));
  }, []);

  const updatePostSchedule = useCallback((postId: string, scheduledAtIso: string | null) => {
    setSavedPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              scheduledAt: scheduledAtIso,
              status: scheduledAtIso ? "scheduled" : p.status === "published" ? "published" : "draft",
            }
          : p,
      ),
    );
  }, []);

  const scheduleCurrentPostForDate = useCallback(
    async (scheduledAtIso: string) => {
      const id = await saveCurrentPost();
      setSavedPosts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, scheduledAt: scheduledAtIso, status: "scheduled" as PostStatus } : p,
        ),
      );
    },
    [saveCurrentPost],
  );

  const publishNowSimulated = useCallback((): { ok: boolean; markedPublished: boolean } => {
    const hasContent = Boolean(preview.caption.trim() || preview.takeMedia[0]);
    if (!hasContent) return { ok: false, markedPublished: false };
    if (currentEditingPostId) {
      setSavedPosts((prev) =>
        prev.map((p) => (p.id === currentEditingPostId ? { ...p, status: "published" as PostStatus } : p)),
      );
      return { ok: true, markedPublished: true };
    }
    return { ok: true, markedPublished: false };
  }, [preview, currentEditingPostId]);

  const clearCurrentCreation = useCallback(() => {
    setPreview(defaultPreview());
    setCurrentEditingPostId(null);
  }, []);

  const value = useMemo(
    () => ({
      preview,
      setPreview,
      resetForTemplate,
      savedPosts,
      setSavedPosts,
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
  );

  return (
    <StudioPreviewContext.Provider value={value}>{children}</StudioPreviewContext.Provider>
  );
}

export function useStudioPreview() {
  const ctx = useContext(StudioPreviewContext);
  if (!ctx) {
    throw new Error("useStudioPreview must be used within StudioPreviewProvider");
  }
  return ctx;
}

export function useStudioPreviewOptional() {
  return useContext(StudioPreviewContext);
}
