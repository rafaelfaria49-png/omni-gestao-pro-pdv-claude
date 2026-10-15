// @vitest-environment jsdom
/** Synthetic providers/network only. Four production surfaces, the Classic shell,
 * PaymentModal, ItemAvulsoModal, VendaEsperaModal, PIN and confirmation dialogs run
 * their actual handlers. No database, Auth.js session or production writes. */
import { createElement, type ComponentProps } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultFormasPagamento, type FormaPagamentoConfig } from "@/lib/pdv-formas-pagamento"
import { buildCapabilitiesSnapshot } from "./resolve-capability"
import type { OfficialPdvSurfaceId } from "./surface-ids"
import { PdvClassic } from "@/components/dashboard/vendas/pdv-classic"
import { PdvAssistenciaEnterprise } from "@/components/dashboard/vendas/pdv-assistencia-enterprise"
import { PdvSupermercado } from "@/components/dashboard/vendas/pdv-supermercado"
import { VendaCompletaEnterprise } from "@/components/dashboard/vendas/venda-completa-enterprise"

type PaymentProps = ComponentProps<typeof import("@/components/dashboard/vendas/payment-modal").PaymentModal>
type PickerProps = ComponentProps<typeof import("@/components/dashboard/vendas/pdv-cliente-picker").PdvClientePicker>
type ReceiptProps = ComponentProps<typeof import("@/components/dashboard/vendas/pdv-recebimento-modal").PdvRecebimentoModal>
const runtime = vi.hoisted(() => ({
  inventory: [{ id: "prod-1", name: "Produto sintético", price: 100, stock: 10, sku: "001" }],
  caixa: { isOpen: true, saldo: 100 },
  params: { formasPagamento: [] as FormaPagamentoConfig[], atalhosRapidos: [], incluirImpostoEstimadoNoPdv: false, aliquotaImpostoEstimadoPdv: 0 },
  print: { imprimirAutomatico: false, rodapeCupom: "" },
  disabled: new Set<string>(),
  finalize: vi.fn(), toast: vi.fn(), noop: vi.fn(), garantir: vi.fn(), pin: vi.fn(),
  payment: undefined as PaymentProps | undefined,
  customer: undefined as PickerProps | undefined,
  receipt: undefined as ReceiptProps | undefined,
  adminSession: false,
}))
vi.mock("@/lib/operations-store", () => ({ useOperationsStore: () => ({
  inventory: runtime.inventory, caixa: runtime.caixa, sales: [], ordens: [],
  finalizeSaleTransaction: runtime.finalize, setInventory: runtime.noop,
  getSaldoCreditoCliente: () => 0, sincronizarCreditoLocal: runtime.noop,
}) }))
vi.mock("@/lib/store-settings-provider", () => ({ useStoreSettings: () => ({
  pdvParams: runtime.params, blob: { pdvParams: runtime.params }, settings: {}, hydrated: true,
  storeId: "store-b2", impressaoConfig: runtime.print, save: runtime.noop,
}) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({
  lojaAtivaId: "store-b2", opsStorageKey: "ops:store-b2", empresaDocumentos: { nomeFantasia: "Loja sintética" }, getEnderecoDocumentos: () => "",
}) }))
vi.mock("@/lib/config-empresa", async (original) => {
  const actual = await original<typeof import("@/lib/config-empresa")>()
  return { ...actual, useConfigEmpresa: () => ({ config: actual.configPadrao }) }
})
vi.mock("@/components/theme/ThemeProvider", () => ({ useStudioTheme: () => ({ mode: "classic" }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: runtime.noop, replace: runtime.noop }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: runtime.toast }) }))
vi.mock("@/lib/pdv-operador-nome", () => ({ usePdvOperadorNome: () => "Operador sintético" }))
vi.mock("@/lib/pdv-operator-id", () => ({ getOrCreatePdvOperatorId: () => "operator-b2" }))
vi.mock("@/lib/hooks/use-cliente-search", () => ({ useClienteSearch: () => ({ clientes: [], isLoading: false }) }))
vi.mock("@/components/dashboard/caixa/caixa-provider", () => ({ useCaixa: () => ({ caixa: runtime.caixa, sessaoId: "session-b2" }) }))
vi.mock("@/components/dashboard/caixa/use-atualizar-caixa", () => ({ useGarantirSessaoCaixa: () => ({ garantirSessao: runtime.garantir }) }))
vi.mock("@/components/dashboard/caixa/caixa-status-bar", () => ({ CaixaStatusBar: () => null }))
vi.mock("@/lib/pdv/use-pdv-capabilities", () => ({ usePdvCapabilities: (surfaceId: OfficialPdvSurfaceId) => ({
  isEnabled: (key: string) => !runtime.disabled.has(key), overrides: undefined,
  snapshot: buildCapabilitiesSnapshot({ storeId: "store-b2", surfaceId }),
}) }))
vi.mock("@/lib/audit-log", () => ({ appendAuditLog: vi.fn() }))
vi.mock("@/app/actions/vendas-enterprise", () => ({ enrichVendaEnterprise: vi.fn() }))
vi.mock("@/lib/pdv-append-conta-receber", () => ({ appendContaReceberTituloPdvAprazo: vi.fn() }))
// Observe props without substituting PaymentModal or any payment handler.
vi.mock("@/components/dashboard/vendas/payment-modal", async (original) => {
  const actual = await original<typeof import("@/components/dashboard/vendas/payment-modal")>()
  return { ...actual, PaymentModal: (props: PaymentProps) => {
    runtime.payment = props
    return createElement(actual.PaymentModal, props)
  } }
})
// Customer/receivables/network subtrees are I/O boundaries; surface opening handlers remain real.
vi.mock("@/components/dashboard/vendas/pdv-cliente-picker", () => ({ PdvClientePicker: (props: PickerProps) => { runtime.customer = props; return null } }))
vi.mock("@/components/dashboard/vendas/pdv-recebimento-modal", () => ({ PdvRecebimentoModal: (props: ReceiptProps) => { runtime.receipt = props; return null } }))
vi.mock("@/components/dashboard/vendas/trocas-devolucao", () => ({ TrocasDevolucao: () => createElement("output", null, "Trocas sintéticas") }))
vi.mock("@/components/dashboard/vendas/acessorios/selecionar-acessorio-dialog", () => ({ SelecionarAcessorioDialog: () => null }))
vi.mock("@/components/dashboard/vendas/cupom-nao-fiscal", () => ({ CupomNaoFiscal: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-post-sale-dialog", () => ({ PdvPostSaleDialog: () => null }))
vi.mock("@/components/dashboard/vendas/pdv-auto-print-feedback", () => ({ PdvAutoPrintFeedback: () => null }))

const surfaces = ["classic", "assistencia", "supermercado", "venda-completa"] as const
function key(value: string, options: Record<string, unknown> = {}, target: Element | Window = document.activeElement ?? window) {
  fireEvent.keyDown(target, { key: value, ...options })
}
function unfocus() { act(() => { (document.activeElement as HTMLElement | null)?.blur() }) }
async function settle() { await act(async () => {}) }
async function addLine(name: string) {
  key("Insert")
  const dialog = screen.getByRole("dialog", { name: /Item Avulso/i })
  fireEvent.change(within(dialog).getByPlaceholderText("Ex.: Suporte de TV universal"), { target: { value: name } })
  fireEvent.change(within(dialog).getAllByPlaceholderText("0,00")[0], { target: { value: "100" } })
  fireEvent.click(within(dialog).getByRole("button", { name: /Adicionar ao carrinho/i }))
  await settle()
}
async function mount(surface: OfficialPdvSurfaceId, rapid = false) {
  if (surface === "venda-completa") localStorage.setItem("omnigestao:venda-completa-ent-v2:store-b2", JSON.stringify({
    cart: [{ lineId: "line-a", inventoryId: "prod-1", codigo: "001", name: "Linha A", unid: "UN", price: 100, qty: 1, discountPct: 0 }],
    cliente: { id: "cli-b2", name: "Cliente sintético", document: "52998224725" }, discountReais: 0,
  }))
  const view = render(surface === "classic" ? createElement(PdvClassic, { isModoRapido: rapid })
    : surface === "assistencia" ? createElement<{ isModoRapido?: boolean }>(PdvAssistenciaEnterprise, { isModoRapido: rapid })
      : surface === "supermercado" ? createElement(PdvSupermercado, { isModoRapido: rapid })
        : createElement(VendaCompletaEnterprise, { onBack: runtime.noop }))
  await settle()
  if (surface !== "venda-completa") await addLine("Linha A")
  await addLine("Linha B")
  unfocus()
  return view
}
const subtotal = () => runtime.payment!.cartSubtotal!
const pinCalls = () => runtime.pin.mock.calls.length
function supervisorAction(action: "remove" | "clear") {
  if (action === "clear") fireEvent.click(screen.getByRole("button", { name: /^Limpar$/ }))
  else fireEvent.click(screen.getAllByTitle("Remover item")[0])
}
async function submitPin() {
  fireEvent.change(screen.getByPlaceholderText("PIN"), { target: { value: "1234" } })
  fireEvent.click(screen.getByRole("button", { name: /Autorizar|Confirmar/ }))
  await settle()
}

beforeEach(() => {
  process.env.DEBUG_PRINT_LIMIT = "600"
  vi.useFakeTimers()
  localStorage.clear(); sessionStorage.clear()
  runtime.params.formasPagamento = defaultFormasPagamento()
  runtime.disabled.clear(); runtime.caixa.isOpen = true; runtime.adminSession = false
  runtime.payment = undefined; runtime.customer = undefined; runtime.receipt = undefined
  vi.clearAllMocks()
  runtime.finalize.mockReset().mockResolvedValue({ ok: false, reason: "Falha sintética" })
  runtime.pin.mockReset().mockResolvedValue({ ok: false })
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/admin" && init?.method === "POST") return runtime.pin()
    return { ok: true, json: async () => ({ authenticated: runtime.adminSession, store: { name: "Loja sintética" }, settings: {}, items: [], creditos: {} }) }
  }))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

for (const surface of surfaces) {
  describe("N5-B2 " + surface + " — handlers reais", () => {
    it("F1 abre pagamento uma vez, sem finalizar; Escape não remove item", async () => {
      await mount(surface)
      const before = subtotal()
      key("F1")
      expect(runtime.payment!.isOpen, JSON.stringify({ toast: runtime.toast.mock.calls, customer: runtime.payment!.selectedCustomer })).toBe(true)
      key("F1"); key("F7"); key("Insert"); key("F5")
      expect(screen.getAllByRole("dialog")).toHaveLength(1)
      key("Escape"); key("Escape")
      expect(subtotal()).toBe(before)
      expect(runtime.finalize).not.toHaveBeenCalled()
      expect(pinCalls()).toBe(0)
    })

    it("F7 coloca e retoma espera pelos componentes reais, sem venda", async () => {
      await mount(surface)
      key("F7")
      const dialog = screen.getByRole("dialog", { name: "Vendas em espera" })
      key("Insert"); key("F1"); key("F7")
      expect(screen.getAllByRole("dialog")).toHaveLength(1)
      fireEvent.click(within(dialog).getByRole("button", { name: /Colocar venda atual em espera/i }))
      expect(subtotal()).toBe(0)
      unfocus(); key("F7")
      fireEvent.click(screen.getByRole("button", { name: /Retomar/i }))
      expect(subtotal()).toBeGreaterThan(0)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })

    it("Insert abre avulso; F7 não atravessa o modal; Escape fecha sem remover", async () => {
      await mount(surface)
      const before = subtotal()
      key("Insert"); key("F7"); key("F1")
      expect(screen.getAllByRole("dialog")).toHaveLength(1)
      key("Escape")
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(subtotal()).toBe(before)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })

    it.each(["input", "textarea", "contenteditable"])("%s não remove nem limpa via Escape/Delete/F5/Ctrl+L", async (tag) => {
      await mount(surface, surface !== "venda-completa")
      const before = subtotal()
      const input = document.createElement(tag === "contenteditable" ? "div" : tag)
      if (tag === "contenteditable") { input.setAttribute("contenteditable", "true"); input.tabIndex = 0 }
      document.body.appendChild(input); input.focus()
      key("Escape"); key("Delete"); key("F5"); key("l", { ctrlKey: true })
      expect(subtotal()).toBe(before)
      expect(screen.queryByRole("alertdialog")).toBeNull()
      expect(runtime.finalize).not.toHaveBeenCalled()
      input.remove()
    })

    it.each(["dialog", "alertdialog", "menu", "listbox"])("portal %s bloqueia atalhos mesmo com foco fora dele", async (role) => {
      await mount(surface, surface !== "venda-completa")
      const before = subtotal()
      const portal = document.createElement("div"); portal.setAttribute("role", role); document.body.appendChild(portal)
      for (const value of ["F1", "F2", "F4", "F5", "F7", "F10", "Insert", "Escape", "Delete"]) key(value)
      expect(runtime.payment!.isOpen).toBe(false)
      expect(subtotal()).toBe(before)
      expect(runtime.finalize).not.toHaveBeenCalled()
      portal.remove()
    })

    it("repeat e evento consumido não abrem, removem ou finalizam", async () => {
      await mount(surface, surface !== "venda-completa")
      const before = subtotal()
      for (const value of ["F1", "F2", "F4", "F5", "F7", "F10", "Insert", "Escape", "Delete"]) {
        key(value, { repeat: true })
        const consumed = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }); consumed.preventDefault()
        fireEvent(window, consumed)
      }
      expect(runtime.payment!.isOpen).toBe(false)
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(screen.queryByRole("alertdialog")).toBeNull()
      expect(subtotal()).toBe(before)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })

    it("capabilities bloqueiam F1/F7; caixa fechado preserva carrinho", async () => {
      await mount(surface)
      runtime.disabled.add("pdv.heldSales"); runtime.disabled.add("sales.paymentMethods")
      // Trigger a production render, without replacing the keyboard listener.
      key("Insert"); key("Escape"); unfocus()
      key("F1"); key("F7")
      expect(runtime.payment!.isOpen).toBe(false)
      expect(screen.queryByRole("dialog")).toBeNull()
      runtime.disabled.clear(); runtime.caixa.isOpen = false
      key("F1")
      expect(runtime.payment!.isOpen).toBe(false)
      expect(subtotal()).toBeGreaterThan(0)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })

    it("finalização real em voo bloqueia Escape, reentrada e remoção", async () => {
      await mount(surface)
      const before = subtotal()
      let resolve!: (value: { ok: false; reason: string }) => void
      runtime.finalize.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
      key("F1")
      const payment = screen.getByRole("dialog")
      fireEvent.click(within(payment).getAllByRole("button", { name: /Dinheiro/i })[0])
      const amount = within(payment).getByPlaceholderText(runtime.payment!.total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
      fireEvent.change(amount, { target: { value: String(Math.round(runtime.payment!.total * 100)) } })
      fireEvent.click(within(payment).getByRole("button", { name: /Confirmar Dinheiro/i }))
      fireEvent.click(within(payment).getByRole("button", { name: "Confirmar Pagamento" }))
      fireEvent.click(screen.getByRole("button", { name: "Sim, finalizar" }))
      // Production confirmation waits 50ms before calling the surface handler.
      await act(async () => { vi.advanceTimersByTime(51) })
      expect(runtime.finalize).toHaveBeenCalledTimes(1)
      for (const value of ["F1", "F7", "Insert", "F5", "Escape", "Delete"]) key(value)
      expect(runtime.payment!.isOpen).toBe(true)
      expect(subtotal()).toBe(before)
      expect(runtime.finalize).toHaveBeenCalledTimes(1)
      await act(async () => { resolve({ ok: false, reason: "Falha sintética após espera" }) })
      expect(subtotal()).toBe(before)
    })

    it("ajuda e hints descrevem somente as teclas desta superfície", async () => {
      await mount(surface)
      if (surface === "supermercado") {
        expect(screen.getByText(/F7: espera/).textContent).toContain("F10: cliente/CPF")
        expect(screen.getByTitle("Dinheiro").textContent).toContain("F1/F2")
      } else {
        key("End")
        const help = screen.getByRole("dialog").textContent!
        if (surface === "classic") {
          expect(help).toContain("F1 abre o pagamento")
          expect(help).not.toContain("Espaço")
          expect(help).not.toContain("Ctrl+L")
        } else if (surface === "assistencia") {
          expect(help).toContain("Remover item com confirmação")
          expect(help).toContain("Recebimento de Contas")
          expect(help).toContain("Ctrl+L")
        } else expect(help).toContain("F4, F5, F8, F9, F10 e F12: sem atalho")
      }
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
  })
}

describe("N5-B2 — PIN vigente do Supermercado", () => {
  for (const action of ["remove", "clear"] as const) {
    it.each(["denied", "error", "cancel"])(action + ": %s conserva todo o carrinho", async (result) => {
      await mount("supermercado")
      const before = subtotal()
      supervisorAction(action)
      expect(screen.getByRole("dialog", { name: "Senha do Supervisor" })).toBeTruthy()
      if (result === "cancel") key("Escape")
      else {
        if (result === "error") runtime.pin.mockRejectedValueOnce(new Error("Synthetic network failure"))
        await submitPin()
      }
      expect(subtotal()).toBe(before)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
    it(action + ": cancelar request em voo invalida autorização tardia", async () => {
      await mount("supermercado")
      const before = subtotal()
      let resolve!: (value: { ok: boolean }) => void
      runtime.pin.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
      supervisorAction(action); await submitPin()
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
      await act(async () => { resolve({ ok: true }) })
      expect(subtotal()).toBe(before)
      supervisorAction(action)
      expect(screen.getByRole("dialog", { name: "Senha do Supervisor" })).toBeTruthy()
    })
    it(action + ": PIN aprovado executa somente a ação solicitada", async () => {
      await mount("supermercado")
      const before = subtotal()
      runtime.pin.mockResolvedValueOnce({ ok: true })
      supervisorAction(action); await submitPin()
      expect(subtotal()).toBe(action === "clear" ? 0 : before / 2)
      expect(screen.queryByText("Linha A")).toBeNull()
      if (action === "remove") expect(screen.getByText("Linha B")).toBeTruthy()
      expect(pinCalls()).toBe(1)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
  }
})

describe("N5-B2 — colisões e modo rápido", () => {
  for (const surface of surfaces) {
    it(surface + ": F3 preserva busca/segunda forma rápida", async () => {
      await mount(surface)
      key("F3")
      if (surface === "classic") expect(screen.getByRole("dialog").textContent).toMatch(/produto/i)
      else if (surface === "supermercado") {
        expect(runtime.payment!.isOpen).toBe(true)
        expect(runtime.payment!.instantPayIntent).toBe("pix")
      } else expect(document.activeElement).toBeInstanceOf(HTMLInputElement)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
    it(surface + ": F2 mantém seu domínio", async () => {
      await mount(surface)
      key("F2")
      if (surface === "classic") expect(screen.getByRole("dialog").textContent).toMatch(/cliente/i)
      else if (surface === "assistencia") expect(runtime.customer!.open).toBe(true)
      else if (surface === "supermercado") {
        expect(runtime.payment!.isOpen).toBe(true)
        expect(runtime.payment!.instantPayIntent).toBe("dinheiro")
      } else expect(runtime.payment!.selectedCustomer).toBeNull()
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
    it(surface + ": F4 mantém quantidade/terceira forma/ausência", async () => {
      await mount(surface)
      if (surface === "classic") fireEvent.click(screen.getByTitle("Linha A"))
      key("F4")
      if (surface === "classic" || surface === "assistencia") expect(screen.getByRole("dialog").textContent).toMatch(/quantidade/i)
      else if (surface === "supermercado") {
        expect(runtime.payment!.isOpen).toBe(true)
        expect(runtime.payment!.instantPayIntent).toBe("cartao_debito")
      } else expect(screen.queryByRole("dialog")).toBeNull()
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
    it(surface + ": F10 mantém pagamento/cliente/ausência", async () => {
      await mount(surface)
      key("F10")
      if (surface === "classic" || surface === "assistencia") {
        expect(runtime.payment!.isOpen).toBe(true)
        expect(runtime.payment!.instantPayIntent).toBeNull()
      } else if (surface === "supermercado") expect(runtime.customer!.open).toBe(true)
      else expect(screen.queryByRole("dialog")).toBeNull()
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
  }
  for (const surface of ["classic", "assistencia", "supermercado"] as const) {
    it(surface + ": F8 preserva foco/trocas", async () => {
      await mount(surface)
      key("F8")
      if (surface === "classic") await settle()
      else expect(screen.getByText("Trocas sintéticas")).toBeTruthy()
      if (surface === "classic") expect(document.activeElement).toBeInstanceOf(HTMLInputElement)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
    it(surface + ": F9 continua recebimento, sem limpar o carrinho", async () => {
      await mount(surface)
      const before = subtotal()
      key("F9")
      expect(runtime.receipt!.open).toBe(true)
      expect(subtotal()).toBe(before)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
    it(surface + ": F12 continua múltiplo, sem finalizar", async () => {
      await mount(surface)
      key("F12")
      expect(runtime.payment!.isOpen).toBe(true)
      expect(runtime.payment!.multipayHint).toBe(true)
      expect(runtime.finalize).not.toHaveBeenCalled()
    })
  }
  it("Classic F5 continua recebimento, sem PIN nem remoção", async () => {
    await mount("classic")
    const before = subtotal()
    key("F5")
    expect(runtime.receipt!.open).toBe(true)
    expect(subtotal()).toBe(before)
    expect(pinCalls()).toBe(0)
  })

  it("Assistência F5 confirma a linha, cancela por Escape e só remove após clique consciente", async () => {
    await mount("assistencia")
    const before = subtotal()
    key("F5")
    expect(screen.getByRole("alertdialog").textContent).toContain("Linha B")
    expect(subtotal()).toBe(before)
    key("Escape"); expect(subtotal()).toBe(before)
    unfocus(); key("F5")
    fireEvent.click(screen.getByRole("button", { name: "Remover item" }))
    expect(subtotal()).toBe(before / 2)
    expect(pinCalls()).toBe(0)
    expect(runtime.finalize).not.toHaveBeenCalled()
  })

  for (const surface of ["classic", "assistencia", "supermercado"] as const) {
    it(surface + ": Escape padrão não remove; rápido explícito remove uma única linha fora de campos", async () => {
      const view = await mount(surface)
      const before = subtotal()
      key("Escape"); expect(subtotal()).toBe(before)
      view.unmount()
      cleanup(); localStorage.clear()
      await mount(surface, true)
      const rapidBefore = subtotal()
      unfocus(); key("Escape")
      expect(subtotal()).toBe(rapidBefore / 2)
      expect(pinCalls()).toBe(0)
    })
  }

  it.each(["F1", "F2", "click"])("Supermercado %s usa a primeira forma ativa, mesmo fora da ordem padrão", async (path) => {
    runtime.params.formasPagamento = defaultFormasPagamento().map((forma) => ({ ...forma, ordem: forma.id === "cartao_debito" ? -1 : forma.ordem }))
    await mount("supermercado")
    if (path === "click") fireEvent.click(screen.getByTitle("Cartão Débito"))
    else key(path)
    expect(runtime.payment!.isOpen).toBe(true)
    expect(runtime.payment!.instantPayIntent).toBe("cartao_debito")
    expect(runtime.finalize).not.toHaveBeenCalled()
  })

  it("Supermercado F1 sem forma rápida não inventa pagamento", async () => {
    runtime.params.formasPagamento = defaultFormasPagamento().map((forma) => ({ ...forma, ativo: false }))
    await mount("supermercado"); key("F1")
    expect(runtime.payment!.isOpen).toBe(false)
    expect(runtime.finalize).not.toHaveBeenCalled()
  })
})
