// @vitest-environment jsdom
/**
 * PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001 — OperationsProvider REAL (fila, finalização,
 * reenvio automático e manual) contra um servidor-modelo com o contrato do writer V2:
 * idempotente por `(storeId, clientSaleId)`, uma baixa de estoque e um lançamento de caixa
 * por venda criada, recusas de negócio sem efeito. Só a rede é sintética; nenhum banco,
 * .env ou credencial. O banco real (mesmo contrato) é provado em
 * `offline-sync.integration.test.ts`; o navegador compilado, no E2E 10.
 */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperationsProvider, useOperationsStore } from "@/lib/operations-store"
import type { PaymentBreakdownFull, SaleRecord } from "@/lib/operations-sale-types"
import { operatorSaleSyncView } from "@/lib/vendas/sale-sync-engine"

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => null }))
vi.mock("@/lib/automation/automation-engine", () => ({ initAutomationEngineClient: () => {} }))

const STORE_A = "loja-off-a"
const STORE_B = "loja-off-b"
const keyOf = (store: string) => `assistec-pro-ops-v1-${store}`
const ORIGIN = "http://localhost"

type Mode =
  | "ok"
  | "network"
  | "hang"
  | "http500"
  | "http401"
  | "lostAfterCommit"
  | "inconclusive"
  | "inconclusiveAfterCommit"
  | { status: number; body: Record<string, unknown> }

type Venda = { id: string; pedidoId: string; storeId: string; clientSaleId: string | null; total: number; at: string; status: string }

/** Servidor-modelo: mesmo contrato observável do writer V2 / V1 e da consulta por clientSaleId. */
class ServerModel {
  down = false
  modes: Mode[] = []
  stock = new Map<string, number>([["p-1", 10]])
  vendas = new Map<string, Venda>()
  cash: Array<{ storeId: string; key: string; valor: number }> = []
  stockMoves: Array<{ key: string; qty: number }> = []
  posts: Array<{ storeId: string; clientSaleId: string | null; pedidoId?: string; retroactive: boolean; path: string }> = []
  gets: string[] = []
  verifyCalls = 0
  /** Recusa de negócio por identidade (fila mista). */
  rejectFor = new Map<string, { status: number; body: Record<string, unknown> }>()
  /** Pausa a próxima escrita até `release()` (envio em voo). */
  paused: Array<() => void> = []
  pauseNext = false
  private seq = 0

  private json(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }
  private commit(storeId: string, key: string, sale: SaleRecord, clientSaleId: string | null) {
    const k = `${storeId}:${key}`
    const existing = this.vendas.get(k)
    if (existing) return { venda: existing, replayed: true }
    this.seq += 1
    const pedidoId = clientSaleId ? `VDA-OFF-${this.seq}` : sale.id
    const venda: Venda = { id: `srv-${this.seq}`, pedidoId, storeId, clientSaleId, total: sale.total, at: sale.at, status: "concluida" }
    this.vendas.set(k, venda)
    for (const line of sale.lines) {
      this.stock.set(line.inventoryId, (this.stock.get(line.inventoryId) ?? 0) - line.quantity)
      this.stockMoves.push({ key, qty: line.quantity })
    }
    const imediato = sale.paymentBreakdown.dinheiro + sale.paymentBreakdown.pix + sale.paymentBreakdown.cartaoDebito + sale.paymentBreakdown.cartaoCredito
    if (imediato > 0) this.cash.push({ storeId, key, valor: imediato })
    return { venda, replayed: false }
  }
  async handle(raw: string, init?: RequestInit): Promise<Response> {
    const url = new URL(raw, ORIGIN)
    const method = init?.method ?? "GET"
    if (this.down) throw new TypeError("Failed to fetch")
    const storeId = url.searchParams.get("storeId") ?? url.searchParams.get("lojaId") ?? ""
    const header = new Headers(init?.headers).get("x-assistec-loja-id")
    if (method === "GET") this.gets.push(`${url.pathname}?${url.searchParams.toString()}`)
    if (method === "POST" && (url.pathname === "/api/ops/venda-persist/v2" || url.pathname === "/api/ops/venda-persist")) {
      if (header && header !== storeId) return this.json(403, { error: "loja divergente" })
      const wire = JSON.parse(String(init?.body ?? "null")) as { sale: SaleRecord; clientSaleId?: string; allowClosedOriginalSession?: boolean }
      const clientSaleId = url.pathname.endsWith("/v2") ? wire.clientSaleId ?? null : null
      this.posts.push({ storeId, clientSaleId, pedidoId: wire.sale.id, retroactive: wire.allowClosedOriginalSession === true, path: url.pathname })
      if (this.pauseNext) {
        this.pauseNext = false
        await new Promise<void>((done) => this.paused.push(done))
      }
      const rejection = clientSaleId ? this.rejectFor.get(clientSaleId) : undefined
      if (rejection) return this.json(rejection.status, rejection.body)
      const mode = this.modes.shift() ?? "ok"
      if (mode === "network") throw new TypeError("Failed to fetch")
      if (mode === "hang") {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        })
      }
      if (mode === "http500") return this.json(500, { error: "falha temporária" })
      if (mode === "http401") return this.json(401, { ok: false, error: "Não autenticado" })
      if (typeof mode === "object") return this.json(mode.status, mode.body)
      if (mode === "inconclusive") return new Response("<html>login do Wi-Fi</html>", { status: 200 })
      const { venda, replayed } = this.commit(storeId, clientSaleId ?? wire.sale.id, wire.sale, clientSaleId)
      if (mode === "lostAfterCommit") throw new TypeError("Failed to fetch")
      if (mode === "inconclusiveAfterCommit") return new Response("<html>login do Wi-Fi</html>", { status: 200 })
      return this.json(200, { ok: true, replayed, venda })
    }
    if (method === "GET" && url.pathname === "/api/ops/vendas/by-client-sale-id") {
      this.verifyCalls += 1
      const venda = this.vendas.get(`${storeId}:${url.searchParams.get("clientSaleId")}`)
      return venda ? this.json(200, { ok: true, venda }) : this.json(404, { error: "Venda não encontrada" })
    }
    if (method === "GET" && url.pathname === "/api/vendas/" + encodeURIComponent(url.pathname.split("/").pop() ?? "")) {
      return this.json(404, { error: "não encontrada" })
    }
    if (url.pathname === "/api/ops/inventory") {
      if (url.searchParams.get("versionOnly") === "1") return this.json(200, { storeId, version: "v1" })
      return this.json(200, {
        items: [{ id: "p-1", dbId: "prod-1", name: "Pão sintético", price: 10, stock: this.stock.get("p-1") ?? 0, cost: 2, category: "Teste", sku: "P1" }],
        version: "v1",
        _lojaIdRecebido: storeId,
      })
    }
    if (url.pathname === "/api/ops/venda-persist/v2") return this.json(200, { writer: "v2" })
    if (url.pathname === "/api/ops/vendas-list") return this.json(200, { sales: [] })
    if (url.pathname === "/api/ops/credito-cliente") return this.json(200, { creditos: {} })
    if (url.pathname.startsWith("/api/ops/caixa")) {
      return this.json(200, { sessoes: [{ id: `sess-${storeId}`, storeId, terminalId: null, saldoInicial: 0, abertaEm: new Date().toISOString() }] })
    }
    return this.json(200, {})
  }
  fetch = (input: RequestInfo | URL, init?: RequestInit) => this.handle(String(input), init)
  vendasDe(storeId: string) {
    return [...this.vendas.values()].filter((v) => v.storeId === storeId)
  }
}

