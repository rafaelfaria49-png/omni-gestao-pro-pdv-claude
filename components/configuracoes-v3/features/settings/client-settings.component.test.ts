// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Session } from "next-auth"
import { BASIC_MODULE_ACCESS, MODULES } from "@/lib/auth/access-policy"
import { getPermissionsFromSession, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { defaultPdvImpressaoConfig, parseImpressaoFromPrinterConfig } from "@/lib/pdv-impressao-config"
import type { StorePdvParams } from "@/lib/store-settings-types"

function perms(kind: "owner" | "bakery" | "legacySeller"): EnterprisePermissions {
  const user = kind === "owner"
    ? { id: "owner", role: "ADMIN", accessScope: null, platformAuthority: true, allowedStoreIds: [], storeModules: {} }
    : kind === "legacySeller"
      ? { id: "seller", role: "GERENTE", accessScope: null, platformAuthority: false, allowedStoreIds: ["loja-a"], storeModules: { "loja-a": [...MODULES] } }
      : { id: "bakery", role: "ADMIN", accessScope: "STORE", platformAuthority: false, allowedStoreIds: ["loja-a"], storeModules: { "loja-a": [...BASIC_MODULE_ACCESS.modules] } }
  return getPermissionsFromSession({ expires: "2099-01-01", user: { ...user, mustChangePassword: false } } as unknown as Session, "loja-a")
}

const h = vi.hoisted(() => ({
  permissions: null as EnterprisePermissions | null,
  pdvParams: {} as Record<string, unknown>,
  printerConfig: {} as Record<string, unknown>,
  refresh: vi.fn(async () => {}),
  toast: vi.fn(),
  cache: { src: null as unknown, value: null as unknown as ReturnType<typeof parseImpressaoFromPrinterConfig> },
}))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => h.permissions }))
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => React.createElement("a", { href, className }, children) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "loja-a", lojaAtivaRaw: { nomeFantasia: "Padaria Sintética", cnpj: "00.000.000/0001-00", logoUrl: "" } }) }))
vi.mock("@/components/configuracoes-v3/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))
vi.mock("@/lib/store-settings-provider", () => ({
  useStoreSettings: () => ({
    hydrated: true, storeId: "loja-a", refresh: h.refresh,
    pdvParams: h.pdvParams as StorePdvParams,
    settings: { receiptFooter: "Rodapé geral", printerConfig: h.printerConfig },
    // O provider real memoiza por printerConfig.
    impressaoConfig: h.cache.src === h.printerConfig ? h.cache.value : Object.assign(h.cache, { src: h.printerConfig, value: parseImpressaoFromPrinterConfig(h.printerConfig) }).value,
  }),
}))
// Editor real de formas é coberto nos próprios testes; aqui só importa a intenção alterada.
vi.mock("./sections/FormasPagamentoSettings", () => ({
  FormasPagamentoSettings: ({ value, onChange }: { value: Array<{ id: string; ativo: boolean }>; onChange: (v: unknown) => void }) =>
    React.createElement("button", {
      type: "button", "data-formas": JSON.stringify(value.map((f) => [f.id, f.ativo])),
      onClick: () => onChange(value.map((f) => (f.id === "pix" ? { ...f, ativo: !f.ativo } : f))),
    }, "alternar pix"),
}))

import { VendasSection } from "./sections/VendasSection"
import { ImpressaoPdvSettingsCard } from "./sections/ImpressaoPdvSettingsCard"
import { SettingsSidebar } from "./components/SettingsSidebar"

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
function stubFetch(handler: (call: Call) => Response) {
  calls = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    return handler(call)
  }))
}

