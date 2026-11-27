// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { Session } from "next-auth"
import { BASIC_MODULE_ACCESS } from "@/lib/auth/access-policy"
import { getPermissionsFromSession, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { defaultPdvImpressaoConfig, parseImpressaoFromPrinterConfig, type PdvImpressaoConfig } from "@/lib/pdv-impressao-config"
import { printPdvSaleReceipt } from "@/lib/pdv-print-runtime"

/** Conta de cliente básico (padaria): impressão pelo navegador, sem ponte TCP. */
function bakery(): EnterprisePermissions {
  return getPermissionsFromSession({
    expires: "2099-01-01",
    user: {
      id: "bakery", role: "ADMIN", accessScope: "STORE", platformAuthority: false, mustChangePassword: false,
      allowedStoreIds: ["loja-a", "loja-b"],
      storeModules: { "loja-a": [...BASIC_MODULE_ACCESS.modules], "loja-b": [...BASIC_MODULE_ACCESS.modules] },
    },
  } as unknown as Session, "loja-a")
}

const h = vi.hoisted(() => ({
  permissions: null as EnterprisePermissions | null,
  loja: "loja-a" as string | null,
  /** Unidade cujas configurações o provider tem carregadas (null = a mesma da loja ativa). */
  providerStore: null as string | null,
  hydrated: true,
  loaded: true,
  printerConfig: {} as Record<string, unknown>,
  refresh: vi.fn(async () => {}),
  toast: vi.fn(),
  cache: { src: null as unknown, value: null as unknown },
}))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => h.permissions }))
vi.mock("@/lib/loja-ativa", () => ({
  useLojaAtiva: () => ({
    lojaAtivaId: h.loja,
    lojaAtivaRaw: h.loja ? { nomeFantasia: "Padaria Sintética", cnpj: "00.000.000/0001-00", logoUrl: "" } : null,
    // O cupom do PDV usa os documentos da empresa (perfil da unidade), não o registro da loja.
    empresaDocumentos: { nomeFantasia: "Padaria Sintética Documentos", cnpj: "11.111.111/0001-11" },
    getEnderecoDocumentos: () => "Rua Sintética, 1 — Centro",
  }),
}))
vi.mock("@/components/configuracoes-v3/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))
vi.mock("@/components/theme/ThemeProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/theme/ThemeProvider")>()),
  useTheme: () => ({ mode: "light", theme: "light" }),
}))
vi.mock("@/lib/store-settings-provider", () => ({
  useStoreSettings: () => ({
    hydrated: h.hydrated, loaded: h.loaded, storeId: h.providerStore ?? h.loja, refresh: h.refresh,
    blob: {}, capabilities: null, pdvScaleVisorVisible: false,
    settings: { receiptFooter: "Rodapé geral", printerConfig: h.printerConfig },
    // O provider real memoiza por printerConfig.
    impressaoConfig: h.cache.src === h.printerConfig
      ? h.cache.value
      : Object.assign(h.cache, { src: h.printerConfig, value: parseImpressaoFromPrinterConfig(h.printerConfig) }).value,
  }),
}))

import { PdvSection } from "../sections/PdvSection"
import { ReceiptPreview } from "./ReceiptPreview"
import { SAMPLE_SALE } from "./pdv-station-model"

type Call = { url: string; method: string; body: Record<string, unknown> | undefined }
let calls: Call[] = []
function stubFetch(handler: (call: Call) => Response) {
  calls = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    return handler(call)
  }))
}
const saveButton = () => screen.queryByRole("button", { name: "Salvar alterações" })
const rodape = () => screen.getByLabelText("Rodapé do cupom") as HTMLInputElement
const radio = (name: string) => screen.getByRole("radio", { name })

beforeEach(() => {
  h.permissions = bakery()
  h.loja = "loja-a"
  h.providerStore = null
  h.hydrated = true
  h.loaded = true
  h.printerConfig = { untouched: "preservado" }
  h.refresh.mockClear()
  h.toast.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  delete (window as unknown as { omniDesktopPrint?: unknown }).omniDesktopPrint
})