let server: ServerModel
let online = true
const runtimes = new Map<string, ReturnType<typeof useOperationsStore>>()
const ops = (store = STORE_A, slot = "main") => runtimes.get(`${store}:${slot}`)!

function Probe({ store, slot }: { store: string; slot: string }) {
  runtimes.set(`${store}:${slot}`, useOperationsStore())
  return null
}
function tree(store = STORE_A, slot = "main") {
  return createElement(OperationsProvider, { storageKey: keyOf(store) } as ComponentProps<typeof OperationsProvider>, createElement(Probe, { store, slot }))
}
function seed(store = STORE_A, extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    keyOf(store),
    JSON.stringify({
      sales: [], devolucoes: [], pendingCaixaOperations: [], orcamentos: [], customerCredits: {},
      caixa: { isOpen: true, saldoInicial: 0, dataAbertura: new Date().toISOString(), totalEntradas: 0, totalSaidas: 0 },
      caixaSessaoId: `sess-${store}`,
      ...extra,
    }),
  )
}
async function mount(store = STORE_A, slot = "main") {
  const view = render(tree(store, slot))
  await waitFor(() => expect(ops(store, slot)?.inventory.length ?? 0).toBeGreaterThan(0))
  await act(async () => {})
  return view
}
function setOnline(value: boolean) {
  online = value
  window.dispatchEvent(new Event(value ? "online" : "offline"))
}
const pbOf = (over: Partial<PaymentBreakdownFull>): Partial<PaymentBreakdownFull> => ({ dinheiro: 0, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0, ...over })
async function sell(store = STORE_A, slot = "main", pb: Partial<PaymentBreakdownFull> = { dinheiro: 10 }, extra: Record<string, unknown> = {}) {
  let result!: Awaited<ReturnType<ReturnType<typeof useOperationsStore>["finalizeSaleTransaction"]>>
  await act(async () => {
    result = await ops(store, slot).finalizeSaleTransaction({
      lines: [{ inventoryId: "p-1", produtoId: "prod-1", name: "Pão sintético", quantity: 1, unitPrice: 10 }],
      total: 10,
      paymentBreakdown: pbOf(pb),
      ...extra,
    })
  })
  return result
}
const stored = (store = STORE_A): SaleRecord[] => (JSON.parse(localStorage.getItem(keyOf(store)) ?? "{}") as { sales?: SaleRecord[] }).sales ?? []
const pendentes = (store = STORE_A, slot = "main") => ops(store, slot).sales.filter((s) => s.syncPending === true)
async function retry(id: string, store = STORE_A, slot = "main") {
  let r!: Awaited<ReturnType<ReturnType<typeof useOperationsStore>["retrySyncSale"]>>
  await act(async () => { r = await ops(store, slot).retrySyncSale(id) })
  return r
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  runtimes.clear()
  server = new ServerModel()
  online = true
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online })
  vi.stubGlobal("fetch", vi.fn(server.fetch))
  seed(STORE_A)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("online", () => {
  it("T01/T09/T10/T11 — venda online confirmada com prova; estoque e caixa uma vez", async () => {
    await mount()
    const r = await sell()
    expect(r).toMatchObject({ ok: true, pending: false, saleId: "VDA-OFF-1" })
    expect(server.vendasDe(STORE_A)).toHaveLength(1)
    expect(server.stock.get("p-1")).toBe(9)
    expect(server.cash).toHaveLength(1)
    expect(ops().sales[0]).toMatchObject({ id: "VDA-OFF-1", syncPending: false, syncLastAttemptSource: "finalize", syncLastAttemptOutcome: "CONFIRMADA" })
    expect(ops().sales[0].syncConfirmedAt).toBeTruthy()
  })

  it("T58 — 2xx sem a venda no corpo (portal Wi-Fi) NÃO vira sincronizada", async () => {
    await mount()
    server.modes.push("inconclusive")
    const r = await sell()
    expect(r).toMatchObject({ ok: true, pending: true })
    expect(server.vendas.size).toBe(0)
    expect(pendentes()[0]).toMatchObject({ syncBlockedCode: "RESPOSTA_INCONCLUSIVA", syncLastAttemptOutcome: "RESPOSTA_INCONCLUSIVA" })
  })

  it("T17 — 2xx inconclusivo DEPOIS do commit: a consulta pela clientSaleId prova e confirma, sem 2º POST", async () => {
    await mount()
    server.modes.push("inconclusiveAfterCommit")
    const r = await sell()
    expect(r).toMatchObject({ ok: true, pending: false })
    expect(server.posts).toHaveLength(1)
    expect(server.verifyCalls).toBe(1)
    expect(server.vendas.size).toBe(1)
  })

  it("T13 — duplo clique na finalização não duplica", async () => {
    await mount()
    let both!: unknown[]
    await act(async () => {
      const input = { lines: [{ inventoryId: "p-1", produtoId: "prod-1", name: "Pão sintético", quantity: 1, unitPrice: 10 }], total: 10, paymentBreakdown: pbOf({ dinheiro: 10 }) }
      both = await Promise.all([ops().finalizeSaleTransaction(input), ops().finalizeSaleTransaction(input)])
    })
    expect(both).toHaveLength(2)
    expect(server.posts).toHaveLength(1)
    expect(server.vendas.size).toBe(1)
    expect(ops().sales).toHaveLength(1)
  })
})

