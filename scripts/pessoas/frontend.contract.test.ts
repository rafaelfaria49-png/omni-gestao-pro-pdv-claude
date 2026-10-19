// @vitest-environment jsdom
import { webcrypto } from "node:crypto"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
const identity = vi.hoisted(() => ({ store: "A", user: "user-A", expanded: false, realContext: false, status: "authenticated" as "authenticated" | "unauthenticated", capacidades: ["viewCadastro", "viewDocumento", "editCadastro"] }))
const backend = vi.hoisted(() => ({ store: "A" }))
vi.mock("@/lib/pessoas/scope", () => ({ exigirAtor: async () => ({ userId: "user-A", storeId: backend.store, role: "ADMIN" }) }))
vi.mock("@/app/actions/pessoas", () => ({
  criarFuncionario: vi.fn(async () => ({ ok: true, data: { id: "new-synthetic" } })),
  obterFuncionario: vi.fn(), listarHistorico: vi.fn(), atualizarDadosPessoais: vi.fn(), completarVinculoRascunho: vi.fn(), criarVersaoContrato: vi.fn(),
  setupEmpregador: vi.fn(), obterEmpregador: vi.fn(), editarEmpregador: vi.fn(), criarEstabelecimento: vi.fn(), editarEstabelecimento: vi.fn(),
}))
vi.mock("@/lib/pessoas/documentos/service", () => ({ listarDocumentos: vi.fn(), criarUploadIntent: vi.fn(), confirmarUpload: vi.fn(), autorizarDownload: vi.fn() }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: identity.status, data: { user: { id: identity.user }, expires: "fixed" } }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: identity.store }) }))
vi.mock("@/components/dashboard/pessoas/contexto", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/dashboard/pessoas/contexto")>()
  return { ...actual, usePessoas: () => identity.realContext ? actual.usePessoas() : {
    storeId: identity.store, empregadorId: "emp-synthetic", capacidades: identity.capacidades, categoriasDocumentais: ["identificacao"],
  } }
})
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: { children: ReactNode; prefetch?: boolean; href: string }) => createElement("a", { ...props, "data-prefetch": String(prefetch) }, children) }))
vi.mock("next/image", () => ({ default: () => null }))
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/pessoas" }))
vi.mock("@/components/ui/collapsible-hover-rail", () => ({ CollapsibleHoverRail: ({ children }: { children: (state: { expanded: boolean; pinned: boolean; togglePinned: () => void; collapse: () => void }) => ReactNode }) =>
  createElement("div", null, children({ expanded: identity.expanded, pinned: false, togglePinned: () => undefined, collapse: () => undefined })) }))
import { Sidebar } from "@/components/painel-inicial/Sidebar"
import { PessoasProvider } from "@/components/dashboard/pessoas/contexto"
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
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks()
  identity.store = "A"; identity.user = "user-A"; identity.status = "authenticated"; identity.realContext = false; backend.store = "A"; identity.expanded = false
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
      criarIntent: vi.fn().mockResolvedValue({ ok: true, data: { signedUrl: "https://storage.example.invalid/synthetic", headersObrigatorios: { "If-None-Match": "*", "Content-Type": "application/pdf" }, uploadIntent: "synthetic-intent", expiresInSec: 300 } }),
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
      criarIntent: vi.fn().mockResolvedValue({ ok: true, data: { signedUrl: "https://storage.example.invalid/synthetic", headersObrigatorios: {}, uploadIntent: "intent-coordination", expiresInSec: 300 } }),
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