describe("Configurações → PDV e impressão · barra de alterações", () => {
  it("grava cada bloco no seu PUT parcial; falha parcial é dita como tal e só o bloco que falhou fica pendente", async () => {
    // O servidor recusa só a impressão: o bloco do caixa é gravado antes e continua gravado.
    stubFetch((c) => (c.body && "impressao" in (c.body.printerConfig as object)
      ? Response.json({ ok: false, error: "Falha sintética" }, { status: 500 })
      : Response.json({ ok: true })))
    render(React.createElement(PdvSection))
    fireEvent.click(radio("Abrir Item Avulso automaticamente"))
    fireEvent.change(rodape(), { target: { value: "Volte sempre" } })
    expect(screen.getByText("2 alterações não salvas")).toBeTruthy()
    fireEvent.click(saveButton()!)

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Impressão: não foi salvo")
    expect(alert.textContent).toContain("Falha sintética")
    expect(alert.textContent).toContain("As demais alterações já estão em vigor.")
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ["PUT", "/api/stores/loja-a/settings", { printerConfig: { pdvScanUnregisteredAction: "open_avulso" } }],
      ["PUT", "/api/stores/loja-a/settings", { printerConfig: { impressao: { rodapeCupom: "Volte sempre" } }, receiptFooter: "Volte sempre" }],
    ])
    // Nenhum anúncio de sucesso enquanto houver bloco recusado.
    expect(h.toast).not.toHaveBeenCalled()
    // Leitor gravado (sem “Desfazer”); impressão continua com o rascunho e o “Desfazer”.
    expect(screen.queryByRole("button", { name: "Desfazer alterações em Leitor" })).toBeNull()
    expect(screen.getByRole("button", { name: "Desfazer alterações em Impressão" })).toBeTruthy()
    expect(radio("Abrir Item Avulso automaticamente").getAttribute("aria-checked")).toBe("true")
    expect(rodape().value).toBe("Volte sempre")

    // Nova tentativa só reenvia o que faltou.
    stubFetch(() => Response.json({ ok: true }))
    fireEvent.click(saveButton()!)
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Impressão salva" })))
    expect(calls.map((c) => c.body)).toEqual([{ printerConfig: { impressao: { rodapeCupom: "Volte sempre" } }, receiptFooter: "Volte sempre" }])
    await waitFor(() => expect(saveButton()).toBeNull())
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("salvar caixa e impressão juntos anuncia um único sucesso", async () => {
    stubFetch(() => Response.json({ ok: true }))
    render(React.createElement(PdvSection))
    // O padrão é “Avisar e oferecer Item Avulso”; escolher outra opção deixa o bloco do caixa pendente.
    fireEvent.click(radio("Avisar e continuar"))
    fireEvent.click(screen.getByRole("switch", { name: "Exibir logo no cupom" }))
    fireEvent.click(saveButton()!)
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1))
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Alterações salvas" }))
    expect(calls).toHaveLength(2)
    expect(calls[1].body).toEqual({ printerConfig: { impressao: { logoNoCupom: false } } })
  })

  it("revalidação do provider não apaga o rascunho de nenhum bloco", () => {
    stubFetch(() => Response.json({ ok: true }))
    const view = render(React.createElement(PdvSection))
    fireEvent.click(radio("Abrir Item Avulso automaticamente"))
    fireEvent.change(rodape(), { target: { value: "Rascunho" } })
    // Outra tela grava algo e o provider entrega um printerConfig novo.
    h.printerConfig = { ...h.printerConfig, impressao: { ...defaultPdvImpressaoConfig(), rodapeCupom: "Do servidor" }, outraSecao: 1 }
    view.rerender(React.createElement(PdvSection))
    expect(rodape().value).toBe("Rascunho")
    expect(radio("Abrir Item Avulso automaticamente").getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText("2 alterações não salvas")).toBeTruthy()
    expect(calls).toHaveLength(0)
  })

  it("trocar de unidade descarta o rascunho da anterior; o que se salva depois vai só para a nova", async () => {
    stubFetch(() => Response.json({ ok: true }))
    const view = render(React.createElement(PdvSection))
    fireEvent.change(rodape(), { target: { value: "Rascunho da loja A" } })
    expect(saveButton()).toBeTruthy()
    h.loja = "loja-b"
    view.rerender(React.createElement(PdvSection))
    expect(rodape().value).toBe("")
    expect(saveButton()).toBeNull()
    expect(calls).toHaveLength(0)
    fireEvent.change(rodape(), { target: { value: "Rascunho da loja B" } })
    fireEvent.click(saveButton()!)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].url).toBe("/api/stores/loja-b/settings")
    expect(calls[0].body).toEqual({ printerConfig: { impressao: { rodapeCupom: "Rascunho da loja B" } }, receiptFooter: "Rascunho da loja B" })
  })

  it("provider ainda com dados de outra unidade: nada é gravado e a barra diz por quê", async () => {
    stubFetch(() => Response.json({ ok: true }))
    h.providerStore = "loja-a"
    h.loja = "loja-b"
    render(React.createElement(PdvSection))
    fireEvent.change(rodape(), { target: { value: "Rascunho" } })
    fireEvent.click(saveButton()!)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Nada foi gravado")
    expect(calls).toHaveLength(0)
    expect(h.toast).not.toHaveBeenCalled()
  })

  it("dois cliques seguidos em salvar gravam cada bloco uma única vez", async () => {
    stubFetch(() => Response.json({ ok: true }))
    render(React.createElement(PdvSection))
    fireEvent.change(rodape(), { target: { value: "Volte sempre" } })
    const btn = saveButton()!
    // Os dois cliques entram antes de o React redesenhar o botão desabilitado.
    act(() => {
      btn.click()
      btn.click()
    })
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Impressão salva" })))
    expect(calls).toHaveLength(1)
  })

  it("recarga do provider (ex.: depois de salvar) só trava os controles; não troca a tela pelo esqueleto", () => {
    stubFetch(() => Response.json({ ok: true }))
    const view = render(React.createElement(PdvSection))
    fireEvent.change(rodape(), { target: { value: "Rascunho" } })
    h.hydrated = false
    h.loaded = false
    view.rerender(React.createElement(PdvSection))
    expect(screen.queryByRole("status", { name: "Carregando configurações da unidade" })).toBeNull()
    expect(rodape().value).toBe("Rascunho")
    expect(rodape().disabled).toBe(true)
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
    h.hydrated = true
    h.loaded = true
    view.rerender(React.createElement(PdvSection))
    expect(rodape().disabled).toBe(false)
    expect(rodape().value).toBe("Rascunho")
    expect(calls).toHaveLength(0)
  })

  it("leitura das configurações falhou: aviso, nada editável e nenhum valor apresentado como em vigor", () => {
    stubFetch(() => Response.json({ ok: true }))
    h.hydrated = true
    h.loaded = false
    render(React.createElement(PdvSection))
    expect(screen.getByText(/Configurações indisponíveis: não foi possível ler os dados desta unidade/)).toBeTruthy()
    expect(screen.queryByLabelText("Rodapé do cupom")).toBeNull()
    expect(screen.queryByRole("radio", { name: "Avisar e continuar" })).toBeNull()
    expect(screen.getByText("A configuração em vigor desta unidade não pôde ser lida agora.")).toBeTruthy()
    expect(screen.queryByTestId("pdv-receipt-preview")).toBeNull()
    expect(saveButton()).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("app Windows: a bobina do computador é salva sozinha, sem PUT da unidade e sem a barra", async () => {
    stubFetch(() => Response.json({ ok: true }))
    const setStation = vi.fn(async (s: { deviceName: string; bobina: string }) => ({ ok: true, station: s }))
    ;(window as unknown as { omniDesktopPrint: unknown }).omniDesktopPrint = {
      version: 1,
      listPrinters: async () => [{ name: "EPSON", displayName: "EPSON TM-T20X", isDefault: true }],
      getStation: async () => ({ deviceName: "EPSON", bobina: "80mm" }),
      setStation,
      print: async () => ({ ok: true, status: "queued", deviceName: "EPSON" }),
    }
    render(React.createElement(PdvSection))
    const row = await screen.findByTestId("desktop-print-station")
    await waitFor(() => expect(within(row).getByText(/Ativa:/)).toBeTruthy())
    fireEvent.click(within(row).getByRole("radio", { name: "58 mm" }))
    const salvar = within(row).getByRole("button", { name: "Salvar neste computador" }) as HTMLButtonElement
    expect(salvar.disabled).toBe(false)
    fireEvent.click(salvar)
    await waitFor(() => expect(setStation).toHaveBeenCalledWith({ deviceName: "EPSON", bobina: "58mm" }))
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Impressora deste computador salva" })))
    // Escopo “Este computador”: nada vai para a unidade e a barra da unidade não aparece.
    expect(calls).toHaveLength(0)
    expect(saveButton()).toBeNull()
  })

  it("a prévia na tela usa o mesmo cabeçalho do cupom do PDV (documentos da empresa e endereço)", () => {
    stubFetch(() => Response.json({ ok: true }))
    render(React.createElement(PdvSection))
    const paper = screen.getAllByTestId("pdv-receipt-preview")[0].querySelector(".cx-paper")!
    expect(paper.textContent).toContain("Padaria Sintética Documentos")
    expect(paper.textContent).toContain("CNPJ 11.111.111/0001-11")
    expect(paper.textContent).toContain("Rua Sintética, 1 — Centro")
    expect(calls).toHaveLength(0)
  })

  it("sem unidade ativa: aviso, controles bloqueados e nenhuma gravação", () => {
    stubFetch(() => Response.json({ ok: true }))
    h.loja = null
    render(React.createElement(PdvSection))
    expect(screen.getByText(/Layout e modo do PDV são salvos por unidade/)).toBeTruthy()
    expect((rodape() as HTMLInputElement).disabled).toBe(true)
    expect(radio("Avisar e continuar").hasAttribute("disabled") || radio("Avisar e continuar").getAttribute("data-disabled") !== null).toBe(true)
    expect(calls).toHaveLength(0)
  })
})

