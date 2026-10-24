// @vitest-environment jsdom
/** Mounted surface + PaymentModal + OperationsProvider + retry + audit are real.
 * Only network and unrelated providers/subtrees are synthetic. */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperationsProvider, useOperationsStore } from "@/lib/operations-store"
import { PdvClassic } from "@/components/dashboard/vendas/pdv-classic"
import { defaultFormasPagamento } from "@/lib/pdv-formas-pagamento"
import { getAuditLogs } from "@/lib/audit-log"
import { OPS_KEY, STORE, SyntheticBackend, seedStorage } from "../../e2e/fixtures/pdv-core"

type PaymentProps = ComponentProps<typeof import("@/components/dashboard/vendas/payment-modal").PaymentModal>
const runtime = vi.hoisted(() => ({ payment: undefined as PaymentProps | undefined, ops: undefined as ReturnType<typeof useOperationsStore> | undefined, noop: vi.fn() }))
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
vi.mock("@/components/theme/ThemeProvider", () => ({ useStudioTheme: () => ({ mode: "classic" }) }))

let backend: SyntheticBackend
function App() { runtime.ops = useOperationsStore(); return createElement(PdvClassic) }
function seedComanda(price = 95) {
  sessionStorage.setItem("assistec-pdv-import-comanda", JSON.stringify({ lines: [{ inventoryId: "n5-c-product", name: "Produto sintético", price, quantity: 2 }] }))
}
async function mount(price = 95) {
  seedComanda(price)
  const view = render(createElement(OperationsProvider, { storageKey: OPS_KEY } as ComponentProps<typeof OperationsProvider>, createElement(App)))
  await waitFor(() => expect(runtime.payment?.total).toBe(price * 2))
  await act(async () => {})
  return view
}
async function confirm(payments: Parameters<NonNullable<PaymentProps["onConfirm"]>>[0] = [{ id: "pix", type: "pix", value: 190 }]) {
  let result: boolean | void
  await act(async () => { result = await runtime.payment!.onConfirm!(payments) })
  return result!
}
const finalized = () => getAuditLogs().filter((entry) => entry.action === "sale_finalized")
const markerKey = `omnigestao:pdv-classic-finalize-audit:${STORE}`
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks()
  runtime.ops = undefined; runtime.payment = undefined
  backend = new SyntheticBackend()
  seedStorage(localStorage, "classic")
  vi.stubGlobal("fetch", vi.fn(backend.fetch))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup(); backend.releaseWrite?.(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  expect(backend.unexpected).toEqual([])
})

