// @vitest-environment jsdom
// Os handlers e o estado do Clássico são reais; providers, subárvores e I/O
// são sintéticos. Nenhum teste conecta ao banco ou a dispositivos.
import { createElement, type ComponentProps, type KeyboardEvent } from "react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { InventoryItem } from "@/lib/operations-store"
import type { PdvOmniClassicShellProps } from "@/components/dashboard/vendas/pdv-omni-classic-shell"
import { productCommercialCatalogProjection } from "@/lib/cadastros/product-commercial-contract"
import { PdvClassic } from "@/components/dashboard/vendas/pdv-classic"

type PaymentProps = ComponentProps<typeof import("@/components/dashboard/vendas/payment-modal").PaymentModal>
type AvulsoProps = ComponentProps<typeof import("@/components/dashboard/vendas/item-avulso-modal").ItemAvulsoModal>
type HoldProps = ComponentProps<typeof import("@/components/dashboard/vendas/venda-espera-modal").VendaEsperaModal>
const r = vi.hoisted(() => ({
  inventory: [] as InventoryItem[], store: "synthetic-weight-store",
  shell: undefined as PdvOmniClassicShellProps | undefined,
  payment: undefined as PaymentProps | undefined,
  avulso: undefined as AvulsoProps | undefined,
  hold: undefined as HoldProps | undefined,
  weightOpen: false, attrOpen: false,
  toast: vi.fn(), finalize: vi.fn(), setInventory: vi.fn(), hardware: vi.fn(), noop: vi.fn(),
}))
vi.mock("@/lib/operations-store", () => ({ useOperationsStore: () => ({
  inventory: r.inventory, setInventory: r.setInventory, finalizeSaleTransaction: r.finalize,
  getSaldoCreditoCliente: () => 0, sincronizarCreditoLocal: r.noop, ordens: [], sales: [],
}) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: r.store, opsStorageKey: `ops-${r.store}`, empresaDocumentos: { nomeFantasia: "Loja sintética" }, getEnderecoDocumentos: () => "" }) }))
vi.mock("@/lib/store-settings-provider", () => ({ useStoreSettings: () => ({ storeId: r.store, pdvParams: { atalhosRapidos: [] }, impressaoConfig: {}, settings: {}, hydrated: true }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: r.toast }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: r.noop, replace: r.noop }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }))
vi.mock("@/lib/pdv-operador-nome", () => ({ usePdvOperadorNome: () => "Operador sintético" }))
vi.mock("@/lib/pdv-operator-id", () => ({ getOrCreatePdvOperatorId: () => "synthetic-operator" }))
vi.mock("@/lib/hooks/use-cliente-search", () => ({ useClienteSearch: () => ({ clientes: [], isLoading: false }) }))
vi.mock("@/components/theme/ThemeProvider", () => ({ useStudioTheme: () => ({ mode: "classic" }) }))
vi.mock("@/components/dashboard/caixa/caixa-provider", () => ({ useCaixa: () => ({ caixa: { isOpen: true }, sessaoId: "synthetic-session" }) }))
vi.mock("@/components/dashboard/caixa/use-atualizar-caixa", () => ({ useGarantirSessaoCaixa: () => ({ garantirSessao: r.noop }) }))
vi.mock("@/components/dashboard/caixa/caixa-status-bar", () => ({ CaixaStatusBar: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-omni-classic-shell", () => ({ PdvOmniClassicShell: (props: PdvOmniClassicShellProps) => { r.shell = props; return null } }))
vi.mock("@/components/dashboard/vendas/payment-modal", () => ({ PaymentModal: (props: PaymentProps) => { r.payment = props; return null } }))
vi.mock("@/components/dashboard/vendas/item-avulso-modal", () => ({ ItemAvulsoModal: (props: AvulsoProps) => { r.avulso = props; return null } }))
vi.mock("@/components/dashboard/vendas/venda-espera-modal", () => ({ VendaEsperaModal: (props: HoldProps) => { r.hold = props; return null } }))
vi.mock("@/components/dashboard/vendas/pdv-product-dialogs", () => ({
  AttrProductDialog: (props: { open: boolean }) => { r.attrOpen = props.open; return null },
  WeightProductDialog: (props: { open: boolean }) => { r.weightOpen = props.open; return null },
}))
vi.mock("@/services/hardware-bridge", () => ({ isWebSerialSupported: r.hardware, openScalePort: r.hardware, closeScalePort: r.hardware, waitForStableWeightKg: r.hardware, peekLastWeightKg: r.hardware }))
vi.mock("@/components/dashboard/vendas/acessorios/selecionar-acessorio-dialog", () => ({ SelecionarAcessorioDialog: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-recebimento-modal", () => ({ PdvRecebimentoModal: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-cliente-picker", () => ({ PdvClientePicker: () => null }))
vi.mock("@/components/dashboard/vendas/trocas-devolucao", () => ({ TrocasDevolucao: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-post-sale-dialog", () => ({ PdvPostSaleDialog: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-auto-print-feedback", () => ({ PdvAutoPrintFeedback: () => null }))

function inventory(unit: "UN" | "KG" | "G", stock: number): InventoryItem {
  const projection = productCommercialCatalogProjection({ comercial: {
    version: 1, modoVenda: unit === "UN" ? "unidade" : "peso", unidade: unit, basePreco: unit,
  } }, 20)
  return { id: "PAD-SYNTH-001", sku: "PAD-SYNTH-001", barcode: "7890000000001", name: "PAO SINTETICO", category: "Padaria", price: 20, cost: 5, stock, vendaPorPeso: projection.vendaPorPeso }
}
async function mount(unit: "UN" | "KG" | "G" = "KG", stock = 0) {
  r.inventory = [inventory(unit, stock)]
  const view = render(createElement(PdvClassic))
  await waitFor(() => expect(r.shell).toBeDefined())
  return view
}
async function scan(value: string) {
  await act(async () => { r.shell!.onBipeChange(value) })
  await act(async () => { await r.shell!.onBipeKeyDown({ key: "Enter", preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLInputElement>) })
}
async function mountRemote(unit: "UN" | "KG" | "G", stock: number) {
  r.inventory = []
  const remoteItem = inventory(unit, stock)
  vi.stubGlobal("fetch", vi.fn(async (input: string) => new Response(JSON.stringify(
    input.includes("/api/ops/inventory/lookup")
      ? { items: [remoteItem] }
      : { store: { id: r.store, name: "Loja sintética" }, settings: {} },
  ), { headers: { "Content-Type": "application/json" } })))
  render(createElement(PdvClassic))
  await waitFor(() => expect(r.shell).toBeDefined())
}
function expectBlocked() {
  expect(r.toast).toHaveBeenLastCalledWith(expect.objectContaining({
    title: "Venda por peso ainda não disponível", description: expect.stringContaining("Cadastro ou saldo em KG/G"),
  }))
  expect(r.toast.mock.calls.some(([copy]) => copy.title === "Sem estoque")).toBe(false)
  expect(r.weightOpen).toBe(false)
  expect(r.attrOpen).toBe(false)
  expect(r.payment?.isOpen).toBe(false)
  expect(r.finalize).not.toHaveBeenCalled()
  expect(r.hardware).not.toHaveBeenCalled()
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks()
  r.shell = undefined; r.payment = undefined; r.avulso = undefined; r.hold = undefined
  r.weightOpen = false; r.attrOpen = false
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ store: { id: r.store, name: "Loja sintética" }, settings: {} }), { headers: { "Content-Type": "application/json" } })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("PDV Clássico: guard comercial antes do saldo e das mutações", () => {
  it.each([["KG", 0], ["KG", 5], ["G", 0], ["G", 500]] as const)("%s com saldo %s bloqueia busca, seleção e bipagem", async (unit, stock) => {
    await mount(unit, stock)
    // Mesmo com atributos, o produto não pode abrir um fluxo intermediário.
    const product = { ...r.shell!.products[0], atributos: [{ id: "sabor", nome: "Sabor", opcoes: ["Natural"] }] }
    await act(async () => { r.shell!.onAddProductFromSearch(product) })
    expectBlocked()
    await act(async () => { r.shell!.onBipeSuggestionSelect!(product) })
    expectBlocked()
    for (const query of ["PAD-SYNTH-001", "7890000000001", "PAO SINTETICO", "1*7890000000001", "2*PAD-SYNTH-001"]) {
      await scan(query)
      expectBlocked()
      expect(r.shell!.cartRows).toEqual([])
    }
    expect(r.setInventory).not.toHaveBeenCalled()
  })

  it("UN disponível entra normalmente e mantém quantidade inteira", async () => {
    await mount("UN", 5)
    await scan("2*7890000000001")
    expect(r.shell!.cartRows).toMatchObject([{ unit: "UN", qty: 2, unitPrice: 20 }])
    expect(r.shell!.total).toBe(40)
    expect(r.toast).not.toHaveBeenCalled()
  })

  it("UN sem saldo continua mostrando Sem estoque", async () => {
    await mount("UN", 0)
    await scan("7890000000001")
    expect(r.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Sem estoque" }))
    expect(r.shell!.cartRows).toEqual([])
  })

  it.each([["KG", 0], ["KG", 5], ["G", 0], ["G", 500]] as const)("fallback remoto %s com saldo %s bloqueia SKU/EAN antes do carrinho", async (unit, stock) => {
    await mountRemote(unit, stock)
    for (const query of ["1*PAD-SYNTH-001", "2*7890000000001"]) {
      await scan(query)
      expectBlocked()
      expect(r.shell!.cartRows).toEqual([])
      expect(r.avulso!.open).toBe(false)
    }
    expect(r.setInventory).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("lojaId=synthetic-weight-store"), expect.objectContaining({
      headers: { "x-assistec-loja-id": "synthetic-weight-store" },
    }))
  })

  it("UN disponível encontrado no fallback remoto entra normalmente", async () => {
    await mountRemote("UN", 5)
    await scan("1*7890000000001")
    expect(r.shell!.cartRows).toMatchObject([{ unit: "UN", qty: 1, unitPrice: 20 }])
    expect(r.toast).not.toHaveBeenCalled()
  })

  it("catálogo atual impede que seleção antiga sem flag trate KG como UN", async () => {
    await mount("KG", 10)
    await act(async () => { r.shell!.onAddProductFromSearch({ ...r.shell!.products[0], vendaPorPeso: false }) })
    expectBlocked()
    expect(r.shell!.cartRows).toEqual([])
  })

  it("comanda KG é bloqueada antes de alterar o carrinho", async () => {
    sessionStorage.setItem("assistec-pdv-import-comanda", JSON.stringify({ lines: [{ inventoryId: "PAD-SYNTH-001", name: "PAO SINTETICO", price: 20, quantity: 1 }] }))
    await mount("KG", 0)
    expectBlocked()
    expect(r.shell!.cartRows).toEqual([])
  })

  it("linha antiga com quantidade 1 não pode editar quantidade, abrir pagamento ou finalizar como UN", async () => {
    const view = await mount("UN", 5)
    await scan("7890000000001")
    r.inventory = [inventory("KG", 0)]
    view.rerender(createElement(PdvClassic))
    await act(async () => { r.shell!.onSelectLine(r.shell!.cartRows[0].lineId) })
    await act(async () => { r.shell!.onShortcutAction("F4") })
    expect(r.shell!.qtyEditOpen).toBe(false)
    await act(async () => { expect(r.shell!.onQtyEditConfirm("1")).toBe(false) })
    expectBlocked()
    await act(async () => { r.shell!.onFinalizeClick() })
    expectBlocked()
    await act(async () => { expect(await r.payment!.onConfirm!([{ id: "pix", type: "pix", value: 20 }])).toBe(false) })
    expectBlocked()
    expect(r.shell!.cartRows[0].qty).toBe(1)
    expect(r.setInventory).not.toHaveBeenCalled()
  })

  it("hold legado KG com quantidade 1 não altera o carrinho", async () => {
    await mount("KG", 5)
    await act(async () => {
      expect(r.hold!.onResume({ id: "synthetic-hold", label: "Espera sintética", pdvType: "classic", savedAt: "2026-10-26T12:00:00Z", items: [
        { lineId: "synthetic-line", inventoryId: "PAD-SYNTH-001", name: "PAO SINTETICO", quantity: 1, price: 20 },
      ] })).toBe(false)
    })
    expectBlocked()
    expect(r.shell!.cartRows).toEqual([])
  })

  it("Item Avulso permanece UN e rejeita código conhecido de produto por peso", async () => {
    await mount("KG", 5)
    const payload = { description: "Item sintético", quantity: 1, unitPrice: 10, custoUnitario: null, codigo: "7890000000001" }
    await act(async () => { r.avulso!.onConfirm(payload) })
    expectBlocked()
    expect(r.shell!.cartRows).toEqual([])
    await act(async () => { r.avulso!.onConfirm({ ...payload, codigo: null }) })
    expect(r.shell!.cartRows).toMatchObject([{ unit: "UN", qty: 1 }])
  })
})
