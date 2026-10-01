// @vitest-environment jsdom
/** R4: mounts the production surfaces. Only providers, I/O and child dialogs are
 * replaced; cache, restore, pending guard, click and window listeners run unchanged.
 */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PendingResolutionSource, PendingSaleIdentity } from "./finalize-modal-contract"
import { PENDING_RETRY_GUIDANCE } from "./finalize-modal-contract"
import { getHeldSales, saveHeldSale, type HeldSale } from "@/lib/pdv-hold"
import { buildCapabilitiesSnapshot } from "./resolve-capability"
import { PdvAssistenciaEnterprise } from "@/components/dashboard/vendas/pdv-assistencia-enterprise"
import { VendaCompletaEnterprise } from "@/components/dashboard/vendas/venda-completa-enterprise"

type Surface = "assistencia" | "venda-completa"
type PaymentProps = ComponentProps<typeof import("@/components/dashboard/vendas/payment-modal").PaymentModal>
type HoldProps = ComponentProps<typeof import("@/components/dashboard/vendas/venda-espera-modal").VendaEsperaModal>
const runtime = vi.hoisted(() => ({
  storeId: "store-a",
  sales: [] as PendingResolutionSource[],
  inventory: [{ id: "prod-1", name: "Produto", price: 100, stock: 10, sku: "001" }],
  caixa: { isOpen: true, saldo: 100 },
  params: { atalhosRapidos: [], incluirImpostoEstimadoNoPdv: false, aliquotaImpostoEstimadoPdv: 0 },
  print: { imprimirAutomatico: false, rodapeCupom: "" },
  finalize: vi.fn(),
  newIdentity: vi.fn(),
  toast: vi.fn(),
  noop: vi.fn(),
  payment: undefined as PaymentProps | undefined,
  hold: undefined as HoldProps | undefined,
}))
vi.mock("@/lib/operations-store", () => ({ useOperationsStore: () => ({
  inventory: runtime.inventory, caixa: runtime.caixa, sales: runtime.sales,
  finalizeSaleTransaction: runtime.finalize, setInventory: runtime.noop,
  getSaldoCreditoCliente: () => 0, sincronizarCreditoLocal: runtime.noop,
}) }))
vi.mock("@/lib/store-settings-provider", () => ({ useStoreSettings: () => ({
  pdvParams: runtime.params, blob: { pdvParams: runtime.params }, hydrated: true,
  impressaoConfig: runtime.print, save: runtime.noop,
}) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({
  lojaAtivaId: runtime.storeId, empresaDocumentos: {}, getEnderecoDocumentos: () => "",
}) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: runtime.toast }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }))
vi.mock("@/lib/pdv-operador-nome", () => ({ usePdvOperadorNome: () => "Operador" }))
vi.mock("@/lib/pdv-operator-id", () => ({ getOrCreatePdvOperatorId: () => "operator-1" }))
vi.mock("@/lib/hooks/use-cliente-search", () => ({ useClienteSearch: () => ({ clientes: [], isLoading: false }) }))
vi.mock("@/components/dashboard/caixa/caixa-provider", () => ({ useCaixa: () => ({ caixa: runtime.caixa, sessaoId: "sessao-1" }) }))
vi.mock("@/components/dashboard/caixa/use-atualizar-caixa", () => ({ useGarantirSessaoCaixa: () => ({ garantirSessao: runtime.noop }) }))
vi.mock("@/components/dashboard/caixa/caixa-status-bar", () => ({ CaixaStatusBar: () => null }))
vi.mock("@/lib/pdv/use-pdv-capabilities", () => ({ usePdvCapabilities: (surfaceId: Surface) => ({
  overrides: undefined, isEnabled: () => true,
  snapshot: buildCapabilitiesSnapshot({ storeId: runtime.storeId, surfaceId }),
}) }))
vi.mock("@/lib/audit-log", () => ({ appendAuditLog: vi.fn() }))
vi.mock("@/app/actions/vendas-enterprise", () => ({ enrichVendaEnterprise: vi.fn() }))
vi.mock("@/lib/pdv-append-conta-receber", () => ({ appendContaReceberTituloPdvAprazo: vi.fn() }))
vi.mock("@/components/dashboard/vendas/payment-modal", () => ({ PaymentModal: (props: PaymentProps) => {
  runtime.payment = props
  return createElement("output", { "data-testid": "payment-state", "data-open": String(props.isOpen) })
} }))
vi.mock("@/components/dashboard/vendas/venda-espera-modal", () => ({ VendaEsperaModal: (props: HoldProps) => {
  runtime.hold = props
  return null
} }))
vi.mock("@/components/dashboard/vendas/pdv-cliente-picker", () => ({ PdvClientePicker: () => null }))
vi.mock("@/components/dashboard/vendas/acessorios/selecionar-acessorio-dialog", () => ({ SelecionarAcessorioDialog: () => null }))
vi.mock("@/components/dashboard/vendas/trocas-devolucao", () => ({ TrocasDevolucao: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-recebimento-modal", () => ({ PdvRecebimentoModal: () => null }))
vi.mock("@/components/dashboard/vendas/item-avulso-modal", () => ({ ItemAvulsoModal: () => null }))
vi.mock("@/components/dashboard/vendas/cupom-nao-fiscal", () => ({ CupomNaoFiscal: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-post-sale-dialog", () => ({ PdvPostSaleDialog: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-auto-print-feedback", () => ({ PdvAutoPrintFeedback: () => null }))

const IDENTITY: PendingSaleIdentity = { id: "PEND-original", clientSaleId: "client-original" }
const pending = (): PendingResolutionSource[] => [{ ...IDENTITY, syncPending: true }]
const resolved = (): PendingResolutionSource[] => [{ id: "VDA-confirmed", clientSaleId: IDENTITY.clientSaleId, syncPending: false }]
const assistLine = { lineId: "line-1", inventoryId: "prod-1", title: "Produto", price: 100, qty: 2, itemType: "produto" }
const vcLine = { lineId: "line-1", inventoryId: "prod-1", codigo: "001", name: "Produto", unid: "UN", price: 100, qty: 2, discountPct: 0 }
function cacheKey(surface: Surface, storeId = runtime.storeId) {
  return surface === "assistencia" ? "omnigestao:pdv-assistencia-cart:" + storeId : "omnigestao:venda-completa-ent-v2:" + storeId
}
/** Fixtures only seed the documented legacy input. Production writes and restores it. */
function seed(surface: Surface, identity?: PendingSaleIdentity, storeId = runtime.storeId, ageHours = 0) {
  const data = surface === "assistencia" ? {
    cart: [assistLine], customerName: "Cliente A", clienteId: "cli-a", clienteDoc: "11122233344",
    discount: 10, discountType: "reais", discountReais: 10, discountPercent: 0,
    savedAt: new Date(Date.now() - ageHours * 3600000).toISOString(),
  } : {
    cart: [vcLine], cliente: { id: "cli-a", name: "Cliente A", document: "11122233344" }, discountReais: 10,
  }
  localStorage.setItem(cacheKey(surface, storeId), JSON.stringify({ ...data, ...(identity ? { pendingIdentity: identity } : {}) }))
}
function element(surface: Surface) {
  return surface === "assistencia" ? createElement(PdvAssistenciaEnterprise) : createElement(VendaCompletaEnterprise, { onBack: runtime.noop })
}
async function mount(surface: Surface) {
  const view = render(element(surface))
  await act(async () => {}) // settle mocked read-only service/credit requests
  return view
}
function open(surface: Surface, path: string) {
  if (path === "click") {
    fireEvent.click(screen.getByRole("button", { name: surface === "assistencia" ? /DINHEIRO/i : /Finalizar Venda/i }))
  } else {
    fireEvent.keyDown(window, { key: path })
  }
}
async function confirm() {
  let outcome: boolean | void = undefined
  await act(async () => {
    outcome = await runtime.payment!.onConfirm!([{ id: "cash", type: "dinheiro", value: runtime.payment!.total }])
  })
  return outcome
}
async function recordPending(surface: Surface) {
  seed(surface)
  const view = await mount(surface)
  open(surface, "click")
  expect(runtime.payment!.isOpen).toBe(true)
  expect(await confirm()).toBe(true)
  expect(runtime.payment!.isOpen).toBe(false)
  runtime.finalize.mockClear()
  runtime.newIdentity.mockClear()
  runtime.toast.mockClear()
  return view
}
function expectBlocked() {
  expect(runtime.payment!.isOpen).toBe(false)
  expect(runtime.finalize).not.toHaveBeenCalled()
  expect(runtime.newIdentity).not.toHaveBeenCalled()
  expect(runtime.toast).toHaveBeenCalledWith(expect.objectContaining({ title: PENDING_RETRY_GUIDANCE.title }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"))
  localStorage.clear()
  runtime.storeId = "store-a"
  runtime.sales = pending()
  runtime.payment = undefined
  runtime.hold = undefined
  vi.clearAllMocks()
  runtime.finalize.mockReset().mockImplementation(async () => {
    runtime.newIdentity()
    return { ok: true, pending: true, saleId: IDENTITY.id, clientSaleId: IDENTITY.clientSaleId }
  })
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ items: [], creditos: {} }) })))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("R4 Assistência — production cache and remount", () => {
  it("registering PENDING writes the real cache immediately, without editing the cart or advancing 500ms", async () => {
    seed("assistencia")
    await mount("assistencia")
    await act(async () => { vi.advanceTimersByTime(501) })
    const before = JSON.parse(localStorage.getItem(cacheKey("assistencia"))!)
    expect(before.pendingIdentity).toBeUndefined()
    expect(await confirm()).toBe(true)
    const after = JSON.parse(localStorage.getItem(cacheKey("assistencia"))!)
    expect(after.pendingIdentity).toEqual(IDENTITY)
    expect(after.cart).toEqual(before.cart)
    expect(after).toMatchObject({ customerName: "Cliente A", clienteId: "cli-a", clienteDoc: "11122233344", discount: 10, discountReais: 10 })
  })

  it("PENDING → runtime cache → unmount/remount blocks opening and direct confirmation, with ZERO second finalize/identity", async () => {
    const first = await recordPending("assistencia")
    first.unmount()
    const uuid = vi.spyOn(crypto, "randomUUID")
    await mount("assistencia")
    open("assistencia", "F1")
    expectBlocked()
    expect(runtime.payment!.total).toBe(190)
    expect(await confirm()).toBe(false)
    expect(runtime.finalize).not.toHaveBeenCalled()
    expect(runtime.newIdentity).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(cacheKey("assistencia"))!).pendingIdentity).toEqual(IDENTITY)
    expect(uuid).not.toHaveBeenCalled()
    uuid.mockRestore()
  })

  it("a pending debounce cannot overwrite the immediately persisted identity", async () => {
    await recordPending("assistencia")
    await act(async () => { vi.advanceTimersByTime(501) })
    expect(JSON.parse(localStorage.getItem(cacheKey("assistencia"))!).pendingIdentity).toEqual(IDENTITY)
  })

  it("legacy cache without pendingIdentity preserves customer, discount and normalized lines", async () => {
    seed("assistencia")
    const data = JSON.parse(localStorage.getItem(cacheKey("assistencia"))!)
    delete data.cart[0].itemType
    data.cart.unshift(null)
    localStorage.setItem(cacheKey("assistencia"), JSON.stringify(data))
    await mount("assistencia")
    expect(runtime.payment!.selectedCustomer).toMatchObject({ id: "cli-a", name: "Cliente A", cpf: "11122233344" })
    expect(runtime.payment!.discountReais).toBe(10)
    open("assistencia", "F1")
    expect(runtime.payment!.isOpen).toBe(true)
    expect(await confirm()).toBe(true)
    expect(runtime.finalize).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ itemType: "produto", quantity: 2 })] }))
  })

  it("switching the mounted Assistência to another store resets its draft before any cache write", async () => {
    const view = await recordPending("assistencia")
    const rawA = localStorage.getItem(cacheKey("assistencia", "store-a"))
    runtime.storeId = "store-b"
    runtime.sales = resolved()
    view.rerender(element("assistencia"))
    expect(runtime.payment!.total).toBe(0)
    expect(runtime.payment!.selectedCustomer).toBeNull()
    await act(async () => { vi.advanceTimersByTime(501) })
    expect(localStorage.getItem(cacheKey("assistencia", "store-b"))).toBeNull()
    expect(localStorage.getItem(cacheKey("assistencia", "store-a"))).toBe(rawA)
    runtime.storeId = "store-a"
    runtime.sales = []
    view.rerender(element("assistencia"))
    expect(runtime.payment!.total).toBe(190)
    open("assistencia", "F1")
    expectBlocked()
  })

  it("legacy percent discounts and the existing 12h TTL remain valid", async () => {
    seed("assistencia")
    const data = JSON.parse(localStorage.getItem(cacheKey("assistencia"))!)
    localStorage.setItem(cacheKey("assistencia"), JSON.stringify({ ...data, discountType: "percent", discountPercent: 15, discountReais: 0 }))
    const view = await mount("assistencia")
    expect(runtime.payment!.discountPercent).toBe(15)
    expect(runtime.payment!.total).toBe(170)
    view.unmount()
    seed("assistencia", IDENTITY, runtime.storeId, 13)
    await mount("assistencia")
    expect(runtime.payment!.total).toBe(0)
    open("assistencia", "F1")
    expect(runtime.payment!.isOpen).toBe(false)
    expect(await confirm()).toBe(false)
    expect(runtime.finalize).not.toHaveBeenCalled()
  })
})

