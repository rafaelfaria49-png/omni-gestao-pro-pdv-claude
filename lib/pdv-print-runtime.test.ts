// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildPdvReceiptEscPos, type PdvReceiptInput } from "./escpos"
import { BOBINA_CHARS, defaultPdvImpressaoConfig } from "./pdv-impressao-config"
import { printPdvSaleReceipt } from "./pdv-print-runtime"

const receipt: PdvReceiptInput = {
  nomeFantasia: "Loja Teste",
  cnpj: "12.345.678/0001-90",
  enderecoLinha: "Rua Teste, 10",
  numeroVenda: "VDA-0001",
  operador: "Caixa 01",
  itens: [{ name: "Café", quantity: 1, unitPrice: 15, lineTotal: 15 }],
  subtotal: 15,
  taxes: 0,
  discount: 0,
  total: 15,
  pagamentos: [{ label: "Dinheiro", valor: 15 }],
  cashTendered: 20,
  troco: 5,
  dataHora: "29/08/2026 10:00:00",
}

const notice = "NÃO É DOCUMENTO FISCAL"
const explanation = "NÃO SUBSTITUI NFC-e OU NF-e"
const br = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
const splitReceipt: PdvReceiptInput = {
  ...receipt,
  clienteNome: "João & Maria",
  clienteCpf: "123.456.789-00",
  itens: [{ name: "Café", quantity: 2, unitPrice: 8, lineTotal: 16 }],
  subtotal: 16,
  taxes: 1,
  discount: 2,
  pagamentos: [{ label: "Dinheiro", valor: 5 }, { label: "PIX", valor: 10 }],
  cashTendered: 10,
}

function captureBrowserPrint() {
  const write = vi.fn<(html: string) => void>()
  const open = vi.spyOn(window, "open").mockReturnValue({
    document: { open: vi.fn(), write, close: vi.fn() },
  } as unknown as Window)
  return {
    open,
    document: () => new DOMParser().parseFromString(write.mock.calls[0]?.[0] ?? "", "text/html"),
  }
}

function assertPrintedNotice(doc: Document) {
  const printed = doc.querySelector(".wrap")!
  expect(printed.textContent?.split(notice)).toHaveLength(2)
  expect(printed.textContent?.split(explanation)).toHaveLength(2)
  const noticeElement = Array.from(printed.querySelectorAll("div")).find((el) => el.textContent === notice)
  expect(noticeElement).toBeDefined()
  expect(noticeElement?.closest(".no-print")).toBeNull()
  expect(printed.querySelector("button")).toBeNull()
}

