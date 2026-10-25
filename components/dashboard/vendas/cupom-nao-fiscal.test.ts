// @vitest-environment jsdom
import { createElement } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultPdvImpressaoConfig } from "@/lib/pdv-impressao-config"
import type { PdvReceiptInput } from "@/lib/escpos"
import { CupomNaoFiscal, type CupomData } from "./cupom-nao-fiscal"
import { PdvPostSaleDialog } from "./pdv-post-sale-dialog"
import { PdvAutoPrintFeedback } from "./pdv-auto-print-feedback"

const toast = vi.hoisted(() => vi.fn())
let settings = defaultPdvImpressaoConfig()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/lib/store-settings-provider", () => ({ useStoreSettings: () => ({ impressaoConfig: settings }) }))

const notice = "NÃO É DOCUMENTO FISCAL"
const explanation = "NÃO SUBSTITUI NFC-e OU NF-e"
const cupom: CupomData = {
  numeroPedido: "VDA-2026-0001",
  at: "2026-10-24T12:00:00Z",
  lojaNome: "Padaria São João & Filhos",
  lojaCnpj: "12.345.678/0001-90",
  lojaEndereco: "Rua das Flores, 10",
  clienteNome: "Maria <b>Silva</b>",
  operador: "Caixa 01",
  itens: [{ nome: "Pão <img src=x>", quantidade: 2, precoUnitario: 8, lineTotal: 16 }],
  pagamentos: [{ label: "Dinheiro", valor: 5 }, { label: "PIX", valor: 10 }],
  subtotal: 16,
  desconto: 1,
  total: 15,
  cashTendered: 10,
  troco: 5,
  status: "concluida",
}
const receipt: PdvReceiptInput = {
  nomeFantasia: cupom.lojaNome,
  cnpj: cupom.lojaCnpj!,
  numeroVenda: cupom.numeroPedido,
  itens: [{ name: "Pão", quantity: 2, unitPrice: 8, lineTotal: 16 }],
  pagamentos: cupom.pagamentos,
  subtotal: 16,
  taxes: 0,
  discount: 1,
  total: 15,
  dataHora: cupom.at,
}

function result(ok = true) {
  return { ok, status: ok ? 200 : 403, json: async () => ok ? { ok: true } : { error: "Forbidden" } }
}

function proxyMock(ok = true) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => result(ok))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function assertNotice(text: string) {
  expect(text.split(notice)).toHaveLength(2)
  expect(text.split(explanation)).toHaveLength(2)
  expect(text).not.toContain("DOCUMENTO NÃO FISCAL")
  expect(text).not.toMatch(/estorno (bancário|fiscal)|autorizad[ao] pela SEFAZ/i)
}

function receiptFromRequest(init?: RequestInit) {
  return new TextDecoder("windows-1252").decode(Buffer.from(JSON.parse(String(init?.body)).data, "base64"))
}

function browserMock() {
  const write = vi.fn<(html: string) => void>()
  const open = vi.spyOn(window, "open").mockReturnValue({ document: { open: vi.fn(), write, close: vi.fn() } } as unknown as Window)
  return { open, document: () => new DOMParser().parseFromString(write.mock.calls[0]?.[0] ?? "", "text/html") }
}

