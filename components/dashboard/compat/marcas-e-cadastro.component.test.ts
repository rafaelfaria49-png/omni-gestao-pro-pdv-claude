// @vitest-environment jsdom
/**
 * COMPAT-CATALOGO-BRASIL-2023-2026-002 — componentes montados.
 *  - Marcas do catálogo: gravação que responde DEPOIS da troca de loja não toca a loja nova.
 *  - Cadastro de modelo: "aguardando lançamento" só existe na gestão; no fluxo operacional (PDV,
 *    produto) o modelo criado é selecionado na hora, então é sempre gravado como lançado.
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const h = vi.hoisted(() => ({
  carregar: vi.fn(),
  salvar: vi.fn(),
  criar: vi.fn(),
}))
vi.mock("@/lib/compat/compat-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/compat/compat-client")>()),
  carregarMarcas: (...a: unknown[]) => h.carregar(...a),
  salvarMarcas: (...a: unknown[]) => h.salvar(...a),
}))
vi.mock("@/lib/catalogo-aparelhos/loja-catalogo-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/catalogo-aparelhos/loja-catalogo-client")>()),
  criarModeloLoja: (...a: unknown[]) => h.criar(...a),
}))
vi.mock("@/components/dashboard/catalogo/hierarquia-fields", () => ({
  // Campos de hierarquia reais dependem de rede; aqui só marca + nome.
  HierarquiaFields: ({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) =>
    React.createElement(
      "div",
      null,
      React.createElement("input", { "aria-label": "Marca", value: value.brand, onChange: (e: { target: { value: string } }) => onChange({ ...value, brand: e.target.value }) }),
      React.createElement("input", { "aria-label": "Nome", value: value.name, onChange: (e: { target: { value: string } }) => onChange({ ...value, name: e.target.value }) }),
    ),
}))

import { MarcasCatalogo } from "./ajustes-panels"
import { CadastrarModeloAparelhoDialog } from "@/components/dashboard/catalogo/cadastrar-modelo-aparelho-dialog"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const marca = (key: string, visivel: boolean) => ({
  key, nome: key, nivel: "secundaria" as const, padraoVisivel: false, modelos: 3, visivel,
})

function adiada<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe("Marcas do catálogo — troca de loja no meio da gravação", () => {
  it("resposta atrasada da loja A não altera marcas nem versão da loja B", async () => {
    h.carregar.mockImplementation(async (loja: string) =>
      loja === "A" ? { ok: true, version: 1, marcas: [marca("GOOGLE", false)] } : { ok: true, version: 8, marcas: [marca("SONY", false)] },
    )
    const gravacaoA = adiada<unknown>()
    h.salvar.mockReturnValue(gravacaoA.promise)
    const onSaved = vi.fn()
    const { rerender } = render(React.createElement(MarcasCatalogo, { lojaHeader: "A", version: 1, onSaved }))
    fireEvent.click(await screen.findByRole("switch", { name: "Mostrar GOOGLE nas buscas" }))
    expect(h.salvar).toHaveBeenCalledWith("A", 1, { GOOGLE: true })

    rerender(React.createElement(MarcasCatalogo, { lojaHeader: "B", version: 8, onSaved }))
    expect(await screen.findByRole("switch", { name: "Mostrar SONY nas buscas" })).not.toBeNull()

    await act(async () => gravacaoA.resolve({ ok: true, version: 2, marcas: [marca("GOOGLE", true)] }))
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.queryByRole("switch", { name: "Mostrar GOOGLE nas buscas" })).toBeNull()
    const sony = screen.getByRole("switch", { name: "Mostrar SONY nas buscas" })
    expect(sony.getAttribute("aria-checked")).toBe("false")
    expect(sony.hasAttribute("disabled")).toBe(false)
  })

  it("A→B→A: gravação da primeira passagem por A não sobrescreve a carga nova de A", async () => {
    let cargaA = 0
    h.carregar.mockImplementation(async (loja: string) => {
      if (loja === "B") return { ok: true, version: 8, marcas: [marca("SONY", false)] }
      cargaA++
      return cargaA === 1
        ? { ok: true, version: 1, marcas: [marca("GOOGLE", false)] }
        : { ok: true, version: 3, marcas: [marca("GOOGLE", false)] }
    })
    const gravacaoAntiga = adiada<unknown>()
    h.salvar.mockReturnValue(gravacaoAntiga.promise)
    const onSaved = vi.fn()
    const { rerender } = render(React.createElement(MarcasCatalogo, { lojaHeader: "A", version: 1, onSaved }))
    fireEvent.click(await screen.findByRole("switch", { name: "Mostrar GOOGLE nas buscas" }))
    rerender(React.createElement(MarcasCatalogo, { lojaHeader: "B", version: 8, onSaved }))
    await screen.findByRole("switch", { name: "Mostrar SONY nas buscas" })
    rerender(React.createElement(MarcasCatalogo, { lojaHeader: "A", version: 3, onSaved }))
    await waitFor(() => expect(cargaA).toBe(2))
    const google = await screen.findByRole("switch", { name: "Mostrar GOOGLE nas buscas" })
    await act(async () => gravacaoAntiga.resolve({ ok: true, version: 2, marcas: [marca("GOOGLE", true)] }))
    expect(onSaved).not.toHaveBeenCalled()
    expect(google.getAttribute("aria-checked")).toBe("false")
  })

  it("gravação na mesma loja atualiza a versão compartilhada", async () => {
    h.carregar.mockResolvedValue({ ok: true, version: 1, marcas: [marca("GOOGLE", false)] })
    h.salvar.mockResolvedValue({ ok: true, version: 2, marcas: [marca("GOOGLE", true)] })
    const onSaved = vi.fn()
    render(React.createElement(MarcasCatalogo, { lojaHeader: "A", version: 1, onSaved }))
    fireEvent.click(await screen.findByRole("switch", { name: "Mostrar GOOGLE nas buscas" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(2))
  })
})

describe("Cadastrar novo modelo — aguardando lançamento", () => {
  const criado = { ok: true, modelo: { modelKey: "manual_x", brand: "Samsung", name: "S27 Sint", line: "", manufacturer: "", aliases: [], notes: "", active: true, lancamento: "lancado" } }

  it("fluxo operacional (PDV/produto): opção ausente e o modelo é gravado como lançado", async () => {
    h.criar.mockResolvedValue(criado)
    const onCreated = vi.fn()
    render(React.createElement(CadastrarModeloAparelhoDialog, { open: true, onOpenChange: () => {}, lojaHeader: "A", onCreated }))
    expect(screen.queryByText("Aguardando lançamento oficial")).toBeNull()
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Samsung" } })
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "S27 Sint" } })
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar modelo" }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(h.criar.mock.calls[0][1]).toMatchObject({ lancamento: "lancado" })
  })

  it("gestão de modelos: opção presente e enviada quando marcada", async () => {
    h.criar.mockResolvedValue({ ...criado, modelo: { ...criado.modelo, lancamento: "aguardando_lancamento" } })
    render(React.createElement(CadastrarModeloAparelhoDialog, { open: true, onOpenChange: () => {}, lojaHeader: "A", permitirAguardando: true, onCreated: () => {} }))
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Samsung" } })
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "S27 Sint" } })
    fireEvent.click(screen.getByText("Aguardando lançamento oficial"))
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar modelo" }))
    await waitFor(() => expect(h.criar).toHaveBeenCalled())
    expect(h.criar.mock.calls[0][1]).toMatchObject({ lancamento: "aguardando_lancamento" })
  })

  it("duplicado ainda aguardando lançamento não pode ser usado direto", async () => {
    h.criar.mockResolvedValue({
      ok: false, code: "DUPLICATE", status: 409, error: "Este modelo já está cadastrado nesta loja, aguardando lançamento.",
      existing: { modelKey: "manual_x", brand: "Samsung", canonicalName: "Samsung S27 Sint", source: "loja", active: false },
    })
    render(React.createElement(CadastrarModeloAparelhoDialog, { open: true, onOpenChange: () => {}, lojaHeader: "A", onCreated: () => {} }))
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Samsung" } })
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "S27 Sint" } })
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar modelo" }))
    expect(await screen.findByRole("alert")).not.toBeNull()
    expect(screen.queryByRole("button", { name: /Usar/ })).toBeNull()
  })
})
