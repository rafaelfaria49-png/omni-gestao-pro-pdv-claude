// @vitest-environment jsdom
import { createElement, type ComponentProps, type PropsWithChildren } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { opsKeyForLoja } from "@/lib/loja-ativa"
import { OperationsProvider, useOperationsStore } from "@/lib/operations-store"

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({
  useEnterprisePermissions: () => ({ hubs: { operacoes: true } }),
}))
vi.mock("@/lib/automation/automation-engine", () => ({ initAutomationEngineClient: () => {} }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

it("preserva a quarentena no reenvio e descarte e mantém a venda pendente que recebe 404 em lote", async () => {
  const storageKey = opsKeyForLoja("qa-conflito")
  const conflictCode = "PEDIDO_ID_CONFLITO_MESMA_LOJA"
  const sale = { at: new Date().toISOString(), total: 10, lines: [], syncPending: true }
  const quarantined = {
    ...sale,
    id: "VDA-2026-0100",
    syncBlockedCode: conflictCode,
  }
  const pending = { ...sale, id: "VDA-2026-0101" }
  localStorage.setItem(storageKey, JSON.stringify({ sales: [quarantined, pending] }))

  // Impede que o flush de montagem altere a fila antes das ações do operador.
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false)
  const salesLookups: Array<{ path: string; method: string }> = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname } = new URL(String(input), "http://localhost")
    if (pathname === `/api/vendas/${quarantined.id}` || pathname === `/api/vendas/${pending.id}`) {
      salesLookups.push({ path: pathname, method: init?.method ?? "GET" })
      return new Response(null, { status: 404 })
    }
    return Response.json({})
  }))
  const { result } = renderHook(useOperationsStore, {
    wrapper: ({ children }: PropsWithChildren) => {
      const props = { storageKey } as ComponentProps<typeof OperationsProvider>
      return createElement(OperationsProvider, props, children)
    },
  })
  await waitFor(() => expect(result.current.sales).toEqual(expect.arrayContaining([
    expect.objectContaining(quarantined),
    expect.objectContaining(pending),
  ])))

  await act(async () => {
    expect(await result.current.retrySyncSale(quarantined.id)).toMatchObject({ ok: false, code: conflictCode })
    expect(await result.current.retrySyncSaleRetroactive(quarantined.id)).toMatchObject({ ok: false, code: conflictCode })
    expect(await result.current.discardLocalPendingSale(quarantined.id)).toMatchObject({ ok: false })
    expect(salesLookups).toEqual([])

    expect(await result.current.bulkDiscardLocalPendingSales()).toEqual({
      ok: true,
      total: 2,
      reconciled: 0,
      kept: 1,
      conflicts: 1,
    })
  })

  expect(salesLookups).toEqual([{ path: `/api/vendas/${pending.id}`, method: "GET" }])
  const preserved = [expect.objectContaining(quarantined), expect.objectContaining(pending)]
  expect(result.current.sales).toEqual(expect.arrayContaining(preserved))
  expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}").sales).toEqual(expect.arrayContaining(preserved))
})