describe("offline — registro local, fila durável e sincronização automática", () => {
  it("T02/T04/T31/T32/T33/T05 — venda offline durável antes do 1º envio; sobrevive ao F5; volta da rede sincroniza sozinha", async () => {
    const view = await mount()
    setOnline(false)
    server.down = true
    const r = await sell()
    expect(r).toMatchObject({ ok: true, pending: true })
    // Persistida na hora (não só no próximo render): identidade + linhas + pagamento.
    const saved = stored().find((s) => s.syncPending === true)!
    expect(saved).toMatchObject({ registeredOffline: true, total: 10, lines: [expect.objectContaining({ inventoryId: "p-1", quantity: 1 })] })
    expect(saved.clientSaleId).toMatch(/^cs_/)
    expect(operatorSaleSyncView(pendentes()[0], { offline: true }).status).toBe("AGUARDANDO_CONEXAO")
    // "Fechar e reabrir o navegador" / reinício da aplicação: só o que está no armazenamento volta.
    view.unmount()
    runtimes.clear()
    await act(async () => {})
    server.down = false
    await mount()
    // Ainda offline para o navegador: nada sai.
    expect(server.posts).toHaveLength(0)
    expect(pendentes()).toHaveLength(1)
    expect(pendentes()[0].clientSaleId).toBe(saved.clientSaleId)
    await act(async () => { setOnline(true) })
    await waitFor(() => expect(pendentes()).toHaveLength(0))
    expect(server.vendasDe(STORE_A)).toHaveLength(1)
    expect(server.vendasDe(STORE_A)[0].clientSaleId).toBe(saved.clientSaleId)
    expect(server.stock.get("p-1")).toBe(9)
    expect(server.cash).toHaveLength(1)
  })

  it("T34 — vendas offline IDÊNTICAS em sequência (carrinho encerrado entre elas) são vendas distintas", async () => {
    await mount()
    setOnline(false)
    server.down = true
    const first = await sell()
    // Reconfirmação do MESMO carrinho ainda aberto: mesma identidade (proteção contra duplicar).
    const again = await sell()
    expect(again).toMatchObject({ ok: true, pending: true, clientSaleId: (first as { clientSaleId?: string }).clientSaleId })
    expect(pendentes()).toHaveLength(1)
    // Operador encerra o carrinho e registra o próximo cliente com o mesmo item.
    act(() => ops().releaseSaleAttempt?.({ id: (first as { saleId: string }).saleId, clientSaleId: (first as { clientSaleId?: string }).clientSaleId }))
    const second = await sell()
    act(() => ops().releaseSaleAttempt?.({ id: (second as { saleId: string }).saleId, clientSaleId: (second as { clientSaleId?: string }).clientSaleId }))
    const third = await sell()
    const ids = new Set([first, second, third].map((r) => (r as { clientSaleId?: string }).clientSaleId))
    expect(ids.size).toBe(3)
    expect(pendentes()).toHaveLength(3)
    expect(stored().filter((s) => s.syncPending === true)).toHaveLength(3)
    server.down = false
    await act(async () => { setOnline(true) })
    await waitFor(() => expect(pendentes()).toHaveLength(0))
    expect(server.vendasDe(STORE_A)).toHaveLength(3)
    expect(server.stock.get("p-1")).toBe(7)
    expect(server.cash).toHaveLength(3)
  })

  it("T34b — depois de recarregar a página, carrinho idêntico é venda nova (a pendente restaurada não absorve)", async () => {
    const view = await mount()
    setOnline(false)
    server.down = true
    await sell()
    view.unmount()
    runtimes.clear()
    // F5 offline: o catálogo da carga inicial vem do cache do service worker; escrita falha.
    server.down = false
    await mount()
    server.modes.push("network")
    await sell()
    expect(pendentes()).toHaveLength(2)
    expect(new Set(pendentes().map((s) => s.clientSaleId)).size).toBe(2)
  })

  it("T47/T48 — Pix e cartão offline ficam DECLARADOS (não confirmados); crédito/vale, a prazo e carnê são recusados sem gravar", async () => {
    await mount()
    setOnline(false)
    server.down = true
    const pix = await sell(STORE_A, "main", { pix: 10 })
    expect(pix).toMatchObject({ ok: true, pending: true })
    expect(pendentes()[0]).toMatchObject({ registeredOffline: true, syncPending: true })
    act(() => ops().releaseSaleAttempt?.({ id: (pix as { saleId: string }).saleId, clientSaleId: (pix as { clientSaleId?: string }).clientSaleId }))
    for (const pb of [{ creditoVale: 10 }, { aPrazo: 10 }, { carne: 10 }]) {
      const r = await sell(STORE_A, "main", pb, { customerCpf: "52998224725", customerName: "Cliente" })
      expect(r).toMatchObject({ ok: false })
      expect((r as { reason: string }).reason).toMatch(/não pode ser registrado offline/)
    }
    expect(ops().sales).toHaveLength(1)
  })

  it("T45/T59 — pendência intacta depois de mudança de catálogo e da volta da rede (sem reload)", async () => {
    await mount()
    setOnline(false)
    server.down = true
    await sell()
    server.down = false
    server.stock.set("p-1", 3)
    server.modes.push("network")
    await act(async () => { await ops().checkCatalog({ force: true }) })
    expect(pendentes()).toHaveLength(1)
    await act(async () => { setOnline(true) })
    await waitFor(() => expect(server.posts.length).toBeGreaterThan(0))
  })
})

