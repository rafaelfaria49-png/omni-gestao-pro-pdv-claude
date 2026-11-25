// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react"
import { criarCacheLeituraFinanceira } from "./read-cache"
import { FinanceiroRealProvider, useFinanceiroReal } from "@/components/financeiro/lovable/context/FinanceiroRealContext"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const browser = vi.hoisted(() => ({ user: "U1", store: "L1" }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: browser.user } }, status: "authenticated" }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: browser.store }) }))

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Promise não iniciada") }
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
function View() {
  const state = useFinanceiroReal()
  return createElement("div", {}, createElement("span", { "data-testid": "dados" },
    state.pagar.map(row => row.descricao).join("|") + (state.error ?? "")),
  createElement("button", { onClick: () => { void state.reload() } }, "Recarregar"))
}
const tree = () => createElement(FinanceiroRealProvider, null, createElement(View))
const body = (descricao: string) => ({ ok: true, rows: [{ id: "conta", descricao, valor: 10, status: "pendente" }] })

afterEach(() => { cleanup(); vi.unstubAllGlobals(); browser.user = "U1"; browser.store = "L1" })

describe("G003 cache de leitura", () => {
  it("descarta resposta atrasada mesmo quando o transporte ignora AbortSignal", async () => {
    const pending = deferred<Response>(), network = vi.fn<typeof fetch>().mockReturnValue(pending.promise)
    const cache = criarCacheLeituraFinanceira("L1", () => {}, network)
    const read = cache.buscar("/api/financeiro/pagar")
    const result = expect(read).rejects.toThrow("expirada")
    cache.descartar()
    pending.resolve(Response.json(body("PRIVADO_ANTERIOR")))
    await result
    expect(network.mock.calls[0][1]?.cache).toBe("no-store")
  })
  it("recusa de autorização invalida as respostas concorrentes da mesma geração", async () => {
    const pending = deferred<Response>(), denied = vi.fn()
    const network = vi.fn<typeof fetch>().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(Response.json({}, { status: 403 }))
    const cache = criarCacheLeituraFinanceira("L1", denied, network), previous = cache.buscar("/primeira")
    const stale = expect(previous).rejects.toThrow("expirada")
    expect((await cache.buscar("/segunda")).status).toBe(403)
    pending.resolve(Response.json(body("NAO_REAPRESENTAR")))
    await stale
    expect(denied).toHaveBeenCalledTimes(1)
  })
  it("Provider real desmonta dados de U1/L1 e bloqueia resposta antiga depois de U2/L2", async () => {
    document.cookie = "assistec-active-store=L1; path=/"
    const old = deferred<Response>()
    const network = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url) === "/api/financeiro/pagar") {
        return new Headers(init?.headers).get("x-assistec-loja-id") === "L1" ? old.promise : Response.json(body("EMPRESA_U2_L2"))
      }
      return Response.json({ ok: true, rows: [] })
    })
    vi.stubGlobal("fetch", network)
    const view = render(tree())
    await waitFor(() => expect(network.mock.calls.some(([url]) => String(url) === "/api/financeiro/pagar")).toBe(true))
    browser.user = "U2"; browser.store = "L2"; document.cookie = "assistec-active-store=L2; path=/"
    view.rerender(tree())
    await waitFor(() => expect(screen.getByTestId("dados").textContent).toContain("EMPRESA_U2_L2"))
    await act(async () => { old.resolve(Response.json(body("PRIVADO_U1_L1"))); await old.promise })
    expect(screen.getByTestId("dados").textContent).not.toContain("PRIVADO_U1_L1")
  })
  it("Provider real limpa todas as leituras ao receber 403 no recarregamento", async () => {
    document.cookie = "assistec-active-store=L1; path=/"
    let negar = false
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async url => {
      if (negar) return Response.json({ ok: false }, { status: 403 })
      return Response.json(String(url) === "/api/financeiro/pagar" ? body("ANTES_DA_REVOGACAO") : { ok: true, rows: [] })
    }))
    render(tree())
    await waitFor(() => expect(screen.getByTestId("dados").textContent).toContain("ANTES_DA_REVOGACAO"))
    negar = true; fireEvent.click(screen.getByText("Recarregar"))
    await waitFor(() => expect(screen.getByTestId("dados").textContent).not.toContain("ANTES_DA_REVOGACAO"))
  })
})

