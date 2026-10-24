// @vitest-environment jsdom
/** Mounted surface + PaymentModal + OperationsProvider + retry + audit are real.
 * Only network and unrelated providers/subtrees are synthetic. */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperationsProvider, useOperationsStore } from "@/lib/operations-store"
import { PdvAssistenciaEnterprise } from "@/components/dashboard/vendas/pdv-assistencia-enterprise"
import { defaultFormasPagamento } from "@/lib/pdv-formas-pagamento"
import { getAuditLogs } from "@/lib/audit-log"
import { OPS_KEY, STORE, SyntheticBackend, seedStorage } from "../../e2e/fixtures/pdv-core"

type PaymentProps = ComponentProps<typeof import("@/components/dashboard/vendas/payment-modal").PaymentModal>
const runtime = vi.hoisted(() => ({ storeId: "", payment: undefined as PaymentProps | undefined, ops: undefined as ReturnType<typeof useOperationsStore> | undefined, noop: vi.fn() }))
const params = { formasPagamento: defaultFormasPagamento(), atalhosRapidos: [], incluirImpostoEstimadoNoPdv: false, aliquotaImpostoEstimadoPdv: 0 }
vi.mock("@/lib/loja-ativa", () => ({ OPS_KEY_LEGACY: "assistec-pro-ops-v1", useLojaAtiva: () => ({ lojaAtivaId: runtime.storeId, opsStorageKey: OPS_KEY, empresaDocumentos: { nomeFantasia: "Loja sintética" }, getEnderecoDocumentos: () => "" }) }))
vi.mock("@/lib/store-settings-provider", () => ({ useStoreSettings: () => ({ pdvParams: params, blob: { pdvParams: params }, settings: {}, hydrated: true, storeId: STORE, impressaoConfig: { imprimirAutomatico: false, rodapeCupom: "" }, save: runtime.noop }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }))
vi.mock("@/lib/pdv-operador-nome", () => ({ usePdvOperadorNome: () => "Operador sintético" }))
vi.mock("@/lib/pdv-operator-id", () => ({ getOrCreatePdvOperatorId: () => "n5-c-operator" }))
vi.mock("@/components/dashboard/caixa/caixa-provider", () => ({ useCaixa: () => ({ caixa: runtime.ops?.caixa ?? { isOpen: true }, sessaoId: "n5-c-caixa" }) }))
vi.mock("@/components/dashboard/caixa/use-atualizar-caixa", () => ({ useGarantirSessaoCaixa: () => ({ garantirSessao: runtime.noop }) }))
vi.mock("@/components/dashboard/caixa/caixa-status-bar", () => ({ CaixaStatusBar: () => null }))
vi.mock("@/lib/automation/automation-engine", () => ({ initAutomationEngineClient: () => {} }))
vi.mock("@/components/dashboard/vendas/payment-modal", async (original) => {
  const actual = await original<typeof import("@/components/dashboard/vendas/payment-modal")>()
  return { ...actual, PaymentModal: (props: PaymentProps) => { runtime.payment = props; return createElement(actual.PaymentModal, props) } }
})
vi.mock("@/components/dashboard/vendas/pdv-recebimento-modal", () => ({ PdvRecebimentoModal: () => null }))
vi.mock("@/components/dashboard/vendas/acessorios/selecionar-acessorio-dialog", () => ({ SelecionarAcessorioDialog: () => null }))
vi.mock("@/components/dashboard/vendas/trocas-devolucao", () => ({ TrocasDevolucao: () => null }))
vi.mock("@/components/dashboard/vendas/cupom-nao-fiscal", () => ({ CupomNaoFiscal: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-post-sale-dialog", () => ({ PdvPostSaleDialog: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-auto-print-feedback", () => ({ PdvAutoPrintFeedback: () => null }))

let backend: SyntheticBackend
function App() { runtime.ops = useOperationsStore(); return createElement(PdvAssistenciaEnterprise) }
function ProviderProbe() { runtime.ops = useOperationsStore(); return null }
const tree = (showSurface: boolean) => createElement(OperationsProvider,
  { storageKey: OPS_KEY } as ComponentProps<typeof OperationsProvider>, createElement(showSurface ? App : ProviderProbe))
const markerKey = (storeId = STORE) => `omnigestao:pdv-assistencia-finalize-audit:${storeId}`
const cartKey = (storeId = STORE) => `omnigestao:pdv-assistencia-cart:${storeId}`
async function mount() {
  const view = render(createElement(OperationsProvider, { storageKey: OPS_KEY } as ComponentProps<typeof OperationsProvider>, createElement(App)))
  await waitFor(() => expect(runtime.payment?.total).toBeGreaterThan(0))
  await act(async () => {})
  return view
}
async function confirm(payments: Parameters<NonNullable<PaymentProps["onConfirm"]>>[0] = [{ id: "pix", type: "pix", value: 190 }]) {
  let result: boolean | void
  await act(async () => { result = await runtime.payment!.onConfirm!(payments) })
  return result!
}
const finalized = () => getAuditLogs().filter((entry) => entry.action === "sale_finalized")
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks()
  runtime.storeId = STORE; runtime.ops = undefined; runtime.payment = undefined
  backend = new SyntheticBackend()
  seedStorage(localStorage, "assistencia", true)
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://127.0.0.1:4179")
    // Segunda loja apenas nos testes de isolamento: leituras periféricas vazias.
    // Writers e qualquer rota não prevista continuam sob o backend fail-closed.
    const store = url.searchParams.get("storeId") ?? url.searchParams.get("lojaId")
    if ((!init?.method || init.method === "GET") && store === `${STORE}-b` &&
      ["/api/ops/servicos", "/api/ops/credito-cliente"].includes(url.pathname)) {
      return new Response(JSON.stringify({ items: [], creditos: {} }), { status: 200 })
    }
    return backend.fetch(input, init)
  }))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup(); backend.releaseWrite?.(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  expect(backend.unexpected).toEqual([])
})

