// @vitest-environment jsdom
import { webcrypto } from "node:crypto"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
const identity = vi.hoisted(() => ({ store: "A", user: "user-A", expanded: false, capacidades: ["viewCadastro", "viewDocumento", "editCadastro"] }))
const backend = vi.hoisted(() => ({ store: "A" }))
vi.mock("@/lib/pessoas/scope", () => ({ exigirAtor: async () => ({ userId: "user-A", storeId: backend.store, role: "ADMIN" }) }))
vi.mock("@/app/actions/pessoas", () => ({
  criarFuncionario: vi.fn(async () => ({ ok: true, data: { id: "new-synthetic" } })),
  obterFuncionario: vi.fn(), listarHistorico: vi.fn(), atualizarDadosPessoais: vi.fn(), completarVinculoRascunho: vi.fn(), criarVersaoContrato: vi.fn(),
  setupEmpregador: vi.fn(), obterEmpregador: vi.fn(), editarEmpregador: vi.fn(), criarEstabelecimento: vi.fn(), editarEstabelecimento: vi.fn(),
}))
vi.mock("@/lib/pessoas/documentos/service", () => ({ listarDocumentos: vi.fn(), criarUploadIntent: vi.fn(), confirmarUpload: vi.fn(), autorizarDownload: vi.fn() }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { id: identity.user }, expires: "fixed" } }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: identity.store }) }))
vi.mock("@/components/dashboard/pessoas/contexto", () => ({ usePessoas: () => ({ storeId: identity.store, empregadorId: "emp-synthetic", capacidades: identity.capacidades, categoriasDocumentais: ["identificacao"] }) }))
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: { children: ReactNode; prefetch?: boolean; href: string }) => createElement("a", { ...props, "data-prefetch": String(prefetch) }, children) }))
vi.mock("next/image", () => ({ default: () => null }))
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/pessoas" }))
vi.mock("@/components/ui/collapsible-hover-rail", () => ({ CollapsibleHoverRail: ({ children }: { children: (state: { expanded: boolean; pinned: boolean; togglePinned: () => void; collapse: () => void }) => ReactNode }) =>
  createElement("div", null, children({ expanded: identity.expanded, pinned: false, togglePinned: () => undefined, collapse: () => undefined })) }))
import { Sidebar } from "@/components/painel-inicial/Sidebar"
import { Documentos, type DocumentActions } from "@/components/dashboard/pessoas/documentos"
import { FichaFuncionario } from "@/components/dashboard/pessoas/ficha"
import { ConfiguracoesPessoas } from "@/components/dashboard/pessoas/configuracoes"
import NovoPage from "@/app/dashboard/pessoas/funcionarios/novo/page"
import FichaPage from "@/app/dashboard/pessoas/funcionarios/[id]/page"
import ConfigPage from "@/app/dashboard/pessoas/configuracoes/page"
import * as canonical from "@/app/actions/pessoas"
import * as documentService from "@/lib/pessoas/documentos/service"
import { useDisponibilidade } from "@/components/dashboard/pessoas/use-disponibilidade"
import { CommandForm, useResource } from "@/components/dashboard/pessoas/ui"
import { filterDashboardNav, hubsNavItems } from "@/lib/navigation/dashboard-nav-items"
import { civilDisplay, decimalInput, moneyDisplay } from "@/lib/pessoas/adapters/cadastro-ui"
vi.setConfig({ testTimeout: 30_000 })
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks()
  identity.store = "A"; backend.store = "A"; identity.expanded = false
  identity.capacidades = ["viewCadastro", "viewDocumento", "editCadastro"]
})
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
    await act(async () => pending[0]({ ok: true, json: async () => ({ storeId: "A", disponivel: true, escopos: [] }) }))
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
  it("faz hash, envia headers assinados e mantém o intent ao conferir a lista antes de repetir complete", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const put = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal("fetch", put)
    const actions: DocumentActions = {
      listar: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      criarIntent: vi.fn().mockResolvedValue({ ok: true, data: { signedUrl: "https://storage.example.invalid/synthetic", headersObrigatorios: { "If-None-Match": "*", "Content-Type": "application/pdf" }, uploadIntent: "synthetic-intent" } }),
      confirmar: vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValue({ ok: true, data: {} }),
      download: vi.fn(),
    }
    render(createElement(Documentos, { id: "link-synthetic", actions }))
    await screen.findByText("Nenhum documento disponível para suas permissões.")
    expect(screen.queryByText("Contrato", { selector: "option" })).toBeNull()
    const file = new File(["%PDF-1.7 synthetic"], "sintetico.pdf", { type: "application/pdf" })
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("%PDF-1.7 synthetic").buffer })
    fireEvent.change(screen.getByLabelText("Arquivo"), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "INTERNO" } })
    fireEvent.submit(screen.getByText("Enviar documento").closest("form")!)
    await screen.findByText("Resposta não confirmada. Você pode repetir o mesmo comando.")
    expect(screen.queryByText("Documento salvo.")).toBeNull()
    fireEvent.click(screen.getByText("Conferir lista antes de novo envio"))
    await waitFor(() => expect(actions.listar).toHaveBeenCalledTimes(2))
    expect(screen.getByText("Repetir confirmação")).toBeTruthy()
    fireEvent.click(screen.getByText("Repetir confirmação"))
    await screen.findByText("Documento salvo.")
    expect(put).toHaveBeenCalledTimes(1)
    expect(actions.confirmar).toHaveBeenCalledTimes(2)
    expect(vi.mocked(actions.confirmar).mock.calls).toEqual([["A", "synthetic-intent"], ["A", "synthetic-intent"]])
    expect(vi.mocked(put).mock.calls[0]).toEqual(["https://storage.example.invalid/synthetic", expect.objectContaining({ method: "PUT", headers: { "If-None-Match": "*", "Content-Type": "application/pdf" } })])
    expect(vi.mocked(actions.criarIntent).mock.calls[0][0]).toBe("A")
    expect(vi.mocked(actions.criarIntent).mock.calls[0][1].sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify({ ...localStorage })).not.toContain("synthetic-intent")
  })
})

