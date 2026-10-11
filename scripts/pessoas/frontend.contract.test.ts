// @vitest-environment jsdom
import { webcrypto } from "node:crypto"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
const identity = vi.hoisted(() => ({ store: "A", user: "user-A" }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { id: identity.user }, expires: "fixed" } }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: identity.store }) }))
vi.mock("@/components/dashboard/pessoas/contexto", () => ({ usePessoas: () => ({ empregadorId: "emp-synthetic", capacidades: ["viewCadastro", "viewDocumento", "editCadastro"] }) }))
import { Documentos } from "@/components/dashboard/pessoas/documentos"
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

describe("Documentos: transporte controlado, não comprova R2", () => {
  it("faz hash, envia headers assinados e repete complete perdido sem repetir PUT", async () => {
    vi.stubGlobal("crypto", webcrypto)
    let completes = 0, puts = 0
    const requests: Array<{ url: string; body?: string; headers?: HeadersInit }> = []
    const fetcher = vi.fn(async (url: string, options: RequestInit = {}) => {
      requests.push({ url, body: typeof options.body === "string" ? options.body : undefined, headers: options.headers })
      if (url.includes("upload-intent")) return { ok: true, json: async () => ({ ok: true, data: { signedUrl: "https://storage.example.invalid/synthetic", headersObrigatorios: { "If-None-Match": "*", "Content-Type": "application/pdf" }, uploadIntent: "synthetic-intent" } }) }
      if (url.startsWith("https:")) { puts++; return { ok: true } }
      if (url.includes("complete")) { completes++; if (completes === 1) throw new Error("lost response"); return { ok: true, json: async () => ({ ok: true, data: {} }) } }
      return { ok: true, json: async () => ({ ok: true, data: [] }) }
    })
    vi.stubGlobal("fetch", fetcher)
    render(createElement(Documentos, { id: "link-synthetic" }))
    await screen.findByText("Nenhum documento disponível para suas permissões.")
    expect(screen.queryByText("Contrato", { selector: "option" })).toBeNull()
    const file = new File(["%PDF-1.7 synthetic"], "sintetico.pdf", { type: "application/pdf" })
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("%PDF-1.7 synthetic").buffer })
    fireEvent.change(screen.getByLabelText("Arquivo"), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "INTERNO" } })
    fireEvent.click(screen.getByText("Enviar documento"))
    await screen.findByText("Resposta não confirmada. Você pode repetir o mesmo comando.")
    fireEvent.click(screen.getByText("Repetir confirmação"))
    await screen.findByText("Documento salvo.")
    expect(puts).toBe(1); expect(completes).toBe(2)
    expect(requests.filter(r => r.url.includes("complete")).map(r => r.body)).toEqual(['{"uploadIntent":"synthetic-intent"}', '{"uploadIntent":"synthetic-intent"}'])
    expect(requests.find(r => r.url.startsWith("https:"))?.headers).toEqual({ "If-None-Match": "*", "Content-Type": "application/pdf" })
    expect(JSON.parse(requests.find(r => r.url.includes("upload-intent"))!.body!).sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify({ ...localStorage })).not.toContain("synthetic-intent")
  })
})
