import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { clientEditorTags, mergeClientEditorTags } from "./client-privacy"
describe("client privacy metadata and caches", () => {
  it("filters nested free-form objects and preserves private keys only server-side", () => {
    const stored = { rg: "private", _raw: { document: "private" }, labels: ["ok"], address: { street: "Old", zip: "private" }, operational: { notes: "Old", secret: "private" } }
    expect(clientEditorTags(stored)).toEqual({ labels: ["ok"], address: { street: "Old" }, operational: { notes: "Old" } })
    expect(mergeClientEditorTags(stored, { rg: "spoof", address: { street: "New", zip: "spoof" }, operational: { notes: "New" } })).toEqual({ ...stored, address: { street: "New", zip: "private" }, operational: { notes: "New", secret: "private" } })
  })
  it("purges historical customer caches without deleting unrelated assets", async () => {
    const removed: string[] = []; let activate: (event: { waitUntil(p: Promise<void>): void }) => void = () => {}
    const paths = ["/api/clientes?q=secret", "/api/clientes/c1", "/api/clients", "/dashboard/cadastros-v2", "/api/import/advanced", "/logo.png"]
    vm.runInNewContext(readFileSync("public/client-privacy-cache.js", "utf8"), {
      URL, self: { location: { origin: "https://app.local" }, addEventListener: (_: string, fn: typeof activate) => { activate = fn } },
      caches: { keys: async () => ["pages"], open: async () => ({ keys: async () => paths.map(p => ({ url: "https://app.local" + p })), delete: async (req: { url: string }) => removed.push(new URL(req.url).pathname) }) },
    })
    let work: Promise<void> = Promise.resolve(); activate({ waitUntil: p => { work = p } }); await work
    expect(removed).toHaveLength(5); expect(removed).not.toContain("/logo.png")
  })
})
