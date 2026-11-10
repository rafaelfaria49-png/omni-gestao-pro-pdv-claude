import { describe, expect, it } from "vitest"
import { purgeSessionRuntimeCaches } from "./purge-session-caches"

function fakeStorage(names: string[]) {
  const present = new Set(names)
  return {
    present,
    keys: async () => [...present],
    delete: async (name: string) => present.delete(name),
  }
}

describe("purgeSessionRuntimeCaches (SEC-342)", () => {
  it("apaga só caches com dado de sessão; precache e assets estáticos ficam", async () => {
    const storage = fakeStorage([
      "workbox-precache-v2-https://app/", "apis", "pages", "pages-rsc", "pages-rsc-prefetch", "next-data",
      "start-url", "cross-origin", "static-data-assets", "static-js-assets", "static-style-assets",
      "next-static-js-assets", "static-image-assets", "google-fonts-webfonts",
    ])
    const removed = await purgeSessionRuntimeCaches(storage)
    expect(removed.sort()).toEqual(["apis", "cross-origin", "next-data", "pages", "pages-rsc", "pages-rsc-prefetch", "start-url", "static-data-assets"])
    expect([...storage.present].sort()).toEqual([
      "google-fonts-webfonts", "next-static-js-assets", "static-image-assets", "static-js-assets", "static-style-assets",
      "workbox-precache-v2-https://app/",
    ])
  })

  it("sem Cache Storage ou com falha não lança", async () => {
    expect(await purgeSessionRuntimeCaches(undefined)).toEqual([])
    expect(await purgeSessionRuntimeCaches({ keys: async () => { throw new Error("x") }, delete: async () => true })).toEqual([])
    const flaky = { keys: async () => ["apis", "pages"], delete: async (n: string) => { if (n === "apis") throw new Error("busy"); return true } }
    expect(await purgeSessionRuntimeCaches(flaky)).toEqual(["pages"])
  })
})
