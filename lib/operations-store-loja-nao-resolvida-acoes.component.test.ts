// @vitest-environment jsdom
/**
 * SEC-342 · P2 da revisão da #343 — AÇÕES do operador sem loja resolvida.
 * Com a chave legada (loja ativa não resolvida), `opsLojaIdFromStorageKey` vira `loja-1`.
 * Venda, troca/devolução e operação de caixa precisam ser recusadas com aviso, sem gravar
 * nada (nem localmente: ficaria órfão na chave legada) e sem rede. Com loja resolvida — online
 * ou offline — nada muda. Rede sintética; sem banco.
 */
import { createElement, useEffect, type ComponentProps } from "react"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  LOJA_NAO_RESOLVIDA_CODE,
  LOJA_NAO_RESOLVIDA_MOTIVO,
  OperationsProvider,
  useOperationsStore,
} from "@/lib/operations-store"
import { OPS_KEY_LEGACY, opsKeyForLoja } from "@/lib/loja-ativa"

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({
  useEnterprisePermissions: () => ({ hubs: { operacoes: true } }),
}))
vi.mock("@/lib/automation/automation-engine", () => ({ initAutomationEngineClient: () => {} }))

type Ops = ReturnType<typeof useOperationsStore>
type Call = { url: string; method: string; store: string | null }
let calls: Call[] = []
const ref: { ops: Ops | null } = { ops: null }

const ITEM = { id: "SKU-TESTE-1", name: "Produto Sintético", stock: 10, price: 5, cost: 1, category: "geral", barcode: "", unit: "UN" }

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://localhost")
  const headers = new Headers(init?.headers)
  calls.push({ url: url.pathname, method: init?.method ?? "GET", store: url.searchParams.get("lojaId") ?? headers.get("x-assistec-loja-id") })
  if (url.pathname === "/api/ops/inventory") return Response.json({ items: [ITEM], version: "v1" })
  if (url.pathname === "/api/ops/caixa/sessoes") return Response.json({ sessoes: [] })
  return Response.json({})
})

function Capture() {
  const value = useOperationsStore()
  useEffect(() => { ref.ops = value })
  return null
}

function seed(key: string) {
  // Fila local que NÃO pode sumir: venda pendente + devolução pendente + operação de caixa.
  localStorage.setItem(key, JSON.stringify({
    sales: [{ id: "venda-local-1", at: new Date().toISOString(), total: 10, lines: [{ inventoryId: ITEM.id, name: ITEM.name, quantity: 2, unitPrice: 5, lineTotal: 10 }], syncPending: true,
      paymentBreakdown: { dinheiro: 10, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 } }],
    devolucoes: [{ id: "dev-local-1", at: new Date().toISOString(), saleId: "venda-local-1", customerCpf: "00000000000", customerName: "Cliente", lines: [], mode: "somente_estoque", creditIssued: 0, syncPending: true }],
    pendingCaixaOperations: [{ id: "op-local-1", at: new Date().toISOString(), sessaoId: "s1", tipo: "sangria", valor: 1, motivo: "x", syncPending: true }],
    orcamentos: [], customerCredits: {}, ordens: [], inventory: [ITEM],
  }))
}

async function mount(storageKey: string | undefined) {
  const props = (storageKey ? { storageKey } : {}) as ComponentProps<typeof OperationsProvider>
  const view = render(createElement(OperationsProvider, props, createElement(Capture)))
  await act(async () => { await new Promise((r) => setTimeout(r, 2_500)) })
  return view
}

const venda = () => ref.ops!.finalizeSaleTransaction({
  lines: [{ inventoryId: ITEM.id, name: ITEM.name, quantity: 1, unitPrice: 5 }],
  total: 5,
  paymentBreakdown: { dinheiro: 5 },
  openCaixaIfClosed: true,
  saldoInicialAoAbrir: 0,
})
const devolucao = () => ref.ops!.registrarDevolucao({ saleId: "venda-local-1", lines: [{ inventoryId: ITEM.id, quantity: 1 }], mode: "somente_estoque", customerCpf: "123.456.789-09", customerName: "Cliente" })
const sangria = () => ref.ops!.registrarOperacaoCaixa({ sessaoId: "s1", tipo: "sangria", valor: 2, motivo: "teste", localId: "op-nova" })

function local(key: string) {
  return JSON.parse(localStorage.getItem(key) ?? "{}") as { sales?: Array<{ id: string; syncPending?: boolean }>; devolucoes?: Array<{ id: string }>; pendingCaixaOperations?: Array<{ id: string }> }
}

