// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const h = vi.hoisted(() => ({ store: "loja-a", renders: [] as Array<{ storeId: string; host: string; theme?: string }> }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: h.store, storesRefreshNonce: 0, lojaAtivaRaw: { storeProfile: "ASSISTENCIA" } }) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => ({ hubs: { cadastros: true }, admin: { configuracoes: true } }) }))
vi.mock("@/lib/pdv-mount-diagnostics", () => ({ markPdvMountStep: vi.fn() }))
import { StoreSettingsProvider, useStoreSettings } from "@/lib/store-settings-provider"
import { useStoreBusiness } from "@/lib/use-store-business"
import { PerfilLojaProvider, usePerfilLoja } from "@/lib/perfil-loja-provider"

function Probe() {
  const business = useStoreBusiness()
  h.renders.push({ storeId: business.storeId, host: business.impressaoConfig.impressoraHost, theme: business.appearance.studioTheme })
  return React.createElement("div", null,
    React.createElement("output", null, business.ready ? business.branch : "loading"),
    React.createElement("button", { onClick: () => void business.refresh() }, "Recarregar"))
}
function AvailabilityProbe() {
  const settings = useStoreSettings()
  const business = useStoreBusiness()
  return React.createElement("pre", { "data-testid": "availability" }, JSON.stringify({
    hydrated: settings.hydrated, loaded: settings.loaded,
    ready: business.ready, capabilities: settings.capabilities,
  }))
}
function LegacyAssistanceProbe() {
  const profile = usePerfilLoja()
  return React.createElement("pre", { "data-testid": "legacy-assistance" }, JSON.stringify(profile))
}
const tree = () => React.createElement(StoreSettingsProvider, null, React.createElement(Probe))
const response = (branch: string, storeId = "loja-a") => new Response(JSON.stringify({ settings: { storeId, printerConfig: {
  pdvMainLayout: "classic", pdvParams: { pdvClassicLayout: "lovable", atalhosRapidos: [] },
  capabilities: { version: 1, business: { primaryBranch: branch } },
} } }), { status: 200, headers: { "Content-Type": "application/json" } })
afterEach(() => { cleanup(); localStorage.clear(); h.renders.length = 0; vi.unstubAllGlobals() })

describe("Provider real — configuração por loja, sem cache cruzado", () => {
  it("falha concluída conserva apresentação da assistência do perfil comprovado da mesma loja", async () => {
    h.store = "loja-a"
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })))
    render(React.createElement(StoreSettingsProvider, null, React.createElement(PerfilLojaProvider, null, React.createElement(LegacyAssistanceProbe))))
    await act(async () => {})
    expect(JSON.parse(screen.getByTestId("legacy-assistance").textContent!)).toMatchObject({ perfilHydrated: true, mostraTecnicoLaudoOs: true })
  })
  it.each(["http", "json", "rede"])("falha %s conclui a tentativa do PDV sem habilitar recursos nem backfill", async (kind) => {
    h.store = "loja-a"
    localStorage.setItem("omnigestao:pdv-shortcuts:loja-a", JSON.stringify([{ id: "local", nome: "Local" }]))
    const fetcher = vi.fn(async () => {
      if (kind === "rede") throw new Error("offline")
      return kind === "json" ? new Response("<html>indisponível</html>") : new Response("{}", { status: 500 })
    })
    vi.stubGlobal("fetch", fetcher)
    render(React.createElement(StoreSettingsProvider, null, React.createElement(AvailabilityProbe)))
    await act(async () => {})
    expect(JSON.parse(screen.getByTestId("availability").textContent!)).toEqual({
      hydrated: true, loaded: false, ready: false, capabilities: null,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("falha de GET não autoriza backfill de valores locais", async () => {
    h.store = "loja-a"
    localStorage.setItem("omnigestao:pdv-shortcuts:loja-a", JSON.stringify([{ id: "local", nome: "Local" }]))
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "indisponível" }), { status: 500 }))
    vi.stubGlobal("fetch", fetcher)
    render(tree())
    await act(async () => {})
    expect(screen.getByRole("status").textContent).toBe("loading")
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(["json-inválido", "envelope-ausente", "outra-loja"])("resposta 200 com %s não inventa configuração legada ou backfill", async (kind) => {
    h.store = "loja-a"
    localStorage.setItem("omnigestao:pdv-shortcuts:loja-a", JSON.stringify([{ id: "local", nome: "Local" }]))
    const fetcher = vi.fn(async () => kind === "json-inválido" ? new Response("<html>indisponível</html>")
      : kind === "envelope-ausente" ? new Response("{}") : response("assistencia", "loja-b"))
    vi.stubGlobal("fetch", fetcher)
    render(tree())
    await act(async () => {})
    expect(screen.getByRole("status").textContent).toBe("loading")
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("impressão e aparência também deixam de expor a loja anterior na primeira renderização", async () => {
    h.store = "loja-a"
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("loja-a")
      ? new Response(JSON.stringify({ settings: { storeId: "loja-a", printerConfig: {
        pdvMainLayout: "classic", pdvParams: { pdvClassicLayout: "lovable", atalhosRapidos: [] },
        impressao: { impressoraHost: "impressora-a" }, appearance: { studioTheme: "midnight" },
      } } })) : new Promise<Response>(() => {})))
    const ui = render(tree())
    await act(async () => {})
    expect(h.renders.at(-1)?.host).toBe("impressora-a")
    h.store = "loja-b"
    ui.rerender(tree())
    expect(h.renders.find((item) => item.storeId === "loja-b")).toEqual({ storeId: "loja-b", host: "", theme: undefined })
  })
  it("troca de loja descarta GET antigo, incluindo a primeira renderização", async () => {
    h.store = "loja-a"
    const pending: Array<{ url: string; resolve: (response: Response) => void }> = []
    vi.stubGlobal("fetch", vi.fn((url: string) => new Promise<Response>((resolve) => pending.push({ url, resolve }))))
    const ui = render(tree())
    await act(async () => pending[0].resolve(response("assistencia")))
    expect(screen.getByRole("status").textContent).toBe("assistencia")
    fireEvent.click(screen.getByRole("button", { name: "Recarregar" }))
    expect(pending[1].url).toContain("loja-a")
    h.store = "loja-b"
    ui.rerender(tree())
    expect(screen.getByRole("status").textContent).toBe("loading")
    expect(pending[2].url).toContain("loja-b")
    await act(async () => pending[2].resolve(response("padaria", "loja-b")))
    expect(screen.getByRole("status").textContent).toBe("padaria")
    await act(async () => pending[1].resolve(response("moda")))
    expect(screen.getByRole("status").textContent).toBe("padaria")
  })
  it("nova sessão relê o ramo persistido; falha não se transforma em perfil legado", async () => {
    h.store = "loja-a"
    const fetcher = vi.fn(async () => response("padaria"))
    vi.stubGlobal("fetch", fetcher)
    render(tree())
    expect(await screen.findByText("padaria")).toBeTruthy()
    cleanup()
    render(tree())
    expect(await screen.findByText("padaria")).toBeTruthy()
    expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher.mockRejectedValueOnce(new Error("offline"))
    fireEvent.click(screen.getByRole("button", { name: "Recarregar" }))
    expect(await screen.findByText("loading")).toBeTruthy()
    expect(screen.queryByText("assistencia")).toBeNull()
  })
})
