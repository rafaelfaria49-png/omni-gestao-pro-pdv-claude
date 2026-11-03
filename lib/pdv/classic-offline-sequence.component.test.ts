// @vitest-environment jsdom
/** Mounted surface + PaymentModal + OperationsProvider + retry + audit are real.
 * Only network and unrelated providers/subtrees are synthetic. */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { within } from "@testing-library/react"
import { Toaster } from "@/components/ui/toaster"
import { OperationsProvider, useOperationsStore } from "@/lib/operations-store"
import { PdvClassic } from "@/components/dashboard/vendas/pdv-classic"
import { defaultFormasPagamento } from "@/lib/pdv-formas-pagamento"
import { getAuditLogs } from "@/lib/audit-log"
import { OPS_KEY, ORIGIN, STORE, SyntheticBackend, seedStorage } from "../../e2e/fixtures/pdv-core"

type PaymentProps = ComponentProps<typeof import("@/components/dashboard/vendas/payment-modal").PaymentModal>
const runtime = vi.hoisted(() => ({ storeId: "", payment: undefined as PaymentProps | undefined, ops: undefined as ReturnType<typeof useOperationsStore> | undefined, noop: vi.fn() }))
const params = { formasPagamento: defaultFormasPagamento(), atalhosRapidos: [], incluirImpostoEstimadoNoPdv: false, aliquotaImpostoEstimadoPdv: 0 }
vi.mock("@/lib/loja-ativa", () => ({ OPS_KEY_LEGACY: "assistec-pro-ops-v1", useLojaAtiva: () => ({ lojaAtivaId: runtime.storeId, opsStorageKey: OPS_KEY, empresaDocumentos: { nomeFantasia: "Loja sintética" }, getEnderecoDocumentos: () => "" }) }))
vi.mock("@/lib/store-settings-provider", () => ({ useStoreSettings: () => ({ pdvParams: params, blob: { pdvParams: params }, settings: {}, hydrated: true, storeId: runtime.storeId, impressaoConfig: { imprimirAutomatico: false, rodapeCupom: "" }, save: runtime.noop }) }))
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
function App({ visible = true }: { visible?: boolean }) {
  runtime.ops = useOperationsStore()
  return visible ? createElement(PdvClassic) : null
}
const tree = (visible = true) => createElement(OperationsProvider, { storageKey: OPS_KEY } as ComponentProps<typeof OperationsProvider>, createElement(App, { visible }), createElement(Toaster))
function seedComanda(price = 95) {
  sessionStorage.setItem("assistec-pdv-import-comanda", JSON.stringify({ lines: [{ inventoryId: "n5-c-product", name: "Produto sintético", price, quantity: 2 }] }))
}
async function mount(price = 95) {
  seedComanda(price)
  const view = render(tree())
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
  runtime.ops = undefined; runtime.payment = undefined; runtime.storeId = STORE
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

describe("PDV-OFFLINE-SYNC — Clássico real: venda pendente → F6 → venda idêntica → F12", () => {
  it("depois de liberar o carrinho com F6, o F12 abre o pagamento da venda seguinte", async () => {
    backend.failWrites = true
    await mount()
    expect(await confirm()).toBe(true)
    expect(runtime.ops!.sales.filter((s) => s.syncPending === true)).toHaveLength(1)
    await act(async () => { fireEvent.keyDown(window, { key: "F6" }) })
    const cancelar = await screen.findByRole("dialog", { name: /Cancelar Venda/ })
    await act(async () => { fireEvent.click(within(cancelar).getByRole("button", { name: "Cancelar venda" })) })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Cancelar Venda/ })).toBeNull())
    const bipe = screen.getByPlaceholderText("Bipe ou digite o código do produto")
    await act(async () => { fireEvent.change(bipe, { target: { value: "N5C001" } }) })
    await act(async () => { fireEvent.keyDown(bipe, { key: "Enter" }) })
    await act(async () => {})
    const estado = { bipe: (bipe as HTMLInputElement).value, total: runtime.payment?.total, aberto: runtime.payment?.isOpen }
    ;(document.activeElement as HTMLElement | null)?.blur()
    // O Cancelar do Radix fica no DOM com data-state="closed" durante a animação de saída
    // (no navegador real); o F12 digitado nesse intervalo não pode ser descartado.
    const saindo = document.createElement("div")
    saindo.setAttribute("role", "dialog")
    saindo.setAttribute("data-state", "closed")
    document.body.appendChild(saindo)
    await act(async () => { fireEvent.keyDown(window, { key: "F12" }) })
    saindo.remove()
    await act(async () => {})
    expect({ ...estado, abertoDepois: runtime.payment?.isOpen }).toMatchObject({ abertoDepois: true })
  })
})
