// @vitest-environment jsdom
/**
 * PDV-F8-FINALIZACAO-COMPLETA-001 — OperationsProvider REAL com a fila de devoluções:
 * AGUARDANDO_VENDA_ORIGEM explícito, parada da retentativa no bloqueio persistente,
 * retomada controlada, encaminhamento supervisionado (desfaz só o estado local) e o
 * espelho de devolução confirmada com linhas repetidas e SKU reutilizado.
 * Só a rede é sintética; nenhum banco, .env ou credencial.
 */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperationsProvider, useOperationsStore } from "@/lib/operations-store"
import type { DevolucaoRecord, SaleRecord } from "@/lib/operations-sale-types"

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => null }))
vi.mock("@/lib/automation/automation-engine", () => ({ initAutomationEngineClient: () => {} }))

const STORE = "loja-fila-dev"
const KEY = `assistec-pro-ops-v1-${STORE}`
const CPF = "52998224725"

const net = vi.hoisted(() => ({
  devPosts: [] as Array<Record<string, unknown>>,
  devResponse: { status: 409, body: { code: "VENDA_ORIGEM_NAO_ENCONTRADA", error: "venda ainda não está no servidor" } as Record<string, unknown> },
}))

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), "http://localhost")
  const method = init?.method ?? "GET"
  if (url.pathname === "/api/ops/devolucao" && method === "POST") {
    net.devPosts.push(JSON.parse(String(init?.body)))
    return json(net.devResponse.status, net.devResponse.body)
  }
  if (url.pathname === "/api/ops/inventory") {
    if (url.searchParams.get("versionOnly") === "1") return json(200, { storeId: STORE, version: "v1" })
    return json(200, {
      items: [
        { id: "CAM-P", dbId: "prod-B", name: "Meia (herdou o SKU)", price: 5, stock: 10, cost: 1, category: "T", sku: "CAM-P" },
        { id: "CAM-P-OLD", dbId: "prod-A", name: "Camiseta P", price: 10, stock: 10, cost: 1, category: "T", sku: "CAM-P-OLD" },
      ],
      version: "v1",
    })
  }
  if (url.pathname === "/api/ops/venda-persist/v2") return json(200, { writer: "v2" })
  if (url.pathname === "/api/ops/vendas-list") return json(200, { sales: [] })
  if (url.pathname === "/api/ops/credito-cliente") return json(200, { creditos: {} })
  if (url.pathname.startsWith("/api/ops/caixa")) return json(200, { sessoes: [] })
  return json(200, {})
}

const runtime = new Map<string, ReturnType<typeof useOperationsStore>>()
const rt = () => runtime.get("ops")!
function Probe() {
  runtime.set("ops", useOperationsStore())
  return null
}

const venda: SaleRecord = {
  id: "VDA-LOCAL-1",
  at: "2026-11-04T09:00:00.000Z",
  total: 20,
  paymentBreakdown: { dinheiro: 20, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 },
  customerCpf: CPF,
  customerName: "Cliente Sintético",
  syncPending: false,
  lines: [
    { inventoryId: "CAM-P", name: "Camiseta P", quantity: 1, unitPrice: 10, lineTotal: 10, qtyReturned: 1 },
    { inventoryId: "CAM-P", name: "Camiseta P", quantity: 1, unitPrice: 10, lineTotal: 10, qtyReturned: 0 },
  ],
}

function devPendente(over: Partial<DevolucaoRecord> = {}): DevolucaoRecord {
  return {
    id: "DEV-2026-0001-AAAAAAAA",
    at: "2026-11-04T09:30:00.000Z",
    saleId: venda.id,
    customerCpf: CPF,
    customerName: "Cliente Sintético",
    lines: [{ inventoryId: "CAM-P", name: "Camiseta P", quantity: 1, valor: 10 }],
    mode: "vale_credito",
    creditIssued: 10,
    syncPending: true,
    tipo: "vale_credito",
    ...over,
  }
}