describe("Sidebar: consumidor desktop e focus mode", () => {
  it("aplica o mesmo estado DP nos três modos e desabilita prefetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ storeId: "A", disponivel: true, podeConfigurarEmpregador: true, escopos: [] }) })))
    const view = render(createElement(Sidebar))
    await waitFor(() => expect(screen.getByRole("link", { name: "Pessoas" }).getAttribute("data-prefetch")).toBe("false"))
    view.rerender(createElement(Sidebar, { focusMode: true }))
    expect(screen.getByRole("link", { name: "Pessoas" }).getAttribute("data-prefetch")).toBe("false")
    identity.expanded = true
    view.rerender(createElement(Sidebar, { focusMode: true }))
    expect(screen.getByRole("link", { name: "Pessoas" }).getAttribute("data-prefetch")).toBe("false")
  })
})

describe("Revalidação e descarte de respostas", () => {
  it("oculta durante foco, preservando somente o contexto da mesma identidade", async () => {
    let finish: (response: unknown) => void = () => undefined
    const dto = { storeId: "A", disponivel: true, podeConfigurarEmpregador: false, escopos: [] }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => dto })
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve })))
    const { result } = renderHook(() => useDisponibilidade())
    await waitFor(() => expect(result.current.data).toEqual(dto))
    const key = result.current.contextKey
    act(() => result.current.refresh())
    expect(result.current.data).toBeUndefined()
    expect(result.current.disponivel).toBe(false)
    expect(result.current.retainedData).toEqual(dto)
    await act(async () => finish({ ok: true, json: async () => dto }))
    expect(result.current.contextKey).toBe(key)
    expect(result.current.data).toEqual(dto)
  })
  it("não mostra a ficha anterior quando muda o carregador", async () => {
    const first = async () => ({ ok: true as const, data: "ficha-A" })
    let finish: (result: { ok: true; data: string }) => void = () => undefined
    const second = () => new Promise<{ ok: true; data: string }>(resolve => { finish = resolve })
    const { result, rerender } = renderHook(({ loader }) => useResource(loader), { initialProps: { loader: first } })
    await waitFor(() => expect(result.current.data).toBe("ficha-A"))
    rerender({ loader: second })
    expect(result.current.data).toBeUndefined()
    await act(async () => finish({ ok: true, data: "ficha-B" }))
    expect(result.current.data).toBe("ficha-B")
  })
})