describe("Recovery R2 final: contexto e retomada documental em memória", () => {
  function fixture() {
    const documentActions: DocumentActions = {
      listar: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      criarIntent: vi.fn().mockResolvedValue({ ok: true, data: { documentoId: "doc-recovery", signedUrl: "https://storage.example.invalid/recovery",
        headersObrigatorios: { "If-None-Match": "*" }, expiresInSec: 300, uploadIntent: "intent-recovery" } }),
      confirmar: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      download: vi.fn(),
    }
    const actions = {
      obterFuncionario: vi.fn().mockResolvedValue({ ok: true, data: { nome: "Pessoa sintética", cpf: null, nascimento: null,
        status: "RASCUNHO", pessoaVersaoAtual: 1, versaoAtual: 1, pendencias: [], contrato: null } }),
      listarHistorico: vi.fn().mockResolvedValue({ ok: true, data: { pessoa: [], contratos: [] } }),
      atualizarDadosPessoais: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      completarVinculoRascunho: vi.fn(), criarVersaoContrato: vi.fn(),
    }
    const listarEmpregadoresAction = vi.fn().mockResolvedValue({ ok: true, data: [
      { id: "emp-synthetic", nome: "Empregador sintético" }, { id: "emp-second", nome: "Outro empregador" },
    ] })
    const tree = (provider = false) => {
      const children = createElement(FichaFuncionario, { id: "link-synthetic", actions, documentActions })
      return provider ? createElement(PessoasProvider, { children, listarEmpregadoresAction, listarFuncionariosAction: vi.fn() }) : children
    }
    return { documentActions, actions, tree }
  }
  function availability() {
    return { storeId: identity.store, disponivel: true, podeConfigurarEmpregador: false,
      escopos: ["emp-synthetic", "emp-second"].map(empregadorId => ({ empregadorId, capacidades: identity.capacidades, categoriasDocumentais: ["identificacao"] })) }
  }
  async function startUpload() {
    const input = await screen.findByLabelText("Arquivo")
    const file = new File(["%PDF-1.7 recovery"], "recovery.pdf", { type: "application/pdf" })
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("%PDF-1.7 recovery").buffer })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "INTERNO" } })
    fireEvent.submit(screen.getByText("Enviar documento").closest("form")!)
    return { file, input }
  }
  async function openSection() {
    fireEvent.click(await screen.findByText("Editar dados pessoais"))
    return screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement
  }
  it("preserva o intent na árvore oculta/inert após REDE e só retoma depois de validar a mesma identidade", async () => {
    identity.realContext = true
    vi.stubGlobal("crypto", webcrypto)
    let reads = 0, finish: (value: unknown) => void = () => undefined
    const put = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
      if (!url.startsWith("/api/")) return put(url, options)
      reads++
      if (reads === 2) return Promise.reject(new Error("offline"))
      if (reads === 3) return new Promise(resolve => { finish = resolve })
      return Promise.resolve({ ok: true, json: async () => availability() })
    }))
    const f = fixture()
    vi.mocked(f.documentActions.confirmar).mockRejectedValueOnce(new Error("lost complete"))
    render(f.tree(true))
    const save = await openSection()
    const { input } = await startUpload()
    await screen.findByText("Confirmação sem resposta conclusiva. Confira a lista ou repita a confirmação.")
    act(() => window.dispatchEvent(new Event("focus")))
    const retryAccess = await screen.findByRole("button", { name: "Tentar novamente" })
    expect(input.isConnected).toBe(true)
    expect(input.closest("[hidden]")?.hasAttribute("inert")).toBe(true)
    fireEvent.click(screen.getByText("Repetir confirmação"))
    fireEvent.submit(save.closest("form")!)
    expect(f.documentActions.confirmar).toHaveBeenCalledTimes(1)
    expect(f.actions.atualizarDadosPessoais).not.toHaveBeenCalled()
    fireEvent.click(retryAccess)
    expect(input.closest("[hidden]")).not.toBeNull()
    await act(async () => finish({ ok: true, json: async () => availability() }))
    await waitFor(() => expect(input.closest("[hidden]")).toBeNull())
    expect(screen.getByLabelText("Arquivo")).toBe(input)
    fireEvent.click(screen.getByText("Repetir confirmação"))
    await screen.findByText("Documento salvo.")
    expect(vi.mocked(f.documentActions.confirmar).mock.calls).toEqual([["A", "intent-recovery"], ["A", "intent-recovery"]])
    expect(put).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(save.disabled).toBe(false))
  })
  it.each(["ESCOPO_NEGADO", "LOJA_DIVERGENTE", "PESSOAS_DESABILITADO", "SEM_ESCOPO"])("descarta a recuperação quando a revalidação confirma %s", async code => {
    identity.realContext = true
    vi.stubGlobal("crypto", webcrypto)
    let reads = 0
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (!url.startsWith("/api/")) return { ok: true, status: 200 }
      if (++reads === 1) return { ok: true, json: async () => availability() }
      return code === "SEM_ESCOPO" ? { ok: true, json: async () => ({ ...availability(), disponivel: false, escopos: [] }) }
        : { ok: false, json: async () => ({ code }) }
    }))
    const f = fixture()
    vi.mocked(f.documentActions.confirmar).mockRejectedValueOnce(new Error("lost complete"))
    render(f.tree(true))
    const { input } = await startUpload()
    await screen.findByText("Repetir confirmação")
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(input.isConnected).toBe(false))
    expect(screen.queryByText("Repetir confirmação")).toBeNull()
    expect(f.documentActions.confirmar).toHaveBeenCalledTimes(1)
  })
  it.each(["Store", "usuário", "logout", "empregador", "geração de escopo"])("descarta arquivo e intent ao mudar %s", async change => {
    identity.realContext = true
    vi.stubGlobal("crypto", webcrypto)
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.startsWith("/api/")
      ? { ok: true, json: async () => availability() } : { ok: true, status: 200 }))
    const f = fixture()
    vi.mocked(f.documentActions.confirmar).mockRejectedValueOnce(new Error("lost complete"))
    const view = render(f.tree(true))
    const { input } = await startUpload()
    await screen.findByText("Repetir confirmação")
    if (change === "empregador") fireEvent.change(screen.getByLabelText("Empregador"), { target: { value: "emp-second" } })
    else if (change === "geração de escopo") act(() => window.dispatchEvent(new StorageEvent("storage", { key: "assistec-pro-loja-ativa-v1", newValue: "B" })))
    else {
      if (change === "Store") identity.store = "B"
      if (change === "usuário") identity.user = "user-B"
      if (change === "logout") identity.status = "unauthenticated"
      view.rerender(f.tree(true))
    }
    await waitFor(() => expect(input.isConnected).toBe(false))
    expect(screen.queryByText("Repetir confirmação")).toBeNull()
    expect(f.documentActions.confirmar).toHaveBeenCalledTimes(1)
    expect(JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })).not.toContain("intent-recovery")
  })
  it.each(["falha HTTP", "cancelamento"])("retoma PUT após %s com o mesmo File, URL, intent e headers exclusivos", async failure => {
    vi.stubGlobal("crypto", webcrypto)
    const put = vi.fn().mockImplementationOnce((_url: string, options: RequestInit) => failure === "falha HTTP"
      ? Promise.resolve({ ok: false, status: 503 })
      : new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Abortado", "AbortError")), { once: true })))
      .mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", put)
    const f = fixture()
    render(f.tree())
    const save = await openSection()
    const { file } = await startUpload()
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    if (failure === "cancelamento") fireEvent.click(screen.getByText("Cancelar"))
    const retry = await screen.findByText("Repetir envio de bytes")
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false))
    expect(save.disabled).toBe(true)
    fireEvent.click(retry)
    await screen.findByText("Documento salvo.")
    expect(put).toHaveBeenCalledTimes(2)
    for (const [url, options] of put.mock.calls) {
      expect(url).toBe("https://storage.example.invalid/recovery")
      expect(options.body).toBe(file)
      expect(options.headers).toEqual({ "If-None-Match": "*" })
    }
    expect(f.documentActions.criarIntent).toHaveBeenCalledTimes(1)
    expect(f.documentActions.confirmar).toHaveBeenCalledWith("A", "intent-recovery")
    await waitFor(() => expect(save.disabled).toBe(false))
  })
  it.each(["PUT 412", "verificação direta"])("confere o mesmo intent após resposta PUT desconhecida e %s", async recovery => {
    vi.stubGlobal("crypto", webcrypto)
    const put = vi.fn().mockRejectedValueOnce(new Error("lost PUT")).mockResolvedValue({ ok: false, status: 412 })
    vi.stubGlobal("fetch", put)
    const f = fixture()
    render(f.tree())
    const save = await openSection()
    await startUpload()
    await screen.findByText("Resposta do envio de bytes não confirmada. Repita o envio ou verifique a confirmação.")
    const button = screen.getByText(recovery === "PUT 412" ? "Repetir envio de bytes" : "Verificar confirmação")
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText("Documento salvo.")).toBeNull()
    fireEvent.click(button)
    await screen.findByText("Documento salvo.")
    expect(put).toHaveBeenCalledTimes(recovery === "PUT 412" ? 2 : 1)
    expect(f.documentActions.criarIntent).toHaveBeenCalledTimes(1)
    expect(f.documentActions.confirmar).toHaveBeenCalledWith("A", "intent-recovery")
    await waitFor(() => expect(save.disabled).toBe(false))
  })
  it("não repete URL vencida e conserva intent válido para confirmação/listagem", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const now = Date.now()
    const time = vi.spyOn(Date, "now").mockReturnValue(now)
    const put = vi.fn().mockRejectedValue(new Error("lost PUT"))
    vi.stubGlobal("fetch", put)
    const f = fixture()
    render(f.tree())
    const save = await openSection()
    await startUpload()
    await screen.findByText("Resposta do envio de bytes não confirmada. Repita o envio ou verifique a confirmação.")
    const retryPut = screen.getByText("Repetir envio de bytes") as HTMLButtonElement
    await waitFor(() => expect(retryPut.disabled).toBe(false))
    time.mockReturnValue(now + 301_000)
    fireEvent.click(retryPut)
    await screen.findByText("A URL de envio expirou. O documento ainda pode ser confirmado: confira a lista ou verifique a confirmação.")
    expect(retryPut.disabled).toBe(true)
    expect(put).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText("Conferir lista antes de novo envio"))
    expect(f.documentActions.criarIntent).toHaveBeenCalledTimes(1)
    expect(save.disabled).toBe(true)
    fireEvent.click(screen.getByText("Verificar confirmação"))
    await screen.findByText("Documento salvo.")
    expect(f.documentActions.confirmar).toHaveBeenCalledWith("A", "intent-recovery")
    expect(put).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(save.disabled).toBe(false))
  })
  it.each(["INTENT_INVALIDO", "INTENT_EXPIRADO"])("exige descarte explícito após %s, sem novo intent automático", async code => {
    vi.stubGlobal("crypto", webcrypto)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const f = fixture()
    vi.mocked(f.documentActions.confirmar).mockResolvedValueOnce({ ok: false, code })
    render(f.tree())
    const save = await openSection()
    await startUpload()
    const discard = await screen.findByText("Descartar envio recusado")
    await waitFor(() => expect((discard as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText("Documento salvo.")).toBeNull()
    expect(screen.queryByText("Enviar documento")).toBeNull()
    expect(save.disabled).toBe(true)
    expect(f.documentActions.criarIntent).toHaveBeenCalledTimes(1)
    fireEvent.click(discard)
    await waitFor(() => expect(save.disabled).toBe(false))
    expect(screen.getByText("Enviar documento")).toBeTruthy()
    expect(f.documentActions.criarIntent).toHaveBeenCalledTimes(1)
    await startUpload()
    await screen.findByText("Documento salvo.")
    expect(f.documentActions.criarIntent).toHaveBeenCalledTimes(2)
  })
  it("libera complete cancelado com a primeira Promise sem resolução e repete o mesmo intent", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const put = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", put)
    const f = fixture()
    vi.mocked(f.documentActions.confirmar).mockImplementationOnce(() => new Promise<never>(() => undefined))
    render(f.tree())
    const save = await openSection()
    await startUpload()
    await waitFor(() => expect(f.documentActions.confirmar).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText("Cancelar"))
    await screen.findByText("Confirmação sem resposta conclusiva. Confira a lista ou repita a confirmação.")
    const retry = screen.getByText("Repetir confirmação") as HTMLButtonElement
    const list = screen.getByText("Conferir lista antes de novo envio") as HTMLButtonElement
    await waitFor(() => {
      expect(retry.disabled).toBe(false)
      expect(list.disabled).toBe(false)
      expect(screen.queryByText("Cancelar")).toBeNull()
    })
    expect(screen.queryByText("Documento salvo.")).toBeNull()
    expect(screen.queryByText("Descartar envio recusado")).toBeNull()
    expect(screen.queryByText("Enviar documento")).toBeNull()
    expect(save.disabled).toBe(true)
    const reads = vi.mocked(f.documentActions.listar).mock.calls.length
    fireEvent.click(list)
    await waitFor(() => expect(vi.mocked(f.documentActions.listar).mock.calls.length).toBeGreaterThan(reads))
    expect(f.documentActions.confirmar).toHaveBeenCalledTimes(1)
    expect(save.disabled).toBe(true)
    fireEvent.click(retry)
    await screen.findByText("Documento salvo.")
    expect(vi.mocked(f.documentActions.confirmar).mock.calls).toEqual([["A", "intent-recovery"], ["A", "intent-recovery"]])
    expect(f.documentActions.criarIntent).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(save.disabled).toBe(false))
  })
  it.each(["sucesso", "recusa", "rejeição"])("ignora %s tardio do complete cancelado durante a nova tentativa", async outcome => {
    vi.stubGlobal("crypto", webcrypto)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const f = fixture()
    type Confirmation = Awaited<ReturnType<DocumentActions["confirmar"]>>
    const confirmed: Confirmation = { ok: true, data: { id: "doc-recovery", vinculoId: "link-synthetic", categoria: "identificacao",
      classificacao: "COMUM", origem: "INTERNO", nomeArquivo: "recovery.pdf", mime: "application/pdf", bytes: 17,
      sha256: "a".repeat(64), createdAt: "2026-10-13T12:00:00.000Z" } }
    let first: (value: Confirmation) => void = () => undefined
    let rejectFirst: (reason: unknown) => void = () => undefined
    let second: (value: Confirmation) => void = () => undefined
    vi.mocked(f.documentActions.confirmar)
      .mockImplementationOnce(() => new Promise((resolve, reject) => { first = resolve; rejectFirst = reject }))
      .mockImplementationOnce(() => new Promise(resolve => { second = resolve }))
    render(f.tree())
    const save = await openSection()
    await startUpload()
    await waitFor(() => expect(f.documentActions.confirmar).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText("Cancelar"))
    await screen.findByText("Confirmação sem resposta conclusiva. Confira a lista ou repita a confirmação.")
    const retry = screen.getByText("Repetir confirmação") as HTMLButtonElement
    const list = screen.getByText("Conferir lista antes de novo envio") as HTMLButtonElement
    await waitFor(() => expect(retry.disabled).toBe(false))
    expect(save.disabled).toBe(true)
    fireEvent.click(retry)
    await waitFor(() => expect(f.documentActions.confirmar).toHaveBeenCalledTimes(2))
    await screen.findByText("Confirmando integridade e publicação…")
    await act(async () => {
      if (outcome === "sucesso") first(confirmed)
      else if (outcome === "recusa") first({ ok: false, code: "INTENT_INVALIDO" })
      else rejectFirst(new Error("late complete rejection"))
    })
    expect(screen.getByText("Confirmando integridade e publicação…")).toBeTruthy()
    expect(screen.getByText("Cancelar")).toBeTruthy()
    expect(screen.queryByText("Documento salvo.")).toBeNull()
    expect(screen.queryByText("Descartar envio recusado")).toBeNull()
    expect(screen.queryByText("Resposta não confirmada. Você pode repetir o mesmo comando.")).toBeNull()
    expect(retry.disabled).toBe(true)
    expect(list.disabled).toBe(true)
    expect(save.disabled).toBe(true)
    expect(f.documentActions.confirmar).toHaveBeenCalledTimes(2)
    await act(async () => second(confirmed))
    await screen.findByText("Documento salvo.")
    expect(vi.mocked(f.documentActions.confirmar).mock.calls).toEqual([["A", "intent-recovery"], ["A", "intent-recovery"]])
    expect(f.documentActions.criarIntent).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(save.disabled).toBe(false))
  })
})

