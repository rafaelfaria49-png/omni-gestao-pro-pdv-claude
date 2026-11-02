import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import vm from "node:vm"

// RELATORIOS-PRODUTOS-VENDIDOS-PWA-SAFETY-002 — guarda de fonte para a CI.
// A prova contra o SW gerado pelo build fica em scripts/relatorios/inspect-pwa-produtos-vendidos.test.mjs.

const ORIGEM = "https://app.local"

describe("PWA × relatório de produtos vendidos", () => {
  it("next.config põe o relatório na regra NetworkOnly existente (sem nova regra)", () => {
    const cfg = readFileSync("next.config.mjs", "utf8")
    const regra = cfg.slice(cfg.indexOf("runtimeCaching: [{"), cfg.indexOf('handler: "NetworkOnly"'))
    expect(regra).toContain('url.pathname === "/api/vendas/produtos-vendidos"')
    expect(regra).toContain('url.pathname.startsWith("/api/vendas/produtos-vendidos/")')
    expect(cfg.match(/handler: "NetworkOnly"/g)).toHaveLength(1)
  })

  it("ativação apaga relatórios guardados em qualquer cache e preserva o resto", async () => {
    const removed: string[] = []
    let activate: (event: { waitUntil(p: Promise<void>): void }) => void = () => {}
    const paths = [
      "/api/vendas/produtos-vendidos?from=a&to=b",
      "/api/vendas/produtos-vendidos/variantes?produtoId=p1",
      "/api/vendas/historico?take=50",
      "/api/vendas/produtos-vendidos-extra",
      "/dashboard/relatorios/produtos",
      "/api/pessoas",
    ]
    vm.runInNewContext(readFileSync("public/client-privacy-cache.js", "utf8"), {
      URL,
      self: { location: { origin: ORIGEM }, addEventListener: (_: string, fn: typeof activate) => { activate = fn } },
      caches: {
        keys: async () => ["apis", "pages"],
        open: async () => ({
          keys: async () => [...paths.map((p) => ({ url: ORIGEM + p })), { url: "https://outra.example/api/vendas/produtos-vendidos" }],
          delete: async (req: { url: string }) => removed.push(req.url),
        }),
      },
    })
    let work: Promise<void> = Promise.resolve()
    activate({ waitUntil: (p) => { work = p } })
    await work
    expect(removed.map((u) => new URL(u).pathname + new URL(u).search).sort()).toEqual([
      "/api/vendas/produtos-vendidos/variantes?produtoId=p1",
      "/api/vendas/produtos-vendidos/variantes?produtoId=p1",
      "/api/vendas/produtos-vendidos?from=a&to=b",
      "/api/vendas/produtos-vendidos?from=a&to=b",
    ])
  })
})
