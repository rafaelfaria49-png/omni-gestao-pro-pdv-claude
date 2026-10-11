// @vitest-environment jsdom
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
const identity = vi.hoisted(() => ({ store: "A", user: "user-A" }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { id: identity.user }, expires: "fixed" } }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: identity.store }) }))
import { useDisponibilidade } from "@/components/dashboard/pessoas/use-disponibilidade"
import { CommandForm } from "@/components/dashboard/pessoas/ui"
import { filterDashboardNav, hubsNavItems } from "@/lib/navigation/dashboard-nav-items"
import { civilDisplay, decimalInput, moneyDisplay } from "@/lib/pessoas/adapters/cadastro-ui"
afterEach(() => { cleanup(); vi.unstubAllGlobals(); identity.store = "A" })
describe("Frontend: contratos de privacidade e consistência", () => {
  it("converte decimais sem perda binária e preserva ausência versus zero", () => {
    expect(decimalInput("9999999999999999,99")).toBe("9999999999999999.99")
    expect(decimalInput("0")).toBe("0.00")
    expect(decimalInput("")).toBeUndefined()
    expect(() => decimalInput("1.234,56")).toThrow()
    expect(moneyDisplay(null, true)).toBe("Remuneração restrita")
    expect(moneyDisplay(null, false)).toBe("Não informado")
    expect(civilDisplay("2020-01-01")).toBe("01/01/2020")
  })
  it("menu nega por padrão inclusive perms null e respeita posição", () => {
    expect(filterDashboardNav(hubsNavItems, null).some(item => item.to === "/dashboard/pessoas")).toBe(false)
    const all = filterDashboardNav(hubsNavItems, null, true)
    const index = all.findIndex(item => item.to === "/dashboard/pessoas")
    expect(all[index - 1].label).toBe("Financeiro HUB")
    expect(all[index + 1].label).toBe("Contador HUB")
  })
  it("descarta resposta tardia da Store anterior e oculta durante erro", async () => {
    const pending: Array<(response: unknown) => void> = []
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => pending.push(resolve))))
    const { result, rerender } = renderHook(() => useDisponibilidade())
    expect(result.current.disponivel).toBe(false)
    identity.store = "B"; rerender()
    await act(async () => pending[0]({ ok: true, json: async () => ({ disponivel: true, escopos: [] }) }))
    expect(result.current.disponivel).toBe(false)
    await act(async () => pending[1]({ ok: false, json: async () => ({ code: "ESCOPO_NEGADO" }) }))
    expect(result.current.error).toBe("ESCOPO_NEGADO")
  })
  it("duplo envio e resposta perdida reutilizam o mesmo comando", async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue({ ok: true })
    const saved = vi.fn()
    render(createElement(CommandForm, { fields: [{ name: "nome", label: "Nome" }], action, onSaved: saved }))
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Sintético" } })
    fireEvent.click(screen.getByText("Salvar"))
    await screen.findByText("Repetir o mesmo comando")
    fireEvent.click(screen.getByText("Repetir o mesmo comando"))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(action.mock.calls[0]).toEqual(action.mock.calls[1])
  })
  it("conflito exige releitura e não repete a escrita", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, code: "VERSION_CONFLICT" })
    const conflict = vi.fn()
    render(createElement(CommandForm, { fields: [], action, onSaved: vi.fn(), onConflict: conflict }))
    fireEvent.click(screen.getByText("Salvar"))
    await waitFor(() => expect(conflict).toHaveBeenCalledTimes(1))
    expect(action).toHaveBeenCalledTimes(1)
  })
})