function seed(devolucoes: DevolucaoRecord[], sales: SaleRecord[] = [venda]) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      sales, devolucoes, pendingCaixaOperations: [], orcamentos: [],
      customerCredits: { [CPF]: { nome: "Cliente Sintético", saldo: 10 } },
      caixa: { isOpen: true, saldoInicial: 0, dataAbertura: new Date().toISOString(), totalEntradas: 0, totalSaidas: 0 },
    }),
  )
}

async function mount() {
  render(createElement(OperationsProvider, { storageKey: KEY } as ComponentProps<typeof OperationsProvider>, createElement(Probe)))
  await waitFor(() => expect(runtime.get("ops")?.inventory.length ?? 0).toBeGreaterThan(0))
  await act(async () => {})
}
const dev = () => rt().devolucoes.find((d) => d.id === "DEV-2026-0001-AAAAAAAA")!
const flush = async () => {
  await act(async () => { window.dispatchEvent(new Event("online")) })
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
}

beforeEach(() => {
  localStorage.clear()
  runtime.clear()
  sessionStorage.clear()
  net.devPosts.length = 0
  net.devResponse = { status: 409, body: { code: "VENDA_ORIGEM_NAO_ENCONTRADA", error: "venda ainda não está no servidor" } }
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true })
  vi.stubGlobal("fetch", vi.fn(fakeFetch))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("fila de devoluções — venda de origem ausente", () => {
  it("marca AGUARDANDO_VENDA_ORIGEM, conta tentativas e mantém o vale local enquanto espera", async () => {
    seed([devPendente()])
    await mount()
    await waitFor(() => expect(dev().syncWaitingCode).toBe("AGUARDANDO_VENDA_ORIGEM"))
    expect(dev().syncAttempts).toBeGreaterThanOrEqual(1)
    expect(dev().syncWaitingSince).toBeTruthy()
    expect(dev().syncPending).toBe(true)
    expect(dev().syncBlocked).toBeFalsy()
    expect(rt().customerCredits[CPF]!.saldo).toBe(10)
  })

  it("passado o limite vira BLOQUEIO PERSISTENTE: a retentativa automática PARA; retomada manual reenvia uma vez com o mesmo localId", async () => {
    const velho = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    seed([devPendente({ syncWaitingCode: "AGUARDANDO_VENDA_ORIGEM", syncWaitingSince: velho, syncAttempts: 4 })])
    await mount()
    await waitFor(() => expect(dev().syncBlocked).toBe(true))
    const posts = net.devPosts.length
    await flush()
    await flush()
    expect(net.devPosts.length).toBe(posts) // bloqueada não é reenviada sozinha

    await act(async () => { rt().retomarDevolucaoPendente("DEV-2026-0001-AAAAAAAA") })
    await waitFor(() => expect(net.devPosts.length).toBe(posts + 1))
    expect(net.devPosts.at(-1)).toMatchObject({ localId: "DEV-2026-0001-AAAAAAAA", vendaLocalId: venda.id })
    expect(dev().syncBlocked).toBeFalsy() // nova janela: 1 tentativa, não bloqueia de novo de imediato
    expect(dev().syncAttempts).toBe(1)
  })

  it("venda chegou: a retomada confirma e limpa o estado de espera", async () => {
    seed([devPendente({ syncWaitingCode: "AGUARDANDO_VENDA_ORIGEM", syncWaitingSince: new Date().toISOString(), syncAttempts: 6, syncBlocked: true })])
    await mount()
    net.devResponse = { status: 200, body: { ok: true, localId: "DEV-2026-0001-AAAAAAAA" } }
    await act(async () => { rt().retomarDevolucaoPendente("DEV-2026-0001-AAAAAAAA") })
    await waitFor(() => expect(dev().syncPending).toBe(false))
    expect(dev().syncWaitingCode).toBeUndefined()
    expect(dev().syncBlocked).toBeUndefined()
    expect(rt().customerCredits[CPF]!.saldo).toBe(10) // confirmado: vale permanece
  })

  it("encaminhamento supervisionado: sai da fila, desfaz vale/estoque/devolvido LOCAIS e guarda a evidência", async () => {
    seed([devPendente({ syncWaitingCode: "AGUARDANDO_VENDA_ORIGEM", syncWaitingSince: new Date().toISOString(), syncBlocked: true })])
    await mount()
    const estoqueAntes = rt().inventory.find((i) => i.id === "CAM-P")!.stock
    await act(async () => {
      rt().registrarEncaminhamentoDevolucao("DEV-2026-0001-AAAAAAAA", { ref: "AUD-1", at: "2026-11-04T12:00:00.000Z", operador: "Supervisor", categoria: "VALE_EMITIDO", valorDeclarado: 10 })
    })
    expect(dev()).toMatchObject({ syncPending: false, conciliacao: { ref: "AUD-1" } })
    expect(dev().lines).toHaveLength(1) // evidência preservada
    expect(rt().customerCredits[CPF]!.saldo).toBe(0)
    expect(rt().inventory.find((i) => i.id === "CAM-P")!.stock).toBe(estoqueAntes - 1)
    expect(rt().sales[0]!.lines.map((l) => l.qtyReturned ?? 0)).toEqual([0, 0])
    // Segundo encaminhamento é no-op (sem estorno em dobro) e a fila não reenvia.
    await act(async () => {
      rt().registrarEncaminhamentoDevolucao("DEV-2026-0001-AAAAAAAA", { ref: "AUD-2", at: "x", operador: "x", categoria: "VALE_EMITIDO", valorDeclarado: 10 })
    })
    expect(dev().conciliacao!.ref).toBe("AUD-1")
    expect(rt().customerCredits[CPF]!.saldo).toBe(0)
    const posts = net.devPosts.length
    await flush()
    expect(net.devPosts.length).toBe(posts)
  })

  it("recusa ITEM_SEM_LASTRO_BLOQUEADO é definitiva: sai da fila e estorna o vale local", async () => {
    net.devResponse = { status: 409, body: { code: "ITEM_SEM_LASTRO_BLOQUEADO", error: "serviço sem política" } }
    seed([devPendente()])
    await mount()
    await waitFor(() => expect(dev().syncRejectedCode).toBe("ITEM_SEM_LASTRO_BLOQUEADO"))
    expect(dev().syncPending).toBe(false)
    expect(rt().customerCredits[CPF]!.saldo).toBe(0)
  })
})

