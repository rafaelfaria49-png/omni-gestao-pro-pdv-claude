// @vitest-environment jsdom
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { BASIC_MODULE_ACCESS } from "@/lib/auth/access-policy"
import { getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"
import { simulatedScale } from "@/test/scale-device"
import { SCALE_PROFILE } from "@/services/scale-readonly"
import { mergePrinterConfigServerSide } from "@/lib/pdv-settings-server-first"

const h = vi.hoisted(() => ({ store: "loja-a", permitted: true }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: h.store, storesRefreshNonce: 0, lojaAtivaRaw: { storeProfile: "ASSISTENCIA" } }) }))
vi.mock("@/lib/auth/use-enterprise-permissions", () => ({ useEnterprisePermissions: () => h.permitted ? getPermissionsFromSession({
  expires: "2099-01-01", user: { id: "synthetic-owner", role: "ADMIN", accessScope: "STORE", platformAuthority: false,
    allowedStoreIds: ["loja-a", "loja-b"], storeModules: { "loja-a": [...BASIC_MODULE_ACCESS.modules], "loja-b": [...BASIC_MODULE_ACCESS.modules] } },
} as unknown as Session, h.store) : { admin: { configuracoes: false } } }))
vi.mock("@/lib/pdv-mount-diagnostics", () => ({ markPdvMountStep: vi.fn() }))

import { StoreSettingsProvider } from "@/lib/store-settings-provider"
import { PdvStoreScaleVisor } from "@/components/dashboard/vendas/pdv-scale-visor"
import { PdvScaleVisorSettingsCard } from "@/components/configuracoes-v3/features/settings/sections/PdvScaleVisorSettingsCard"

type Printer = Record<string, unknown>
let records: Record<string, Printer>
let writes: Array<{ store: string; body: { printerConfig: Printer } }>
let failPut: boolean, failGet: boolean, malformedPut: boolean
let device: ReturnType<typeof simulatedScale>
function tree(showSettings = false) {
  return React.createElement(StoreSettingsProvider, null,
    showSettings ? React.createElement(PdvScaleVisorSettingsCard) : null,
    React.createElement(PdvStoreScaleVisor, { storeId: h.store }))
}
async function connect() {
  fireEvent.change(await screen.findByLabelText("Protocolo da balança"), { target: { value: SCALE_PROFILE } })
  fireEvent.click(screen.getByRole("button", { name: "Conectar balança" }))
  await screen.findByText("Conectada, aguardando leitura")
}
beforeEach(() => {
  h.store = "loja-a"; h.permitted = true
  writes = []; failPut = false; failGet = false; malformedPut = false
  const base = { pdvMainLayout: "classic", pdvParams: { pdvClassicLayout: "lovable", atalhosRapidos: [] } }
  records = {
    "loja-a": { ...base, capabilities: { version: 1, overrides: {}, business: { primaryBranch: "padaria" } } },
    "loja-b": { ...base, capabilities: { version: 1, overrides: {}, business: { primaryBranch: "comercio" } } },
  }
  device = simulatedScale()
  Object.defineProperty(navigator, "serial", { configurable: true, value: device.serial })
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const store = /\/stores\/([^/]+)\/settings/.exec(url)?.[1]
    if (!store || !records[store]) throw new Error("unexpected_url")
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body))
      writes.push({ store, body })
      if (failPut) return Response.json({ ok: false }, { status: 500 })
      if (malformedPut) return Response.json({ ok: true })
      records[store] = mergePrinterConfigServerSide(records[store], body.printerConfig, false)
      return Response.json({ ok: true, settings: { storeId: store, printerConfig: records[store] } })
    }
    if (failGet) return Response.json({ error: "unavailable" }, { status: 500 })
    return Response.json({ settings: { storeId: store, printerConfig: records[store] } })
  }))
})
afterEach(async () => {
  cleanup()
  await act(async () => {})
  localStorage.clear()
  delete navigator.serial
  vi.unstubAllGlobals()
})

