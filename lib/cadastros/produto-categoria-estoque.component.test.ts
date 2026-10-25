// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { businessPresentation, resolveBusinessResource } from "@/lib/store-business-capabilities"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { MODULES } from "@/lib/auth/access-policy"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"

/**
 * Categoria explícita e feedback de estoque na ficha canônica (`ProductAIModal`).
 * Writers e leitores são mocks de Server Action: aqui só se prova o que a ficha
 * envia, quando informa sucesso e o que mostra; a persistência real fica no E2E.
 */
const h = vi.hoisted(() => ({
  internal: false,
  capabilities: { version: 1, business: { primaryBranch: "padaria" } } as StoreCapabilitiesV1,
  dictionary: [] as Array<{ id: string; name: string; type: string; active: boolean }>,
  listCategorias: vi.fn(),
  upsertCategoria: vi.fn(),
  upsertProduto: vi.fn(),
  movementProps: null as null | { open: boolean; produto: { estoque: number; metadata?: unknown } | null; onSaved?: (r: { estoqueDepois: number }) => void },
}))

function permissions() {
  const base = getEnterprisePermissions("ADMIN")
  return h.internal
    ? { ...base, platformAuthority: true, modules: Object.fromEntries(MODULES.map((m) => [m, true])) }
    : { ...base, platformAuthority: false, modules: { ...Object.fromEntries(MODULES.map((m) => [m, false])), catalog: true, stock: true } }
}