describe("Reenviar manual — tentativa real, progresso e resultado autoritativo", () => {
  it("T56 — clique offline responde na hora, sem fetch, e grava o desfecho na venda", async () => {
    await mount()
    setOnline(false)
    server.down = true
    await sell()
    const calls = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    const r = await retry(pendentes()[0].clientSaleId!)
    expect(r).toMatchObject({ ok: false, code: "SEM_CONEXAO" })
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls)
    expect(pendentes()[0]).toMatchObject({ syncLastAttemptSource: "manual", syncLastAttemptOutcome: "SEM_CONEXAO" })
  })

  it("T55 — navegador 'online' mas servidor fora: verifica, não envia, explica", async () => {
    await mount()
    server.down = true
    await sell()
    const posts = server.posts.length
    const r = await retry(pendentes()[0].clientSaleId!)
    expect(r.ok).toBe(false)
    expect((r as { reason: string }).reason).toMatch(/Nada foi enviado/)
    expect(server.posts.length).toBe(posts)
    expect(pendentes()[0].syncLastAttemptOutcome).toBe("SEM_CONEXAO")
    expect(ops().syncConnectivity).toBe("servidor_inacessivel")
  })

  it("T06/T07/T08/T16 — resposta perdida DEPOIS do commit: Reenviar acha a venda e reconcilia sem 2º POST", async () => {
    await mount()
    server.modes.push("lostAfterCommit")
    const r0 = await sell()
    expect(r0).toMatchObject({ ok: true, pending: true })
    expect(server.vendas.size).toBe(1)
    const r = await retry(pendentes()[0].clientSaleId!)
    expect(r).toEqual({ ok: true, reconciled: true, pedidoId: "VDA-OFF-1" })
    expect(server.posts).toHaveLength(1)
    expect(server.vendas.size).toBe(1)
    expect(server.cash).toHaveLength(1)
    expect(ops().sales[0]).toMatchObject({ syncPending: false, syncLastAttemptOutcome: "JA_EXISTIA_NO_SERVIDOR", syncLastAttemptSource: "manual" })
    expect(ops().saleSyncPhases ?? {}).toEqual({})
  })

  it("T12/T36 — 10 reenvios simultâneos e 10 seguidos da mesma identidade: uma venda, uma baixa, um caixa", async () => {
    await mount()
    server.down = true
    await sell()
    server.down = false
    const id = pendentes()[0].clientSaleId!
    let all!: unknown[]
    await act(async () => { all = await Promise.all(Array.from({ length: 10 }, () => ops().retrySyncSale(id))) })
    expect(all.filter((r) => (r as { ok: boolean }).ok).length).toBeGreaterThanOrEqual(1)
    for (let i = 0; i < 10; i += 1) {
      const r = await retry(id)
      expect(r).toMatchObject({ ok: false, code: "JA_CONFIRMADA" })
    }
    expect(server.vendas.size).toBe(1)
    expect(server.stock.get("p-1")).toBe(9)
    expect(server.cash).toHaveLength(1)
    expect(server.stockMoves).toHaveLength(1)
  })

  it("T15 — servidor pendurado: prazo estoura, venda fica pendente com SEM_RESPOSTA; Reenviar depois confirma uma vez", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await mount()
    server.modes.push("hang")
    let pending!: Promise<unknown>
    await act(async () => {
      pending = ops().finalizeSaleTransaction({ lines: [{ inventoryId: "p-1", produtoId: "prod-1", name: "Pão sintético", quantity: 1, unitPrice: 10 }], total: 10, paymentBreakdown: pbOf({ dinheiro: 10 }) })
      await Promise.resolve()
    })
    await act(async () => { vi.advanceTimersByTime(26_000) })
    const r = await act(async () => pending)
    expect(r).toMatchObject({ ok: true, pending: true })
    expect(pendentes()[0]).toMatchObject({ syncNetworkError: true, syncLastAttemptOutcome: "SEM_RESPOSTA" })
    vi.useRealTimers()
    const again = await retry(pendentes()[0].clientSaleId!)
    expect(again).toMatchObject({ ok: true })
    expect(server.vendas.size).toBe(1)
  })

  it("NAO_ENCONTRADA — venda que não está mais na fila é informada, não fingida", async () => {
    await mount()
    const r = await retry("cs_" + "f".repeat(32))
    expect(r).toMatchObject({ ok: false, code: "NAO_ENCONTRADA" })
  })
})

