// @vitest-environment jsdom
import React from "react"
import type { Session } from "next-auth"
import type { AccessModule } from "@/lib/auth/access-policy"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const h = vi.hoisted(() => ({ session: null as Session | null, status: "authenticated", update: vi.fn(async () => {}) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: h.session, status: h.status, update: h.update }) }))
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement("a", { href }, children) }))
vi.mock("./config-empresa", () => {
  const empresa = { nomeFantasia: "Loja sintética", endereco: {}, identidadeVisual: { logoUrl: "" } }
  return {
    configPadrao: { empresa },
    useConfigEmpresa: () => ({ configHydrated: true, config: { empresa, minhasLojas: { lojas: [] } } }),
  }
})

import { LojaAtivaProvider, useLojaAtiva } from "./loja-ativa"
import { WorkspaceAccessBoundary } from "@/components/auth/WorkspaceAccessBoundary"

function Harness() {
  const { lojaAtivaId, setLojaAtivaId } = useLojaAtiva()
  return React.createElement("div", null,
    React.createElement("output", { "data-testid": "store" }, lojaAtivaId),
    ...["loja-b", "loja-c"].map((id) => React.createElement("button", { key: id, onClick: () => setLojaAtivaId(id) }, id)),
    React.createElement(WorkspaceAccessBoundary, null, React.createElement("input", { "aria-label": "Rascunho" })),
  )
}
function mount() { return render(React.createElement(LojaAtivaProvider, null, React.createElement(Harness))) }
function network(probe?: (url: string) => Promise<{ ok: boolean }> | undefined) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url === "/api/stores") return { ok: true, json: async () => ({ stores: ["loja-a", "loja-b", "loja-c"].map((id) => ({ id, name: id })) }) }
    return probe?.(url) ?? { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}
beforeEach(() => {
  localStorage.clear()
  document.cookie = "assistec-active-store=; Max-Age=0; Path=/"
  const modules: AccessModule[] = ["home", "catalog", "settings", "reports"]
  h.session = { user: { id: "synthetic", role: "GERENTE", accessScope: "STORE", platformAuthority: false, lojaId: "loja-a", storeAccess: "restricted", allowedStoreIds: ["loja-a", "loja-b", "loja-c"], storeModules: Object.fromEntries(["loja-a", "loja-b", "loja-c"].map((id) => [id, [...modules]])) }, expires: "2099-01-01" }
  h.status = "authenticated"
  h.update.mockClear()
  vi.stubGlobal("alert", vi.fn())
  network()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("contexto da unidade e revalidação de sessão", () => {
  it("descarta a loja de outra identidade salva no navegador", async () => {
    localStorage.setItem("assistec-pro-loja-ativa-v1", "loja-b")
    h.session!.user.allowedStoreIds = ["loja-a"]
    mount()
    await waitFor(() => expect(localStorage.getItem("assistec-pro-loja-ativa-v1")).toBe("loja-a"))
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    expect(localStorage.getItem("assistec-pro-loja-ativa-v1")).toBe("loja-a")
    expect(document.cookie).toContain("assistec-active-store=loja-a")
  })
  it("sondagem cancelada na saída da página não restaura a loja anterior", async () => {
    let fail!: (error: Error) => void
    network((url) => url === "/api/stores/loja-b/settings" ? new Promise((_resolve, reject) => { fail = reject }) : undefined)
    mount()
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    fireEvent.click(screen.getByRole("button", { name: "loja-b" }))
    await act(async () => { window.dispatchEvent(new Event("pagehide")); fail(new Error("Navigation canceled fetch")) })
    expect(localStorage.getItem("assistec-pro-loja-ativa-v1")).toBe("loja-b")
    expect(document.cookie).toContain("assistec-active-store=loja-b")
    expect(window.alert).not.toHaveBeenCalled()
  })
  it("falha atrasada de B não reverte a seleção mais recente C", async () => {
    let fail!: (error: Error) => void
    network((url) => url === "/api/stores/loja-b/settings" ? new Promise((_resolve, reject) => { fail = reject }) : undefined)
    mount()
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    fireEvent.click(screen.getByRole("button", { name: "loja-b" }))
    fireEvent.click(screen.getByRole("button", { name: "loja-c" }))
    await act(async () => { fail(new Error("Late response")) })
    expect(screen.getByTestId("store").textContent).toBe("loja-c")
    expect(localStorage.getItem("assistec-pro-loja-ativa-v1")).toBe("loja-c")
    expect(document.cookie).toContain("assistec-active-store=loja-c")
    expect(window.alert).not.toHaveBeenCalled()
  })
  it("loja sem módulo de catálogo/PDV não depende da sondagem de inventário", async () => {
    h.session!.user.storeModules!["loja-b"] = ["home", "reports", "settings"]
    const requests = network()
    mount()
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    fireEvent.click(screen.getByRole("button", { name: "loja-b" }))
    await waitFor(() => expect(h.update).toHaveBeenCalledOnce())
    expect(requests.mock.calls.some(([url]) => String(url).includes("/inventory"))).toBe(false)
    expect(screen.getByTestId("store").textContent).toBe("loja-b")
  })
  it("revogação de membership invalida a sondagem da identidade anterior", async () => {
    let fail!: (error: Error) => void
    network((url) => url === "/api/stores/loja-b/settings" ? new Promise((_resolve, reject) => { fail = reject }) : undefined)
    const ui = mount()
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    fireEvent.click(screen.getByRole("button", { name: "loja-c" }))
    await waitFor(() => expect(h.update).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole("button", { name: "loja-b" }))
    h.session = { ...h.session!, user: { ...h.session!.user, allowedStoreIds: ["loja-a"] } }
    ui.rerender(React.createElement(LojaAtivaProvider, null, React.createElement(Harness)))
    await waitFor(() => expect(localStorage.getItem("assistec-pro-loja-ativa-v1")).toBe("loja-a"))
    await act(async () => { fail(new Error("Old membership response")) })
    expect(localStorage.getItem("assistec-pro-loja-ativa-v1")).toBe("loja-a")
    expect(document.cookie).toContain("assistec-active-store=loja-a")
    expect(window.alert).not.toHaveBeenCalled()
  })
  it("revalidação mantém rascunho até o servidor confirmar revogação", async () => {
    const ui = mount()
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    fireEvent.change(screen.getByRole("textbox", { name: "Rascunho" }), { target: { value: "Dados ainda não salvos" } })
    h.status = "loading"
    ui.rerender(React.createElement(LojaAtivaProvider, null, React.createElement(Harness)))
    expect((screen.getByRole("textbox", { name: "Rascunho" }) as HTMLInputElement).value).toBe("Dados ainda não salvos")
    h.status = "unauthenticated"; h.session = null
    ui.rerender(React.createElement(LojaAtivaProvider, null, React.createElement(Harness)))
    expect(screen.queryByRole("textbox", { name: "Rascunho" })).toBeNull()
    expect(screen.getByText("Sua sessão foi encerrada.")).toBeTruthy()
  })
})
