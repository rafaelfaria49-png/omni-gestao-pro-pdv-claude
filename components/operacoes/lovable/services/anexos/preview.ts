import type { CanonicalAnexo } from "./types";
import { getLocalBlob } from "./storage";

type CacheEntry = { url: string; lastUsedAt: number };
const cache = new Map<string, CacheEntry>();

function now() {
  return Date.now();
}

export function isLocalIdbUrl(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith("local-idb://");
}

export function localIdbKeyFromUrl(url: string): string {
  return url.replace(/^local-idb:\/\//, "");
}

export async function resolvePreviewUrl(a: CanonicalAnexo): Promise<string | null> {
  // External URL: usa direto.
  if (a.url && !isLocalIdbUrl(a.url)) return a.url;

  if (!a.url) return null;
  const key = localIdbKeyFromUrl(a.url);

  const cached = cache.get(key);
  if (cached) {
    cached.lastUsedAt = now();
    return cached.url;
  }

  const blob = await getLocalBlob(key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  cache.set(key, { url, lastUsedAt: now() });
  return url;
}

export function revokePreviewUrlFor(anexoUrl: string | undefined) {
  if (!anexoUrl || !isLocalIdbUrl(anexoUrl)) return;
  const key = localIdbKeyFromUrl(anexoUrl);
  const entry = cache.get(key);
  if (!entry) return;
  URL.revokeObjectURL(entry.url);
  cache.delete(key);
}

export function gcPreviewCache(maxAgeMs = 5 * 60 * 1000) {
  const t = now();
  for (const [key, entry] of cache.entries()) {
    if (t - entry.lastUsedAt > maxAgeMs) {
      URL.revokeObjectURL(entry.url);
      cache.delete(key);
    }
  }
}