function config(overrides: Partial<ReturnType<typeof defaultPdvImpressaoConfig>> = {}) {
  return { ...defaultPdvImpressaoConfig(), ...overrides }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("PDV thermal print runtime", () => {
  it("inclui dinheiro recebido e troco no ESC/POS real", () => {
    const bytes = buildPdvReceiptEscPos(receipt)
    const text = Buffer.from(bytes).toString("latin1")

    expect(text).toContain("Dinheiro recebido")
    expect(text).toContain("Troco")
    expect(text).toContain("VDA-0001")
  })

  it("envia diretamente para a impressora configurada e respeita vias", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ ok: true }),
    }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await printPdvSaleReceipt({
      config: config({ impressoraHost: "192.168.0.50", impressoraPorta: 9100, viasCupom: 2 }),
      input: receipt,
      allowBrowserFallback: false,
    })

    expect(result).toEqual({ ok: true, via: "proxy" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "")) as {
      host?: string
      port?: number
    }
    expect(firstBody.host).toBe("192.168.0.50")
    expect(firstBody.port).toBe(9100)
  })

  it("falha direta não abre preview automaticamente", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: false,
      statusText: "offline",
      json: async () => ({ ok: false, error: "ECONNREFUSED" }),
    }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await printPdvSaleReceipt({
      config: config({ impressoraHost: "192.168.0.50" }),
      input: receipt,
      allowBrowserFallback: false,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain("ECONNREFUSED")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe.each(["58mm", "80mm"] as const)("G2 — ESC/POS %s", (bobina) => {
  describe.each(["simplificado", "completo"] as const)("%s", (modo) => {
    it.each(["", "Volte sempre!\nPadaria São João"])("aviso único, CP1252 e valores preservados; rodapé %j", (receiptFooter) => {
      const input = { ...splitReceipt, receiptFooter }
      const before = structuredClone(input)
      const bytes = buildPdvReceiptEscPos(input, { modo, maxChars: BOBINA_CHARS[bobina] })
      const text = new TextDecoder("windows-1252").decode(bytes)

      expect(Array.from(bytes.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 16])
      expect(text.split(notice)).toHaveLength(2)
      expect(text.split(explanation)).toHaveLength(2)
      expect(Buffer.from(bytes).includes(Buffer.from([0x4e, 0xc3, 0x4f, 0x20, 0xc9]))).toBe(true)
      expect(text).toContain(`\x1bE\x01${notice}\n\x1bE\x00${explanation}\n`)
      const header = text.slice(0, text.indexOf(notice))
      expect(header.lastIndexOf("\x1ba\x01")).toBeGreaterThan(header.lastIndexOf("\x1ba\x00"))
      for (const label of [notice, explanation]) {
        expect(label.length).toBeLessThanOrEqual(BOBINA_CHARS[bobina])
        expect(text.split("\n").some((row) => row.endsWith(label))).toBe(true)
      }
      expect(text).toContain(modo === "simplificado" ? "1 item(ns)" : "2x Café")
      for (const line of [
        `Subtotal: ${br(16)}`, `Impostos (estimado): ${br(1)}`, `Desconto: ${br(2)}`,
        `Valor final pago: ${br(15)}`, `Dinheiro: ${br(5)}`, `PIX: ${br(10)}`,
        `Dinheiro recebido: ${br(10)}`, `Troco: ${br(5)}`,
      ]) expect(text).toContain(line)
      if (receiptFooter) expect(text.indexOf("Volte sempre!")).toBeGreaterThan(text.indexOf(explanation))
      expect(Array.from(bytes.slice(-6))).toEqual([0x1b, 0x64, 3, 0x1d, 0x56, 0])
      expect(input).toEqual(before)
    })
  })
})

describe("G2 — envio, vias e fallback reais", () => {
  it.each([false, true])("estado cancelada=%s coexiste com aviso no ESC/POS e HTML compartilhados", async (cancelada) => {
    const input = { ...receipt, cancelada }
    const text = new TextDecoder("windows-1252").decode(buildPdvReceiptEscPos(input))
    expect(text.split(notice)).toHaveLength(2)
    expect(text.split(explanation)).toHaveLength(2)
    expect(text.includes("VENDA CANCELADA")).toBe(cancelada)

    const browser = captureBrowserPrint()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await printPdvSaleReceipt({ config: config(), input, forceBrowserFallback: true })
    const doc = browser.document()
    assertPrintedNotice(doc)
    expect(doc.querySelector(".wrap")?.textContent?.includes("VENDA CANCELADA")).toBe(cancelada)
    expect(doc.body.textContent).not.toMatch(/estorno bancário|estorno fiscal|autorizad[ao] pela SEFAZ/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("cada via contém o aviso uma vez e a gaveta recebe só o pulso original", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ ok: true }) }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await printPdvSaleReceipt({
      config: config({ viasCupom: 2, abrirGaveta: true, bobinaTamanho: "58mm" }),
      input: splitReceipt,
      allowBrowserFallback: false,
    })).toEqual({ ok: true, via: "proxy" })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const payloads = fetchMock.mock.calls.map(([url, init]) => {
      expect(url).toBe("/api/print/raw")
      expect(init?.method).toBe("POST")
      return Buffer.from(JSON.parse(String(init?.body)).data, "base64")
    })
    expect(payloads[0]).toEqual(payloads[2])
    expect(payloads[0].toString("latin1").split(notice)).toHaveLength(2)
    expect(Array.from(payloads[1])).toEqual([0x1b, 0x70, 0, 0x78, 0xf0])
  })

  for (const bobina of ["58mm", "80mm"] as const) {
    for (const modo of ["simplificado", "completo"] as const) {
      it(`HTML impresso ${bobina}/${modo}: fallback explícito após 403, aviso e dados escapados`, async () => {
        const browser = captureBrowserPrint()
        const fetchMock = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "Forbidden" }) }))
        vi.stubGlobal("fetch", fetchMock)
        const params = {
          config: config({ bobinaTamanho: bobina, comprovanteModo: modo, impressoraHost: "192.168.0.50" }),
          input: {
            ...splitReceipt,
            nomeFantasia: 'Loja <script>alert("x")</script> & Cia',
            itens: [{ ...splitReceipt.itens[0], name: 'Café <img src=x onerror="alert(1)">' }],
          },
          receiptFooter: '<b>São João & Filhos</b>',
          allowBrowserFallback: false,
        }
        expect(await printPdvSaleReceipt(params)).toEqual({ ok: false, error: "Forbidden" })
        expect(browser.open).not.toHaveBeenCalled()
        expect(await printPdvSaleReceipt({ ...params, forceBrowserFallback: true })).toEqual({ ok: true, via: "html" })
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const doc = browser.document()
        assertPrintedNotice(doc)
        const printed = doc.querySelector(".wrap")!
        expect(printed.querySelector("script, img, b")).toBeNull()
        expect(printed.textContent).toContain(params.input.nomeFantasia)
        expect(printed.textContent).toContain(params.receiptFooter)
        for (const value of ["VDA-0001", receipt.cnpj, receipt.dataHora, "Caixa 01", "João & Maria", "123.456.789-00"]) {
          expect(printed.textContent).toContain(value)
        }
        expect(printed.textContent).toContain(modo === "simplificado" ? "1 item(ns)" : params.input.itens[0].name)
        for (const line of [
          `Subtotal: ${br(16)}`, `Imposto estimado: ${br(1)}`, `Desconto: ${br(2)}`, `Total: ${br(15)}`,
          `Dinheiro${br(5)}`, `PIX${br(10)}`, `Dinheiro recebido: ${br(10)}`, `Troco: ${br(5)}`,
        ]) expect(printed.textContent).toContain(line)
        expect(doc.querySelector("style")?.textContent).toContain(`size: ${bobina} auto`)
        expect(doc.querySelector("style")?.textContent).toContain(`width: ${bobina === "58mm" ? "52mm" : "72mm"}`)
      })
    }
  }

  it("sem térmica configurada, o fallback HTML mantém o aviso com rodapé vazio", async () => {
    const browser = captureBrowserPrint()
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Sem bridge") }))
    expect(await printPdvSaleReceipt({ config: config(), input: receipt })).toEqual({ ok: true, via: "html" })
    assertPrintedNotice(browser.document())
  })

  it("impressão automática não abre navegador implicitamente, mesmo sem térmica", async () => {
    const browser = captureBrowserPrint()
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: "Forbidden" }) }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await printPdvSaleReceipt({ config: config({ imprimirAutomatico: true }), input: receipt, allowBrowserFallback: false }))
      .toEqual({ ok: false, error: "Forbidden" })
    expect(browser.open).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("preserva erro de pop-up bloqueado no fallback explícito", async () => {
    vi.spyOn(window, "open").mockReturnValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const result = await printPdvSaleReceipt({ config: config(), input: receipt, forceBrowserFallback: true })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("bloqueou a janela de impressão")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