describe("erros transitórios, sessão e recusas de negócio", () => {
  it("T18 — 500 transitório: backoff segura o intervalo; a volta da rede tenta já e confirma", async () => {
    await mount()
    server.modes.push("http500")
    await sell()
    expect(pendentes()[0]).toMatchObject({ syncHttpStatus: 500, syncLastAttemptOutcome: "SERVIDOR_INDISPONIVEL" })
    const posts = server.posts.length
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")) })
    await waitFor(() => expect(server.posts.length).toBeGreaterThan(posts))
    await waitFor(() => expect(pendentes()).toHaveLength(0))
    expect(server.vendas.size).toBe(1)
  })

  it("T38 — sessão expirada (401): preserva a venda como AUTH_REQUIRED e volta a enviar quando houver sessão", async () => {
    await mount()
    server.modes.push("http401")
    await sell()
    expect(pendentes()[0]).toMatchObject({ syncBlockedCode: "AUTH_REQUIRED", syncLastAttemptOutcome: "SESSAO_EXPIRADA" })
    await act(async () => { setOnline(true) })
    await waitFor(() => expect(pendentes()).toHaveLength(0))
    expect(server.vendas.size).toBe(1)
  })

  it("T19/T57/T23/T25/T26/T27/T28/T29 — recusa de negócio na pendência não entra em loop automático", async () => {
    const codes = [
      "PRODUTO_NAO_RESOLVIDO", "ESTOQUE_INSUFICIENTE", "STOCK_INVARIANT_DRIFT", "CAIXA_ORIGINAL_FECHADO", "SESSAO_INVALIDA",
      "PAGAMENTOS_TOTAL_DIVERGENTE", "CREDITO_VALE_INSUFICIENTE", "IDEMPOTENCY_KEY_REUSED",
    ]
    await mount()
    for (const code of codes) {
      server.down = true
      const r = await sell()
      server.down = false
      server.modes.push({ status: 409, body: { error: `recusa ${code}`, code } })
      const id = (r as { clientSaleId: string }).clientSaleId
      const res = await retry(id)
      expect(res).toMatchObject({ ok: false, code })
      act(() => ops().releaseSaleAttempt?.({ id: (r as { saleId: string }).saleId, clientSaleId: id }))
    }
    const posts = server.posts.length
    for (let i = 0; i < 3; i += 1) await act(async () => { setOnline(true) })
    await act(async () => { await new Promise((done) => setTimeout(done, 50)) })
    expect(server.posts.length).toBe(posts)
    expect(server.vendas.size).toBe(0)
    expect(pendentes()).toHaveLength(codes.length)
    for (const s of pendentes()) expect(["REJEITADA", "EXIGE_CORRECAO"]).toContain(operatorSaleSyncView(s, {}).status)
    // Retroativo é ação manual explícita e só ela envia allowClosedOriginalSession.
    expect(server.posts.some((p) => p.retroactive)).toBe(false)
    const fechada = pendentes().find((s) => s.syncBlockedCode === "CAIXA_ORIGINAL_FECHADO")!
    await act(async () => { await ops().retrySyncSaleRetroactive(fechada.clientSaleId!) })
    expect(server.posts.filter((p) => p.retroactive)).toHaveLength(1)
  })

  it("T54 — recusa definitiva na finalização descarta a tentativa e ela não ressuscita depois do F5", async () => {
    const view = await mount()
    server.modes.push({ status: 409, body: { error: "Produto não resolvido", code: "PRODUTO_NAO_RESOLVIDO", inventoryIds: ["p-1"] } })
    const r = await sell()
    expect(r).toMatchObject({ ok: false })
    expect(ops().sales).toHaveLength(0)
    view.unmount()
    runtimes.clear()
    await mount()
    expect(ops().sales).toHaveLength(0)
    expect(stored()).toHaveLength(0)
  })
})