describe("Recovery R1: Store esperada e Store do backend", () => {
  it("recusa criar na Store B com formulário da Store A antes da action canônica", async () => {
    const input = { empregadorId: "emp-synthetic", comandoId: "command-synthetic", nome: "Pessoa sintética", motivo: "fixture" }
    const action = NovoPage().props.actions.criarFuncionario
    backend.store = "B"
    expect(await action("A", input)).toEqual({ ok: false, code: "LOJA_DIVERGENTE" })
    expect(canonical.criarFuncionario).not.toHaveBeenCalled()
    backend.store = "A"
    expect(await action("A", input)).toMatchObject({ ok: true })
    expect(canonical.criarFuncionario).toHaveBeenCalledWith(input)
  })
  it("fecha manutenção, edição e documentos antes de consultar ou escrever com Store divergente", async () => {
    backend.store = "B"
    const config = ConfigPage().props.actions
    for (const action of Object.values(config) as Array<(store: string, input: object) => Promise<unknown>>) {
      expect(await action("A", { empregadorId: "emp-synthetic" })).toEqual({ ok: false, code: "LOJA_DIVERGENTE" })
    }
    const ficha = await FichaPage({ params: Promise.resolve({ id: "link-synthetic" }) })
    for (const action of Object.values(ficha.props.actions) as Array<(store: string, input: object) => Promise<unknown>>) {
      expect(await action("A", { empregadorId: "emp-synthetic" })).toEqual({ ok: false, code: "LOJA_DIVERGENTE" })
    }
    for (const action of Object.values(ficha.props.documentActions) as Array<(store: string, input: object) => Promise<unknown>>) {
      expect(await action("A", { empregadorId: "emp-synthetic" })).toEqual({ ok: false, code: "LOJA_DIVERGENTE" })
    }
    for (const action of [canonical.setupEmpregador, canonical.obterEmpregador, canonical.editarEmpregador, canonical.criarEstabelecimento,
      canonical.editarEstabelecimento, canonical.obterFuncionario, canonical.listarHistorico, canonical.atualizarDadosPessoais,
      canonical.completarVinculoRascunho, canonical.criarVersaoContrato, documentService.listarDocumentos, documentService.criarUploadIntent,
      documentService.confirmarUpload, documentService.autorizarDownload]) expect(action).not.toHaveBeenCalled()
  })
  it("nega disponibilidade de B quando o contexto React ainda espera A", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ storeId: "B", disponivel: true, escopos: [] }) })))
    const { result } = renderHook(() => useDisponibilidade())
    await waitFor(() => expect(result.current.error).toBe("LOJA_DIVERGENTE"))
    expect(result.current.data).toBeUndefined()
    expect(result.current.retainedData).toBeUndefined()
    expect(result.current.disponivel).toBe(false)
  })
  it("storage invalida o contexto retido e descarta uma resposta anterior mesmo voltando a A", async () => {
    const dto = { storeId: "A", disponivel: true, podeConfigurarEmpregador: false, escopos: [] }
    const pending: Array<(value: unknown) => void> = []
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => dto })
      .mockImplementation(() => new Promise(resolve => pending.push(resolve))))
    const { result } = renderHook(() => useDisponibilidade())
    await waitFor(() => expect(result.current.data).toEqual(dto))
    const initialKey = result.current.contextKey
    act(() => result.current.refresh())
    expect(result.current.retainedData).toEqual(dto)
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "assistec-pro-loja-ativa-v1", newValue: "B" })))
    expect(result.current.retainedData).toBeUndefined()
    expect(result.current.contextKey).not.toBe(initialKey)
    await act(async () => pending[0]({ ok: true, json: async () => dto }))
    expect(result.current.data).toBeUndefined()
    await act(async () => pending[1]({ ok: true, json: async () => dto }))
    expect(result.current.data).toEqual(dto)
  })
})

