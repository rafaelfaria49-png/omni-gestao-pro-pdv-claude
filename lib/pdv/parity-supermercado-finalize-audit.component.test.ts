// @vitest-environment jsdom
/** Real surface, PaymentModal, OperationsProvider, finalize, retry and audit.
 * Only transport and unrelated providers/subtrees are synthetic. */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperationsProvider, useOperationsStore } from "@/lib/operations-store"
import { PdvSupermercado } from "@/components/dashboard/vendas/pdv-supermercado"
import { defaultFormasPagamento } from "@/lib/pdv-formas-pagamento"
import { getAuditLogs } from "@/lib/audit-log"
import { INVENTORY, OPS_KEY, STORE, SyntheticBackend, seedStorage } from "../../e2e/fixtures/pdv-core"

type PaymentProps = ComponentProps<typeof import("@/components/dashboard/vendas/payment-modal").PaymentModal>
const runtime = vi.hoisted(() => ({
  payment: undefined as PaymentProps | undefined,
  ops: undefined as ReturnType<typeof useOperationsStore> | undefined,
  noop: vi.fn(),
}))
const params = { formasPagamento: defaultFormasPagamento(), atalhosRapidos: [], incluirImpostoEstimadoNoPdv: false, aliquotaImpostoEstimadoPdv: 0 }
vi.mock("@/lib/loja-ativa", () => ({ OPS_KEY_LEGACY: "assistec-pro-ops-v1", useLojaAtiva: () => ({ lojaAtivaId: STORE, opsStorageKey: OPS_KEY, empresaDocumentos: { nomeFantasia: "Loja sintética" }, getEnderecoDocumentos: () => "" }) }))
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: runtime.noop, replace: runtime.noop }) }))

let backend: SyntheticBackend
function App() { runtime.ops = useOperationsStore(); return createElement(PdvSupermercado) }
const tree = () => createElement(OperationsProvider, { storageKey: OPS_KEY } as ComponentProps<typeof OperationsProvider>, createElement(App))
const markerKey = `omnigestao:pdv-supermercado-finalize-audit:${STORE}`
async function addProduct(view: ReturnType<typeof render>) {
  const input = view.getByPlaceholderText("Digite produto, categoria ou escaneie o código…")
  fireEvent.change(input, { target: { value: "N5C001" } })
  fireEvent.keyDown(input, { key: "Enter" })
  await act(async () => {})
}
async function mount(quantity = 1) {
  const view = render(tree())
  await waitFor(() => expect(runtime.ops?.inventory).toHaveLength(1))
  for (let index = 0; index < quantity; index++) await addProduct(view)
  await waitFor(() => expect(runtime.payment?.total).toBe(quantity * 100))
  return view
}
async function confirm(payments: Parameters<NonNullable<PaymentProps["onConfirm"]>>[0] = [{ id: "pix", type: "pix", value: 100 }]) {
  let result: boolean | void
  await act(async () => { result = await runtime.payment!.onConfirm!(payments) })
  return result!
}
const finalized = () => getAuditLogs().filter((entry) => entry.action === "sale_finalized")
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks()
  runtime.ops = undefined; runtime.payment = undefined
  backend = new SyntheticBackend()
  seedStorage(localStorage, "supermercado")
  vi.stubGlobal("fetch", vi.fn(backend.fetch))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup(); backend.releaseWrite?.(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  expect(backend.unexpected).toEqual([])
})