describe("fila mista e concorrência manual × automático", () => {
  it("T35 — fila com aprovadas e recusada: cada uma no seu estado, a recusada não some nem entra em loop", async () => {
    await mount()
    setOnline(false)
    server.down = true
    const ids: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const r = await sell()
      ids.push((r as { clientSaleId: string }).clientSaleId)
      act(() => ops().releaseSaleAttempt?.({ id: (r as { saleId: string }).saleId, clientSaleId: ids[i] }))
    }
    server.down = false
    server.rejectFor.set(ids[1], { status: 409, body: { error: "Estoque insuficiente", code: "ESTOQUE_INSUFICIENTE" } })
    await act(async () => { setOnline(true) })
    await waitFor(() => expect(pendentes()).toHaveLength(1))
    expect(pendentes()[0]).toMatchObject({ clientSaleId: ids[1], syncBlockedCode: "ESTOQUE_INSUFICIENTE" })
    expect(operatorSaleSyncView(pendentes()[0], {}).status).toBe("REJEITADA")
    expect(server.vendasDe(STORE_A)).toHaveLength(2)
    const posts = server.posts.length
    await act(async () => { setOnline(true) })
    await act(async () => { await new Promise((done) => setTimeout(done, 50)) })
    expect(server.posts.length).toBe(posts)
    expect(stored().filter((s) => s.syncPending === true).map((s) => s.clientSaleId)).toEqual([ids[1]])
  })

  it("T36 — Reenviar manual durante o envio automático em voo: junta-se a ele, um único POST", async () => {
    await mount()
    setOnline(false)
    server.down = true
    await sell()
    const id = pendentes()[0].clientSaleId!
    server.down = false
    server.pauseNext = true
    await act(async () => { setOnline(true) })
    await waitFor(() => expect(server.paused).toHaveLength(1))
    expect(ops().saleSyncPhases?.[id]).toBe("enviando")
    let manual!: Promise<unknown>
    await act(async () => { manual = ops().retrySyncSale(id) })
    await act(async () => { server.paused.shift()?.() })
    const r = await act(async () => manual)
    expect((r as { ok: boolean }).ok).toBe(true)
    expect(server.posts).toHaveLength(1)
    expect(server.vendas.size).toBe(1)
    await waitFor(() => expect(ops().saleSyncPhases ?? {}).toEqual({}))
  })
})

