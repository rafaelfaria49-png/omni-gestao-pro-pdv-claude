import type { ConnectedAccount, MarketingSavedPost } from "./marketing-ia-types";

const LS_POSTS = "omni-marketing-ia:v1:posts";
const LS_ACCOUNTS = "omni-marketing-ia:v1:accounts";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeLoadedPost(p: MarketingSavedPost): MarketingSavedPost {
  const s = p.previewSurface as string;
  const previewSurface =
    s === "whatsapp" ? "whatsapp" : s === "ad" ? "ad" : "instagram";
  return { ...p, previewSurface };
}

export function loadMarketingPosts(): MarketingSavedPost[] {
  if (typeof window === "undefined") return [];
  const v = safeParse<MarketingSavedPost[]>(localStorage.getItem(LS_POSTS), []);
  if (!Array.isArray(v)) return [];
  return v.map((p) => normalizeLoadedPost(p));
}

export function persistMarketingPosts(posts: MarketingSavedPost[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_POSTS, JSON.stringify(posts));
}

export function loadConnectedAccounts(): ConnectedAccount[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(LS_ACCOUNTS);
  const parsed = safeParse<unknown>(raw, null);
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (x): x is ConnectedAccount =>
        x &&
        typeof x === "object" &&
        typeof (x as ConnectedAccount).id === "string" &&
        typeof (x as ConnectedAccount).username === "string",
    );
  }
  // Migração legado Record<string, string[]>
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const rec = parsed as Record<string, string[]>;
    const out: ConnectedAccount[] = [];
    for (const net of ["instagram", "tiktok", "facebook", "whatsapp"] as const) {
      const list = rec[net];
      if (!Array.isArray(list)) continue;
      list.forEach((u) => {
        if (typeof u === "string" && u.trim())
          out.push({ id: crypto.randomUUID(), network: net, username: u.trim() });
      });
    }
    if (out.length) {
      persistConnectedAccounts(out);
      return out;
    }
  }
  return [];
}

export function persistConnectedAccounts(accounts: ConnectedAccount[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_ACCOUNTS, JSON.stringify(accounts));
}

export async function blobUrlToDataUrl(blobUrl: string): Promise<string | null> {
  try {
    const r = await fetch(blobUrl);
    const b = await r.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("read"));
      fr.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}