vi.mock("@/lib/use-store-business", () => ({ useStoreBusiness: () => ({
  storeId: "loja-a", ready: true, hydrated: true, capabilities: h.capabilities, refresh: vi.fn(),
  branch: h.capabilities.business?.primaryBranch ?? "padaria", configured: true, permissions: permissions(),
  canConfigure: true, presentation: businessPresentation(h.capabilities), save: vi.fn(),
  resource: (key: Parameters<typeof resolveBusinessResource>[1]) => resolveBusinessResource(h.capabilities, key, undefined, true),
}) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/app/actions/produto-texto-livre", () => ({ interpretarProdutoTextoLivre: vi.fn() }))
vi.mock("@/app/actions/cadastros", () => ({
  listCategorias: h.listCategorias, listMarcas: vi.fn(async () => []),
  listCategoriasMarcasUsadasEmProduto: vi.fn(async () => ({ categorias: [], marcas: [] })),
  upsertCategoria: h.upsertCategoria, upsertMarca: vi.fn(), upsertProduto: h.upsertProduto,
  listProdutosPaginado: vi.fn(), lookupProdutoPorBarcodeLocal: vi.fn(), resolverCodigoBarras: vi.fn(),
}))
vi.mock("@/components/cadastros/lovable/components/cadastros/MovimentacaoEstoqueModal", () => ({
  MovimentacaoEstoqueModal: (props: NonNullable<typeof h.movementProps>) => {
    h.movementProps = props
    return props.open ? React.createElement("div", { "data-testid": "movimentacao" }, "Movimentação aberta") : null
  },
}))
vi.mock("@/components/dashboard/estoque/produto-compatibilidade-aparelhos", () => ({
  emptyCompatibilidade: () => ({ models: [], aliases: [], status: "nao_verificado", types: [], notes: "" }),
  ProdutoCompatibilidadeAparelhos: () => null,
}))
vi.mock("@/components/dashboard/estoque/produto-acessorios-config", () => ({ ProdutoAcessoriosConfig: () => null }))

import { ProductAIModal } from "@/components/cadastros/lovable/components/cadastros/produto-ia"

beforeEach(() => {
  h.internal = false
  h.capabilities = { version: 1, business: { primaryBranch: "padaria" } }
  h.dictionary = [{ id: "c1", name: "Bolos", type: "produto", active: true }]
  h.listCategorias.mockReset().mockImplementation(async () => h.dictionary)
  h.upsertCategoria.mockReset()
  h.upsertProduto.mockReset().mockResolvedValue({ ok: true, id: "p-new" })
  h.movementProps = null
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

type Initial = React.ComponentProps<typeof ProductAIModal>["initial"]
function editor(initial?: Initial) {
  return render(React.createElement(ProductAIModal, { open: true, onClose: vi.fn(), storeId: "loja-a", ...(initial ? { productId: "p-1", initial } : {}) }))
}
const categoria = () => screen.getByRole("textbox", { name: "Categoria", hidden: true }) as HTMLInputElement
const nome = () => screen.getByRole("textbox", { name: "Nome", hidden: true }) as HTMLInputElement
async function loaded() { await waitFor(() => expect(h.listCategorias).toHaveBeenCalled()) }

describe("Categoria explícita na experiência do cliente", () => {
  it("texto digitado com Enter ou saída do campo nunca grava nem vira categoria", async () => {
    editor()
    await loaded()
    fireEvent.change(categoria(), { target: { value: "Pães" } })
    fireEvent.keyDown(categoria(), { key: "Enter" })
    fireEvent.blur(categoria())
    expect(h.upsertCategoria).not.toHaveBeenCalled()
    expect(categoria().value).toBe("")
    expect(screen.getByText(/"Pães" não está na lista desta loja/)).toBeTruthy()
    // Salvar o produto não envia o texto descartado como categoria.
    fireEvent.change(nome(), { target: { value: "Pão francês" } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }))
    await waitFor(() => expect(h.upsertProduto).toHaveBeenCalledOnce())
    expect(h.upsertProduto.mock.calls[0][1]).not.toHaveProperty("categoria")
  })

  it("teclado real: Enter não cria, Tab chega ao botão e Enter nele abre a janela com o texto pendente", async () => {
    const user = userEvent.setup()
    editor()
    await loaded()
    await user.click(categoria())
    await user.keyboard("Salgados")
    await user.keyboard("{Enter}")
    await user.tab()
    const button = screen.getByRole("button", { name: "Nova categoria" })
    expect(document.activeElement).toBe(button)
    expect(categoria().value).toBe("")
    expect(h.upsertCategoria).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    const dialog = await screen.findByRole("dialog", { name: "Nova categoria" })
    const input = within(dialog).getByRole("textbox", { name: "Nome da categoria" }) as HTMLInputElement
    expect(input.value).toBe("Salgados")
    expect(document.activeElement).toBe(input)
  })

  it("teclado real: setas + Enter selecionam uma categoria existente sem gravar", async () => {
    h.dictionary = [
      { id: "c1", name: "Bolos", type: "produto", active: true },
      { id: "c3", name: "Bolachas", type: "produto", active: true },
    ]
    const user = userEvent.setup()
    editor()
    await loaded()
    await waitFor(() => expect(h.listCategorias).toHaveBeenCalled())
    await user.click(categoria())
    await user.keyboard("bol")
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")
    expect(categoria().value).toBe("Bolos")
    expect(h.upsertCategoria).not.toHaveBeenCalled()
  })

  it("lista longa: a opção ativa pelas setas é rolada para a área visível antes do Enter", async () => {
    h.dictionary = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `Categoria ${String(i).padStart(2, "0")}`, type: "produto", active: true }))
    const scrolled: string[] = []
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) { scrolled.push(this.textContent ?? "") }
    try {
      const user = userEvent.setup()
      editor()
      await loaded()
      await user.click(categoria())
      await user.keyboard("categoria")
      for (let i = 0; i < 25; i += 1) await user.keyboard("{ArrowDown}")
      expect(scrolled.at(-1)).toBe("Categoria 24")
      await user.keyboard("{Enter}")
      expect(categoria().value).toBe("Categoria 24")
    } finally {
      HTMLElement.prototype.scrollIntoView = original
    }
  })

  it("busca seleciona o nome canônico existente, sem criar", async () => {
    editor()
    await loaded()
    fireEvent.change(categoria(), { target: { value: "  bolos " } })
    fireEvent.blur(categoria())
    expect(categoria().value).toBe("Bolos")
    expect(h.upsertCategoria).not.toHaveBeenCalled()
  })

  it("Nova categoria grava pelo writer canônico uma vez, seleciona o nome devolvido e relê a lista", async () => {
    let release!: (value: { id: string; name: string }) => void
    h.upsertCategoria.mockImplementation(() => new Promise((resolve) => { release = resolve }))
    editor()
    await loaded()
    fireEvent.change(nome(), { target: { value: "Pão de queijo" } })
    fireEvent.change(categoria(), { target: { value: "  pães " } })
    fireEvent.blur(categoria())
    fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }))
    const dialog = await screen.findByRole("dialog", { name: "Nova categoria" })
    const input = within(dialog).getByRole("textbox", { name: "Nome da categoria" }) as HTMLInputElement
    expect(input.value).toBe("pães")
    const save = within(dialog).getByRole("button", { name: "Salvar categoria" })
    fireEvent.click(save)
    fireEvent.click(save)
    fireEvent.submit(input.form!)
    expect(h.upsertCategoria).toHaveBeenCalledTimes(1)
    expect(h.upsertCategoria).toHaveBeenCalledWith("loja-a", { name: "pães", type: "produto", active: true })
    // Antes da confirmação não há sucesso nem seleção.
    expect(screen.queryByText(/salva nesta loja e selecionada/)).toBeNull()
    expect(categoria().value).toBe("")
    const readsBefore = h.listCategorias.mock.calls.length
    h.dictionary = [...h.dictionary, { id: "c2", name: "Pães", type: "produto", active: true }]
    await act(async () => { release({ id: "c2", name: "Pães" }) })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nova categoria" })).toBeNull())
    expect(categoria().value).toBe("Pães")
    expect(screen.getByText('Categoria "Pães" salva nesta loja e selecionada.')).toBeTruthy()
    await waitFor(() => expect(h.listCategorias.mock.calls.length).toBeGreaterThan(readsBefore))
    expect(nome().value).toBe("Pão de queijo")
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }))
    await waitFor(() => expect(h.upsertProduto).toHaveBeenCalledOnce())
    expect(h.upsertProduto.mock.calls[0][1]).toMatchObject({ categoria: "Pães", nome: "Pão de queijo" })
  })

  it("falha do writer mantém a janela com erro e não seleciona categoria fictícia", async () => {
    h.upsertCategoria.mockRejectedValue(new Error("Sem permissão para Cadastros."))
    editor()
    await loaded()
    fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }))
    const dialog = await screen.findByRole("dialog", { name: "Nova categoria" })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Nome da categoria" }), { target: { value: "Salgados" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar categoria" }))
    expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", expect.stringMatching(/Não foi possível confirmar a criação/))
    expect(categoria().value).toBe("")
    expect(screen.queryByText(/salva nesta loja e selecionada/)).toBeNull()
    expect(screen.queryByRole("option", { name: "Salgados" })).toBeNull()
  })

  it("nome vazio não grava; cancelar fecha sem gravar e preserva o rascunho do produto", async () => {
    editor()
    await loaded()
    fireEvent.change(nome(), { target: { value: "Rascunho preservado" } })
    const trigger = screen.getByRole("button", { name: "Nova categoria" })
    trigger.focus()
    fireEvent.click(trigger)
    let dialog = await screen.findByRole("dialog", { name: "Nova categoria" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar categoria" }))
    expect(within(dialog).getByRole("alert").textContent).toBe("Informe o nome da categoria.")
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nova categoria" })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }))
    dialog = await screen.findByRole("dialog", { name: "Nova categoria" })
    fireEvent.keyDown(dialog, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nova categoria" })).toBeNull())
    expect(h.upsertCategoria).not.toHaveBeenCalled()
    expect(nome().value).toBe("Rascunho preservado")
    expect(screen.getByRole("button", { name: "Salvar produto" })).toBeTruthy()
  })
})

describe("Visão interna (A01 / lojas legadas) preservada", () => {
  it("sem botão novo; Enter continua criando pelo writer como antes", async () => {
    h.internal = true
    h.upsertCategoria.mockResolvedValue({ id: "c9", name: "Pães" })
    editor()
    await loaded()
    expect(screen.queryByRole("button", { name: "Nova categoria" })).toBeNull()
    fireEvent.change(categoria(), { target: { value: "Pães" } })
    fireEvent.keyDown(categoria(), { key: "Enter" })
    await waitFor(() => expect(h.upsertCategoria).toHaveBeenCalledWith("loja-a", { name: "Pães", type: "produto", active: true }))
    await waitFor(() => expect(categoria().value).toBe("Pães"))
  })
})

describe("Estoque na ficha: unidade, motivo do bloqueio e releitura", () => {
  const base = { nome: "Produto", estoque: 0 }
  it("produto UN: unidade junto ao saldo, movimentação abre e o saldo confirmado aparece na ficha", async () => {
    const onSaved = vi.fn()
    render(React.createElement(ProductAIModal, { open: true, onClose: vi.fn(), onSaved, storeId: "loja-a", productId: "p-1", initial: { ...base, metadata: {} } }))
    const saldo = screen.getByRole("textbox", { name: "Estoque atual" }) as HTMLInputElement
    expect(saldo.value).toBe("0")
    expect(document.querySelector("#produto-estoque-unidade")?.getAttribute("data-unidade")).toBe("UN")
    expect(document.querySelector("[data-estoque-bloqueio]")).toBeNull()
    const move = screen.getByRole("button", { name: "Movimentar estoque" }) as HTMLButtonElement
    expect(move.disabled).toBe(false)
    fireEvent.click(move)
    expect(screen.getByTestId("movimentacao")).toBeTruthy()
    expect(h.movementProps?.produto).toMatchObject({ estoque: 0, metadata: {} })
    await act(async () => { h.movementProps?.onSaved?.({ estoqueDepois: 7 }) })
    expect(saldo.value).toBe("7")
    expect(screen.getByText("Movimentação registrada. Saldo atual: 7 UN.")).toBeTruthy()
    expect(onSaved).toHaveBeenCalledOnce()
    // Salvar os demais dados depois da movimentação não envia saldo.
    fireEvent.change(nome(), { target: { value: "Produto renomeado" } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }))
    await waitFor(() => expect(h.upsertProduto).toHaveBeenCalledOnce())
    expect(h.upsertProduto.mock.calls[0][1]).not.toHaveProperty("estoque")
  })

  it("G em preparação: botão desabilitado com motivo visível e associado, sem abrir gravação", () => {
    editor({ ...base, metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "G", basePreco: "G" } } })
    const move = screen.getByRole("button", { name: "Movimentar estoque" }) as HTMLButtonElement
    expect(move.disabled).toBe(true)
    const reason = document.querySelector('[data-estoque-bloqueio="peso_em_preparacao"]')
    expect(reason?.textContent).toMatch(/Movimentação indisponível: venda por peso em preparação/)
    expect(move.getAttribute("aria-describedby")).toBe(reason?.id)
    expect(document.querySelector("#produto-estoque-unidade")?.getAttribute("data-unidade")).toBe("G")
    expect(document.body.textContent).not.toMatch(/Use Movimentar estoque para entrada/)
    fireEvent.click(move)
    expect(screen.queryByTestId("movimentacao")).toBeNull()
  })

  it("KG: movimentação abre para entrada e a ficha mostra o saldo em milésimos (3,250)", async () => {
    const metadata = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
    render(React.createElement(ProductAIModal, { open: true, onClose: vi.fn(), storeId: "loja-a", productId: "p-1", initial: { ...base, estoque: 2.5, metadata } }))
    const saldo = screen.getByRole("textbox", { name: "Estoque atual" }) as HTMLInputElement
    expect(saldo.value).toBe("2,500")
    expect(document.querySelector("#produto-estoque-unidade")?.getAttribute("data-unidade")).toBe("KG")
    expect(document.querySelector("[data-estoque-bloqueio]")).toBeNull()
    expect(document.body.textContent).toMatch(/Use Movimentar estoque para entrada em kg \(até 3 casas\)/)
    const move = screen.getByRole("button", { name: "Movimentar estoque" }) as HTMLButtonElement
    expect(move.disabled).toBe(false)
    fireEvent.click(move)
    expect(h.movementProps?.produto).toMatchObject({ estoque: 2.5, metadata })
    await act(async () => { h.movementProps?.onSaved?.({ estoqueDepois: 3.25 }) })
    expect(saldo.value).toBe("3,250")
    expect(screen.getByText("Movimentação registrada. Saldo atual: 3,250 KG.")).toBeTruthy()
  })

  it("declaração comercial inválida recebe orientação própria e unidade a revisar", () => {
    editor({ ...base, metadata: { comercial: { version: 2, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } } })
    expect((screen.getByRole("button", { name: "Movimentar estoque" }) as HTMLButtonElement).disabled).toBe(true)
    const reason = document.querySelector('[data-estoque-bloqueio="declaracao_invalida"]')
    expect(reason?.textContent).toMatch(/declaração comercial inválida/)
    expect(reason?.textContent).not.toMatch(/peso em preparação/)
    expect(document.querySelector("#produto-estoque-unidade")?.textContent).toBe("unidade a revisar")
  })
})
