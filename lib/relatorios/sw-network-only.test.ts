/**
 * RELATORIOS-FASE-A-001 (A3) — relatórios, financeiro e caixa nunca do cache do Service Worker.
 *
 * Avalia o callback `urlPattern` exatamente como o Workbox o serializa (`Function#toString`
 * embutido no `sw.js`) e o script de limpeza na ativação do SW. Sem build: lê o texto do
 * `next.config.mjs`, igual ao que vai para o worker.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import vm from "node:vm"

type Pattern = (ctx: { sameOrigin: boolean; url: URL }) => boolean

function networkOnlyPattern(): Pattern {
  const src = readFileSync("next.config.mjs", "utf8")
  const start = src.indexOf("urlPattern: ", src.indexOf("runtimeCaching: ["))
  const end = src.indexOf('handler: "NetworkOnly"', start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  const fn = src.slice(start + "urlPattern: ".length, end).trim().replace(/,$/, "")
  return new Function(`return (${fn})`)() as Pattern
}

const ORIGIN = "https://app.local"
const at = (path: string, sameOrigin = true) => ({ sameOrigin, url: new URL(ORIGIN + path) })

describe("SW · NetworkOnly para relatórios, financeiro e caixa", () => {
  const isNetworkOnly = networkOnlyPattern()

  it.each([
    "/api/vendas/historico?storeId=a&from=2026-11-07T03:00:00.000Z",
    "/api/vendas/abc123",
    "/api/financeiro/receber",
    "/api/financeiro/pagar",
    "/api/financeiro/fluxo-caixa",
    "/api/financeiro/relatorios/resumo?storeId=a&preset=hoje",
    "/api/financeiro/dre",
    "/api/ops/caixa/sessoes?take=50",
    "/api/ops/caixa/sessoes?lojaId=a&status=ABERTA&take=1",
    "/api/ops/caixa/sessao-detalhe?id=s1",
    "/api/dashboard/elite",
    "/api/dashboard/resumo",
    // Loja só no header: a mesma URL serviria a lista de outra loja.
    "/api/ops/contas-pagar-list",
    "/api/ops/contas-receber-list",
    "/api/ops/contas-receber-list?lojaId=a",
    "/api/finance/accounts",
    "/api/finance/transactions?page=1",
  ])("%s → NetworkOnly", (path) => {
    expect(isNetworkOnly(at(path))).toBe(true)
  })

  it.each([
    // Carga inicial do PDV e reconciliação de vendas seguem com a política anterior (fora do escopo).
    "/api/ops/inventory",
    "/api/ops/vendas-list?lojaId=a",
    "/api/version",
    // Prefixos parecidos não entram por acidente.
    "/api/vendasx",
    "/api/financeiro-legado",
    "/api/ops/caixas",
    "/api/ops/contas-receber-list-x",
    "/api/financex",
  ])("%s → mantém a política anterior", (path) => {
    expect(isNetworkOnly(at(path))).toBe(false)
  })

  it("regras anteriores continuam valendo", () => {
    expect(isNetworkOnly(at("/api/clientes?q=x"))).toBe(true)
    expect(isNetworkOnly(at("/api/ops/inventory?catalogSync=1"))).toBe(true)
    expect(isNetworkOnly(at("/api/ops/venda-persist/v2"))).toBe(true)
  })

  it("outra origem nunca casa", () => {
    expect(isNetworkOnly(at("/api/financeiro/receber", false))).toBe(false)
  })
})

describe("SW · limpeza na ativação remove respostas antigas dessas rotas", () => {
  it("apaga relatórios/financeiro/caixa já guardados e preserva o resto", async () => {
    const removed: string[] = []
    let activate: (event: { waitUntil(p: Promise<void>): void }) => void = () => {}
    const paths = [
      "/api/vendas/historico?storeId=a",
      "/api/financeiro/receber",
      "/api/ops/caixa/sessoes?take=50",
      "/api/dashboard/elite",
      "/api/ops/contas-pagar-list",
      "/api/ops/contas-receber-list",
      "/api/finance/accounts",
      "/api/ops/inventory",
      "/api/ops/vendas-list?lojaId=a",
      "/logo.png",
    ]
    vm.runInNewContext(readFileSync("public/client-privacy-cache.js", "utf8"), {
      URL,
      self: { location: { origin: ORIGIN }, addEventListener: (_: string, fn: typeof activate) => { activate = fn } },
      caches: {
        keys: async () => ["apis"],
        open: async () => ({
          keys: async () => paths.map((p) => ({ url: ORIGIN + p })),
          delete: async (req: { url: string }) => removed.push(new URL(req.url).pathname),
        }),
      },
    })
    let work: Promise<void> = Promise.resolve()
    activate({ waitUntil: (p) => { work = p } })
    await work
    expect(removed.sort()).toEqual(
      [
        "/api/dashboard/elite", "/api/financeiro/receber", "/api/ops/caixa/sessoes", "/api/vendas/historico",
        "/api/ops/contas-pagar-list", "/api/ops/contas-receber-list", "/api/finance/accounts",
      ].sort(),
    )
  })
})
