// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { TargetDTO } from "./contracts"
const h = vi.hoisted(() => ({ list: vi.fn(), issue: vi.fn(), recover: vi.fn(), identifiers: vi.fn(), jobs: vi.fn(), job: vi.fn() }))
vi.mock("@/app/actions/identificacao-etiquetas", () => ({
  listIdentificacaoTargets: h.list, listLotesEtiquetas: h.jobs, emitirCodigoInterno: h.issue,
  listIdentificadores: h.identifiers, consultarSolicitacaoIdentificacao: h.recover,
  lookupIdentificacao: vi.fn(), registrarIdentificador: vi.fn(), alterarIdentificadorAtivo: vi.fn(), criarLoteEtiquetas: vi.fn(),
  reimprimirLoteEtiquetas: vi.fn(), iniciarImpressaoEtiquetas: vi.fn(), registrarEventoImpressao: vi.fn(), getLoteEtiquetas: h.job,
}))
import { IdentificacaoEtiquetasPanel } from "@/components/vestuario/IdentificacaoEtiquetasPanel"
const target: TargetDTO = { produtoId: "p", varianteId: null, nome: "Camiseta QA", sku: "SIM-QA", cor: null, tamanho: null,
  updatedAt: "2026-11-16T00:00:00.000Z", variantVersion: null, precoCentavos: 2000, codigoInterno: null, codigoInternoAtivo: false, codigoExistente: null }
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  h.list.mockResolvedValue({ ok: true, value: { items: [target], limited: false } })
  h.issue.mockResolvedValue({ ok: true, value: { id: "identifier", kind: "identifier" } })
  h.recover.mockResolvedValue({ ok: true, value: { id: "identifier", kind: "identifier" } })
  h.identifiers.mockResolvedValue({ ok: true, value: [] })
  h.jobs.mockResolvedValue({ ok: true, value: [] })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe("HUB etiquetas: estado real, resposta perdida e seleção por loja", () => {
  it("não habilita quantidade/lote antes de emitir código; campos têm labels", async () => {
    render(React.createElement(IdentificacaoEtiquetasPanel, { storeId: "a" }))
    const quantity = await screen.findByRole("spinbutton", { name: "Quantidade SIM-QA" })
    expect((quantity as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Salvar lote para conferência" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("textbox", { name: "Ler código" })).toBeTruthy()
  })
  it("resposta perdida preserva mesma chave e permite recuperar sem emitir novamente", async () => {
    h.issue.mockRejectedValue(new Error("network lost"))
    render(React.createElement(IdentificacaoEtiquetasPanel, { storeId: "a" }))
    fireEvent.click(await screen.findByRole("button", { name: "Códigos" }))
    fireEvent.click(await screen.findByRole("button", { name: "Emitir código interno" }))
    await screen.findByText(/Resposta perdida/)
    const stored = JSON.parse(sessionStorage.getItem("omni.identificacao.pending.v1:a")!)
    expect(stored.requestKey).toBe(h.issue.mock.calls[0][1].requestKey)
    fireEvent.click(screen.getByRole("button", { name: "Consultar resultado" }))
    await screen.findByText(/Resultado recuperado/)
    expect(h.issue).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem("omni.identificacao.pending.v1:a")).toBeNull()
  })
  it("repetição após resultado incerto usa payload/chave idênticos", async () => {
    h.issue.mockResolvedValueOnce({ ok: false, code: "UNKNOWN_RESULT", message: "Resultado incerto" })
    render(React.createElement(IdentificacaoEtiquetasPanel, { storeId: "a" }))
    fireEvent.click(await screen.findByRole("button", { name: "Códigos" }))
    fireEvent.click(await screen.findByRole("button", { name: "Emitir código interno" }))
    await screen.findByText("Resultado incerto")
    fireEvent.click(screen.getByRole("button", { name: "Repetir mesma solicitação" }))
    await waitFor(() => expect(h.issue).toHaveBeenCalledTimes(2))
    expect(h.issue.mock.calls[0]).toEqual(h.issue.mock.calls[1])
  })
  it("desmontagem por loja descarta resposta atrasada da unidade anterior", async () => {
    let resolve!: (v: unknown) => void
    h.list.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const r = render(React.createElement(IdentificacaoEtiquetasPanel, { key: "a", storeId: "a" }))
    r.rerender(React.createElement(IdentificacaoEtiquetasPanel, { key: "b", storeId: "b" }))
    await screen.findByText("Camiseta QA")
    resolve({ ok: true, value: { items: [{ ...target, nome: "NÃO EXIBIR A" }], limited: false } })
    await waitFor(() => expect(screen.queryByText("NÃO EXIBIR A")).toBeNull())
    expect(h.list).toHaveBeenCalledWith("b", "")
  })
  it("troca rápida de lote e PDF atrasado não misturam prévia e lote de impressão", async () => {
    const a = { id: "job-a", total: 2, originalId: null, motivo: "", createdAt: "2026-11-16T00:00:00.000Z" }
    const b = { ...a, id: "job-b", total: 3 }
    h.jobs.mockResolvedValue({ ok: true, value: [a, b] })
    let resolveA!: (v: unknown) => void, resolveB!: (v: unknown) => void, resolvePdf!: (v: unknown) => void
    h.job.mockImplementation((_store, id) => new Promise(resolve => { if (id === "job-a") resolveA = resolve; else resolveB = resolve }))
    const fetch = vi.fn(() => new Promise(resolve => { resolvePdf = resolve }))
    vi.stubGlobal("fetch", fetch)
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:pdf-b") })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
    render(React.createElement(IdentificacaoEtiquetasPanel, { storeId: "a" }))
    const buttonA = await screen.findByRole("button", { name: /2 etiquetas · Lote original/ })
    const buttonB = screen.getByRole("button", { name: /3 etiquetas · Lote original/ })
    act(() => { buttonA.dispatchEvent(new MouseEvent("click", { bubbles: true })); buttonB.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
    expect(h.job).toHaveBeenCalledTimes(2)
    await act(async () => { resolveB({ ok: true, value: { ...b, snapshot: {}, tentativas: [] } }) })
    fireEvent.click(screen.getByRole("button", { name: "Gerar prévia / PDF" }))
    await act(async () => { resolveA({ ok: true, value: { ...a, snapshot: {}, tentativas: [] } }) })
    await act(async () => { resolvePdf({ ok: true, arrayBuffer: async () => Uint8Array.from([37, 80, 68, 70, 45, 66]).buffer }) })
    const download = await screen.findByRole("link", { name: "Baixar PDF" })
    expect(download.getAttribute("download")).toBe("etiquetas-job-b.pdf")
    expect(screen.getByTitle("Prévia das etiquetas").getAttribute("src")).toBe("/api/identificacao/etiquetas/job-b?storeId=a&format=html")
    expect(fetch).toHaveBeenCalledWith("/api/identificacao/etiquetas/job-b?storeId=a", { cache: "no-store" })
    expect((screen.getByRole("button", { name: "Solicitar impressão" }) as HTMLButtonElement).disabled).toBe(false)
  })
  it("HTTP 200 com PDF vazio não marca sucesso nem habilita impressão", async () => {
    const job = { id: "job-empty", total: 1, originalId: null, motivo: "", createdAt: "2026-11-16T00:00:00.000Z" }
    h.jobs.mockResolvedValue({ ok: true, value: [job] })
    h.job.mockResolvedValue({ ok: true, value: { ...job, snapshot: {}, tentativas: [] } })
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })))
    render(React.createElement(IdentificacaoEtiquetasPanel, { storeId: "a" }))
    fireEvent.click(await screen.findByRole("button", { name: /1 etiquetas · Lote original/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Gerar prévia / PDF" }))
    await screen.findByText(/Resposta de PDF vazia ou inválida/)
    expect(screen.queryByRole("link", { name: "Baixar PDF" })).toBeNull()
    expect((screen.getByRole("button", { name: "Solicitar impressão" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