// Executa os callbacks que o plugin serializa no SW, sem importar/inicializar o
// build do Next. As entradas são URLs reais, inclusive respostas antigas em cache.
const configSource = ts.createSourceFile("next.config.mjs", readFileSync(resolve("next.config.mjs"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const privatePaths = [
  "/api/financeiro", "/api/financeiro/relatorios/exportar?formato=xlsx", "/api/financeiro/pagar?id=privado",
  "/api/ops/contas-receber-list", "/api/ops/caixa/sessao-detalhe?id=sessao",
  "/api/vendas/venda-1", "/api/dashboard/elite", "/api/contador/pacotes/pacote-1",
  "/dashboard/financeiro", "/dashboard/financeiro-v2", "/dashboard/contador", "/dashboard/omni-agent",
  "/api/contador-externo/lojas/loja-1/competencias/2026-10/resumo", "/contador", "/contador/lojas/loja-1",
  "/api/contador-externo/lojas", "/contador-externo", "/contador-externo/lojas/loja-1",
  "/contador-externo/lojas/loja-1/competencias/2026-10?_rsc=sintetico",
  "/api/clientes/cliente-1", "/dashboard/cadastros",
]
const origin = "https://fixture.example.invalid"
function property(node: ts.Node, name: string): ts.PropertyAssignment | undefined {
  if (ts.isPropertyAssignment(node) && node.name.getText(configSource) === name) return node
  return ts.forEachChild(node, child => property(child, name))
}

describe("G003 PWA: callbacks reais do worker e CacheStorage", () => {
  it("usa NetworkOnly para cada reader/página privada sem desativar cache de recursos comuns", () => {
    const runtime = property(configSource, "runtimeCaching")?.initializer
    if (!runtime || !ts.isArrayLiteralExpression(runtime)) throw new Error("Contrato runtimeCaching ausente")
    const firstRule = runtime.elements[0]
    expect(property(firstRule, "handler")?.initializer.getText(configSource)).toBe('"NetworkOnly"')
    expect(property(firstRule, "method")?.initializer.getText(configSource)).toBe('"GET"')
    const callback = property(firstRule, "urlPattern")?.initializer
    if (!callback) throw new Error("Callback serializado ausente")
    const matches = runInNewContext(`(${callback.getText(configSource)})`) as (input: { sameOrigin: boolean; url: URL }) => boolean
    for (const path of privatePaths) {
      expect(matches({ sameOrigin: true, url: new URL(path, origin) }), path).toBe(true)
      expect(matches({ sameOrigin: false, url: new URL(path, "https://other.example.invalid") }), path).toBe(false)
    }
    // Reconciliação #393 (allowlist-only): somente ativos estáticos públicos escapam da regra 1;
    // qualquer outra rota (inclusive as comuns) também é NetworkOnly — mais estrito que o G003.
    for (const path of ["/_next/static/app.js", "/manifest.webmanifest", "/icons/icon-192.png"]) {
      expect(matches({ sameOrigin: true, url: new URL(path, origin) }), path).toBe(false)
    }
  })

  // Reconciliação #393: o worker auxiliar (swe-worker) que atendia __FRONTEND_NAV_CACHE__ /
  // __START_URL_CACHE__ não é mais gerado — não há o que guardar. Prova: as duas opções desligadas.
  it.each(["cacheOnFrontEndNav", "cacheStartUrl"])("worker auxiliar desativado: %s = false", option => {
    expect(property(configSource, option)?.initializer.getText(configSource)).toBe("false")
  })

  it("a ativação apaga respostas privadas históricas de todos os caches e preserva outros recursos", async () => {
    const entries = () => new Map([...privatePaths.map(path => new URL(path, origin).href),
      `${origin}/_next/static/app.js`, `${origin}/logo.png`, "https://other.example.invalid/api/financeiro/pagar",
    ].map(url => [url, { url }]))
    const stores = new Map([["apis", entries()], ["pages", entries()], ["start-url", entries()]])
    let activate: (event: { waitUntil(task: Promise<void>): void }) => void = () => { throw new Error("Ativação não registrada") }
    runInNewContext(readFileSync(resolve("public/client-privacy-cache.js"), "utf8"), {
      URL, self: { location: new URL(origin), addEventListener(type: string, listener: typeof activate) {
        expect(type).toBe("activate"); activate = listener
      } },
      caches: { keys: async () => [...stores.keys()], open: async (name: string) => {
        const rows = stores.get(name)
        if (!rows) throw new Error("Cache inexistente")
        return { keys: async () => [...rows.values()], delete: async (request: { url: string }) => rows.delete(request.url) }
      } },
    })
    let pending = Promise.resolve()
    activate({ waitUntil(task) { pending = task } })
    await pending
    for (const rows of stores.values()) expect([...rows.keys()]).toEqual([
      `${origin}/_next/static/app.js`, `${origin}/logo.png`, "https://other.example.invalid/api/financeiro/pagar",
    ])
  })
})
