// @vitest-environment jsdom
/**
 * OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001 — `comercial` (retroativa/brindes) atravessa o
 * OperationsProvider REAL: `finalizeSaleTransaction(..., comercial)` → `SaleRecord.comercial` →
 * `body.sale.comercial` (V2), inclusive no reenvio da fila offline. Venda sem `comercial` mantém o
 * corpo de antes. Recusa da validação comercial (4xx antes da transação) é FAILED com a mensagem do
 * servidor, nunca PENDING congelado. Só a rede é sintética.
 */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperationsProvider, useOperationsStore, type SaleComercialRequest } from "@/lib/operations-store"
import type { SaleRecord } from "@/lib/operations-sale-types"

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => null }))
vi.mock("@/lib/automation/automation-engine", () => ({ initAutomationEngineClient: () => {} }))

const STORE = "loja-comercial-a"
const KEY = `assistec-pro-ops-v1-${STORE}`
const ORIGIN = "http://localhost"

type Wire = { sale: SaleRecord & { comercial?: unknown }; clientSaleId?: string }

class ServerModel {
  down = false
  posts: Wire[] = []
  next: Array<{ status: number; body: Record<string, unknown> }> = []
  private seq = 0
  private vendas = new Map<string, Record<string, unknown>>()
  private json(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }
  async handle(raw: string, init?: RequestInit): Promise<Response> {
    const url = new URL(raw, ORIGIN)
    const method = init?.method ?? "GET"
    if (this.down) throw new TypeError("Failed to fetch")
    const storeId = url.searchParams.get("storeId") ?? url.searchParams.get("lojaId") ?? ""
    if (method === "POST" && (url.pathname === "/api/ops/venda-persist/v2" || url.pathname === "/api/ops/venda-persist")) {
      const wire = JSON.parse(String(init?.body ?? "null")) as Wire
      this.posts.push(wire)
      const forced = this.next.shift()
      if (forced) return this.json(forced.status, forced.body)
      const clientSaleId = wire.clientSaleId ?? null
      const k = `${storeId}:${clientSaleId ?? wire.sale.id}`
      let venda = this.vendas.get(k)
      const replayed = !!venda
      if (!venda) {
        this.seq += 1
        venda = { id: `srv-${this.seq}`, pedidoId: `VDA-COM-${this.seq}`, storeId, clientSaleId, total: wire.sale.total, at: wire.sale.at, status: "concluida" }
        this.vendas.set(k, venda)
      }
      return this.json(200, { ok: true, replayed, venda })
    }
    if (method === "GET" && url.pathname === "/api/ops/vendas/by-client-sale-id") {
      const venda = this.vendas.get(`${storeId}:${url.searchParams.get("clientSaleId")}`)
      return venda ? this.json(200, { ok: true, venda }) : this.json(404, { error: "Venda não encontrada" })
    }
    if (url.pathname === "/api/ops/inventory") {
      if (url.searchParams.get("versionOnly") === "1") return this.json(200, { storeId, version: "v1" })
      return this.json(200, {
        items: [{ id: "p-1", dbId: "prod-1", name: "Capinha", price: 10, stock: 10, cost: 2, category: "Teste", sku: "P1" }],
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
}

let server: ServerModel
let online = true
const runtimes = new Map<string, ReturnType<typeof useOperationsStore>>()
const ops = () => runtimes.get("main")!

function Probe() {
  runtimes.set("main", useOperationsStore())
  return null
}
async function mount() {
  const view = render(createElement(OperationsProvider, { storageKey: KEY } as ComponentProps<typeof OperationsProvider>, createElement(Probe)))
  await waitFor(() => expect(runtimes.get("main")?.inventory.length ?? 0).toBeGreaterThan(0))
  await act(async () => {})
  return view
}
function setOnline(value: boolean) {
  online = value
  window.dispatchEvent(new Event(value ? "online" : "offline"))
}

const COMERCIAL: SaleComercialRequest = {
  retroativa: { modo: "pagamento_hoje", dataEfetivaVenda: "2026-11-20", justificativa: "Venda anotada no papel" },
  brindes: [{ lineIndex: 1, motivo: "cortesia" }],
}

async function sell(comercial?: SaleComercialRequest) {
  let result!: Awaited<ReturnType<ReturnType<typeof useOperationsStore>["finalizeSaleTransaction"]>>
  await act(async () => {
    result = await ops().finalizeSaleTransaction({
      lines: [
        { inventoryId: "p-1", produtoId: "prod-1", name: "Capinha", quantity: 1, unitPrice: 10 },
        { inventoryId: "p-1", produtoId: "prod-1", name: "Capinha", quantity: 1, unitPrice: 0 },
      ],
      total: 10,
      paymentBreakdown: { dinheiro: 10, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 },
      ...(comercial ? { comercial } : {}),
    })
  })
  return result
}
const stored = (): Array<SaleRecord & { comercial?: unknown }> =>
  (JSON.parse(localStorage.getItem(KEY) ?? "{}") as { sales?: SaleRecord[] }).sales ?? []

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  runtimes.clear()
  server = new ServerModel()
  online = true
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online })
  vi.stubGlobal("fetch", vi.fn(server.fetch))
  localStorage.setItem(KEY, JSON.stringify({
    sales: [], devolucoes: [], pendingCaixaOperations: [], orcamentos: [], customerCredits: {},
    caixa: { isOpen: true, saldoInicial: 0, dataAbertura: new Date().toISOString(), totalEntradas: 0, totalSaidas: 0 },
    caixaSessaoId: `sess-${STORE}`,
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("comercial na finalização", () => {
  it("venda comum: o corpo não ganha `comercial`", async () => {
    await mount()
    expect(await sell()).toMatchObject({ ok: true, pending: false })
    expect(server.posts).toHaveLength(1)
    expect("comercial" in server.posts[0].sale).toBe(false)
  })

  it("retroativa + brinde viajam em body.sale.comercial e no SaleRecord", async () => {
    await mount()
    expect(await sell(COMERCIAL)).toMatchObject({ ok: true, pending: false })
    expect(server.posts[0].sale.comercial).toEqual(COMERCIAL)
    expect((ops().sales[0] as SaleRecord & { comercial?: unknown }).comercial).toEqual(COMERCIAL)
  })

  it("fila offline: a pendência guarda `comercial` e o reenvio manda o mesmo objeto", async () => {
    await mount()
    setOnline(false)
    server.down = true
    expect(await sell(COMERCIAL)).toMatchObject({ ok: true, pending: true })
    expect(stored().find((s) => s.syncPending === true)?.comercial).toEqual(COMERCIAL)
    server.down = false
    await act(async () => { setOnline(true) })
    await waitFor(() => expect(ops().sales.filter((s) => s.syncPending === true)).toHaveLength(0))
    const enviado = server.posts.at(-1)!
    expect(enviado.sale.comercial).toEqual(COMERCIAL)
  })

  it("recusa comercial (422) é FAILED com a mensagem do servidor — nada fica pendente", async () => {
    await mount()
    server.next.push({ status: 422, body: { error: "A loja permite registrar vendas de até 7 dias atrás.", code: "RETROATIVA_FORA_DO_LIMITE" } })
    const r = await sell(COMERCIAL)
    expect(r.ok).toBe(false)
    expect((r as { reason: string }).reason).toContain("até 7 dias atrás")
    expect(ops().sales.filter((s) => s.syncPending === true)).toHaveLength(0)
    expect(stored().filter((s) => s.syncPending === true)).toHaveLength(0)
  })

  it("recusa estrutural é definitiva; contextual (dia/permissão/flag) só encerra a finalização ao vivo de identidade nova", async () => {
    const { classifySaleAttemptOutcome, finalizeFailureDisposition } = await import("@/lib/vendas/pending-sync-classification")
    // Estrutural: depende só do conteúdo — reenvio repetiria a recusa.
    expect(classifySaleAttemptOutcome({ ok: false, code: "BRINDE_COM_PRECO", httpStatus: 422 })).toBe("REJECTED")
    // Contextual: no reenvio automático NÃO vira "recusada" (a venda pode já ter sido gravada) — revisão P1-2.
    expect(classifySaleAttemptOutcome({ ok: false, code: "RETROATIVA_FORA_DO_LIMITE", httpStatus: 422 })).toBe("ACTION_REQUIRED")
    expect(classifySaleAttemptOutcome({ ok: false, code: "RETROATIVA_SEM_PERMISSAO", httpStatus: 403 })).toBe("ACTION_REQUIRED")
    // Finalização ao vivo de identidade criada agora: nada pode ter sido gravado → FAILED com a mensagem.
    expect(finalizeFailureDisposition({ code: "RETROATIVA_FORA_DO_LIMITE", httpStatus: 422, reusedIdentity: false })).toBe("FAILED")
    expect(finalizeFailureDisposition({ code: "RETROATIVA_FORA_DO_LIMITE", httpStatus: 422, reusedIdentity: true })).toBe("PENDING")
    // 5xx/rede continuam DESCONHECIDOS: a mesma identidade pode tentar de novo.
    expect(classifySaleAttemptOutcome({ ok: false, code: "RETROATIVA_FORA_DO_LIMITE", httpStatus: 503 })).toBe("UNKNOWN")
    expect(finalizeFailureDisposition({ code: "RETROATIVA_FORA_DO_LIMITE", httpStatus: 503, reusedIdentity: false })).toBe("PENDING")
  })
})
