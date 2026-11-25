// @vitest-environment jsdom
/**
 * OMNI-CADASTROS-PADRAO-GLOBAL-UX-001 — UI real do Cadastros HUB com o padrão global:
 * busca sem acento, ordem pt-BR, pré-checagem de duplicidade (sem chamar o servidor),
 * mensagens por toast, rótulos ligados aos campos e chips de categoria por id.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { businessPresentation, resolveBusinessResource } from "@/lib/store-business-capabilities"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"

const h = vi.hoisted(() => ({
  capabilities: { version: 1, business: { primaryBranch: "assistencia" } } as StoreCapabilitiesV1,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  listFornecedores: vi.fn(async () => [] as unknown[]),
  upsertFornecedor: vi.fn(async () => ({ id: "f-new" })),
  listCategorias: vi.fn(async () => [] as unknown[]),
  listMarcas: vi.fn(async () => [] as unknown[]),
  upsertCategoria: vi.fn(async () => ({ id: "c-new", name: "x" })),
  upsertMarca: vi.fn(async () => ({ id: "m-new", name: "x" })),
  listTecnicos: vi.fn(async () => [] as unknown[]),
  upsertTecnico: vi.fn(async () => ({ id: "t-new" })),
}))

vi.mock("@/lib/use-store-business", () => ({ useStoreBusiness: () => ({
  storeId: "loja-a", ready: true, hydrated: true, capabilities: h.capabilities, refresh: vi.fn(),
  branch: "assistencia", configured: true,
  permissions: { ...getEnterprisePermissions("ADMIN"), platformAuthority: false, workspace: { iaMestre: false, omniAgent: false }, modules: { ai: false, marketplace: false, service: true, deviceCatalog: true } },
  canConfigure: true, presentation: businessPresentation(h.capabilities), save: vi.fn(),
  resource: (key: Parameters<typeof resolveBusinessResource>[1]) => resolveBusinessResource(h.capabilities, key, undefined, true),
}) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => ({ ...getEnterprisePermissions("ADMIN"), platformAuthority: false, workspace: { iaMestre: false, omniAgent: false }, modules: { ai: false, marketplace: false, service: true, deviceCatalog: true } }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-a" }) }))
vi.mock("@/components/configuracoes-v3/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess, info: h.toastInfo } }))
vi.mock("@/app/actions/produto-texto-livre", () => ({ interpretarProdutoTextoLivre: vi.fn() }))
vi.mock("@/app/actions/estoque", () => ({ getEstoqueResumo: vi.fn(async () => ({})) }))
vi.mock("@/app/actions/cadastros", () => ({
  listCategorias: h.listCategorias, listMarcas: h.listMarcas,
  listCategoriasMarcasUsadasEmProduto: vi.fn(async () => ({ categorias: [], marcas: [] })),
  upsertCategoria: h.upsertCategoria, upsertMarca: h.upsertMarca, upsertProduto: vi.fn(),
  lookupProdutoPorBarcodeLocal: vi.fn(), resolverCodigoBarras: vi.fn(),
  getCadastrosDashboardStats: vi.fn(async () => ({ kpis: [], saude: [] })),
  listEquipamentosModelos: vi.fn(async () => []), listClientes: vi.fn(async () => []), listFornecedores: h.listFornecedores,
  listProdutosPaginado: vi.fn(async () => ({ produtos: [], total: 0 })), listServicos: vi.fn(async () => []),
  listTecnicos: h.listTecnicos, listLogsAuditoriaCadastros: vi.fn(async () => []),
  upsertEquipamentoModelo: vi.fn(), upsertFornecedor: h.upsertFornecedor, upsertTecnico: h.upsertTecnico, updateCliente: vi.fn(),
  upsertServico: vi.fn(), deleteProduto: vi.fn(), getUltimoBatchProdutos: vi.fn(async () => null),
}))
vi.mock("@/app/actions/identificacao-etiquetas", () => ({
  getIdentificacaoStatus: vi.fn(async () => ({ enabled: false })),
}))
vi.mock("@/app/actions/vestuario-catalogo", () => ({
  getVestuarioCatalogoStatus: vi.fn(async () => ({ enabled: false })),
}))
vi.mock("@/components/cadastros/lovable/components/cadastros/MovimentacaoEstoqueModal", () => ({ MovimentacaoEstoqueModal: () => null, HistoricoEstoqueGeralModal: () => null }))
vi.mock("@/components/cadastros/lovable/components/cadastros/ClienteEditor", () => ({ ClienteEditorDialog: () => null }))
vi.mock("@/components/cadastros/lovable/components/cadastros/ImportacaoHub", () => ({ ImportacaoHub: () => null }))

import { CadastrosHub } from "@/components/cadastros/lovable/components/cadastros/CadastrosHub"

const fornecedor = (id: string, nome: string, cnpj = "—") => ({
  id, nome, razaoSocial: "", cnpj, contato: "—", whatsapp: "—", email: "—", endereco: "", produtos: "",
  prazo: "—", pagamento: "—", observacoes: "", ultima: "—", status: "Ativo",
})

beforeEach(() => {
  for (const fn of Object.values(h)) if (typeof fn === "function" && "mockClear" in fn) (fn as ReturnType<typeof vi.fn>).mockClear()
  h.listFornecedores.mockResolvedValue([
    fornecedor("f1", "Óticas Brasil"),
    fornecedor("f2", "Cerâmica Paulista", "11.222.333/0001-81"),
    fornecedor("f3", "acessórios centro"),
  ])
  h.listCategorias.mockResolvedValue([
    { id: "c1", name: "Películas", type: "produto", active: true },
    { id: "c2", name: "capinhas", type: "produto", active: true },
    { id: "c3", name: "Capinhas", type: "produto", active: true }, // legado duplicado
  ])
  h.listMarcas.mockResolvedValue([])
  h.listTecnicos.mockResolvedValue([])
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function abrirAba(nome: string) {
  render(React.createElement(CadastrosHub))
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${nome}$`) }))
}

describe("Fornecedores — padrão global", () => {
  it("lista em ordem pt-BR e busca sem acento e por dígitos do CNPJ", async () => {
    await abrirAba("Fornecedores")
    await screen.findByText("Óticas Brasil")
    const nomes = [...document.querySelectorAll("tbody tr td:first-child")].map((td) => td.textContent)
    expect(nomes).toEqual(["acessórios centro", "Cerâmica Paulista", "Óticas Brasil"])
    const busca = screen.getByPlaceholderText("Buscar em fornecedores…")
    fireEvent.change(busca, { target: { value: "ceramica" } })
    expect(screen.queryByText("Óticas Brasil")).toBeNull()
    expect(screen.getByText("Cerâmica Paulista")).toBeTruthy()
    fireEvent.change(busca, { target: { value: "11222333" } })
    expect(screen.getByText("Cerâmica Paulista")).toBeTruthy()
    fireEvent.change(busca, { target: { value: "otica brasil" } })
    expect(screen.getByText("Óticas Brasil")).toBeTruthy()
  })

  it("bloqueia duplicado no formulário sem chamar o servidor, com mensagem clara", async () => {
    await abrirAba("Fornecedores")
    await screen.findByText("Óticas Brasil")
    fireEvent.click(screen.getByRole("button", { name: /Novo$/ }))
    const nome = screen.getByLabelText(/Nome fantasia/)
    expect(nome.getAttribute("aria-required")).toBe("true")
    fireEvent.change(nome, { target: { value: "  OTICAS   brasil " } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar fornecedor" }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalled())
    expect(String(h.toastError.mock.calls[0][0])).toContain("Já existe o fornecedor “Óticas Brasil”")
    expect(h.upsertFornecedor).not.toHaveBeenCalled()
  })

  it("salva novo fornecedor e confirma por toast (sem window.alert)", async () => {
    const alert = vi.fn()
    vi.stubGlobal("alert", alert)
    await abrirAba("Fornecedores")
    await screen.findByText("Óticas Brasil")
    fireEvent.click(screen.getByRole("button", { name: /Novo$/ }))
    fireEvent.change(screen.getByLabelText(/Nome fantasia/), { target: { value: "Nova Distribuidora" } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar fornecedor" }))
    await waitFor(() => expect(h.upsertFornecedor).toHaveBeenCalledOnce())
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalledWith("Fornecedor cadastrado."))
    expect(alert).not.toHaveBeenCalled()
  })

  it("campo obrigatório vazio é recusado no formulário", async () => {
    await abrirAba("Fornecedores")
    await screen.findByText("Óticas Brasil")
    fireEvent.click(screen.getByRole("button", { name: /Novo$/ }))
    fireEvent.click(screen.getByRole("button", { name: "Salvar fornecedor" }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Informe o nome fantasia do fornecedor."))
    expect(h.upsertFornecedor).not.toHaveBeenCalled()
  })
})

describe("Categorias / Marcas — padrão global", () => {
  it("chips em ordem pt-BR, por id (legado duplicado não se confunde) e inativação acessível", async () => {
    await abrirAba("Categorias / Marcas")
    const card = (await screen.findByText("Categorias de produtos")).closest("div.rounded-2xl") as HTMLElement
    const inativar = within(card).getAllByRole("button", { name: /^Inativar / })
    expect(inativar.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Inativar capinhas",
      "Inativar Capinhas",
      "Inativar Películas",
    ])
    fireEvent.click(inativar[1])
    await waitFor(() => expect(h.upsertCategoria).toHaveBeenCalledWith("loja-a", { id: "c3", name: "Capinhas", type: "produto", active: false }))
  })

  it("nova categoria equivalente a uma ativa é recusada sem chamar o servidor", async () => {
    await abrirAba("Categorias / Marcas")
    const card = (await screen.findByText("Categorias de produtos")).closest("div.rounded-2xl") as HTMLElement
    fireEvent.click(within(card).getByRole("button", { name: /Novo/ }))
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "PELICULAS" } })
    expect((screen.getByLabelText("Tipo") as HTMLSelectElement).selectedOptions[0].textContent).toBe("Produto")
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalled())
    expect(String(h.toastError.mock.calls[0][0])).toContain("Já existe a categoria “Películas”")
    expect(h.upsertCategoria).not.toHaveBeenCalled()
  })
})

describe("Técnicos — padrão global", () => {
  it("duplicidade por nome sem acento/caixa", async () => {
    h.listTecnicos.mockResolvedValue([
      { id: "t1", name: "José Antônio", email: "", phone: "", role: "Técnico", specialty: "", commissionPercent: 0, active: true },
    ])
    await abrirAba("Técnicos")
    await screen.findByText("José Antônio")
    fireEvent.click(screen.getByRole("button", { name: /Novo$/ }))
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: "JOSE ANTONIO" } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalled())
    expect(String(h.toastError.mock.calls[0][0])).toContain("Já existe o técnico “José Antônio”")
    expect(h.upsertTecnico).not.toHaveBeenCalled()
  })
})