describe("Recovery R2 final: etapas pendentes e confirmação inconclusiva", () => {
  function documentActions(): DocumentActions {
    return {
      listar: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      criarIntent: vi.fn().mockResolvedValue({ ok: true, data: { documentoId: "11111111-1111-4111-8111-111111111111", uploadIntent: "intent-stage",
        signedUrl: "https://storage.example.invalid/stage", headersObrigatorios: { "If-None-Match": "*" }, expiresInSec: 300 } }),
      confirmar: vi.fn().mockResolvedValue({ ok: true, data: {} }), download: vi.fn(),
    }
  }
  async function selectFile() {
    const input = await screen.findByLabelText("Arquivo")
    const file = new File(["%PDF-1.7 stage"], "stage.pdf", { type: "application/pdf" })
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("%PDF-1.7 stage").buffer })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "INTERNO" } })
    fireEvent.submit(screen.getByText("Enviar documento").closest("form")!)
    return file
  }
  it("continua permitindo retry do PUT depois de complete inconclusivo sem objeto confirmado", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const put = vi.fn().mockRejectedValueOnce(new Error("lost PUT")).mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", put)
    const actions = documentActions()
    vi.mocked(actions.confirmar).mockResolvedValueOnce({ ok: false, code: "FALHA_INTERNA" })
    render(createElement(Documentos, { id: "link-synthetic", actions }))
    const file = await selectFile()
    await screen.findByText("Resposta do envio de bytes não confirmada. Repita o envio ou verifique a confirmação.")
    const verify = screen.getByText("Verificar confirmação") as HTMLButtonElement
    await waitFor(() => expect(verify.disabled).toBe(false))
    fireEvent.click(verify)
    await screen.findByText("Confirmação sem resposta conclusiva. Confira a lista ou repita a confirmação.")
    const retryPut = screen.getByText("Repetir envio de bytes") as HTMLButtonElement
    await waitFor(() => expect(retryPut.disabled).toBe(false))
    fireEvent.click(retryPut)
    await screen.findByText("Documento salvo.")
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[1][1].body).toBe(file)
    expect(actions.criarIntent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(actions.confirmar).mock.calls).toEqual([["A", "intent-stage"], ["A", "intent-stage"]])
  })
  it("conserva intent recebido depois de Cancelar sem iniciar PUT automaticamente", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const put = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", put)
    const actions = documentActions()
    let finish: (value: Awaited<ReturnType<DocumentActions["criarIntent"]>>) => void = () => undefined
    vi.mocked(actions.criarIntent).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    render(createElement(Documentos, { id: "link-synthetic", actions }))
    const file = await selectFile()
    await waitFor(() => expect(actions.criarIntent).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText("Cancelar"))
    await act(async () => finish({ ok: true, data: { documentoId: "11111111-1111-4111-8111-111111111111", uploadIntent: "intent-stage",
      signedUrl: "https://storage.example.invalid/stage", headersObrigatorios: { "If-None-Match": "*" }, expiresInSec: 300 } }))
    expect(put).not.toHaveBeenCalled()
    const retryPut = screen.getByText("Repetir envio de bytes") as HTMLButtonElement
    await waitFor(() => expect(retryPut.disabled).toBe(false))
    fireEvent.click(retryPut)
    await screen.findByText("Documento salvo.")
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0][1].body).toBe(file)
    expect(actions.criarIntent).toHaveBeenCalledTimes(1)
  })
})
