// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { businessPresentation, resolveBusinessResource } from "@/lib/store-business-capabilities"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"

const h = vi.hoisted(() => ({
  capabilities: { version: 1, business: { primaryBranch: "padaria" } } as StoreCapabilitiesV1,
  canConfigure: true,
  permitted: true,
  ready: true,
  hydrated: true,
  refresh: vi.fn(async () => {}),
  save: vi.fn(async (_patch: unknown) => {}),
  upsert: vi.fn(async (_id: string, _input: unknown) => ({ ok: true, id: "p-new" })),
}))
vi.mock("@/lib/use-store-business", () => ({ useStoreBusiness: () => ({
  storeId: "loja-a", ready: h.ready, hydrated: h.hydrated, capabilities: h.capabilities, refresh: h.refresh,
  branch: h.capabilities.business?.primaryBranch ?? "assistencia", configured: true,
  permissions: { ...getEnterprisePermissions("ADMIN"), platformAuthority: false, workspace: { iaMestre: false, omniAgent: false }, modules: { ai: false, marketplace: false, service: h.permitted, deviceCatalog: h.permitted } },
  canConfigure: h.canConfigure, presentation: businessPresentation(h.capabilities), save: h.save,
  resource: (key: Parameters<typeof resolveBusinessResource>[1]) => resolveBusinessResource(h.capabilities, key, undefined, h.permitted),
}) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => ({ ...getEnterprisePermissions("ADMIN"), platformAuthority: false, workspace: { iaMestre: false, omniAgent: false }, modules: { ai: false, marketplace: false, service: h.permitted, deviceCatalog: h.permitted } }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-a" }) }))
vi.mock("@/components/configuracoes-v3/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/app/actions/produto-texto-livre", () => ({ interpretarProdutoTextoLivre: vi.fn() }))
vi.mock("@/app/actions/estoque", () => ({ getEstoqueResumo: vi.fn(async () => ({})) }))
vi.mock("@/app/actions/cadastros", () => ({
  listCategorias: vi.fn(async () => []), listMarcas: vi.fn(async () => []),
  listCategoriasMarcasUsadasEmProduto: vi.fn(async () => ({ categorias: [], marcas: [] })),
  upsertCategoria: vi.fn(), upsertMarca: vi.fn(), upsertProduto: h.upsert,
  lookupProdutoPorBarcodeLocal: vi.fn(), resolverCodigoBarras: vi.fn(),
  getCadastrosDashboardStats: vi.fn(async () => ({ kpis: [], saude: [] })),
  listEquipamentosModelos: vi.fn(), listClientes: vi.fn(), listFornecedores: vi.fn(),
  listProdutosPaginado: vi.fn(), listServicos: vi.fn(), listTecnicos: vi.fn(), listLogsAuditoriaCadastros: vi.fn(),
  upsertEquipamentoModelo: vi.fn(), upsertFornecedor: vi.fn(), upsertTecnico: vi.fn(), updateCliente: vi.fn(),
  upsertServico: vi.fn(), deleteProduto: vi.fn(), getUltimoBatchProdutos: vi.fn(),
}))
vi.mock("@/components/cadastros/lovable/components/cadastros/MovimentacaoEstoqueModal", () => ({ MovimentacaoEstoqueModal: () => null, HistoricoEstoqueGeralModal: () => null }))
vi.mock("@/components/cadastros/lovable/components/cadastros/ClienteEditor", () => ({ ClienteEditorDialog: () => null }))
vi.mock("@/components/cadastros/lovable/components/cadastros/ImportacaoHub", () => ({ ImportacaoHub: () => null }))
vi.mock("@/components/dashboard/estoque/produto-compatibilidade-aparelhos", () => ({
  emptyCompatibilidade: () => ({ models: [], aliases: [], status: "nao_verificado", types: [], notes: "" }),
  ProdutoCompatibilidadeAparelhos: () => React.createElement("p", null, "Editor de compatibilidade"),
}))
vi.mock("@/components/dashboard/estoque/produto-acessorios-config", () => ({
  ProdutoAcessoriosConfig: () => React.createElement("p", null, "Configuração de capinhas e películas"),
}))

import { ProductAIModal } from "@/components/cadastros/lovable/components/cadastros/produto-ia"
import { CadastrosHub } from "@/components/cadastros/lovable/components/cadastros/CadastrosHub"
import { BusinessResourcesCard } from "@/components/configuracoes-v3/features/settings/components/BusinessResourcesCard"

beforeEach(() => {
  h.capabilities = { version: 1, business: { primaryBranch: "padaria" } }
  h.permitted = true
  h.canConfigure = true
  h.ready = true
  h.hydrated = true
  h.refresh.mockClear()
  h.upsert.mockClear()
  h.save.mockClear()
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function product(initial?: React.ComponentProps<typeof ProductAIModal>["initial"]) {
  return render(React.createElement(ProductAIModal, { open: true, onClose: vi.fn(), storeId: "loja-a", ...(initial ? { productId: "p-existing", initial } : {}) }))
}

describe("Cadastros adaptados por recursos e produto", () => {
  it("padaria nova não renderiza aparelhos, exemplos de celulares ou técnicos", async () => {
    product()
    expect(await screen.findAllByPlaceholderText("Ex.: Pão francês")).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/capinhas|películas|equipamentos|compatibilidade com aparelhos/i)
    const placeholders = [...document.querySelectorAll("[placeholder]")].map((el) => el.getAttribute("placeholder")).join(" ")
    expect(placeholders).not.toMatch(/iphone|apple|celular|telas|película/i)
    expect(screen.getByText("Garantia (dias)")).toBeTruthy()
    expect(screen.getByText("NCM")).toBeTruthy()
  })
  it("audita também navegação, novo cadastro e atalhos do HUB", async () => {
    render(React.createElement(CadastrosHub))
    await screen.findByText("Cadastros: Padaria / Confeitaria")
    expect(screen.getByRole("link", { name: /Configurar ramo/ }).getAttribute("href")).toContain("?sec=geral#ramo-recursos")
    fireEvent.click(screen.getByRole("button", { name: "Novo cadastro" }))
    expect(document.body.textContent).not.toMatch(/técnicos|novo técnico|equipamentos|modelo para OS|diagnóstico/i)
  })
  it("loja mista aplica seções só ao produto explicitamente escolhido", async () => {
    h.capabilities = { version: 1, business: { primaryBranch: "variedades" }, overrides: { "catalog.deviceCompatibility": true, "pdv.accessoryModelColor": true } }
    product()
    expect(screen.queryByText("Editor de compatibilidade")).toBeNull()
    expect(screen.queryByText("Configuração de capinhas e películas")).toBeNull()
    fireEvent.click(screen.getByRole("checkbox", { name: "Possui compatibilidade com aparelhos" }))
    expect(await screen.findByText("Editor de compatibilidade")).toBeTruthy()
    expect(screen.queryByText("Configuração de capinhas e películas")).toBeNull()
    fireEvent.click(screen.getByRole("checkbox", { name: "É um acessório para aparelhos" }))
    expect(screen.getByText("Configuração de capinhas e películas")).toBeTruthy()
  })
  it("alterar uma aplicação omite a aplicação que não foi tocada", async () => {
    h.capabilities = { version: 1, business: { primaryBranch: "variedades" }, overrides: { "catalog.deviceCompatibility": true, "pdv.accessoryModelColor": true } }
    product({ nome: "Misto" })
    fireEvent.click(screen.getByRole("checkbox", { name: "Possui compatibilidade com aparelhos" }))
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledOnce())
    expect((h.upsert.mock.calls[0][1] as any).metadata.cadastroRecursos).toEqual({ compatibilidade: true })
  })
  it("grade alterada antes de ocultar o recurso não reenvia false ao salvar campos comuns", async () => {
    h.capabilities = { version: 1, business: { primaryBranch: "variedades" }, overrides: { "catalog.variants": true, "catalog.weight": true } }
    const props = { open: true, onClose: vi.fn(), storeId: "loja-a", productId: "existing", initial: { nome: "Misto", metadata: { comercial: { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN", gradePlanejada: true } } } }
    const ui = render(React.createElement(ProductAIModal, props))
    fireEvent.click(screen.getByRole("checkbox", { name: /Planejar grade/ }))
    h.capabilities = { ...h.capabilities, overrides: { "catalog.variants": false, "catalog.weight": true } }
    ui.rerender(React.createElement(ProductAIModal, props))
    expect(screen.queryByRole("checkbox", { name: /Planejar grade/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledOnce())
    expect((h.upsert.mock.calls[0][1] as any).metadata).not.toHaveProperty("comercial")
  })
  it("categorias não expõem linhas de equipamentos quando assistência está desabilitada", async () => {
    render(React.createElement(CadastrosHub))
    fireEvent.click(screen.getByRole("button", { name: "Categorias / Marcas" }))
    expect(await screen.findByText("Categorias de produtos")).toBeTruthy()
    expect(screen.queryByText("Linhas de equipamentos")).toBeNull()
  })
  it("edição com seções ocultas omite configurações e preserva o patch", async () => {
    product({ nome: "Mercadoria", garantia: 60, metadata: {
      atributos: { modeloCompativel: "Modelo histórico", descricao: "Descrição" },
      catalogoAparelhos: { version: 1, deviceModelKeys: ["m1"] },
      acessorios: { version: 1, tipo: "capinha", exigeModelo: true, exigeCor: true, usaCoresPadrao: true },
    } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledOnce())
    const payload = h.upsert.mock.calls[0][1] as Record<string, any>
    expect(payload).not.toHaveProperty("accessoryConfig")
    expect(payload).not.toHaveProperty("active")
    expect(payload.metadata).not.toHaveProperty("catalogoAparelhos")
    expect(payload.metadata).not.toHaveProperty("comercial")
    expect(payload.metadata.atributos).not.toHaveProperty("modeloCompativel")
    expect(payload.garantia).toBe(60)
  })
  it("assistência existente reabre sua configuração pertinente", async () => {
    h.capabilities = { version: 1, business: { primaryBranch: "assistencia" } }
    product({ nome: "Peça", metadata: { atributos: { modeloCompativel: "Modelo A" }, acessorios: { version: 1, tipo: "capinha", exigeModelo: true, exigeCor: false, usaCoresPadrao: true } } })
    expect(await screen.findByText("Editor de compatibilidade")).toBeTruthy()
    expect(screen.getByText("Configuração de capinhas e películas")).toBeTruthy()
    expect(screen.getByDisplayValue("Modelo A")).toBeTruthy()
  })
  it("permissão negada mantém seções ocultas mesmo quando solicitadas", () => {
    h.permitted = false
    h.capabilities = { version: 1, business: { primaryBranch: "assistencia" } }
    product({ metadata: { atributos: { modeloCompativel: "A" } } })
    expect(screen.queryByText("Editor de compatibilidade")).toBeNull()
  })
  it("produto por peso permanece identificado e bloqueado após desativar recurso", () => {
    h.capabilities = { version: 1, business: { primaryBranch: "variedades" }, overrides: { "catalog.weight": false } }
    product({ nome: "Grãos", metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } } })
    expect((screen.getByRole("combobox", { name: "Forma de venda" }) as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText(/Venda bloqueada até a integração/)).toBeTruthy()
  })
  it("declaração comercial inválida avisa e não envia unidade padrão ao salvar", async () => {
    product({ nome: "Histórico", metadata: { comercial: { version: 1, modoVenda: "unidade", unidade: "KG", basePreco: "KG" } } })
    expect(screen.getByRole("alert").textContent).toMatch(/Declaração comercial inválida.*Venda bloqueada/)
    expect(screen.queryByRole("combobox", { name: "Forma de venda" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledOnce())
    expect((h.upsert.mock.calls[0][1] as any).metadata).not.toHaveProperty("comercial")
  })
  it("variedades prepara peso sem exigir ramo padaria", async () => {
    h.capabilities = { version: 1, business: { primaryBranch: "variedades" }, overrides: { "catalog.weight": true } }
    product()
    fireEvent.change(screen.getByRole("combobox", { name: "Forma de venda" }), { target: { value: "peso" } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledOnce())
    expect((h.upsert.mock.calls[0][1] as any).metadata.comercial).toEqual({ version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" })
    expect(h.capabilities.business?.primaryBranch).toBe("variedades")
  })
})

describe("Editor oficial de configuração", () => {
  it("falha concluída exibe erro e permite recarregar sem oferecer edição", async () => {
    h.ready = false
    render(React.createElement(BusinessResourcesCard))
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível carregar")
    expect(screen.queryByRole("combobox", { name: "Ramo principal" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }))
    await waitFor(() => expect(h.refresh).toHaveBeenCalledOnce())
    expect(h.save).not.toHaveBeenCalled()
  })
  it("tentativa em andamento continua como carregamento", () => {
    h.ready = false; h.hydrated = false
    render(React.createElement(BusinessResourcesCard))
    expect(screen.getByRole("status").textContent).toContain("Carregando")
    expect(screen.queryByRole("alert")).toBeNull()
  })
  it("mudar preset envia só o ramo e preserva escolhas explícitas", async () => {
    h.capabilities = { version: 1, business: { primaryBranch: "assistencia" }, overrides: { "pdv.accessoryModelColor": true } }
    render(React.createElement(BusinessResourcesCard))
    fireEvent.change(screen.getByRole("combobox", { name: "Ramo principal" }), { target: { value: "padaria" } })
    expect((screen.getByRole("checkbox", { name: /Acessórios para aparelhos/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Salvar ramo e recursos" }))
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce())
    expect(h.save.mock.calls[0][0]).toEqual({ printerConfig: { capabilities: { version: 1, business: { primaryBranch: "padaria" } } } })
  })
  it("alternar override em objeto troca só enabled e preserva as demais propriedades", async () => {
    h.capabilities = { version: 1, business: { primaryBranch: "variedades" }, overrides: { "catalog.weight": { enabled: true, nota: "balcão" } } }
    render(React.createElement(BusinessResourcesCard))
    fireEvent.click(screen.getByRole("checkbox", { name: /Produtos por peso/ }))
    fireEvent.click(screen.getByRole("button", { name: "Salvar ramo e recursos" }))
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce())
    expect(h.save.mock.calls[0][0]).toEqual({ printerConfig: { capabilities: { version: 1, business: {},
      overrides: { "catalog.weight": { enabled: false, nota: "balcão" } } } } })
  })
  it("marcar e desmarcar a mesma caixa não grava escolha explícita nova", () => {
    h.capabilities = { version: 1, business: { primaryBranch: "padaria" } }
    render(React.createElement(BusinessResourcesCard))
    const box = screen.getByRole("checkbox", { name: /Grade comercial/ })
    fireEvent.click(box)
    fireEvent.click(box)
    expect(screen.getAllByText("Sugestão do ramo").length).toBe(5)
    expect((screen.getByRole("button", { name: "Salvar ramo e recursos" }) as HTMLButtonElement).disabled).toBe(true)
  })
  it("exibe preparação com honestidade e desabilita edição sem permissão", () => {
    h.canConfigure = false
    render(React.createElement(BusinessResourcesCard))
    expect((screen.getByRole("combobox", { name: "Ramo principal" }) as HTMLSelectElement).disabled).toBe(true)
    expect(document.body.textContent).toMatch(/Venda fracionada.*indisponíveis/)
    expect(document.body.textContent).toMatch(/Estoque por combinação.*indisponíveis/)
  })
})
