// @vitest-environment jsdom
/**
 * OMNI-CADASTROS-ACESSORIOS-COMPATIBILIDADE-FINAL-001 — testes de UI reais:
 *  - CoresPanel: cadastrar nova cor com visual, editar nome + visual, pesquisar cores,
 *    bloquear duplicidade por caixa/acento/espaço/hífen, ativar/inativar.
 *  - ProdutoAcessoriosConfig: pesquisar cores, selecionar cores aplicáveis ao produto,
 *    remover seleção do produto sem apagar a cor da loja, abrir gerenciador de cores.
 *  - ProdutoCompatibilidadeAparelhos: definir modelo principal, consultar compatíveis
 *    explicitamente sem auto-associação e sem misturar capinha × película.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { ACESSORIO_CORES_PADRAO } from "@/lib/acessorios/cores"
import { COR_PADRAO_VISUAL, type CorEfetiva } from "@/lib/compat/cores-loja"
import { emptyProdutoAcessoriosForm, type ProdutoAcessoriosFormValue } from "@/lib/acessorios/form"
import { CoresPanel } from "./ajustes-panels"
import { ProdutoAcessoriosConfig } from "@/components/dashboard/estoque/produto-acessorios-config"
import { ProdutoCompatibilidadeAparelhos, emptyCompatibilidade, type CompatibilidadeValue } from "@/components/dashboard/estoque/produto-compatibilidade-aparelhos"

const padraoBase: CorEfetiva[] = ACESSORIO_CORES_PADRAO.map((c) => ({
  id: c.key,
  label: c.label,
  origem: "padrao",
  ativo: true,
  baseKey: c.key,
  version: 0,
  rowId: null,
  visual: COR_PADRAO_VISUAL[c.key],
}))

let coresState: CorEfetiva[] = []
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  coresState = [
    ...padraoBase,
    { id: "cor-marinho", label: "Azul-marinho", origem: "loja", ativo: true, baseKey: null, version: 1, rowId: "cor-marinho", visual: "#1E3A8A" },
  ]
  fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input), "http://local")
    const method = (init?.method ?? "GET").toUpperCase()
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

    if (url.pathname === "/api/catalogo/compat/cores") {
      if (method === "GET") {
        return new Response(JSON.stringify({ ok: true, cores: coresState, linhas: [] }), { status: 200 })
      }
      if (method === "POST") {
        const novo: CorEfetiva = {
          id: `cor-${coresState.length + 1}`,
          label: String(body.label ?? "").trim(),
          origem: "loja",
          ativo: true,
          baseKey: null,
          version: 1,
          rowId: `cor-${coresState.length + 1}`,
          visual: String(body.visual ?? "#64748B"),
        }
        coresState = [...coresState, novo]
        return new Response(JSON.stringify({ ok: true, id: novo.id, visual: novo.visual }), { status: 201 })
      }
      if (method === "PATCH") {
        if (typeof body.baseKey === "string") {
          coresState = coresState.map((c) =>
            c.id === body.baseKey
              ? {
                  ...c,
                  ...(typeof body.ativo === "boolean" ? { ativo: body.ativo } : {}),
                  ...(typeof body.visual === "string" ? { visual: body.visual } : {}),
                }
              : c,
          )
          return new Response(JSON.stringify({ ok: true, id: body.baseKey }), { status: 200 })
        }
        coresState = coresState.map((c) =>
          c.id === body.id
            ? {
                ...c,
                ...(typeof body.label === "string" ? { label: body.label } : {}),
                ...(typeof body.ativo === "boolean" ? { ativo: body.ativo } : {}),
                ...(typeof body.visual === "string" ? { visual: body.visual } : {}),
                version: c.version + 1,
              }
            : c,
        )
        return new Response(JSON.stringify({ ok: true, id: body.id }), { status: 200 })
      }
    }

    if (url.pathname === "/api/catalogo/compat/organizacao") {
      return new Response(JSON.stringify({ ok: true, paineis: [], preferencias: { posicoesHabilitadas: false, modoModeloPadrao: "opcional", modoCorPadrao: "opcional", marcasConfig: {}, version: 1 } }), { status: 200 })
    }

    if (url.pathname === "/api/catalogo/compat/vinculos") {
      const cat = url.searchParams.get("categoria")
      return new Response(
        JSON.stringify({
          ok: true,
          modelo: { modelKey: "apple_iphone_7", canonicalName: "Apple iPhone 7", brand: "Apple", source: "global", active: true, hierarquia: { fabricante: "Apple", marca: "iPhone", linha: "" }, aliases: [] },
          vinculos:
            cat === "capinha"
              ? [{ modelKey: "apple_iphone_8", canonicalName: "Apple iPhone 8", brand: "Apple", source: "global", ativo: true, acao: "adicionar", status: "confirmado_loja", notes: "", origem: "teste", confirmedBy: "admin", confirmedAt: "2026-11-24T00:00:00Z" }]
              : [],
          globais:
            cat === "pelicula_tela"
              ? [{ modelKey: "apple_iphone_se_2020", canonicalName: "Apple iPhone SE 2020", brand: "Apple", groupName: "iPhone 4.7", status: "provavel_mercado" }]
              : [],
        }),
        { status: 200 },
      )
    }

    return new Response(JSON.stringify({ ok: true, results: [], models: [] }), { status: 200 })
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("CoresPanel — gerenciamento completo de cores", () => {
  it("cadastra nova cor com visual, bloqueia duplicata por grafia/hífen, edita nome+visual, pesquisa e inativa", async () => {
    const onChanged = vi.fn()
    render(React.createElement(CoresPanel, { lojaHeader: "loja-a", onChanged }))

    await screen.findByText("Azul-marinho")

    // Duplicidade por diferença de caixa/espaço/hífen bloqueada no cliente sem POST
    fireEvent.change(screen.getByLabelText("Nova cor da loja"), { target: { value: "  AZUL   marinho " } })
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar cor/ }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/Já existe a cor “Azul-marinho”/)
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "POST")).toBe(false)

    // Cadastra nova cor com visual escolhido
    fireEvent.change(screen.getByLabelText("Nova cor da loja"), { target: { value: "Verde musgo" } })
    fireEvent.change(screen.getByLabelText("Representação visual da nova cor"), { target: { value: "#3F6212" } })
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar cor/ }))
    await screen.findByText("Verde musgo")
    expect(onChanged).toHaveBeenCalled()

    // Pesquisa filtra sem acento/caixa
    fireEvent.change(screen.getByLabelText("Pesquisar cores"), { target: { value: "musgo" } })
    expect(screen.getByText("Verde musgo")).toBeTruthy()
    expect(screen.queryByText("Azul-marinho")).toBeNull()
    fireEvent.change(screen.getByLabelText("Pesquisar cores"), { target: { value: "" } })

    // Editar nome e representação visual
    fireEvent.click(screen.getByRole("button", { name: "Editar Verde musgo" }))
    fireEvent.change(screen.getByLabelText("Nome da cor"), { target: { value: "Verde oliva" } })
    fireEvent.change(screen.getByLabelText("Representação visual de Verde musgo"), { target: { value: "#4D7C0F" } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar cor" }))
    await screen.findByText("Verde oliva")
    expect(coresState.find((c) => c.label === "Verde oliva")?.visual).toBe("#4D7C0F")

    // Desativar cor própria (preserva registro, marca como inativa)
    const row = screen.getByText("Verde oliva").closest("li") as HTMLElement
    fireEvent.click(within(row).getByRole("button", { name: /Desativar/ }))
    await waitFor(() => expect(within(row).getByText("inativa")).toBeTruthy())
    expect(coresState.some((c) => c.label === "Verde oliva" && !c.ativo)).toBe(true)
  })
})

describe("ProdutoAcessoriosConfig — seleção e remoção de cor sem apagar a cor global", () => {
  it("seleciona e remove cor do produto mantendo a cor cadastrada na loja", async () => {
    const Wrapper = () => {
      const [val, setVal] = React.useState<ProdutoAcessoriosFormValue>({
        ...emptyProdutoAcessoriosForm(),
        enabled: true,
        tipo: "capinha",
        exigeModelo: true,
        exigeCor: true,
        modoModelo: "obrigatorio",
        modoCor: "obrigatorio",
        usaCoresPadrao: false,
        coresPermitidas: ["preto", "transparente"],
        coresLoja: ["cor-marinho"],
      })
      return React.createElement(ProdutoAcessoriosConfig, { lojaHeader: "loja-a", value: val, onChange: setVal })
    }
    render(React.createElement(Wrapper))

    const chips = await screen.findByLabelText("Cores selecionadas no produto")
    await waitFor(() => expect(within(chips).getByText("Azul-marinho")).toBeTruthy())
    expect(within(chips).getByText("Preto")).toBeTruthy()

    // Remove Azul-marinho APENAS deste produto
    fireEvent.click(within(chips).getByRole("button", { name: "Remover seleção de Azul-marinho" }))
    await waitFor(() => expect(within(chips).queryByText("Azul-marinho")).toBeNull())
    // A cor continua no catálogo da loja (nenhum DELETE/PATCH de inativação foi chamado)
    expect(coresState.find((c) => c.id === "cor-marinho")?.ativo).toBe(true)
    expect(fetchMock.mock.calls.some((c) => ["DELETE", "PATCH"].includes(String((c[1] as RequestInit | undefined)?.method)))).toBe(false)
  })
})

describe("ProdutoCompatibilidadeAparelhos — principal e compatíveis separados por tipo", () => {
  it("destaca o modelo principal e consulta compatíveis de capinha sem misturar película nem auto-vincular", async () => {
    const Wrapper = () => {
      const [val, setVal] = React.useState<CompatibilidadeValue>({
        ...emptyCompatibilidade(),
        models: [{ modelKey: "apple_iphone_7", canonicalName: "Apple iPhone 7", brand: "Apple" }],
        types: ["capinha"],
        status: "precisa_testar",
      })
      return React.createElement(ProdutoCompatibilidadeAparelhos, { value: val, onChange: setVal, lojaHeader: "loja-a" })
    }
    render(React.createElement(Wrapper))

    expect(screen.getByText("principal")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Ver compatíveis de capinha do principal" }))
    // Mostra Apple iPhone 8 (capinha), mas NÃO mostra iPhone SE 2020 (película) e NÃO vincula automaticamente
    await screen.findByText("Apple iPhone 8")
    expect(screen.queryByText("Apple iPhone SE 2020")).toBeNull()
    const vinculados = screen.getByLabelText("Modelos vinculados")
    expect(within(vinculados).queryByText("Apple iPhone 8")).toBeNull()

    // Operador clica explicitamente para vincular
    fireEvent.click(screen.getByRole("button", { name: "+ Vincular" }))
    expect(within(vinculados).getByText("Apple iPhone 8")).toBeTruthy()
  })
})