describe("Recovery R2: ficha e documentos coordenam operações", () => {
  it("bloqueia salvar durante upload/complete pendente e mantém Documentos montado ao reler a ficha", async () => {
    vi.stubGlobal("crypto", webcrypto)
    let finishPut: (value: { ok: boolean }) => void = () => undefined
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finishPut = resolve })))
    const dto = { nome: "Pessoa sintética", cpf: null, nascimento: null, status: "RASCUNHO", pessoaVersaoAtual: 1, versaoAtual: 1, pendencias: [], contrato: null }
    const actions = {
      obterFuncionario: vi.fn().mockResolvedValue({ ok: true, data: dto }),
      listarHistorico: vi.fn().mockResolvedValue({ ok: true, data: { pessoa: [], contratos: [] } }),
      atualizarDadosPessoais: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      completarVinculoRascunho: vi.fn(), criarVersaoContrato: vi.fn(),
    }
    const documentActions: DocumentActions = {
      listar: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      criarIntent: vi.fn().mockResolvedValue({ ok: true, data: { signedUrl: "https://storage.example.invalid/synthetic", headersObrigatorios: {}, uploadIntent: "intent-coordination" } }),
      confirmar: vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValue({ ok: true, data: {} }),
      download: vi.fn(),
    }
    render(createElement(FichaFuncionario, { id: "link-synthetic", actions, documentActions }))
    fireEvent.click(await screen.findByText("Editar dados pessoais"))
    const save = screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement
    const file = new File(["%PDF-1.7 synthetic"], "sintetico.pdf", { type: "application/pdf" })
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("%PDF-1.7 synthetic").buffer })
    fireEvent.change(await screen.findByLabelText("Arquivo"), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "INTERNO" } })
    fireEvent.submit(screen.getByText("Enviar documento").closest("form")!)
    await waitFor(() => expect(documentActions.criarIntent).toHaveBeenCalledTimes(1))
    expect(save.disabled).toBe(true)
    fireEvent.submit(save.closest("form")!)
    expect(actions.atualizarDadosPessoais).not.toHaveBeenCalled()
    await act(async () => finishPut({ ok: true }))
    await screen.findByText("Resposta não confirmada. Você pode repetir o mesmo comando.")
    expect(save.disabled).toBe(true)
    fireEvent.click(screen.getByText("Conferir lista antes de novo envio"))
    expect(save.disabled).toBe(true)
    fireEvent.click(screen.getByText("Repetir confirmação"))
    await screen.findByText("Documento salvo.")
    await waitFor(() => expect(save.disabled).toBe(false))
    actions.obterFuncionario.mockImplementationOnce(() => new Promise(() => {}))
    fireEvent.submit(save.closest("form")!)
    await waitFor(() => expect(actions.atualizarDadosPessoais).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("heading", { name: "Documentos privados" })).toBeTruthy()
    expect(screen.getByText("Documento salvo.")).toBeTruthy()
    expect(screen.queryByText("Carregando ficha…")).toBeNull()
  })
})

describe("Recovery R5: foco após releitura da configuração", () => {
  it.each(["empregador", "estabelecimento"])("restaura foco após salvar %s sem usar o formulário desmontado", async tipo => {
    identity.capacidades = ["viewCadastro", "manageAccess"]
    const employer = { nome: "Empregador sintético", tipoInscricao: "CNPJ", inscricao: "synthetic", storeGestoraId: "A", versaoAtual: 1,
      versoes: [], estabelecimentos: [{ id: "est-synthetic", nome: "Sede sintética", tipoInscricao: "CNPJ", inscricao: "est-synthetic", versaoAtual: 1, versoes: [] }] }
    let finish: (value: unknown) => void = () => undefined
    const actions = {
      obterEmpregador: vi.fn().mockResolvedValueOnce({ ok: true, data: employer }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })),
      setupEmpregador: vi.fn(), editarEmpregador: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      criarEstabelecimento: vi.fn(), editarEstabelecimento: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    }
    render(createElement(ConfiguracoesPessoas, { actions }))
    fireEvent.click(await screen.findByRole("button", { name: tipo === "empregador" ? "Editar empregador" : "Editar estabelecimento" }))
    const form = screen.getByRole("button", { name: "Salvar" }).closest("form")!
    fireEvent.submit(form)
    await screen.findByText("Carregando configuração…")
    expect(form.isConnected).toBe(false)
    await act(async () => finish({ ok: true, data: { ...employer, versaoAtual: 2 } }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText("Configuração salva e atualizada.")))
  })
})
