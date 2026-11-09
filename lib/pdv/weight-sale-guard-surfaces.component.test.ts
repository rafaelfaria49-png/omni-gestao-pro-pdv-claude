// @vitest-environment jsdom
/**
 * ESTOQUE-MANUAL-KG-001 — superfícies REAIS do PDV com produto de venda por peso
 * bloqueada e saldo positivo (10). Mesmo harness dos testes de paridade N5-C:
 * OperationsProvider, catálogo vindo de `/api/ops/inventory` (backend sintético
 * com a marca `vendaPesoIndisponivel`) e PaymentModal real. Prova que nenhum
 * caminho — bipe/busca, comanda importada, carrinho persistido ou rascunho —
 * deixa o item chegar ao pagamento, e que a orientação não manda repor estoque.
 */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperationsProvider, useOperationsStore } from "@/lib/operations-store"
import { PdvClassic } from "@/components/dashboard/vendas/pdv-classic"
import { PdvSupermercado } from "@/components/dashboard/vendas/pdv-supermercado"
import { PdvAssistenciaEnterprise } from "@/components/dashboard/vendas/pdv-assistencia-enterprise"
import { VendaCompletaEnterprise } from "@/components/dashboard/vendas/venda-completa-enterprise"
import { defaultFormasPagamento } from "@/lib/pdv-formas-pagamento"
import { CUSTOMER, INVENTORY, OPS_KEY, STORE, SyntheticBackend, seedStorage, type Surface } from "../../e2e/fixtures/pdv-core"

type PaymentProps = ComponentProps<typeof import("@/components/dashboard/vendas/payment-modal").PaymentModal>
const runtime = vi.hoisted(() => ({
  payment: undefined as PaymentProps | undefined,
  ops: undefined as ReturnType<typeof useOperationsStore> | undefined,
  toast: vi.fn(),
  noop: vi.fn(),
}))
const params = { formasPagamento: defaultFormasPagamento(), atalhosRapidos: [], incluirImpostoEstimadoNoPdv: false, aliquotaImpostoEstimadoPdv: 0 }
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: runtime.toast, dismiss: vi.fn(), toasts: [] }), toast: runtime.toast }))
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
vi.mock("@/app/actions/vendas-enterprise", () => ({ enrichVendaEnterprise: vi.fn() }))

const PRODUTO = INVENTORY[0] as (typeof INVENTORY)[number] & { vendaPesoIndisponivel?: boolean }
const SURFACE = {
  classic: () => createElement(PdvClassic),
  supermercado: () => createElement(PdvSupermercado),
  assistencia: () => createElement(PdvAssistenciaEnterprise),
  "venda-completa": () => createElement(VendaCompletaEnterprise, { onBack: runtime.noop }),
} as const

let backend: SyntheticBackend
function mount(surface: Surface) {
  function App() { runtime.ops = useOperationsStore(); return SURFACE[surface]() }
  return render(createElement(OperationsProvider, { storageKey: OPS_KEY } as ComponentProps<typeof OperationsProvider>, createElement(App)))
}
const titles = () => runtime.toast.mock.calls.map(([n]) => (n as { title?: string }).title)
const descriptions = () => runtime.toast.mock.calls.map(([n]) => String((n as { description?: unknown }).description ?? ""))
async function expectBlockedWithoutStockAdvice() {
  await waitFor(() => expect(titles()).toContain("Venda por peso ainda não liberada"))
  await act(async () => {})
  expect(descriptions().join(" ")).toMatch(/vendido por kg/)
  expect(descriptions().join(" ")).not.toMatch(/sem saldo|sem estoque|Estoque insuficiente/i)
  expect(titles()).not.toContain("Sem estoque")
  expect(runtime.payment?.total ?? 0).toBe(0)
  expect(backend.posts).toHaveLength(0)
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks()
  runtime.ops = undefined; runtime.payment = undefined
  PRODUTO.vendaPesoIndisponivel = true
  backend = new SyntheticBackend()
  vi.stubGlobal("fetch", vi.fn(backend.fetch))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup(); backend.releaseWrite?.(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  delete PRODUTO.vendaPesoIndisponivel
  expect(backend.unexpected).toEqual([])
})