beforeEach(() => {
  settings = { ...defaultPdvImpressaoConfig(), bobinaTamanho: "58mm" }
  toast.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("G2 — Histórico / segunda via com geradores reais", () => {
  it.each(["concluida", "cancelada"])("prévia e cópia da venda %s preservam aviso, estado e dados", async (status) => {
    const fetchMock = proxyMock()
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: window.navigator.userAgent })
    render(createElement(CupomNaoFiscal, { isOpen: true, onClose: vi.fn(), data: { ...cupom, status } }))

    expect(screen.getAllByText(notice)).toHaveLength(1)
    expect(screen.getAllByText(explanation)).toHaveLength(1)
    expect(screen.getByText(cupom.itens[0].nome)).toBeDefined()
    expect(screen.getByText(cupom.numeroPedido)).toBeDefined()
    expect(screen.queryByText("⚠ VENDA CANCELADA ⚠") !== null).toBe(status === "cancelada")
    fireEvent.click(screen.getByRole("button", { name: "Copiar resumo" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const text = writeText.mock.calls[0][0]
    assertNotice(text)
    expect(text.includes("VENDA CANCELADA")).toBe(status === "cancelada")
    for (const value of [cupom.numeroPedido, cupom.lojaNome.toUpperCase(), cupom.itens[0].nome, "Dinheiro", "PIX", "15,00"]) {
      expect(text).toContain(value)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(["concluida", "cancelada"])("envio térmico e segunda via da venda %s preservam os dois estados", async (status) => {
    const fetchMock = proxyMock()
    render(createElement(CupomNaoFiscal, { isOpen: true, onClose: vi.fn(), data: { ...cupom, status } }))
    fireEvent.click(screen.getByRole("button", { name: "Enviar para térmica" }))
    await screen.findByRole("button", { name: "Imprimir 2ª via" })
    fireEvent.click(screen.getByRole("button", { name: "Imprimir 2ª via" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[0][1]?.body).toBe(fetchMock.mock.calls[1][1]?.body)
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe("/api/print/raw")
      const text = receiptFromRequest(init)
      assertNotice(text)
      expect(text.includes("VENDA CANCELADA")).toBe(status === "cancelada")
      expect(text).toContain(cupom.numeroPedido)
      expect(text).toContain("Troco:")
    }
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: `Venda ${cupom.numeroPedido} permanece ${status === "cancelada" ? "cancelada" : "confirmada"}.`,
    }))
  })

  it.each(["concluida", "cancelada"])("403 → navegador da venda %s: HTML real com aviso, dados escapados e bobina configurada", async (status) => {
    const fetchMock = proxyMock(false)
    const browser = browserMock()
    render(createElement(CupomNaoFiscal, { isOpen: true, onClose: vi.fn(), data: { ...cupom, status } }))
    fireEvent.click(screen.getByRole("button", { name: "Enviar para térmica" }))
    fireEvent.click(await screen.findByRole("button", { name: "Abrir impressão do navegador" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const doc = browser.document()
    const printed = doc.querySelector(".wrap")!
    assertNotice(printed.textContent ?? "")
    expect(printed.textContent?.includes("VENDA CANCELADA")).toBe(status === "cancelada")
    expect(printed.textContent).toContain(cupom.itens[0].nome)
    expect(printed.textContent).toContain(cupom.clienteNome)
    expect(printed.querySelector("img, script, button")).toBeNull()
    expect(doc.querySelector("style")?.textContent).toContain("size: 58mm auto")
  })

  it("bloqueio de pop-up permanece visível no Histórico", async () => {
    proxyMock(false)
    vi.spyOn(window, "open").mockReturnValue(null)
    render(createElement(CupomNaoFiscal, { isOpen: true, onClose: vi.fn(), data: cupom }))
    fireEvent.click(screen.getByRole("button", { name: "Enviar para térmica" }))
    fireEvent.click(await screen.findByRole("button", { name: "Abrir impressão do navegador" }))
    expect(screen.getByRole("alert").textContent).toContain("bloqueou a janela de impressão")
  })

  it("autoPrint da Venda Completa envia o aviso; cancelada não dispara automaticamente", async () => {
    const fetchMock = proxyMock()
    const view = render(createElement(CupomNaoFiscal, { isOpen: true, onClose: vi.fn(), data: cupom, autoPrint: true }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    assertNotice(receiptFromRequest(fetchMock.mock.calls[0][1]))
    view.unmount()
    fetchMock.mockClear()
    render(createElement(CupomNaoFiscal, { isOpen: true, onClose: vi.fn(), data: { ...cupom, status: "cancelada" }, autoPrint: true }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("G2 — pós-venda manual e automático", () => {
  it("impressão manual e reimpressão enviam o mesmo documento sem outras APIs", async () => {
    const fetchMock = proxyMock()
    render(createElement(PdvPostSaleDialog, { open: true, onOpenChange: vi.fn(), printInput: receipt, impressaoConfig: settings }))
    fireEvent.click(screen.getByRole("button", { name: "Imprimir agora" }))
    fireEvent.click(await screen.findByRole("button", { name: "Imprimir 2ª via" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[0][1]?.body).toBe(fetchMock.mock.calls[1][1]?.body)
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe("/api/print/raw")
      assertNotice(receiptFromRequest(init))
    }
  })

  it("falha manual permite HTML explícito com aviso, sem repetir a venda", async () => {
    const fetchMock = proxyMock(false)
    const browser = browserMock()
    render(createElement(PdvPostSaleDialog, { open: true, onOpenChange: vi.fn(), printInput: receipt, impressaoConfig: settings }))
    fireEvent.click(screen.getByRole("button", { name: "Imprimir agora" }))
    const fallback = await screen.findByRole("button", { name: "Abrir impressão do navegador" })
    expect(browser.open).not.toHaveBeenCalled()
    fireEvent.click(fallback)
    await screen.findByRole("button", { name: "Imprimir 2ª via" })
    assertNotice(browser.document().querySelector(".wrap")?.textContent ?? "")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/print/raw")
  })

  it("falha automática não abre fallback; retry e HTML explícito só operam o comprovante", async () => {
    const fetchMock = proxyMock(false)
    const browser = browserMock()
    render(createElement(PdvAutoPrintFeedback, { printInput: receipt, impressaoConfig: settings, onDismiss: vi.fn() }))
    fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(browser.open).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole("button", { name: "Abrir impressão do navegador" }))
    await screen.findByRole("button", { name: "Imprimir 2ª via" })
    assertNotice(browser.document().querySelector(".wrap")?.textContent ?? "")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe("/api/print/raw")
      assertNotice(receiptFromRequest(init))
    }
  })

  it("sem snapshot confirmado, pós-venda manual/automático não envia comprovante", () => {
    const fetchMock = proxyMock()
    render(createElement(PdvAutoPrintFeedback, { printInput: null, impressaoConfig: settings, onDismiss: vi.fn() }))
    render(createElement(PdvPostSaleDialog, { open: true, onOpenChange: vi.fn(), printInput: null, impressaoConfig: settings }))
    fireEvent.click(screen.getByRole("button", { name: "Imprimir agora" }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