describe("abas, lojas e armazenamento local", () => {
  it("T14/T44 — duas abas: a fila de uma não é sobrescrita pela outra; ambas reenviam e o servidor guarda UMA venda", async () => {
    await mount(STORE_A, "tab1")
    await mount(STORE_A, "tab2")
    setOnline(false)
    server.down = true
    await sell(STORE_A, "tab1")
    const cs = pendentes(STORE_A, "tab1")[0].clientSaleId
    // A aba 2 grava o estado dela (qualquer mudança) — sem conhecer a venda da aba 1.
    await act(async () => { ops(STORE_A, "tab2").setCaixaSessaoId(`sess-${STORE_A}`) })
    await act(async () => { ops(STORE_A, "tab2").setOrcamentos([]) })
    expect(stored().some((s) => s.clientSaleId === cs && s.syncPending === true)).toBe(true)
    // Evento de storage (outra aba) faz a aba 2 conhecer a pendência.
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: keyOf(STORE_A), newValue: localStorage.getItem(keyOf(STORE_A)) })) })
    await waitFor(() => expect(pendentes(STORE_A, "tab2").some((s) => s.clientSaleId === cs)).toBe(true))
    server.down = false
    await act(async () => { setOnline(true) })
    await waitFor(() => expect(pendentes(STORE_A, "tab1")).toHaveLength(0))
    await waitFor(() => expect(pendentes(STORE_A, "tab2")).toHaveLength(0))
    expect(server.vendas.size).toBe(1)
    expect(server.stock.get("p-1")).toBe(9)
    expect(server.cash).toHaveLength(1)
  })

  it("REV-P0 — recusa definitiva na aba A tira da aba B a pendência que ela adotou; B nunca a envia nem regrava", async () => {
    await mount(STORE_A, "tab1")
    await mount(STORE_A, "tab2")
    server.pauseNext = true
    let finalizing!: Promise<unknown>
    await act(async () => {
      finalizing = ops(STORE_A, "tab1").finalizeSaleTransaction({ lines: [{ inventoryId: "p-1", produtoId: "prod-1", name: "Pão sintético", quantity: 1, unitPrice: 10 }], total: 10, paymentBreakdown: pbOf({ dinheiro: 10 }) })
    })
    await waitFor(() => expect(server.paused).toHaveLength(1))
    // A gravação durável aconteceu antes do POST: a aba 2 adota pela notificação de storage.
    const cs = stored().find((s) => s.syncPending === true)!.clientSaleId!
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: keyOf(STORE_A), newValue: localStorage.getItem(keyOf(STORE_A)) })) })
    await waitFor(() => expect(pendentes(STORE_A, "tab2").some((s) => s.clientSaleId === cs)).toBe(true))
    server.rejectFor.set(cs, { status: 409, body: { error: "Produto não resolvido", code: "PRODUTO_NAO_RESOLVIDO", inventoryIds: ["p-1"] } })
    await act(async () => { server.paused.shift()?.() })
    expect(await act(async () => finalizing)).toMatchObject({ ok: false })
    expect(ops(STORE_A, "tab1").sales.some((s) => s.clientSaleId === cs)).toBe(false)
    // A lápide chega na aba 2 (evento de storage da chave de lápides).
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: `omnigestao:pdv-sale-tombstones:${STORE_A}`, newValue: "{}" })) })
    await waitFor(() => expect(ops(STORE_A, "tab2").sales.some((s) => s.clientSaleId === cs)).toBe(false))
    const posts = server.posts.length
    await act(async () => { setOnline(true) })
    await act(async () => { await new Promise((done) => setTimeout(done, 50)) })
    expect(server.posts.slice(posts).some((p) => p.clientSaleId === cs)).toBe(false)
    expect(stored().some((s) => s.clientSaleId === cs)).toBe(false)
    expect(server.vendas.size).toBe(0)
  })

  it("REV-P1 — evento de storage sem novidade não re-renderiza nem regrava (abas convergem)", async () => {
    await mount(STORE_A, "tab1")
    setOnline(false)
    server.down = true
    await sell(STORE_A, "tab1")
    await act(async () => {})
    const spy = vi.spyOn(Storage.prototype, "setItem")
    const before = spy.mock.calls.filter(([k]) => k === keyOf(STORE_A)).length
    for (let i = 0; i < 5; i += 1) {
      await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: keyOf(STORE_A), newValue: localStorage.getItem(keyOf(STORE_A)) })) })
    }
    expect(spy.mock.calls.filter(([k]) => k === keyOf(STORE_A)).length).toBe(before)
  })

  it("REV-P2-7 — depois do F5, carrinho idêntico a uma venda com resultado DESCONHECIDO é barrado até verificar", async () => {
    const view = await mount()
    server.modes.push("lostAfterCommit")
    await sell()
    expect(pendentes()[0]).toMatchObject({ syncResultUnknown: true })
    view.unmount()
    runtimes.clear()
    // O reenvio automático da montagem também fica sem resposta: a dúvida continua.
    const posts = server.posts.length
    server.modes.push("network")
    await mount()
    await waitFor(() => expect(server.posts.length).toBe(posts + 1))
    await act(async () => {})
    expect(pendentes()[0]).toMatchObject({ syncResultUnknown: true })
    const r = await sell()
    expect(r).toMatchObject({ ok: false })
    expect((r as { reason: string }).reason).toMatch(/pode já estar gravada/)
    expect(r).toMatchObject({ code: "VENDA_IDENTICA_RESULTADO_DESCONHECIDO" })
    expect(ops().unknownTwinPrompt).toMatchObject({ clientSaleId: pendentes()[0].clientSaleId })
    expect(server.vendas.size).toBe(1)
    // O Reenviar verifica e reconcilia; só então um carrinho igual vira venda nova.
    const again = await retry(pendentes()[0].clientSaleId!)
    expect(again).toMatchObject({ ok: true, reconciled: true })
    server.modes.length = 0
    expect(await sell()).toMatchObject({ ok: true, pending: false })
    expect(server.vendas.size).toBe(2)
  })

  it("REV3 — 'É outra venda' só com decisão EXPLÍCITA: repetir não libera; a escolha libera identidade nova e preserva a anterior", async () => {
    const view = await mount()
    server.modes.push("lostAfterCommit")
    await sell()
    view.unmount()
    runtimes.clear()
    server.modes.push("network")
    await mount()
    await waitFor(() => expect(server.posts.length).toBe(2))
    await act(async () => {})
    server.down = true
    const anterior = pendentes()[0]
    const aviso = await sell()
    expect(aviso).toMatchObject({ ok: false, code: "VENDA_IDENTICA_RESULTADO_DESCONHECIDO" })
    // Repetir a finalização (reflexo) NÃO é confirmação: continua barrada.
    expect(await sell()).toMatchObject({ ok: false, code: "VENDA_IDENTICA_RESULTADO_DESCONHECIDO" })
    expect(pendentes()).toHaveLength(1)
    // "Voltar" não decide nada.
    await act(async () => { await ops().resolveUnknownTwin?.("cancelar") })
    expect(ops().unknownTwinPrompt).toBeNull()
    expect(await sell()).toMatchObject({ ok: false })
    // Decisão explícita: é outro cliente.
    await act(async () => { await ops().resolveUnknownTwin?.("outra") })
    const outra = await sell()
    expect(outra).toMatchObject({ ok: true, pending: true })
    expect(new Set(pendentes().map((s) => s.clientSaleId)).size).toBe(2)
    // A anterior segue na fila com a MESMA identidade e o mesmo estado de dúvida.
    expect(pendentes().find((s) => s.clientSaleId === anterior.clientSaleId)).toMatchObject({ syncResultUnknown: true })
    expect(stored().filter((s) => s.syncPending === true)).toHaveLength(2)
  })

  it("REV2-P2 — rede cai DEPOIS do envio: o desfecho é desconhecido (não 'nada foi enviado')", async () => {
    await mount()
    const original = server.handle.bind(server)
    server.handle = async (raw, init) => {
      if ((init?.method ?? "GET") === "POST" && raw.includes("/venda-persist")) {
        const res = await original(raw, init)
        online = false
        void res
        throw new TypeError("Failed to fetch")
      }
      return original(raw, init)
    }
    await sell()
    expect(server.vendas.size).toBe(1)
    expect(pendentes()[0]).toMatchObject({ syncLastAttemptOutcome: "SEM_RESPOSTA", syncResultUnknown: true })
    expect(operatorSaleSyncView(pendentes()[0], { offline: true }).serverHasSale).toBe("desconhecido")
  })

  it("T30/T43 — loja B nunca envia a pendência da loja A", async () => {
    seed(STORE_A, { sales: [{ id: "PEND-x", clientSaleId: "cs_" + "a".repeat(32), at: new Date().toISOString(), total: 10, lines: [{ inventoryId: "p-1", name: "Pão", quantity: 1, unitPrice: 10, lineTotal: 10 }], paymentBreakdown: pbOf({ dinheiro: 10 }), syncPending: true }] })
    seed(STORE_B)
    await mount(STORE_B)
    await act(async () => { setOnline(true) })
    await act(async () => { await new Promise((done) => setTimeout(done, 50)) })
    expect(server.posts.every((p) => p.storeId === STORE_B)).toBe(true)
    expect(server.posts.some((p) => p.clientSaleId === "cs_" + "a".repeat(32))).toBe(false)
    expect(stored(STORE_A)[0]).toMatchObject({ syncPending: true })
  })

  it("T39/T40 — quota esgotada: avisa, mantém na memória e recusa NOVA venda offline", async () => {
    await mount()
    setOnline(false)
    server.down = true
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === keyOf(STORE_A)) throw new DOMException("cheio", "QuotaExceededError")
      return original.call(this, key, value)
    })
    const first = await sell()
    expect(first).toMatchObject({ ok: true, pending: true })
    expect(ops().localQueueHealthy).toBe(false)
    act(() => ops().releaseSaleAttempt?.({ id: (first as { saleId: string }).saleId, clientSaleId: (first as { clientSaleId?: string }).clientSaleId }))
    const second = await sell()
    expect(second).toMatchObject({ ok: false })
    expect((second as { reason: string }).reason).toMatch(/armazenamento/)
    expect(pendentes()).toHaveLength(1)
  })

  it("T41 — fila corrompida vai para quarentena e a gravação volta a funcionar", async () => {
    localStorage.setItem(keyOf(STORE_A), "{isto não é json")
    await mount()
    expect(Object.keys(localStorage).some((k) => k.startsWith(`${keyOf(STORE_A)}:quarentena:`))).toBe(true)
    setOnline(false)
    server.down = true
    await sell()
    expect(stored().filter((s) => s.syncPending === true)).toHaveLength(1)
    expect(ops().localQueueHealthy).toBe(true)
  })

  it("T42 — pendência legada (sem clientSaleId, writer V1) é reenviada pelo V1 com a mesma identidade", async () => {
    seed(STORE_A, { sales: [{ id: "VDA-2026-0042", at: new Date().toISOString(), total: 10, lines: [{ inventoryId: "p-1", name: "Pão", quantity: 1, unitPrice: 10, lineTotal: 10 }], paymentBreakdown: pbOf({ dinheiro: 10 }), syncPending: true }] })
    await mount()
    await waitFor(() => expect(pendentes()).toHaveLength(0))
    expect(server.posts[0]).toMatchObject({ path: "/api/ops/venda-persist", pedidoId: "VDA-2026-0042" })
    expect(server.vendas.size).toBe(1)
  })

  it("T60 — toda pendência fica explicitamente classificada", async () => {
    await mount()
    server.down = true
    await sell()
    for (const s of pendentes()) {
      expect(["REGISTRADA_LOCALMENTE", "AGUARDANDO_CONEXAO", "REJEITADA", "EXIGE_CORRECAO", "QUARENTENA"]).toContain(operatorSaleSyncView(s, {}).status)
    }
  })
})