beforeEach(() => {
  h.permissions = perms("bakery")
  h.pdvParams = { garantiaPadraoDias: 90, validadeOrcamentoDias: 7, incluirImpostoEstimadoNoPdv: false, aliquotaImpostoEstimadoPdv: 0, moduloControleConsumo: false }
  h.printerConfig = {}
  h.refresh.mockClear()
  h.toast.mockClear()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("Configurações → Vendas", () => {
  it("cliente básico vê só formas de pagamento; garantia, imposto e mesas não liberados ficam ocultos", () => {
    stubFetch(() => Response.json({ ok: true }))
    render(React.createElement(VendasSection))
    expect(screen.getByRole("heading", { name: "Vendas e pagamentos" })).toBeTruthy()
    expect(screen.getByText("Formas de pagamento")).toBeTruthy()
    for (const hidden of ["Orçamentos", "Impostos", "Mesas e consumo", "Garantia padrão (dias)"]) expect(screen.queryByText(hidden)).toBeNull()
    expect(document.body.textContent).not.toMatch(/printerConfig|\/dashboard\/vendas\/mesas/)
    expect(calls).toHaveLength(0)
  })

  it("imposto gravado que altera o total é informado sem oferecer controle", () => {
    h.pdvParams = { ...h.pdvParams, incluirImpostoEstimadoNoPdv: true, aliquotaImpostoEstimadoPdv: 4 }
    render(React.createElement(VendasSection))
    expect(screen.getByRole("note").textContent).toContain("4%")
    expect(screen.queryByRole("switch")).toBeNull()
  })

  it("proprietário mantém garantia/orçamento e impostos; mesas só aparece com rota permitida", () => {
    h.permissions = perms("owner")
    render(React.createElement(VendasSection))
    expect(screen.getByText("Orçamentos")).toBeTruthy()
    expect(screen.getByText("Impostos")).toBeTruthy()
    expect(screen.getByText("Mesas e consumo")).toBeTruthy()
    cleanup()
    // Conta interna sem plataforma: rota de mesas é negada pela política, então a tela não promete.
    h.permissions = perms("legacySeller")
    render(React.createElement(VendasSection))
    expect(screen.getByText("Impostos")).toBeTruthy()
    expect(screen.queryByText("Mesas e consumo")).toBeNull()
  })

  it("salva somente a preferência alterada, sem snapshot de printerConfig/pdvParams", async () => {
    stubFetch(() => Response.json({ ok: true }))
    render(React.createElement(VendasSection))
    fireEvent.click(screen.getByRole("button", { name: "alternar pix" }))
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }))
    await waitFor(() => expect(calls).toHaveLength(1))
    const [put] = calls
    expect(put.method).toBe("PUT")
    expect(put.url).toBe("/api/stores/loja-a/settings")
    const body = put.body as { printerConfig: { pdvParams: Record<string, unknown> } }
    expect(Object.keys(body)).toEqual(["printerConfig"])
    expect(Object.keys(body.printerConfig)).toEqual(["pdvParams"])
    expect(Object.keys(body.printerConfig.pdvParams)).toEqual(["formasPagamento"])
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Vendas atualizadas" })))
  })

  it("revalidação do provider não apaga rascunho; falha de gravação não mostra sucesso", async () => {
    stubFetch(() => Response.json({ ok: false, error: "Falha sintética" }, { status: 500 }))
    const view = render(React.createElement(VendasSection))
    const before = screen.getByRole("button", { name: "alternar pix" }).getAttribute("data-formas")
    fireEvent.click(screen.getByRole("button", { name: "alternar pix" }))
    const draft = screen.getByRole("button", { name: "alternar pix" }).getAttribute("data-formas")
    expect(draft).not.toBe(before)
    h.pdvParams = { ...h.pdvParams, garantiaPadraoDias: 30 }
    view.rerender(React.createElement(VendasSection))
    expect(screen.getByRole("button", { name: "alternar pix" }).getAttribute("data-formas")).toBe(draft)
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }))
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "Falha sintética" })))
    expect(h.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Vendas atualizadas" }))
    expect(screen.getByRole("button", { name: "alternar pix" }).getAttribute("data-formas")).toBe(draft)
  })
})

