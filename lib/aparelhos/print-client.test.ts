// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  bridge: true,
  station: { deviceName: "POS-80 QA", bobina: "80mm" } as { deviceName: string; bobina: string } | null,
  print: vi.fn(),
}))
vi.mock("@/lib/desktop-print-bridge", () => ({
  getDesktopPrintBridge: () => h.bridge ? {} : null,
  loadDesktopStation: async () => h.station,
  desktopPrintHtml: h.print,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
import { abrirDocumento } from "@/components/aparelhos/api"
import { documentoTesteAparelho80mm, fragmentoAparelho80mm, imprimirTesteDocumentoAparelho } from "./print-client"

const documento = '<html><head><title>Termo GAR-QA</title><style>.doc { width:72mm }</style><style id="page-size">@page { size:80mm 800mm }</style></head><body><div class="toolbar">Imprimir</div><main class="doc"><h1>Garantia congelada</h1><p>Cliente QA</p></main><script>window.print()</script></body></html>'

beforeEach(() => {
  h.bridge = true
  h.station = { deviceName: "POS-80 QA", bobina: "80mm" }
  h.print.mockReset().mockResolvedValue({ ok: true, status: "queued", deviceName: "POS-80 QA" })
  vi.stubGlobal("fetch", vi.fn(async () => new Response(documento, { status: 200, headers: { "Content-Type": "text/html" } })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("Documentos de aparelhos na ponte Windows existente", () => {
  it("extrai conteúdo, preserva o snapshot e remove scripts/toolbar e a largura duplicada", () => {
    const result = fragmentoAparelho80mm(documento)
    expect(result.title).toBe("Termo GAR-QA")
    expect(result.html).toContain("Garantia congelada")
    expect(result.html).toContain("width: auto; max-width: 100%")
    expect(result.html).not.toMatch(/<script|toolbar|@page/)
    expect(fragmentoAparelho80mm(documento.replace("<h1>", '<h1 onclick="alert(1)">')).html).not.toContain("onclick")
  })
  it("80 mm emite pelo endpoint oficial uma vez e entrega o documento à ponte, sem popup", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const params = { tipo: "termo_garantia", formato: "80mm", aparelhoVendaId: "garantia-qa" }
    await Promise.all([abrirDocumento("loja-qa", params, "venda"), abrirDocumento("loja-qa", params, "venda")])
    expect(fetch).toHaveBeenCalledTimes(1)
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string, "http://localhost")
    expect(url.pathname).toBe("/api/aparelhos/documentos")
    expect(url.searchParams.get("storeId")).toBe("loja-qa")
    expect(url.searchParams.get("canal")).toBe("venda")
    expect(h.print).toHaveBeenCalledWith(expect.stringContaining("Garantia congelada"), { bobina: "80mm", title: "Termo GAR-QA" })
    expect(open).not.toHaveBeenCalled()
  })
  it("impressora indisponível mantém a falha visível e permite tentar somente o documento novamente", async () => {
    h.print.mockResolvedValueOnce({ ok: false, status: "printer-missing", error: "POS-80 desconectada" })
    const params = { tipo: "termo_entrega", formato: "80mm", aparelhoVendaId: "garantia-qa" }
    await expect(abrirDocumento("loja-qa", params)).rejects.toThrow("POS-80 desconectada")
    await abrirDocumento("loja-qa", params)
    expect(h.print).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).startsWith("/api/aparelhos/documentos?"))).toBe(true)
  })
  it("não emite documento sem estação 80 mm e não imprime erro de autorização", async () => {
    h.station = { deviceName: "58 QA", bobina: "58mm" }
    await expect(abrirDocumento("loja-qa", { formato: "80mm" })).rejects.toThrow("80 mm")
    expect(fetch).not.toHaveBeenCalled()
    h.station.bobina = "80mm"
    vi.mocked(fetch).mockResolvedValueOnce(new Response("Acesso negado", { status: 403 }))
    await expect(abrirDocumento("loja-qa", { formato: "80mm" })).rejects.toThrow("sessão e a loja")
    expect(h.print).not.toHaveBeenCalled()
  })
  it("A4 e prévia preservam a janela de documentos; navegador comum também", async () => {
    const child = { opener: window }
    const open = vi.spyOn(window, "open").mockReturnValue(child as unknown as Window)
    await abrirDocumento("loja-qa", { formato: "a4", tipo: "termo_garantia" })
    await abrirDocumento("loja-qa", { formato: "80mm", previa: "1" })
    h.bridge = false
    await abrirDocumento("loja-qa", { formato: "80mm", tipo: "termo_entrega" })
    expect(open).toHaveBeenCalledTimes(3)
    expect(child.opener).toBeNull()
    expect(h.print).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("fragmento enviado ao spooler: cobertura com rótulo, valor e nota em elementos próprios e CSS 80 mm de linha única", () => {
    const { html } = fragmentoAparelho80mm(documentoTesteAparelho80mm(new Date("2026-11-20T12:00:00Z")))
    const frag = new DOMParser().parseFromString(html, "text/html")
    const blocos = Array.from(frag.querySelectorAll(".cover > div"))
    expect(blocos.map((d) => Array.from(d.children).map((c) => `${c.tagName}.${c.className}`))).toEqual(Array(3).fill(["SPAN.rot", "B.", "SPAN.muted"]))
    // Mesmo sem CSS o texto nunca cola (bug da POS-80: "Garantia legal90 diasCDC art. 26", "até18/02/2027contratual").
    const texto = blocos.map((d) => d.textContent)
    expect(texto).toEqual([
      "Garantia legal 90 dias CDC art. 26, II — sempre garantida",
      "Garantia contratual adicional Sem adicional —",
      "Cobertura total até 18/02/2027 contratual + legal, a partir da entrega em 20/11/2026",
    ])
    const css = frag.querySelector("style")?.textContent ?? ""
    expect(css).toMatch(/\.cover \.rot, \.cover b, \.cover \.muted \{ display: block; \}/)
    expect(css).toMatch(/th::after \{ content: ": "; \}/)
    expect(css).not.toMatch(/white-space: nowrap/)
    // `anywhere` zera a largura mínima e parte rótulos no meio ("Nom/e"); o fragmento sobrepõe a ponte.
    expect(css).toMatch(/\.doc \{[^}]*overflow-wrap: break-word/)
    expect(css).not.toContain("overflow-wrap: anywhere")
    expect(frag.querySelector("h1 .nw")?.textContent).toBe("SEM VALIDADE")
  })
  it("teste sintético imprime o mesmo formato sem usar banco, API ou identificador de aparelho", async () => {
    await imprimirTesteDocumentoAparelho()
    expect(fetch).not.toHaveBeenCalled()
    expect(h.print).toHaveBeenCalledTimes(1)
    expect(h.print.mock.calls[0][0]).toContain("SEM VALIDADE COMERCIAL")
    expect(h.print.mock.calls[0][0]).toContain("Acentuação ÇÃÉÕ")
    expect(h.print.mock.calls[0][0]).not.toMatch(/<th>IMEI/)
  })
})