describe("espelho de devolução confirmada pelo servidor", () => {
  it("linhas repetidas não contam em dobro e o estoque local segue o Produto.id (SKU reutilizado)", async () => {
    seed([], [{ ...venda, lines: venda.lines.map((l) => ({ ...l, qtyReturned: 0 })) }])
    await mount()
    const meia = rt().inventory.find((i) => i.id === "CAM-P")!.stock
    const camiseta = rt().inventory.find((i) => i.id === "CAM-P-OLD")!.stock
    let r!: ReturnType<ReturnType<typeof rt>["registrarDevolucao"]>
    await act(async () => {
      r = rt().registrarDevolucao({
        saleId: venda.id,
        lines: [{ inventoryId: "CAM-P", quantity: 2 }],
        mode: "vale_credito",
        customerCpf: CPF,
        customerName: "Cliente Sintético",
        tipo: "vale_credito",
        serverConfirmed: {
          localId: "DEV-2026-0009-BBBBBBBB",
          creditIssued: 20,
          lines: [{ inventoryId: "CAM-P", produtoId: "prod-A", name: "Camiseta P", quantity: 2, valor: 20 }],
        },
      })
    })
    expect(r).toMatchObject({ ok: true, creditIssued: 20 })
    expect(rt().sales[0]!.lines.map((l) => l.qtyReturned)).toEqual([1, 1])
    expect(rt().inventory.find((i) => i.id === "CAM-P-OLD")!.stock).toBe(camiseta + 2)
    expect(rt().inventory.find((i) => i.id === "CAM-P")!.stock).toBe(meia)
    expect(net.devPosts).toHaveLength(0) // confirmada: sem reenvio
  })
})