describe("Configurações → Impressão", () => {
  const stored = {
    untouched: "preservado",
    impressao: { ...defaultPdvImpressaoConfig(), impressoraHost: "10.0.0.5", viasCupom: 3, abrirGaveta: true, imprimirOs: false, chaveFutura: "x" },
  }

  it("cliente vê só preferências do navegador; sem TCP, gaveta, OS ou teste que daria 403", () => {
    stubFetch(() => Response.json({ ok: true }))
    h.printerConfig = stored
    render(React.createElement(ImpressaoPdvSettingsCard, { browserOnly: true }))
    expect(screen.getByText("Impressão do cupom")).toBeTruthy()
    for (const hidden of [/host\/IP/, /Porta TCP/, /Vias do cupom/, /gaveta após/, /impressão térmica de OS/, /crediário/, /Testar impressão/, /\/api\/print\/raw/]) {
      expect(document.body.textContent).not.toMatch(hidden)
    }
    expect(screen.getByLabelText("Rodapé do cupom")).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Imprimir cupom automaticamente" })).toBeTruthy()
    expect(calls).toHaveLength(0)
  })

  it("salva a partir da releitura, enviando só o alterado e preservando host/vias/gaveta ocultos", async () => {
    h.printerConfig = { impressao: defaultPdvImpressaoConfig() }
    stubFetch((call) => call.method === "GET" ? Response.json({ settings: { printerConfig: stored } }) : Response.json({ ok: true }))
    render(React.createElement(ImpressaoPdvSettingsCard, { browserOnly: true }))
    fireEvent.change(screen.getByLabelText("Rodapé do cupom"), { target: { value: "  Volte sempre  " } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar impressão" }))
    await waitFor(() => expect(calls.map((c) => c.method)).toEqual(["GET", "PUT"]))
    expect(calls.some((c) => c.url.includes("/api/print/raw"))).toBe(false)
    expect(calls[1].body).toEqual({
      printerConfig: { impressao: { ...stored.impressao, rodapeCupom: "Volte sempre" } },
      receiptFooter: "Volte sempre",
    })
  })

  it("releitura indisponível não grava nada e não anuncia sucesso", async () => {
    stubFetch(() => Response.json({ error: "x" }, { status: 503 }))
    render(React.createElement(ImpressaoPdvSettingsCard, { browserOnly: true }))
    fireEvent.click(screen.getByRole("switch", { name: "Imprimir cupom automaticamente" }))
    fireEvent.click(screen.getByRole("button", { name: "Salvar impressão" }))
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })))
    expect(calls.map((c) => c.method)).toEqual(["GET"])
    expect(h.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Impressão salva" }))
  })

  it("prévia usa a impressão do navegador, sem ponte TCP nem gravação", async () => {
    stubFetch(() => Response.json({ ok: true }))
    let written = ""
    vi.stubGlobal("open", vi.fn(() => ({ document: { open() {}, write(html: string) { written += html }, close() {} } })))
    render(React.createElement(ImpressaoPdvSettingsCard, { browserOnly: true }))
    fireEvent.click(screen.getByRole("button", { name: "Prévia no navegador" }))
    await waitFor(() => expect(written).toContain("PRÉVIA — sem valor fiscal"))
    expect(written).toContain("Padaria Sintética")
    expect(calls).toHaveLength(0)
  })

  it("plataforma conserva o cartão técnico com host, vias e teste", () => {
    h.permissions = perms("owner")
    h.printerConfig = stored
    render(React.createElement(ImpressaoPdvSettingsCard))
    expect(screen.getByText("Impressão operacional")).toBeTruthy()
    expect(screen.getByLabelText("Impressora de comprovante (host/IP)")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Testar impressão/ })).toBeTruthy()
  })
})

describe("Configurações → menu", () => {
  it("cliente vê nomes claros e só as seções liberadas; proprietário mantém os nomes atuais", () => {
    render(React.createElement(SettingsSidebar, { active: "geral", onChange: () => {} }))
    const client = screen.getAllByRole("button").map((b) => b.textContent)
    expect(client).toEqual(["Dados da loja", "Aparência", "PDV e impressão", "Vendas e pagamentos", "Equipe", "Segurança da conta"])
    cleanup()
    h.permissions = perms("owner")
    render(React.createElement(SettingsSidebar, { active: "geral", onChange: () => {} }))
    const owner = screen.getAllByRole("button").map((b) => b.textContent)
    expect(owner).toContain("Geral")
    expect(owner).toContain("Identidade Fiscal")
    expect(owner).toContain("Usuários e Permissões")
  })
})
