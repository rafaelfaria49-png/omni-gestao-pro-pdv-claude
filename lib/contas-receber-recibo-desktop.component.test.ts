// @vitest-environment jsdom
/**
 * OMNI-FINANCEIRO-F9-HUB-RECONCILIACAO-MAIN-001 — comprovante de recebimento no app Windows.
 * Com a estação configurada, o cupom vai pelo MESMO bridge do cupom de venda
 * (`window.omniDesktopPrint`), sem diálogo do navegador. Sem estação ou com falha do
 * spooler, cai no caminho do navegador. Teste em jsdom não é homologação física.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const payload = {
  lojaNome: "Loja QA",
  cliente: "Ana QA",
  dataPagamento: new Date("2026-11-08T13:45:00.000Z"),
  formaPagamento: "PIX",
  itens: [
    { descricao: "Crediário #1", valorRecebido: 10, saldoRestante: 0 },
    { descricao: "Crediário #2", valorRecebido: 5, saldoRestante: 2 },
  ],
  totalRecebido: 15,
  saldoDevedorAtual: 2,
  operacaoId: "lote-qa-1",
}

type PrintReq = { html: string; bobina?: string; title?: string; kind?: string }

function instalarBridge(station: { deviceName: string; bobina: "58mm" | "80mm" } | null, ok = true) {
  const print = vi.fn(async (_r: PrintReq) =>
    ok
      ? { ok: true as const, status: "queued" as const, deviceName: "POS-80" }
      : { ok: false as const, status: "printer-missing" as const, error: "Impressora não encontrada" },
  )
  ;(window as unknown as { omniDesktopPrint?: unknown }).omniDesktopPrint = {
    version: 1,
    listPrinters: async () => [],
    getStation: async () => station,
    setStation: async () => ({ ok: true }),
    print,
  }
  return print
}

describe("comprovante — impressão direta do app Windows", () => {
  let printSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    printSpy = vi.fn()
    window.print = printSpy as unknown as typeof window.print
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
  })

  afterEach(() => {
    delete (window as unknown as { omniDesktopPrint?: unknown }).omniDesktopPrint
    vi.unstubAllGlobals()
    document.getElementById("recibo-print-mount")?.remove()
    document.documentElement.removeAttribute("data-printing-recibo")
  })

  it("estação configurada: um job no spooler, cupom NÃO FISCAL consolidado, sem diálogo do navegador", async () => {
    const desktop = instalarBridge({ deviceName: "POS-80", bobina: "80mm" })
    const { imprimirReciboLote } = await import("@/lib/contas-receber-recibo")
    await expect(imprimirReciboLote(payload, { bobina: "58mm" })).resolves.toBe(true)
    expect(desktop).toHaveBeenCalledTimes(1)
    const req = desktop.mock.calls[0][0]
    expect(req.kind).toBe("receipt")
    expect(req.bobina).toBe("58mm")
    expect(req.html).toContain("COMPROVANTE NÃO FISCAL")
    expect(req.html).toContain("Ana QA")
    expect(req.html).toContain("Crediário #1")
    expect(req.html).toContain("Crediário #2")
    expect(req.html).toContain("lote-qa-1")
    expect(req.html).toContain(".recibo-thermal")
    expect(printSpy).not.toHaveBeenCalled()
  })

  it("2ª via vai marcada e é um documento diferente do original (a proteção anti-rajada do app não a engole)", async () => {
    const desktop = instalarBridge({ deviceName: "POS-80", bobina: "80mm" })
    const { imprimirReciboLote } = await import("@/lib/contas-receber-recibo")
    await imprimirReciboLote(payload)
    await imprimirReciboLote({ ...payload, segundaVia: true })
    expect(desktop).toHaveBeenCalledTimes(2)
    expect(desktop.mock.calls[1][0].html).toContain("2ª VIA")
    expect(desktop.mock.calls[1][0].html).not.toBe(desktop.mock.calls[0][0].html)
  })

  it("app sem impressora escolhida: segue o diálogo do navegador", async () => {
    const desktop = instalarBridge(null)
    const { imprimirReciboLote } = await import("@/lib/contas-receber-recibo")
    await expect(imprimirReciboLote(payload)).resolves.toBe(true)
    expect(desktop).not.toHaveBeenCalled()
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it("spooler falhou: contingência do navegador, uma vez", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const desktop = instalarBridge({ deviceName: "POS-80", bobina: "80mm" }, false)
    const { imprimirReciboLote } = await import("@/lib/contas-receber-recibo")
    await expect(imprimirReciboLote(payload)).resolves.toBe(true)
    expect(desktop).toHaveBeenCalledTimes(1)
    expect(printSpy).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