let online = true
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  calls = []
  ref.ops = null
  online = true
  vi.stubGlobal("fetch", fakeFetch)
  vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function assertRecusaTudo() {
  const before = JSON.stringify(local(OPS_KEY_LEGACY))
  const v = await venda()
  expect(v).toEqual({ ok: false, reason: LOJA_NAO_RESOLVIDA_MOTIVO, code: LOJA_NAO_RESOLVIDA_CODE })
  expect(devolucao()).toEqual({ ok: false, reason: LOJA_NAO_RESOLVIDA_MOTIVO })
  expect(await sangria()).toEqual({ ok: false, reason: LOJA_NAO_RESOLVIDA_MOTIVO })
  const retry = await ref.ops!.retrySyncSale("venda-local-1")
  expect(retry).toMatchObject({ ok: false, code: LOJA_NAO_RESOLVIDA_CODE })
  await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
  // Nada foi para o servidor (nem para a loja-1) e nada local mudou ou sumiu.
  expect(calls).toEqual([])
  expect(JSON.stringify(local(OPS_KEY_LEGACY))).toBe(before)
  const s = local(OPS_KEY_LEGACY)
  expect(s.sales?.map((x) => [x.id, x.syncPending])).toEqual([["venda-local-1", true]])
  expect(s.devolucoes?.map((x) => x.id)).toEqual(["dev-local-1"])
  expect(s.pendingCaixaOperations?.map((x) => x.id)).toEqual(["op-local-1"])
}

describe("ações do operador sem loja resolvida (chave legada)", () => {
  it("primeiro acesso online: venda, devolução, caixa e reenvio recusados com aviso; fila intacta", async () => {
    seed(OPS_KEY_LEGACY)
    await mount(undefined)
    await assertRecusaTudo()
  }, 15_000)

  it("primeiro acesso sem internet: mesma recusa, sem cair na loja-1", async () => {
    online = false
    seed(OPS_KEY_LEGACY)
    await mount(undefined)
    await assertRecusaTudo()
  }, 15_000)

  it("liberação após resolver a loja: a mesma ação deixa de ser recusada pela porta", async () => {
    const view = await mount(undefined)
    expect((await venda()).ok).toBe(false)
    calls = []
    // Na aplicação o provider é remontado com a chave da loja (key={opsStorageKey}).
    view.unmount()
    await mount(opsKeyForLoja("qa-a"))
    const r = await venda()
    expect(r).not.toMatchObject({ code: LOJA_NAO_RESOLVIDA_CODE })
    expect(new Set(calls.map((c) => c.store).filter(Boolean))).toEqual(new Set(["qa-a"]))
  }, 20_000)
})

describe("com loja resolvida nada muda", () => {
  it("loja A versus loja B: cada provider fala só com a própria loja", async () => {
    for (const loja of ["qa-a", "qa-b"]) {
      calls = []
      const view = await mount(opsKeyForLoja(loja))
      expect(devolucao()).not.toEqual({ ok: false, reason: LOJA_NAO_RESOLVIDA_MOTIVO })
      await venda()
      await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
      expect(calls.length).toBeGreaterThan(0)
      expect([...new Set(calls.map((c) => c.store).filter(Boolean))]).toEqual([loja])
      view.unmount()
    }
  }, 30_000)

  it("operação offline válida: loja resolvida e sem rede continua vendendo (pendente local)", async () => {
    online = false
    await mount(opsKeyForLoja("qa-a"))
    const r = await venda()
    expect(r).not.toMatchObject({ code: LOJA_NAO_RESOLVIDA_CODE })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.pending).toBe(true)
    // Tentativas de envio (que no navegador real falham sem rede) vão só para a loja resolvida.
    expect([...new Set(calls.map((c) => c.store).filter(Boolean))]).toEqual(["qa-a"])
    expect(calls.some((c) => c.store === "loja-1")).toBe(false)
  }, 15_000)

  it("RAFACELL (loja-1 real) sem regressão: chave própria, ações liberadas, só loja-1", async () => {
    const key = opsKeyForLoja("loja-1")
    expect(key).not.toBe(OPS_KEY_LEGACY)
    await mount(key)
    expect(await sangria()).not.toEqual({ ok: false, reason: LOJA_NAO_RESOLVIDA_MOTIVO })
    const r = await venda()
    expect(r).not.toMatchObject({ code: LOJA_NAO_RESOLVIDA_CODE })
    expect([...new Set(calls.map((c) => c.store).filter(Boolean))]).toEqual(["loja-1"])
  }, 15_000)
})
