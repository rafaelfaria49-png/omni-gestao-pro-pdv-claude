// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { businessPresentation, resolveBusinessResource } from "@/lib/store-business-capabilities"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"
import type { ProdutoDTO } from "@/app/actions/cadastros"

/**
 * PADARIA-ESTOQUE-KG-A01-STORE-RELEASE-001 — ficha aberta por link
 * (`/dashboard/cadastros-v2?aba=produtos&produto=<id>`), destino da Gestão de Produtos
 * histórica para produto por peso. A resposta do servidor só abre a ficha enquanto o
 * pedido ainda é dono do editor (revisão R6: P2 abertura manual, P3 StrictMode).
 */
const capabilities: StoreCapabilitiesV1 = { version: 1, business: { primaryBranch: "padaria" } }
const h = vi.hoisted(() => ({
  obter: vi.fn(async (_storeId: string, _id: string): Promise<unknown> => null),
  toastError: vi.fn(),
}))
vi.mock("@/lib/use-store-business", () => ({ useStoreBusiness: () => ({
  storeId: "loja-a", ready: true, hydrated: true, capabilities, refresh: vi.fn(), branch: "padaria", configured: true,
  permissions: { ...getEnterprisePermissions("ADMIN"), platformAuthority: false, workspace: { iaMestre: false, omniAgent: false }, modules: { ai: false, marketplace: false, service: true, deviceCatalog: false } },
  canConfigure: false, presentation: businessPresentation(capabilities), save: vi.fn(),
  resource: (key: Parameters<typeof resolveBusinessResource>[1]) => resolveBusinessResource(capabilities, key, undefined, true),
}) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => ({ ...getEnterprisePermissions("ADMIN"), platformAuthority: false, workspace: { iaMestre: false, omniAgent: false }, modules: { ai: false, marketplace: false, service: true, deviceCatalog: false } }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-a" }) }))
vi.mock("@/components/configuracoes-v3/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn() } }))
vi.mock("@/app/actions/produto-texto-livre", () => ({ interpretarProdutoTextoLivre: vi.fn() }))
vi.mock("@/app/actions/estoque", () => ({ getEstoqueResumo: vi.fn(async () => ({})) }))
vi.mock("@/app/actions/cadastros", () => ({
  listCategorias: vi.fn(async () => []), listMarcas: vi.fn(async () => []),
  listCategoriasMarcasUsadasEmProduto: vi.fn(async () => ({ categorias: [], marcas: [] })),
  upsertCategoria: vi.fn(), upsertMarca: vi.fn(), upsertProduto: vi.fn(),
  lookupProdutoPorBarcodeLocal: vi.fn(), resolverCodigoBarras: vi.fn(),
  getCadastrosDashboardStats: vi.fn(async () => ({ kpis: [], saude: [] })),
  listEquipamentosModelos: vi.fn(), listClientes: vi.fn(), listFornecedores: vi.fn(),
  listProdutosPaginado: vi.fn(async () => ({ produtos: [], total: 0 })), obterProdutoFicha: h.obter,
  listServicos: vi.fn(), listTecnicos: vi.fn(), listLogsAuditoriaCadastros: vi.fn(),
  upsertEquipamentoModelo: vi.fn(), upsertFornecedor: vi.fn(), upsertTecnico: vi.fn(), updateCliente: vi.fn(),
  upsertServico: vi.fn(), deleteProduto: vi.fn(), getUltimoBatchProdutos: vi.fn(async () => null),
}))
vi.mock("@/components/cadastros/lovable/components/cadastros/MovimentacaoEstoqueModal", () => ({ MovimentacaoEstoqueModal: () => null, HistoricoEstoqueGeralModal: () => null }))
vi.mock("@/components/cadastros/lovable/components/cadastros/ClienteEditor", () => ({ ClienteEditorDialog: () => null }))
vi.mock("@/components/cadastros/lovable/components/cadastros/ImportacaoHub", () => ({ ImportacaoHub: () => null }))

import { ProdutosPanel } from "@/components/cadastros/lovable/components/cadastros/CadastrosHub"

const PAO: ProdutoDTO = {
  id: "p-kg", nome: "Pão Link Sintético", sku: "—", barras: "", categoria: "—", marca: "—", fornecedor: "—",
  estoque: 12.75, custo: 0, preco: 18.9, margem: 0, garantia: 0, status: "Incompleto",
  metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } },
}

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
/** Pai como o CadastrosHub: guarda o id do link e o limpa quando o painel o consome. */
function Hub({ consumed }: { consumed: () => void }) {
  const [id, setId] = React.useState<string | null>("p-kg")
  return React.createElement(ProdutosPanel, { storeId: "loja-a", openProductId: id, onOpenProductConsumed: () => { consumed(); setId(null) } })
}
function panel(consumed = vi.fn(), strict = false) {
  const el = React.createElement(Hub, { consumed })
  render(strict ? React.createElement(React.StrictMode, null, el) : el)
  return consumed
}

beforeEach(() => {
  h.obter.mockReset()
  h.toastError.mockClear()
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("ficha de produto aberta por link", () => {
  it("relê o produto da loja e abre a ficha com o saldo em kg", async () => {
    h.obter.mockResolvedValue(PAO)
    const consumed = panel()
    expect(await screen.findByDisplayValue(PAO.nome)).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Estoque atual" })).toHaveProperty("value", "12,750")
    expect(h.obter).toHaveBeenCalledWith("loja-a", "p-kg")
    expect(consumed).toHaveBeenCalledTimes(1)
  })

  it("produto de outra loja (null) não abre ficha e avisa", async () => {
    h.obter.mockResolvedValue(null)
    const consumed = panel()
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Produto não encontrado nesta loja."))
    expect(screen.queryByDisplayValue(PAO.nome)).toBeNull()
    expect(screen.queryByRole("textbox", { name: "Estoque atual" })).toBeNull()
    expect(consumed).toHaveBeenCalledTimes(1)
  })

  it("abrir Novo enquanto o link carrega: a resposta não troca o formulário do operador (R6 P2)", async () => {
    const d = deferred<ProdutoDTO>()
    h.obter.mockReturnValue(d.promise)
    const consumed = panel()
    await waitFor(() => expect(h.obter).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getAllByRole("button", { name: "Novo" })[0])
    const nome = await screen.findByPlaceholderText("Ex.: Pão francês")
    fireEvent.change(nome, { target: { value: "Rascunho do operador" } })
    expect(consumed).toHaveBeenCalledTimes(1)
    await act(async () => { d.resolve(PAO) })
    expect(screen.queryByDisplayValue(PAO.nome)).toBeNull()
    expect(screen.getByDisplayValue("Rascunho do operador")).toBeTruthy()
    expect(consumed).toHaveBeenCalledTimes(1)
  })

  it("StrictMode: a leitura descartada falhar não impede a válida de abrir a ficha (R6 P3)", async () => {
    const primeira = deferred<ProdutoDTO>(), segunda = deferred<ProdutoDTO>()
    h.obter.mockReturnValueOnce(primeira.promise).mockReturnValueOnce(segunda.promise)
    const consumed = panel(vi.fn(), true)
    await waitFor(() => expect(h.obter).toHaveBeenCalledTimes(2))
    await act(async () => { primeira.reject(new Error("rede")) })
    expect(h.toastError).not.toHaveBeenCalled()
    expect(consumed).not.toHaveBeenCalled()
    await act(async () => { segunda.resolve(PAO) })
    expect(await screen.findByDisplayValue(PAO.nome)).toBeTruthy()
    expect(consumed).toHaveBeenCalledTimes(1)
  })
})