describe("N5-C Supermercado — handlers, confirmação, retry e auditoria reais", () => {
  it("CONFIRMED direto audita identidade canônica, loja, total e breakdown real uma vez", async () => {
    const view = await mount()
    expect(await confirm([
      { id: "cash", type: "dinheiro", value: 10 }, { id: "pix", type: "pix", value: 20 },
      { id: "debit", type: "cartao_debito", value: 30 }, { id: "card", type: "cartao_credito", value: 40 },
    ])).toBe(true)
    expect(backend.posts).toHaveLength(1)
    expect(runtime.ops!.sales[0]).toMatchObject({ id: "VDA-N5C-1", syncPending: false, total: 100,
      paymentBreakdown: { dinheiro: 10, pix: 20, cartaoDebito: 30, cartaoCredito: 40, carne: 0, aPrazo: 0, creditoVale: 0 } })
    expect(finalized()).toHaveLength(1)
    expect(finalized()[0].detail.replaceAll("\u00a0", " ")).toBe(`Venda VDA-N5C-1 | Loja ${STORE} | Total R$ 100,00 | Din R$ 10,00 Pix R$ 20,00 Déb R$ 30,00 Créd R$ 40,00 Carnê R$ 0,00 Prazo R$ 0,00 Vale R$ 0,00`)
    expect(runtime.payment!.total).toBe(0)
    expect(JSON.parse(localStorage.getItem(markerKey)!)).toEqual([])
    view.rerender(tree())
    await act(async () => {})
    expect(finalized()).toHaveLength(1)
  })
  it("FAILED não audita nem limpa o carrinho; nova tentativa consciente pode confirmar", async () => {
    await mount()
    expect(await confirm([{ id: "pix", type: "pix", value: 1 }])).toBe(false)
    expect(backend.posts).toHaveLength(0)
    expect(finalized()).toHaveLength(0)
    expect(runtime.payment!.total).toBe(100)
    expect(await confirm()).toBe(true)
    expect(finalized()).toHaveLength(1)
  })
  it("PENDING sem efeitos; retry conserva clientSaleId e confirma exatamente uma vez", async () => {
    backend.failWrites = true
    const view = await mount()
    expect(await confirm()).toBe(true)
    expect(finalized()).toHaveLength(0)
    expect(runtime.ops!.caixa.totalEntradas).toBe(0)
    expect(runtime.payment!.total).toBe(100)
    const identity = runtime.ops!.sales[0].clientSaleId!
    expect(runtime.ops!.sales[0].syncPending).toBe(true)
    expect(await confirm()).toBe(false)
    expect(backend.posts).toHaveLength(1)
    backend.failWrites = false
    await act(async () => { expect(await runtime.ops!.retrySyncSale(identity)).toEqual({ ok: true }) })
    expect(backend.posts.map((post) => post.clientSaleId)).toEqual([identity, identity])
    expect(backend.posts[1].sale.total).toBe(backend.posts[0].sale.total)
    expect(backend.posts[1].sale.paymentBreakdown).toEqual(backend.posts[0].sale.paymentBreakdown)
    expect(runtime.ops!.sales).toHaveLength(1)
    expect(runtime.ops!.sales[0]).toMatchObject({ id: "VDA-N5C-1", syncPending: false })
    expect(finalized()).toHaveLength(1)
    view.rerender(tree())
    await act(async () => { expect((await runtime.ops!.retrySyncSale(identity)).ok).toBe(false) })
    expect(finalized()).toHaveLength(1)
    expect(backend.posts).toHaveLength(2)
    expect(backend.audits.filter((entry) => entry.action === "sale_finalized")).toHaveLength(1)
  })
  it("remount com carrinho alterado audita snapshot enviado; restaurar marcador não duplica", async () => {
    backend.failWrites = true
    const first = await mount()
    await confirm([{ id: "cash", type: "dinheiro", value: 30 }, { id: "pix", type: "pix", value: 70 }])
    const identity = runtime.ops!.sales[0].clientSaleId!
    const marker = localStorage.getItem(markerKey)!
    first.unmount()
    const second = await mount(2)
    backend.failWrites = false
    await act(async () => { await runtime.ops!.retrySyncSale(identity) })
    expect(finalized()).toHaveLength(1)
    const detail = finalized()[0].detail.replaceAll("\u00a0", " ")
    expect(detail).toContain("Total R$ 100,00 | Din R$ 30,00 Pix R$ 70,00")
    expect(detail).not.toContain("200,00")
    expect(runtime.payment!.total).toBe(200)
    second.unmount()
    localStorage.setItem(markerKey, marker)
    await mount(2)
    expect(finalized()).toHaveLength(1)
    expect(backend.audits.filter((entry) => entry.action === "sale_finalized")).toHaveLength(1)
  })
  it("duas chamadas concorrentes do handler não duplicam venda ou auditoria", async () => {
    await mount()
    const handler = runtime.payment!.onConfirm!
    await act(async () => {
      const payments = [{ id: "pix", type: "pix" as const, value: 100 }]
      expect(await Promise.all([handler(payments), handler(payments)])).toEqual([true, true])
    })
    expect(backend.posts).toHaveLength(1)
    expect(finalized()).toHaveLength(1)
  })
  it("ignora vendas de outra origem e marcadores de outra loja", async () => {
    localStorage.setItem("omnigestao:pdv-supermercado-finalize-audit:outra-loja", JSON.stringify([{ id: "VDA-N5C-1" }]))
    await mount()
    await act(async () => {
      expect((await runtime.ops!.finalizeSaleTransaction({ lines: [{ inventoryId: INVENTORY[0].id, quantity: 1, unitPrice: 50 }], total: 50, paymentBreakdown: { pix: 50 } })).ok).toBe(true)
    })
    expect(runtime.ops!.sales.some((sale) => sale.syncPending === false)).toBe(true)
    expect(finalized()).toHaveLength(0)
    expect(await confirm()).toBe(true)
    expect(finalized()).toHaveLength(1)
    expect(finalized()[0].detail).toContain("Venda VDA-N5C-2")
    expect(finalized()[0].detail).toContain(`Loja ${STORE}`)
  })
  it("resposta em voo mantém zero eventos até a confirmação efetiva", async () => {
    backend.pauseWrites = true
    await mount()
    const run = act(async () => { await runtime.payment!.onConfirm!([{ id: "pix", type: "pix", value: 100 }]) })
    await waitFor(() => expect(backend.posts).toHaveLength(1))
    expect(finalized()).toHaveLength(0)
    backend.releaseWrite!()
    await run
    expect(finalized()).toHaveLength(1)
  })
})