describe("Provider e cartão reais com servidor/serial simulados", () => {
  it("padaria sem override vê visor desconectado; abrir o PDV não grava preferência nem pede porta", async () => {
    render(tree())
    await screen.findByTestId("pdv-scale-visor")
    expect(screen.getByText("Desconectada")).toBeTruthy()
    expect(screen.getByLabelText("Peso recebido da balança").textContent).toBe("— kg")
    expect(writes).toHaveLength(0)
    expect(device.serial.requestPort).not.toHaveBeenCalled()
  })
  it("STORE autorizado salva somente false, fecha leitura ativa e mantém após reload/reentrada/mudança de ramo", async () => {
    records["loja-a"].impressao = { viasCupom: 2 }
    render(tree(true))
    const check = await screen.findByRole("checkbox", { name: "Exibir visor de peso no PDV" })
    expect((check as HTMLInputElement).checked).toBe(true)
    await connect()
    await act(async () => device.send("ST,+0001.234 kg\r\n"))
    expect(screen.getByLabelText("Peso recebido da balança").textContent).toBe("1,234 kg")
    fireEvent.click(check)
    fireEvent.click(screen.getByRole("button", { name: "Salvar visor" }))
    await screen.findByText("Preferência do visor salva nesta unidade.")
    await waitFor(() => expect(screen.queryByTestId("pdv-scale-visor")).toBeNull())
    expect(writes).toEqual([{ store: "loja-a", body: { printerConfig: { pdvScaleVisorVisible: false } } }])
    expect(records["loja-a"].impressao).toEqual({ viasCupom: 2 })
    await waitFor(() => expect(device.port.close).toHaveBeenCalledTimes(1))
    cleanup()
    records["loja-a"].capabilities = { version: 1, overrides: {}, business: { primaryBranch: "assistencia" } }
    render(tree(true))
    await screen.findByText(/Escolha manual da unidade/)
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
    expect(screen.queryByTestId("pdv-scale-visor")).toBeNull()
    expect(writes).toHaveLength(1)
  })
  it("outra loja sem override oculta; true manual persiste em nova montagem sem copiar porta", async () => {
    h.store = "loja-b"
    render(tree(true))
    const check = await screen.findByRole("checkbox")
    expect((check as HTMLInputElement).checked).toBe(false)
    expect(screen.queryByTestId("pdv-scale-visor")).toBeNull()
    fireEvent.click(check)
    fireEvent.click(screen.getByRole("button", { name: "Salvar visor" }))
    await screen.findByTestId("pdv-scale-visor")
    cleanup()
    render(tree())
    await screen.findByTestId("pdv-scale-visor")
    expect(screen.getByText("Desconectada")).toBeTruthy()
    expect(device.serial.requestPort).not.toHaveBeenCalled()
    expect(records["loja-a"].pdvScaleVisorVisible).toBeUndefined()
  })
  it.each(["server", "malformed"])("falha %s conserva rascunho, oferece cancelar e não finge sucesso", async (kind) => {
    failPut = kind === "server"; malformedPut = kind === "malformed"
    render(tree(true))
    fireEvent.click(await screen.findByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: "Salvar visor" }))
    await screen.findByRole("alert")
    expect(screen.queryByText("Preferência do visor salva nesta unidade.")).toBeNull()
    expect(screen.getByRole("button", { name: "Salvar visor" })).toBeTruthy()
    expect(records["loja-a"].pdvScaleVisorVisible).toBeUndefined()
    fireEvent.click(screen.getByRole("button", { name: "Cancelar visor" }))
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByRole("alert")).toBeNull()
  })
  it("troca A/B descarta leitura, conexão e draft na primeira renderização; retorno não reconecta", async () => {
    records["loja-b"].pdvScaleVisorVisible = true
    const view = render(tree(true))
    await connect()
    await act(async () => device.send("ST,+00012.40 kg\r\n"))
    fireEvent.click(screen.getByRole("checkbox"))
    h.store = "loja-b"
    view.rerender(tree(true))
    expect(screen.queryByLabelText("Peso recebido da balança")).toBeNull()
    await screen.findByTestId("pdv-scale-visor")
    expect(screen.getByLabelText("Peso recebido da balança").textContent).toBe("— kg")
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByRole("button", { name: "Salvar visor" })).toBeNull()
    await waitFor(() => expect(device.port.close).toHaveBeenCalledTimes(1))
    h.store = "loja-a"
    view.rerender(tree(true))
    await screen.findByTestId("pdv-scale-visor")
    expect(screen.getByText("Desconectada")).toBeTruthy()
    expect(device.serial.requestPort).toHaveBeenCalledTimes(1)
    expect(writes).toHaveLength(0)
  })
  it("falha de carregamento não presume preferência nem conexão", async () => {
    failGet = true
    render(tree(true))
    await screen.findByText(/Configurações indisponíveis/)
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByTestId("pdv-scale-visor")).toBeNull()
    expect(device.serial.requestPort).not.toHaveBeenCalled()
  })
  it("permissão de configurações é respeitada sem exigir autoridade de plataforma", async () => {
    h.permitted = false
    render(tree(true))
    await screen.findByTestId("pdv-scale-visor")
    expect(screen.queryByText("Balança e visor de peso")).toBeNull()
    expect(writes).toHaveLength(0)
  })
  it("navegador incompatível informa e desabilita conexão", async () => {
    delete navigator.serial
    render(tree())
    await screen.findByText(/Navegador sem Web Serial/)
    expect((screen.getByRole("button", { name: "Conectar balança" }) as HTMLButtonElement).disabled).toBe(true)
  })
  it("desmontar libera reader/listeners; leituras não produzem mutações HTTP", async () => {
    const view = render(tree())
    await connect()
    await act(async () => device.send("US,+00012.40 kg\r\nST,+00012.40 kg\r\n"))
    view.unmount()
    await waitFor(() => expect(device.port.close).toHaveBeenCalledTimes(1))
    expect(device.cancel).toHaveBeenCalledTimes(1)
    expect(device.serial.removeEventListener).toHaveBeenCalledTimes(1)
    expect(writes).toHaveLength(0)
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
  })
})