describe("PDV com produto KG de venda bloqueada e saldo 10", () => {
  it("Clássico: comanda importada com o produto não chega ao pagamento", async () => {
    seedStorage(localStorage, "classic")
    sessionStorage.setItem("assistec-pdv-import-comanda", JSON.stringify({ lines: [{ inventoryId: PRODUTO.id, name: PRODUTO.name, price: 95, quantity: 2 }] }))
    mount("classic")
    await expectBlockedWithoutStockAdvice()
  })

  // Carrinho misto (KG ainda liberado no catálogo + unitário) com pagamento aberto.
  async function mixedClassicWithPaymentOpen() {
    delete PRODUTO.vendaPesoIndisponivel
    const un2 = { ...PRODUTO, id: "n5-c-un2", name: "Produto unitário sintético", sku: "N5C002" } as (typeof INVENTORY)[number]
    INVENTORY.push(un2)
    seedStorage(localStorage, "classic")
    sessionStorage.setItem("assistec-pdv-import-comanda", JSON.stringify({ lines: [
      { inventoryId: PRODUTO.id, name: PRODUTO.name, price: 100, quantity: 1 },
      { inventoryId: un2.id, name: un2.name, price: 100, quantity: 1 },
    ] }))
    mount("classic")
    await waitFor(() => expect(runtime.payment?.total).toBe(200))
    await act(async () => { fireEvent.keyDown(window, { key: "F1" }) })
    await waitFor(() => expect(runtime.payment?.isOpen).toBe(true))
    const marcarKg = () => act(async () => {
      runtime.ops!.setInventory((prev) => prev.map((i) => (i.id === PRODUTO.id ? { ...i, vendaPesoIndisponivel: true } : i)))
    })
    return { marcarKg, cleanup: () => { INVENTORY.splice(INVENTORY.indexOf(un2), 1) } }
  }

  it("Clássico: catálogo marca KG com pagamento aberto — carrinho e modal intactos até fechar; aí o item sai", async () => {
    const { marcarKg, cleanup } = await mixedClassicWithPaymentOpen()
    try {
      await marcarKg()
      await waitFor(() => expect(descriptions().join(" ")).toMatch(/esta venda será recusada sem gravar nada. Feche o pagamento/))
      await act(async () => {})
      expect(runtime.payment?.isOpen).toBe(true)
      expect(runtime.payment?.total).toBe(200)
      expect(descriptions().filter((d) => /será recusada/.test(d))).toHaveLength(1)
      await act(async () => { runtime.payment!.onClose() })
      await waitFor(() => expect(runtime.payment?.total).toBe(100))
      expect(descriptions().join(" ")).toMatch(/saiu do carrinho/)
      expect(backend.posts).toHaveLength(0)
    } finally { cleanup() }
  })

  it("Clássico: catálogo muda durante confirmação suspensa — sem segundo envio nem troca de carrinho", async () => {
    const { marcarKg, cleanup } = await mixedClassicWithPaymentOpen()
    try {
      backend.pauseWrites = true
      let pending: Promise<unknown> | undefined
      await act(async () => { pending = Promise.resolve(runtime.payment!.onConfirm!([{ id: "pix", type: "pix", value: 200 }])) })
      await waitFor(() => expect(backend.posts).toHaveLength(1))
      await marcarKg()
      await act(async () => {})
      expect(runtime.payment?.isOpen).toBe(true)
      expect(runtime.payment?.total).toBe(200)
      expect(backend.posts).toHaveLength(1)
      backend.pauseWrites = false
      await act(async () => { backend.releaseWrite?.(); await pending })
      expect(backend.posts).toHaveLength(1)
    } finally { cleanup() }
  })

  it("Supermercado: bipe/busca recusa antes do estoque", async () => {
    seedStorage(localStorage, "supermercado")
    const view = mount("supermercado")
    await waitFor(() => expect(runtime.ops?.inventory).toHaveLength(1))
    const input = view.getByPlaceholderText("Digite produto, categoria ou escaneie o código…")
    fireEvent.change(input, { target: { value: "N5C001" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await expectBlockedWithoutStockAdvice()
  })

  it("Assistência: carrinho persistido com o produto é limpo na restauração", async () => {
    seedStorage(localStorage, "assistencia", true)
    mount("assistencia")
    await expectBlockedWithoutStockAdvice()
  })

  it("Venda Completa: rascunho com o produto é limpo na restauração", async () => {
    seedStorage(localStorage, "venda-completa")
    localStorage.setItem(`omnigestao:venda-completa-ent-v2:${STORE}`, JSON.stringify({ cliente: CUSTOMER, discountReais: 0,
      cart: [{ lineId: "n5-c-line", inventoryId: PRODUTO.id, codigo: "N5C001", name: PRODUTO.name, unid: "UN", price: 100, qty: 1, discountPct: 0 }] }))
    mount("venda-completa")
    await expectBlockedWithoutStockAdvice()
  })
})
