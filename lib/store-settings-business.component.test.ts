// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const h = vi.hoisted(() => ({ store: "loja-a" }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: h.store, storesRefreshNonce: 0, lojaAtivaRaw: { storeProfile: "ASSISTENCIA" } }) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => ({ hubs: { cadastros: true }, admin: { configuracoes: true } }) }))
vi.mock("@/lib/pdv-mount-diagnostics", () => ({ markPdvMountStep: vi.fn() }))
import { StoreSettingsProvider } from "@/lib/store-settings-provider"
import { useStoreBusiness } from "@/lib/use-store-business"

function Probe() {
  const business = useStoreBusiness()
  return React.createElement("div", null,
    React.createElement("output", null, business.ready ? business.branch : "loading"),
    React.createElement("button", { onClick: () => void business.refresh() }, "Recarregar"))
}
const tree = () => React.createElement(StoreSettingsProvider, null, React.createElement(Probe))
const response = (branch: string) => new Response(JSON.stringify({ settings: { printerConfig: {
  pdvMainLayout: "classic", pdvParams: { pdvClassicLayout: "lovable", atalhosRapidos: [] },
  capabilities: { version: 1, business: { primaryBranch: branch } },
} } }), { status: 200, headers: { "Content-Type": "application/json" } })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("Provider real — configuração por loja, sem cache cruzado", () => {
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
    await act(async () => pending[2].resolve(response("padaria")))
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
