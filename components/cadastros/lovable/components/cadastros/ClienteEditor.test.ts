// @vitest-environment jsdom
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ClientTextSuggestion } from "@/lib/cadastros/natural-text/cliente-types"

type Interpretation = { ok: true; sugestao: ClientTextSuggestion } | { ok: false; message: string }
const h = vi.hoisted(() => ({
  interpret: vi.fn<(store: string, text: string, source: string) => Promise<Interpretation>>(),
  save: vi.fn<(...args: unknown[]) => Promise<{ ok: true; id: string } | { ok: false; message: string }>>(),
}))
vi.mock("@/app/actions/cliente-texto-livre", () => ({ interpretarClienteTextoLivre: h.interpret, salvarClienteRevisado: h.save }))
import { interpretarTextoCliente } from "@/lib/cadastros/natural-text/cliente"
import { ClienteEditor, ClienteEditorDialog } from "./ClienteEditor"

const props = () => ({ storeId: "loja-a", editing: null, onClose: vi.fn(), onSaved: vi.fn() })
const edit = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name, exact: true }))
async function suggest(text = "Novo cliente Lia de Teste, telefone 14999998888, mora em Itaí") {
  edit("Descreva o novo cliente", text)
  click("Interpretar texto")
  await screen.findByLabelText("Sugestão: Nome")
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("React", React)
  h.interpret.mockImplementation(async (_, text) => ({ ok: true, sugestao: interpretarTextoCliente(text) }))
  h.save.mockResolvedValue({ ok: true, id: "synthetic" })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("HUB real client editor: human review and temporary capture", () => {
  it("reviews/corrects, applies, then saves only after explicit confirmation", async () => {
    const p = props(); render(React.createElement(ClienteEditor, p))
    await suggest()
    expect(h.save).not.toHaveBeenCalled()
    expect((screen.getByLabelText("Nome *") as HTMLInputElement).value).toBe("")
    edit("Sugestão: Nome", "Lia Corrigida de Teste")
    click("Aplicar aos campos vazios")
    expect((screen.getByLabelText("Nome *") as HTMLInputElement).value).toBe("Lia Corrigida de Teste")
    expect((screen.getByLabelText("Telefone / WhatsApp") as HTMLInputElement).value).toBe("(14) 99999-8888")
    expect(screen.getByRole("button", { name: "Salvar cliente" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("checkbox"))
    edit("Cidade", "Cidade de Teste")
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole("checkbox"))
    click("Salvar cliente")
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce())
    expect(h.save).toHaveBeenCalledWith("loja-a", null, expect.objectContaining({ nome: "Lia Corrigida de Teste", cidade: "Cidade de Teste", documento: "" }), true)
    expect(JSON.stringify(h.save.mock.calls)).not.toContain("Novo cliente")
    await waitFor(() => expect(p.onSaved).toHaveBeenCalledOnce())
  })
  it("preserves manual data and does not apply ambiguous documents", async () => {
    render(React.createElement(ClienteEditor, props()))
    edit("Nome *", "Operador de Teste")
    await suggest("Nome Lia de Teste, CPF 11111111111")
    click("Aplicar aos campos vazios")
    expect((screen.getByLabelText("Nome *") as HTMLInputElement).value).toBe("Operador de Teste")
    expect((screen.getByLabelText("CPF / CNPJ") as HTMLInputElement).value).toBe("")
    expect(h.save).not.toHaveBeenCalled()
  })
  it("cancels and discards without writing, including a response arriving after discard", async () => {
    let resolve!: (value: Interpretation) => void
    h.interpret.mockImplementation(() => new Promise((r) => { resolve = r }))
    const p = props(); render(React.createElement(ClienteEditor, p))
    edit("Descreva o novo cliente", "Lia de Teste"); click("Interpretar texto")
    click("Descartar sugestões")
    await act(async () => resolve({ ok: true, sugestao: interpretarTextoCliente("Lia de Teste") }))
    expect(screen.queryByLabelText("Sugestão: Nome")).toBeNull()
    click("Cancelar")
    expect(p.onClose).toHaveBeenCalledOnce(); expect(h.save).not.toHaveBeenCalled()
  })
  it("invalidates old requests on text change and accepts only the newest response", async () => {
    const pending: ((value: Interpretation) => void)[] = []
    h.interpret.mockImplementation(() => new Promise((r) => pending.push(r)))
    render(React.createElement(ClienteEditor, props()))
    edit("Descreva o novo cliente", "Primeira de Teste"); click("Interpretar texto")
    edit("Descreva o novo cliente", "Segunda de Teste"); click("Interpretar texto")
    await act(async () => pending[1]({ ok: true, sugestao: interpretarTextoCliente("Segunda de Teste") }))
    await act(async () => pending[0]({ ok: true, sugestao: interpretarTextoCliente("Primeira de Teste") }))
    expect((screen.getByLabelText("Sugestão: Nome") as HTMLInputElement).value).toBe("Segunda de Teste")
  })
  it("clears capture and ignores late results when the HUB switches stores", async () => {
    let resolve!: (value: Interpretation) => void
    h.interpret.mockImplementation(() => new Promise((r) => { resolve = r }))
    const p = props(); const view = render(React.createElement(ClienteEditor, { ...p, key: "loja-a" }))
    edit("Descreva o novo cliente", "Lia de Teste"); click("Interpretar texto")
    view.rerender(React.createElement(ClienteEditor, { ...p, key: "loja-b", storeId: "loja-b" }))
    await act(async () => resolve({ ok: true, sugestao: interpretarTextoCliente("Lia de Teste") }))
    expect((screen.getByLabelText("Descreva o novo cliente") as HTMLTextAreaElement).value).toBe("")
    expect(screen.queryByLabelText("Sugestão: Nome")).toBeNull()
    expect(h.save).not.toHaveBeenCalled()
  })
  it("blocks invalid human corrections and displays duplicate refusal without automatically merging", async () => {
    render(React.createElement(ClienteEditor, props()))
    edit("Nome *", "Lia de Teste"); edit("CPF / CNPJ", "11111111111")
    fireEvent.click(screen.getByRole("checkbox")); click("Salvar cliente")
    expect(h.save).not.toHaveBeenCalled()
    expect(screen.getByText(/CPF\/CNPJ inválido/)).toBeTruthy()
    edit("CPF / CNPJ", "52998224725")
    h.save.mockResolvedValueOnce({ ok: false, message: "Conflito de identidade nesta loja. Operação bloqueada." })
    fireEvent.click(screen.getByRole("checkbox")); click("Salvar cliente")
    await screen.findByText("Conflito de identidade nesta loja. Operação bloqueada.")
    expect(h.save).toHaveBeenCalledOnce()
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  })
  it("keeps microphone gated even with an available/blocked speech engine; requests no permission", () => {
    const speech = vi.fn(), microphone = vi.fn()
    vi.stubGlobal("SpeechRecognition", speech)
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: microphone } })
    render(React.createElement(ClienteEditor, props()))
    click("Voz indisponível")
    expect(screen.getByRole("button", { name: "Voz indisponível" }).hasAttribute("disabled")).toBe(true)
    expect(speech).not.toHaveBeenCalled(); expect(microphone).not.toHaveBeenCalled()
    expect(screen.getByText(/pode enviar áudio a serviços externos/)).toBeTruthy()
  })
  it("uses an accessible dialog and clears fields after close/reopen", async () => {
    const p = props(); const view = render(React.createElement(ClienteEditorDialog, { ...p, open: true }))
    expect(screen.getByRole("dialog", { name: "Novo cliente" })).toBeTruthy()
    await suggest()
    view.rerender(React.createElement(ClienteEditorDialog, { ...p, open: false }))
    view.rerender(React.createElement(ClienteEditorDialog, { ...p, open: true }))
    expect(screen.queryByLabelText("Sugestão: Nome")).toBeNull()
    expect((screen.getByLabelText("Descreva o novo cliente") as HTMLTextAreaElement).value).toBe("")
  })
})
