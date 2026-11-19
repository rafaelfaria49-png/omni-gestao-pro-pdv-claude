// @vitest-environment jsdom
/**
 * COMPAT-BUSCA-MODELOS-NATURAL-001 — componentes montados (fetch simulado, sem rede):
 *  - Compat (ModeloPicker): "Mostrar mais" pede o offset seguinte e acrescenta sem repetir;
 *    busca nova volta para a primeira página.
 *  - PDV (Configurar acessório): o iPhone 7 da 2ª página é selecionável; modelo + cor viram a
 *    linha do carrinho SEM tocar estoque (nenhuma chamada além da busca).
 *  - Cadastro: nome de um caractere ("7") habilita o cadastro; modelo exato já existente oferece
 *    "Usar modelo existente" e não grava nada.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const h = vi.hoisted(() => ({ criar: vi.fn() }))
vi.mock("@/lib/catalogo-aparelhos/loja-catalogo-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/catalogo-aparelhos/loja-catalogo-client")>()),
  criarModeloLoja: (...a: unknown[]) => h.criar(...a),
}))
vi.mock("@/lib/compat/compat-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/compat/compat-client")>()),
  carregarHierarquia: async () => ({ ok: true, fabricantes: ["Apple"], arvore: [] }),
  carregarCores: async () => ({ ok: true, linhas: [] }),
  consultarCapinha: async () => ({ ok: true, localizacoes: [] }),
}))

import { ModeloPicker } from "@/components/dashboard/compat/modelo-picker"
import { SelecionarAcessorioDialog } from "@/components/dashboard/vendas/acessorios/selecionar-acessorio-dialog"
import { CadastrarModeloAparelhoDialog } from "./cadastrar-modelo-aparelho-dialog"

const res = (modelKey: string, canonicalName: string, matchType = "prefix") => ({
  modelKey,
  canonicalName,
  brand: "Apple",
  shortName: canonicalName.replace("Apple iPhone ", ""),
  commercialLine: "iPhone",
  aliases: [],
  confidence: "alta",
  status: "ativo",
  matchType,
  matchedText: canonicalName,
  ambiguous: false,
  requiresBrandContext: false,
  reviewFlags: [],
  source: "global",
})
const PAGINA_1 = ["6", "6 Plus", "6s"].map((n) => res(`apple_iphone_${n.replace(/ /g, "_").toLowerCase()}`, `Apple iPhone ${n}`))
const PAGINA_2 = ["7", "7 Plus"].map((n) => res(`apple_iphone_${n.replace(/ /g, "_").toLowerCase()}`, `Apple iPhone ${n}`))

let fetchMock: ReturnType<typeof vi.fn>
const urls = () => fetchMock.mock.calls.map((c) => new URL(String(c[0]), "http://local"))

function respostaBusca(url: URL) {
  const q = url.searchParams.get("q") ?? ""
  const offset = Number(url.searchParams.get("offset") ?? "0")
  if (url.pathname !== "/api/catalogo/aparelhos/search") return { results: [] }
  if (q === "iPhone") {
    return offset === 0
      ? { query: q, results: PAGINA_1, total: 5, hasMore: true, nextOffset: 3 }
      : { query: q, results: PAGINA_2, total: 5, hasMore: false, nextOffset: null }
  }
  if (q === "iPhone 7") {
    return { query: q, results: [res("apple_iphone_7", "Apple iPhone 7", "exact"), PAGINA_2[1]], total: 2, hasMore: false, nextOffset: null }
  }
  return { query: q, results: [], total: 0, hasMore: false, nextOffset: null }
}

beforeEach(() => {
  fetchMock = vi.fn(async (input: unknown) => {
    const url = new URL(String(input), "http://local")
    return new Response(JSON.stringify(respostaBusca(url)), { status: 200, headers: { "content-type": "application/json" } })
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const nomes = (container: HTMLElement) =>
  within(container)
    .queryAllByRole("option")
    .map((o) => o.textContent ?? "")

describe("Compat — ModeloPicker paginado", () => {
  it('"Mostrar mais" busca o offset seguinte, acrescenta sem repetir e some no fim', async () => {
    const onSelect = vi.fn()
    render(React.createElement(ModeloPicker, { lojaHeader: "loja-a", label: "Modelo", onSelect }))
    fireEvent.change(screen.getByRole("combobox", { name: "Modelo" }), { target: { value: "iPhone" } })

    const lista = await screen.findByRole("listbox")
    await waitFor(() => expect(nomes(lista)).toHaveLength(3))
    expect(screen.getByText("3 de 5 modelos")).not.toBeNull()
    expect(urls()[0].searchParams.get("offset")).toBe("0")

    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais" }))
    await waitFor(() => expect(nomes(lista)).toHaveLength(5))
    expect(urls().at(-1)!.searchParams.get("offset")).toBe("3")
    expect(nomes(lista).some((n) => n.includes("Apple iPhone 7"))).toBe(true)
    expect(screen.queryByRole("button", { name: "Mostrar mais" })).toBeNull()
    // cabeçalho da loja ativa em todas as páginas (isolamento multiloja)
    for (const c of fetchMock.mock.calls) expect((c[1] as RequestInit).headers).toMatchObject({ "x-assistec-loja-id": "loja-a" })

    fireEvent.click(within(lista).getByRole("option", { name: /^Apple iPhone 7Apple/ }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ modelKey: "apple_iphone_7" }))
  })

  it('revisão R2 (P3): falha no "Mostrar mais" seguida de nova tentativa bem-sucedida limpa o aviso', async () => {
    render(React.createElement(ModeloPicker, { lojaHeader: "loja-a", label: "Modelo", onSelect: vi.fn() }))
    fireEvent.change(screen.getByRole("combobox", { name: "Modelo" }), { target: { value: "iPhone" } })
    const lista = await screen.findByRole("listbox")
    await waitFor(() => expect(nomes(lista)).toHaveLength(3))
    const ok = fetchMock.getMockImplementation()!
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 500 }))
    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais" }))
    expect(await screen.findByText("Falha ao buscar modelos.")).not.toBeNull()
    fetchMock.mockImplementation(ok)
    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais" }))
    await waitFor(() => expect(nomes(lista)).toHaveLength(5))
    expect(screen.queryByText("Falha ao buscar modelos.")).toBeNull()
  })

  it("busca nova volta para a primeira página (não mistura com a anterior)", async () => {
    render(React.createElement(ModeloPicker, { lojaHeader: "loja-a", label: "Modelo", onSelect: vi.fn() }))
    const input = screen.getByRole("combobox", { name: "Modelo" })
    fireEvent.change(input, { target: { value: "iPhone" } })
    const lista = await screen.findByRole("listbox")
    await waitFor(() => expect(nomes(lista)).toHaveLength(3))
    fireEvent.change(input, { target: { value: "iPhone 7" } })
    await waitFor(() => expect(nomes(lista).map((n) => n.split("Apple ·")[0])).toEqual(["Apple iPhone 7", "Apple iPhone 7 Plus"].map((n) => expect.stringContaining(n))))
    expect(urls().at(-1)!.searchParams.get("offset")).toBe("0")
  })
})

describe("PDV — Configurar acessório", () => {
  it("seleciona o iPhone 7 (2ª página) e a cor; a linha vai ao carrinho sem chamar estoque", async () => {
    const onConfirm = vi.fn((_line: unknown) => true)
    render(
      React.createElement(SelecionarAcessorioDialog, {
        open: true,
        product: {
          id: "prod-capinha",
          name: "Capinha Silicone",
          accessoryConfig: { version: 1, tipo: "capinha", exigeModelo: true, exigeCor: true, usaCoresPadrao: true },
        },
        onCancel: vi.fn(),
        onConfirm,
      }),
    )
    fireEvent.change(await screen.findByPlaceholderText("Ex.: A06, Samsung A06, iPhone 13"), { target: { value: "iPhone" } })
    await screen.findByText("Apple iPhone 6s")
    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais" }))
    fireEvent.click(await screen.findByRole("button", { name: /^Apple iPhone 7Apple · iPhone$/ }))

    const cores = await screen.findByRole("group", { name: "Cor do acessório" })
    fireEvent.click(within(cores).getAllByRole("button")[0])
    fireEvent.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const linha = onConfirm.mock.calls[0][0] as Record<string, unknown>
    expect(JSON.stringify(linha)).toContain("apple_iphone_7")
    expect(JSON.stringify(linha)).not.toContain("apple_iphone_7_plus")
    // só a busca de modelos foi à rede: nada de estoque/venda
    for (const u of urls()) expect(u.pathname).toBe("/api/catalogo/aparelhos/search")
  })
})

describe("Cadastrar novo modelo — nome de um caractere e reaproveitamento", () => {
  const abrir = (onCreated = vi.fn()) => {
    render(React.createElement(CadastrarModeloAparelhoDialog, { open: true, onOpenChange: vi.fn(), lojaHeader: "loja-a", onCreated }))
    return onCreated
  }

  it('"iPhone" + "7" habilita o cadastro e envia nome "7"', async () => {
    h.criar.mockResolvedValue({
      ok: true,
      modelo: { modelKey: "manual_x", brand: "iPhone", name: "7", manufacturer: "Apple", line: "", aliases: [], notes: "", active: true, version: 1, lancamento: "lancado", id: "1", storeId: "loja-a" },
    })
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ results: [], total: 0, hasMore: false, nextOffset: null })))
    const onCreated = abrir()
    fireEvent.change(screen.getByLabelText("Fabricante"), { target: { value: "Apple" } })
    fireEvent.change(screen.getByLabelText("Marca comercial"), { target: { value: "iPhone" } })
    fireEvent.change(screen.getByLabelText("Nome comercial do modelo"), { target: { value: "7" } })
    expect(screen.getByText("iPhone 7")).not.toBeNull() // nome padronizado
    const salvar = screen.getByRole("button", { name: "Cadastrar modelo" })
    expect(salvar.hasAttribute("disabled")).toBe(false)
    fireEvent.click(salvar)
    await waitFor(() => expect(h.criar).toHaveBeenCalledWith("loja-a", expect.objectContaining({ brand: "iPhone", name: "7", manufacturer: "Apple" })))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it("sem nome o cadastro segue desabilitado", () => {
    abrir()
    fireEvent.change(screen.getByLabelText("Marca comercial"), { target: { value: "iPhone" } })
    expect(screen.getByRole("button", { name: "Cadastrar modelo" }).hasAttribute("disabled")).toBe(true)
    fireEvent.change(screen.getByLabelText("Nome comercial do modelo"), { target: { value: "   " } })
    expect(screen.getByRole("button", { name: "Cadastrar modelo" }).hasAttribute("disabled")).toBe(true)
  })

  it('iPhone 7 já no catálogo: oferece "Usar modelo existente" e não grava', async () => {
    const onCreated = abrir()
    fireEvent.change(screen.getByLabelText("Marca comercial"), { target: { value: "iPhone" } })
    fireEvent.change(screen.getByLabelText("Nome comercial do modelo"), { target: { value: "7" } })
    const usar = await screen.findByRole("button", { name: /Usar modelo existente: Apple iPhone 7$/ }, { timeout: 3000 })
    // o 7 Plus é só "parecido": não vira atalho de reaproveitamento
    expect(screen.queryByRole("button", { name: /Usar modelo existente: Apple iPhone 7 Plus/ })).toBeNull()
    fireEvent.click(usar)
    expect(onCreated).toHaveBeenCalledWith({ modelKey: "apple_iphone_7", brand: "Apple", canonicalName: "Apple iPhone 7" }, null)
    expect(h.criar).not.toHaveBeenCalled()
  })

  it("revisão R1 (P2): trocar o nome some na hora com o atalho da consulta anterior", async () => {
    const onCreated = abrir()
    fireEvent.change(screen.getByLabelText("Marca comercial"), { target: { value: "iPhone" } })
    fireEvent.change(screen.getByLabelText("Nome comercial do modelo"), { target: { value: "7" } })
    await screen.findByRole("button", { name: /Usar modelo existente: Apple iPhone 7$/ }, { timeout: 3000 })
    // nova consulta nunca responde (pendente): o atalho antigo não pode continuar clicável
    fetchMock.mockImplementation(() => new Promise(() => {}))
    fireEvent.change(screen.getByLabelText("Nome comercial do modelo"), { target: { value: "7 Plus" } })
    expect(screen.queryByRole("button", { name: /Usar modelo existente/ })).toBeNull()
    expect(onCreated).not.toHaveBeenCalled()
  })
})