describe("N5-C Classic — componente, motor, retry e auditoria reais", () => {
  it("CONFIRMED audita identidade, total e breakdown do snapshot real uma vez", async () => {
    await mount()
    expect(await confirm([
      { id: "cash", type: "dinheiro", value: 10 }, { id: "pix", type: "pix", value: 40 },
      { id: "debit", type: "cartao_debito", value: 60 }, { id: "card", type: "cartao_credito", value: 80 },
    ])).toBe(true)
    expect(backend.posts).toHaveLength(1)
    expect(runtime.ops!.sales[0]).toMatchObject({ id: "VDA-N5C-1", syncPending: false, total: 190,
      paymentBreakdown: { dinheiro: 10, pix: 40, cartaoDebito: 60, cartaoCredito: 80, carne: 0, aPrazo: 0, creditoVale: 0 } })
    expect(finalized()).toHaveLength(1)
    expect(finalized()[0].detail.replaceAll("\u00a0", " ")).toBe(`Venda VDA-N5C-1 | Loja ${STORE} | Total R$ 190,00 | Din R$ 10,00 Pix R$ 40,00 Déb R$ 60,00 Créd R$ 80,00 Carnê R$ 0,00 Prazo R$ 0,00 Vale R$ 0,00`)
    expect(runtime.payment!.total).toBe(0)
    expect(JSON.parse(localStorage.getItem(markerKey)!)).toEqual([])
  })
  it("FAILED não emite auditoria nem modifica carrinho; permite tentativa consciente", async () => {
    await mount()
    expect(await confirm([{ id: "pix", type: "pix", value: 1 }])).toBe(false)
    expect(backend.posts).toHaveLength(0)
    expect(finalized()).toHaveLength(0)
    expect(runtime.payment!.total).toBe(190)
    expect(await confirm()).toBe(true)
    expect(finalized()).toHaveLength(1)
  })
  it("PENDING sem efeito definitivo; retry confirmado conserva clientSaleId e não duplica", async () => {
    backend.failWrites = true
    const view = await mount()
    expect(await confirm()).toBe(true)
    expect(finalized()).toHaveLength(0)
    expect(runtime.ops!.caixa.totalEntradas).toBe(0)
    expect(runtime.payment!.total).toBe(190)
    const identity = runtime.ops!.sales[0].clientSaleId!
    expect(await confirm()).toBe(false)
    expect(backend.posts).toHaveLength(1)
    backend.failWrites = false
    await act(async () => { expect(await runtime.ops!.retrySyncSale(identity)).toEqual({ ok: true }) })
    expect(backend.posts.map((post) => post.clientSaleId)).toEqual([identity, identity])
    expect(runtime.ops!.sales).toHaveLength(1)
    expect(runtime.ops!.sales[0]).toMatchObject({ id: "VDA-N5C-1", syncPending: false })
    expect(finalized()).toHaveLength(1)
    view.rerender(createElement(OperationsProvider, { storageKey: OPS_KEY } as ComponentProps<typeof OperationsProvider>, createElement(App)))
    await act(async () => { expect((await runtime.ops!.retrySyncSale(identity)).ok).toBe(false) })
    expect(finalized()).toHaveLength(1)
    expect(backend.audits.filter((entry) => entry.action === "sale_finalized")).toHaveLength(1)
  })
  it("remount com draft diferente audita snapshot pendente; restauração repetida não duplica", async () => {
    backend.failWrites = true
    const first = await mount()
    await confirm([{ id: "cash", type: "dinheiro", value: 30 }, { id: "pix", type: "pix", value: 160 }])
    const identity = runtime.ops!.sales[0].clientSaleId!
    const marker = localStorage.getItem(markerKey)!
    first.unmount()
    const second = await mount(999)
    backend.failWrites = false
    await act(async () => { await runtime.ops!.retrySyncSale(identity) })
    expect(finalized()).toHaveLength(1)
    const detail = finalized()[0].detail.replaceAll("\u00a0", " ")
    expect(detail).toContain("Total R$ 190,00 | Din R$ 30,00 Pix R$ 160,00")
    expect(detail).not.toContain("1.998")
    expect(runtime.payment!.total).toBe(1998)
    second.unmount()
    localStorage.setItem(markerKey, marker)
    await mount(999)
    expect(finalized()).toHaveLength(1)
    expect(backend.audits.filter((entry) => entry.action === "sale_finalized")).toHaveLength(1)
  })
  it("duas chamadas concorrentes do handler real não duplicam venda ou auditoria", async () => {
    await mount()
    const handler = runtime.payment!.onConfirm!
    await act(async () => {
      const payments = [{ id: "pix", type: "pix" as const, value: 190 }]
      expect(await Promise.all([handler(payments), handler(payments)])).toEqual([true, true])
    })
    expect(backend.posts).toHaveLength(1)
    expect(finalized()).toHaveLength(1)
  })
  it("não audita vendas de outra origem observadas em sales nem marcadores de outra loja", async () => {
    localStorage.setItem("omnigestao:pdv-classic-finalize-audit:outra-loja", JSON.stringify([{ id: "VDA-N5C-1" }]))
    await mount()
    await act(async () => {
      expect((await runtime.ops!.finalizeSaleTransaction({ lines: [{ inventoryId: "n5-c-product", quantity: 1, unitPrice: 50 }], total: 50, paymentBreakdown: { pix: 50 } })).ok).toBe(true)
    })
    expect(runtime.ops!.sales.some((sale) => sale.syncPending === false)).toBe(true)
    expect(finalized()).toHaveLength(0)
    expect(await confirm()).toBe(true)
    expect(finalized()).toHaveLength(1)
    expect(finalized()[0].detail).toContain("Venda VDA-N5C-2")
  })
  it("resposta em voo mantém zero eventos até a confirmação efetiva", async () => {
    backend.pauseWrites = true
    await mount()
    const run = act(async () => { await runtime.payment!.onConfirm!([{ id: "pix", type: "pix", value: 190 }]) })
    await waitFor(() => expect(backend.posts).toHaveLength(1))
    expect(finalized()).toHaveLength(0)
    backend.releaseWrite!()
    await run
    expect(finalized()).toHaveLength(1)
  })
})
