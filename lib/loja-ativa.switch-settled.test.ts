// @vitest-environment jsdom
// `setLojaAtivaId(id, { onSettled })`: o seletor de loja só reavalia a página no servidor depois que a
// sondagem CONFIRMA a loja nova (OMNI-STORE-SAFE-SWITCHER-001 · achado P2 da revisão independente).
import React from "react"
import type { Session } from "next-auth"
import type { AccessModule } from "@/lib/auth/access-policy"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const h = vi.hoisted(() => ({ session: null as Session | null, update: vi.fn(async () => {}), settled: vi.fn() }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: h.session, status: "authenticated", update: h.update }) }))
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }))
vi.mock("./config-empresa", () => {
  const empresa = { nomeFantasia: "Loja sintética", endereco: {}, identidadeVisual: { logoUrl: "" } }
  return { configPadrao: { empresa }, useConfigEmpresa: () => ({ configHydrated: true, config: { empresa, minhasLojas: { lojas: [] } } }) }
})

import {
  LojaAtivaProvider,
  registrarGuardaTrocaLoja,
  registrarGuardaTrocaLojaV4,
  useLojaAtiva,
} from "./loja-ativa"

function Harness() {
  const { lojaAtivaId, setLojaAtivaId } = useLojaAtiva()
  return React.createElement("div", null,
    React.createElement("output", { "data-testid": "store" }, lojaAtivaId),
    ...["loja-b", "loja-c"].map((id) => React.createElement("button", { key: id, onClick: () => setLojaAtivaId(id, { onSettled: (ok) => h.settled(id, ok) }) }, id)),
  )
}
const mount = () => render(React.createElement(LojaAtivaProvider, null, React.createElement(Harness)))
function network(probe?: (url: string) => Promise<{ ok: boolean }> | { ok: boolean } | undefined) {
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url === "/api/stores") return { ok: true, json: async () => ({ stores: ["loja-a", "loja-b", "loja-c"].map((id) => ({ id, name: id })) }) }
    return probe?.(url) ?? { ok: true, json: async () => ({}) }
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.cookie = "assistec-active-store=; Max-Age=0; Path=/"
  const modules: AccessModule[] = ["home", "catalog", "settings"]
  h.session = { user: { id: "synthetic", role: "ADMIN", accessScope: "STORE", platformAuthority: false, lojaId: "loja-a", storeAccess: "restricted", allowedStoreIds: ["loja-a", "loja-b", "loja-c"], storeModules: Object.fromEntries(["loja-a", "loja-b", "loja-c"].map((id) => [id, [...modules]])) }, expires: "2099-01-01" } as unknown as Session
  h.update.mockClear()
  h.settled.mockClear()
  vi.stubGlobal("alert", vi.fn())
  network()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); registrarGuardaTrocaLojaV4(null) })

describe("setLojaAtivaId · onSettled", () => {
  it("confirma só depois da sondagem da loja nova", async () => {
    let release!: () => void
    network((url) => url === "/api/stores/loja-b/settings" ? new Promise((resolve) => { release = () => resolve({ ok: true }) }) : undefined)
    mount()
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    fireEvent.click(screen.getByRole("button", { name: "loja-b" }))
    expect(screen.getByTestId("store").textContent).toBe("loja-b")
    expect(h.settled).not.toHaveBeenCalled() // estado já mudou, mas a sondagem ainda não respondeu
    await act(async () => { release() })
    await waitFor(() => expect(h.settled).toHaveBeenCalledWith("loja-b", true))
    expect(h.settled).toHaveBeenCalledOnce()
  })

  it("troca revertida (unidade indisponível) devolve false e volta para a loja anterior", async () => {
    network((url) => url === "/api/stores/loja-b/settings" ? { ok: false } : undefined)
    mount()
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    fireEvent.click(screen.getByRole("button", { name: "loja-b" }))
    await waitFor(() => expect(h.settled).toHaveBeenCalledWith("loja-b", false))
    expect(h.settled).not.toHaveBeenCalledWith("loja-b", true)
    expect(screen.getByTestId("store").textContent).toBe("loja-a")
    expect(document.cookie).toContain("assistec-active-store=loja-a")
  })

  it("troca superada por outra não confirma a antiga", async () => {
    let fail!: (e: Error) => void
    network((url) => url === "/api/stores/loja-b/settings" ? new Promise((_r, reject) => { fail = reject }) : undefined)
    mount()
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    fireEvent.click(screen.getByRole("button", { name: "loja-b" }))
    fireEvent.click(screen.getByRole("button", { name: "loja-c" }))
    await act(async () => { fail(new Error("atrasada")) })
    await waitFor(() => expect(h.settled).toHaveBeenCalledWith("loja-c", true))
    expect(h.settled.mock.calls.some(([id]) => id === "loja-b")).toBe(false)
  })

  it("barrada pela guarda da V4 (Cancelar): não troca nem confirma", async () => {
    registrarGuardaTrocaLojaV4({ temRascunhoSujo: () => true, solicitarSaida: () => "bloqueada" })
    mount()
    await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
    fireEvent.click(screen.getByRole("button", { name: "loja-b" }))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.getByTestId("store").textContent).toBe("loja-a")
    expect(h.settled).not.toHaveBeenCalled()
  })

  it("guarda adicional via registrarGuardaTrocaLoja bloqueia troca até confirmação explícita e limpa no desregistro", async () => {
    let pendingSwitch: (() => void) | null = null
    let dirty = true
    const unregister = registrarGuardaTrocaLoja({
      temRascunhoSujo: () => dirty,
      solicitarSaida: (trocar) => {
        pendingSwitch = trocar
        return "bloqueada"
      },
    })
    try {
      mount()
      await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-a"))
      fireEvent.click(screen.getByRole("button", { name: "loja-b" }))
      await act(async () => { await new Promise((r) => setTimeout(r, 40)) })
      expect(screen.getByTestId("store").textContent).toBe("loja-a")
      expect(h.settled).not.toHaveBeenCalled()
      expect(pendingSwitch).not.toBeNull()

      // Usuário confirma descarte e prossegue com a troca
      dirty = false
      await act(async () => { pendingSwitch?.() })
      await waitFor(() => expect(screen.getByTestId("store").textContent).toBe("loja-b"))
      await waitFor(() => expect(h.settled).toHaveBeenCalledWith("loja-b", true))
    } finally {
      unregister()
    }
  })
})