describe("N5-C Assistência — motor, handler e log reais", () => {
  it("CONFIRMED emite uma vez com saleId do motor e todos os valores enviados", async () => {
    await mount()
    expect(await confirm([
      { id: "cash", type: "dinheiro", value: 10 }, { id: "pix", type: "pix", value: 20 },
      { id: "debit", type: "cartao_debito", value: 30 }, { id: "card", type: "cartao_credito", value: 40 },
      { id: "prazo", type: "a_prazo", value: 50, aPrazoConfig: { parcelas: 3, primeiroVencimento: "10/12/2026", intervalDias: 30 } },
      { id: "vale", type: "credito_vale", value: 40 },
    ])).toBe(true)
    expect(backend.posts).toHaveLength(1)
    expect(backend.posts[0].sale).toMatchObject({ total: 190, paymentBreakdown: { dinheiro: 10, pix: 20, cartaoDebito: 30, cartaoCredito: 40, carne: 0, aPrazo: 50, creditoVale: 40 } })
    expect(finalized()).toHaveLength(1)
    expect(finalized()[0].detail.replaceAll("\u00a0", " ")).toBe(`Venda VDA-N5C-1 | Loja ${STORE} | Total R$ 190,00 | Din R$ 10,00 Pix R$ 20,00 Déb R$ 30,00 Créd R$ 40,00 Carnê R$ 0,00 Prazo R$ 50,00 Vale R$ 40,00`)
    expect(runtime.payment!.total).toBe(0)
    expect(runtime.ops!.sales[0]).toMatchObject({ id: "VDA-N5C-1", syncPending: false })
  })
  it("FAILED do motor não audita nem limpa o carrinho; tentativa consciente continua possível", async () => {
    await mount()
    expect(await confirm([{ id: "pix", type: "pix", value: 1 }])).toBe(false)
    expect(backend.posts).toHaveLength(0)
    expect(finalized()).toHaveLength(0)
    expect(runtime.payment!.total).toBe(190)
    expect(await confirm()).toBe(true)
    expect(finalized()).toHaveLength(1)
  })
  it("PENDING não audita; bloqueia reconfirmação; Reenviar confirma a identidade original uma vez", async () => {
    backend.failWrites = true
    await mount()
    expect(await confirm()).toBe(true)
    expect(finalized()).toHaveLength(0)
    expect(runtime.payment!.total).toBe(190)
    const identity = runtime.ops!.sales[0].clientSaleId!
    expect(runtime.ops!.sales[0].syncPending).toBe(true)
    expect(await confirm()).toBe(false)
    expect(backend.posts).toHaveLength(1)
    backend.failWrites = false
    await act(async () => { expect(await runtime.ops!.retrySyncSale(identity)).toEqual({ ok: true }) })
    expect(backend.posts).toHaveLength(2)
    expect(backend.posts.map((post) => post.clientSaleId)).toEqual([identity, identity])
    expect(runtime.ops!.sales).toHaveLength(1)
    expect(runtime.ops!.sales[0].syncPending).toBe(false)
    expect(finalized()).toHaveLength(1)
    await act(async () => { expect((await runtime.ops!.retrySyncSale(identity)).ok).toBe(false) })
    expect(finalized()).toHaveLength(1)
  })
  it("resolução após remount usa o payload pendente, e repetir o restore não duplica o log", async () => {
    backend.failWrites = true
    const first = await mount()
    await confirm()
    const identity = runtime.ops!.sales[0].clientSaleId!
    first.unmount()
    const key = `omnigestao:pdv-assistencia-cart:${STORE}`
    const draft = JSON.parse(localStorage.getItem(key)!)
    draft.cart[0].price = 999 // rascunho diferente não altera a venda já enviada
    localStorage.setItem(key, JSON.stringify(draft))
    const second = await mount()
    backend.failWrites = false
    await act(async () => { await runtime.ops!.retrySyncSale(identity) })
    expect(finalized()).toHaveLength(1)
    expect(finalized()[0].detail).toContain("190,00")
    expect(finalized()[0].detail).not.toContain("999")
    second.unmount()
    await mount()
    expect(finalized()).toHaveLength(1)
    expect(backend.audits.filter((entry) => entry.action === "sale_finalized")).toHaveLength(1)
  })
  it("duas chamadas concorrentes do handler compartilham a confirmação sem duplicar auditoria", async () => {
    await mount()
    const handler = runtime.payment!.onConfirm!
    await act(async () => {
      const payments = [{ id: "pix", type: "pix" as const, value: 190 }]
      expect(await Promise.all([handler(payments), handler(payments)])).toEqual([true, true])
    })
    expect(backend.posts).toHaveLength(1)
    expect(finalized()).toHaveLength(1)
  })
  for (const cache of ["alterado", "expirado", "ausente"] as const) {
    it(`retry confirma com tela desmontada; cache ${cache}; remount audita a identidade original só uma vez`, async () => {
      backend.failWrites = true
      const view = await mount()
      expect(await confirm()).toBe(true)
      const identity = runtime.ops!.sales[0].clientSaleId!
      expect(JSON.parse(localStorage.getItem(markerKey())!)).toEqual([{ id: runtime.ops!.sales[0].id, clientSaleId: identity }])
      expect(finalized()).toHaveLength(0)
      view.rerender(tree(false)) // OperationsProvider real permanece montado.
      backend.failWrites = false
      await act(async () => { expect(await runtime.ops!.retrySyncSale(identity)).toEqual({ ok: true }) })
      expect(runtime.ops!.sales).toHaveLength(1)
      expect(runtime.ops!.sales[0]).toMatchObject({ id: "VDA-N5C-1", clientSaleId: identity, syncPending: false, total: 190 })
      expect(backend.posts.map((post) => post.clientSaleId)).toEqual([identity, identity])
      expect(finalized()).toHaveLength(0)
      const businessState = JSON.stringify({ sales: runtime.ops!.sales, inventory: runtime.ops!.inventory, caixa: runtime.ops!.caixa })
      if (cache === "ausente") localStorage.removeItem(cartKey())
      else {
        const draft = JSON.parse(localStorage.getItem(cartKey())!)
        if (cache === "alterado") draft.cart[0].price = 999
        else draft.savedAt = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
        localStorage.setItem(cartKey(), JSON.stringify(draft))
      }
      view.rerender(tree(true))
      await waitFor(() => expect(finalized()).toHaveLength(1))
      expect(runtime.payment!.total).toBe(cache === "alterado" ? 1988 : 0)
      expect(finalized()[0].detail.replaceAll("\u00a0", " ")).toBe(`Venda VDA-N5C-1 | Loja ${STORE} | Total R$ 190,00 | Din R$ 0,00 Pix R$ 190,00 Déb R$ 0,00 Créd R$ 0,00 Carnê R$ 0,00 Prazo R$ 0,00 Vale R$ 0,00`)
      expect(JSON.parse(localStorage.getItem(markerKey())!)).toEqual([])
      view.rerender(tree(false)); view.rerender(tree(true)); view.rerender(tree(true))
      await act(async () => { expect((await runtime.ops!.retrySyncSale(identity)).ok).toBe(false) })
      expect(finalized()).toHaveLength(1)
      expect(backend.audits.filter((entry) => entry.action === "sale_finalized")).toHaveLength(1)
      expect(backend.posts).toHaveLength(2)
      expect(JSON.stringify({ sales: runtime.ops!.sales, inventory: runtime.ops!.inventory, caixa: runtime.ops!.caixa })).toBe(businessState)
    })
  }
  it("loja alheia não audita a venda original nem perde seu próprio marcador", async () => {
    backend.failWrites = true
    const view = await mount()
    await confirm()
    const identity = runtime.ops!.sales[0].clientSaleId!
    view.rerender(tree(false))
    backend.failWrites = false
    await act(async () => { await runtime.ops!.retrySyncSale(identity) })
    const originalMarker = localStorage.getItem(markerKey())
    const foreign = JSON.stringify([{ id: "PEND-outra", clientSaleId: "client-outra" }])
    localStorage.setItem(markerKey(`${STORE}-b`), foreign)
    runtime.storeId = `${STORE}-b`
    view.rerender(tree(true))
    await act(async () => {})
    expect(finalized()).toHaveLength(0)
    expect(localStorage.getItem(markerKey())).toBe(originalMarker)
    expect(localStorage.getItem(markerKey(`${STORE}-b`))).toBe(foreign)
    runtime.storeId = STORE
    view.rerender(tree(true))
    await waitFor(() => expect(finalized()).toHaveLength(1))
    expect(finalized()[0].detail).toContain(`Loja ${STORE} |`)
    expect(localStorage.getItem(markerKey(`${STORE}-b`))).toBe(foreign)
  })
  it("resposta em voo após troca de loja preserva marcador e carrinho da loja nova", async () => {
    backend.pauseWrites = true
    const view = await mount()
    const otherDraft = JSON.parse(localStorage.getItem(cartKey())!)
    otherDraft.cart[0].price = 70; otherDraft.discountReais = 0; otherDraft.discount = 0
    localStorage.setItem(cartKey(`${STORE}-b`), JSON.stringify(otherDraft))
    const foreign = JSON.stringify([{ id: "PEND-outra", clientSaleId: "client-outra" }])
    localStorage.setItem(markerKey(`${STORE}-b`), foreign)
    const completion = act(async () => { expect(await runtime.payment!.onConfirm!([{ id: "pix", type: "pix", value: 190 }])).toBe(true) })
    await waitFor(() => expect(backend.posts).toHaveLength(1))
    expect(finalized()).toHaveLength(0)
    runtime.storeId = `${STORE}-b`
    view.rerender(tree(true))
    backend.releaseWrite!()
    await completion
    expect(runtime.payment!.total).toBe(140)
    expect(finalized()).toHaveLength(0)
    expect(localStorage.getItem(markerKey(`${STORE}-b`))).toBe(foreign)
    expect(JSON.parse(localStorage.getItem(markerKey())!)[0].clientSaleId).toBe(backend.posts[0].clientSaleId)
    runtime.storeId = STORE
    view.rerender(tree(true))
    await waitFor(() => expect(finalized()).toHaveLength(1))
    expect(finalized()[0].detail).toContain("190,00")
    expect(backend.posts).toHaveLength(1)
    expect(localStorage.getItem(markerKey(`${STORE}-b`))).toBe(foreign)
  })
})