for (const surface of ["venda-completa", "assistencia"] as const) {
  // Each click/key case creates a fresh PENDING token. No click can clear the key fixture.
  for (const path of surface === "assistencia" ? ["click", "F1", "F10", "F12"] : ["click", "F1"]) {
    it(surface + " " + path + ": PENDING blocks; changing only sales.syncPending releases the same cart", async () => {
      const view = await recordPending(surface)
      const customer = runtime.payment!.selectedCustomer
      const total = runtime.payment!.total
      open(surface, path)
      expectBlocked()
      runtime.sales = resolved()
      view.rerender(element(surface))
      expect(runtime.payment!.isOpen).toBe(false)
      expect(runtime.payment!.selectedCustomer).toEqual(customer)
      expect(runtime.payment!.total).toBe(total)
      open(surface, path)
      expect(runtime.payment!.isOpen).toBe(true)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
  }


  for (const path of ["click", "F1"]) {
    it(surface + " " + path + ": an old resolved sales snapshot cannot release a newly pending identity", async () => {
      runtime.sales = resolved()
      const view = await recordPending(surface)
      runtime.sales = pending()
      view.rerender(element(surface))
      open(surface, path)
      expectBlocked()
      expect(await confirm()).toBe(false)
      expect(runtime.finalize).not.toHaveBeenCalled()
      expect(runtime.newIdentity).not.toHaveBeenCalled()
    })
  }

  it(surface + ": direct confirmation resolves using current sales, without opening/clicking first", async () => {
    const view = await recordPending(surface)
    runtime.sales = resolved()
    view.rerender(element(surface))
    runtime.finalize.mockResolvedValue({ ok: false, reason: "test stop before any real sale" })
    expect(await confirm()).toBe(false)
    expect(runtime.finalize).toHaveBeenCalledTimes(1)
    expect(runtime.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: PENDING_RETRY_GUIDANCE.title }))
  })

  for (const [label, sales, allowed] of [
    ["pending", pending(), false], ["resolved", resolved(), true], ["missing", [], false],
  ] as const) {
    it(surface + ": an already open modal uses current sales for a resumed identity — " + label, async () => {
      seed(surface)
      const view = await mount(surface)
      open(surface, "F1")
      expect(runtime.payment!.isOpen).toBe(true)
      // Execute the production hold-resume callback while the payment view is
      // mounted. This supplies a token without first resolving/clearing it by opening.
      const held: HeldSale = { id: "pending-held", label: "Pendente", savedAt: new Date().toISOString(), pdvType: surface,
        items: [{ lineId: "line-1", inventoryId: "prod-1", name: "Produto", price: 100, quantity: 2 }],
        customer: { id: "cli-a", name: "Cliente A", cpf: "11122233344" }, pendingIdentity: IDENTITY,
      }
      act(() => { runtime.hold!.onResume(held) })
      expect(runtime.payment!.isOpen).toBe(true)
      runtime.sales = [...sales]
      view.rerender(element(surface))
      runtime.finalize.mockResolvedValue({ ok: false, reason: "test stop before any real sale" })
      expect(await confirm()).toBe(false)
      expect(runtime.finalize).toHaveBeenCalledTimes(allowed ? 1 : 0)
      if (!allowed) expect(runtime.newIdentity).not.toHaveBeenCalled()
    })
  }

  for (const sales of [[], [{ id: "other", clientSaleId: "other", syncPending: false }]]) {
    it(surface + ": partial/missing original sale stays fail-closed in both opening and confirmation: " + JSON.stringify(sales), async () => {
      const view = await recordPending(surface)
      runtime.sales = sales
      view.rerender(element(surface))
      open(surface, "F1")
      expectBlocked()
      expect(await confirm()).toBe(false)
      expect(runtime.finalize).not.toHaveBeenCalled()
      expect(runtime.newIdentity).not.toHaveBeenCalled()
    })
  }

  it(surface + ": production hold/resume preserves PENDING and store/terminal isolation", async () => {
    await recordPending(surface)
    act(() => { runtime.hold!.onHold() })
    const held = getHeldSales("store-a", "default", surface)
    expect(held).toHaveLength(1)
    expect(held[0].pendingIdentity).toEqual(IDENTITY)
    expect(getHeldSales("store-b", "default", surface)).toEqual([])
    expect(getHeldSales("store-a", "terminal-b", surface)).toEqual([])
    act(() => { runtime.hold!.onResume(held[0]) })
    open(surface, "F1")
    expectBlocked()
    expect(await confirm()).toBe(false)
    expect(runtime.finalize).not.toHaveBeenCalled()
  })

  it(surface + ": legacy hold resumes with no pending identity", async () => {
    seed(surface)
    await mount(surface)
    const legacy: HeldSale = { id: "legacy-hold", label: "Venda antiga", savedAt: new Date().toISOString(), pdvType: surface,
      items: [{ lineId: "legacy-line", inventoryId: "prod-1", name: "Produto", price: 100, quantity: 1 }],
      customer: { id: "cli-a", name: "Cliente A", cpf: "11122233344" },
    }
    saveHeldSale("store-a", "default", legacy)
    act(() => { runtime.hold!.onResume(legacy) })
    open(surface, "F1")
    expect(runtime.payment!.isOpen).toBe(true)
  })

  it(surface + ": Store B cannot release or inherit Store A cache identity", async () => {
    const viewA = await recordPending(surface)
    const rawA = localStorage.getItem(cacheKey(surface, "store-a"))
    viewA.unmount()
    runtime.storeId = "store-b"
    runtime.sales = resolved()
    seed(surface)
    const viewB = await mount(surface)
    open(surface, "F1")
    expect(runtime.payment!.isOpen).toBe(true)
    expect(localStorage.getItem(cacheKey(surface, "store-a"))).toBe(rawA)
    viewB.unmount()
    runtime.storeId = "store-a"
    runtime.sales = []
    await mount(surface)
    runtime.toast.mockClear()
    open(surface, "F1")
    expectBlocked()
    expect(await confirm()).toBe(false)
    expect(runtime.finalize).not.toHaveBeenCalled()
  })
}
