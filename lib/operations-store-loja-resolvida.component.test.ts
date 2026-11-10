// @vitest-environment jsdom
/**
 * SEC-342 · isolamento entre lojas — o OperationsProvider REAL montado com a chave legada
 * (loja ativa ainda não resolvida) não pode falar com o servidor: `opsLojaIdFromStorageKey`
 * traduz essa chave para `loja-1`, e cada carga de página consultava inventário, ordens e
 * caixa da `loja-1` (e podia gravar ordens/livro diário e reenviar a fila) com outra loja
 * selecionada. Com loja real, o provider fala só com ela. Rede sintética; sem banco.
 */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperationsProvider } from "@/lib/operations-store"
import { OPS_KEY_LEGACY } from "@/lib/loja-ativa"

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({
  useEnterprisePermissions: () => ({ hubs: { operacoes: true } }),
}))
vi.mock("@/lib/automation/automation-engine", () => ({ initAutomationEngineClient: () => {} }))

type Call = { url: string; method: string; store: string | null }
let calls: Call[] = []

function storeOf(url: URL, init?: RequestInit): string | null {
  const headers = new Headers(init?.headers)
  return url.searchParams.get("lojaId") ?? headers.get("x-assistec-loja-id")
}

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://localhost")
  calls.push({ url: url.pathname, method: init?.method ?? "GET", store: storeOf(url, init) })
  if (url.pathname === "/api/ops/inventory") return Response.json({ items: [], version: "v1" })
  if (url.pathname === "/api/ops/caixa/sessoes") return Response.json({ sessoes: [] })
  return Response.json({})
})

function seedQueue(key: string) {
  // Fila com uma venda pendente e ordens locais: o que o provider legado podia empurrar para a loja-1.
  localStorage.setItem(key, JSON.stringify({
    sales: [{ id: "venda-local-1", at: new Date().toISOString(), total: 10, lines: [], syncPending: true,
      paymentBreakdown: { dinheiro: 10, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 } }],
    devolucoes: [], pendingCaixaOperations: [], orcamentos: [], customerCredits: {},
    ordens: [{ id: "os-local-1" }],
    dailyLedger: { "2026-11-10": { entradas: 1 } },
  }))
}

async function mountFor(storageKey: string | undefined) {
  const props = (storageKey ? { storageKey } : {}) as ComponentProps<typeof OperationsProvider>
  render(createElement(OperationsProvider, props, null))
  // Cobre os timers de montagem (livro diário 1,2 s; PUT de ordens 750 ms após a carga).
  await act(async () => { await new Promise((r) => setTimeout(r, 2_500)) })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  calls = []
  vi.stubGlobal("fetch", fakeFetch)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("OperationsProvider sem loja resolvida", () => {
  it("não consulta nem grava nada no servidor com a chave legada (nada vai para a loja-1)", async () => {
    seedQueue(OPS_KEY_LEGACY)
    await mountFor(undefined)
    expect(calls).toEqual([])
    // A fila local continua intacta (nada descartado, nada reenviado).
    const stored = JSON.parse(localStorage.getItem(OPS_KEY_LEGACY) ?? "{}") as { sales?: Array<{ id: string; syncPending?: boolean }> }
    expect(stored.sales?.map((s) => [s.id, s.syncPending])).toEqual([["venda-local-1", true]])
  }, 10_000)

  it("com a loja real resolvida fala só com essa loja", async () => {
    await mountFor("assistec-pro-ops-v1-qa-b")
    expect(calls.length).toBeGreaterThan(0)
    const lojas = new Set(calls.map((c) => c.store).filter(Boolean))
    expect([...lojas]).toEqual(["qa-b"])
    expect(calls.some((c) => c.url === "/api/ops/inventory")).toBe(true)
  }, 10_000)
})