describe("Prévia do cupom", () => {
  const store = { nomeFantasia: "Padaria Sintética", cnpj: "00.000.000/0001-00", enderecoLinha: "Rua Sintética, 1 — Centro" }
  const dataHora = "26/11/2026 10:30"
  const strip = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "")

  /** HTML que a impressão do navegador realmente abre para a mesma venda de exemplo. */
  async function realReceipt(config: PdvImpressaoConfig, receiptFooter: string | null, logoUrl: string | null) {
    let written = ""
    vi.stubGlobal("open", vi.fn(() => ({ document: { open() {}, write(html: string) { written += html }, close() {} } })))
    const result = await printPdvSaleReceipt({
      config, receiptFooter, logoUrl, forceBrowserFallback: true,
      input: {
        ...store,
        numeroVenda: SAMPLE_SALE.numeroVenda,
        operador: SAMPLE_SALE.operador,
        dataHora,
        itens: SAMPLE_SALE.itens.map((it) => ({ ...it, unitPrice: it.lineTotal / it.quantity })),
        subtotal: SAMPLE_SALE.subtotal,
        taxes: 0,
        discount: 0,
        total: SAMPLE_SALE.total,
        pagamentos: SAMPLE_SALE.pagamentos,
      },
    })
    expect(result.ok).toBe(true)
    const wrap = new DOMParser().parseFromString(written, "text/html").querySelector(".wrap")
    expect(wrap).toBeTruthy()
    return wrap!
  }

  it.each([
    ["completo, 80 mm, rodapé próprio e logo", { comprovanteModo: "completo", bobinaTamanho: "80mm", rodapeCupom: "Troca em até 7 dias", logoNoCupom: true }, "/logo.png"],
    ["simplificado, 58 mm, rodapé geral e sem logo", { comprovanteModo: "simplificado", bobinaTamanho: "58mm", rodapeCupom: "", logoNoCupom: false }, "/logo.png"],
    ["logo ligada sem logo cadastrada", { logoNoCupom: true }, null],
  ] as const)("mesmo conteúdo, na mesma ordem, que o cupom impresso: %s", async (_caso, patch, logoUrl) => {
    const config: PdvImpressaoConfig = { ...defaultPdvImpressaoConfig(), ...patch }
    const real = await realReceipt(config, "Rodapé geral", logoUrl)
    const view = render(React.createElement(ReceiptPreview, {
      config, store: { ...store, logoUrl }, receiptFooter: "Rodapé geral", showVias: false, dataHora,
    }))
    const paper = view.container.querySelector(".cx-paper")
    expect(paper).toBeTruthy()
    expect(strip(paper!.textContent)).toBe(strip(real.textContent))
    expect(paper!.querySelectorAll(".cx-sep").length).toBe(real.querySelectorAll('div[style*="dashed"]').length)
    expect(!!paper!.querySelector("img")).toBe(!!real.querySelector("img"))
  })
})
