// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { StoreAdminReauthDialog } from "./store-admin-reauth-dialog"

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const SENHA = "Senha-Sintetica-Da-Admin-42"

function abrir(mode: "admin" | "employee", fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(fetchImpl)
  vi.stubGlobal("fetch", fetchMock)
  const onAuthorized = vi.fn()
  const onOpenChange = vi.fn()
  render(React.createElement(StoreAdminReauthDialog, {
    open: true, onOpenChange, onAuthorized, mode, storeId: "loja-a", sessaoId: "sessao-a",
  }))
  return { fetchMock, onAuthorized, onOpenChange }
}
const campo = () => screen.getByLabelText("Senha da administradora") as HTMLInputElement

it("ADMIN STORE envia a própria senha ao servidor, com loja e sessão, e libera só com resposta ok", async () => {
  const { fetchMock, onAuthorized } = abrir("admin", async () => Response.json({ ok: true }))
  fireEvent.change(campo(), { target: { value: SENHA } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Liberar" })) })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]!
  expect(url).toBe("/api/auth/store-admin-reauth")
  expect((init.headers as Record<string, string>)["x-assistec-loja-id"]).toBe("loja-a")
  expect(JSON.parse(String(init.body))).toEqual({ password: SENHA, sessaoId: "sessao-a" })
  expect(onAuthorized).toHaveBeenCalledTimes(1)
  expect(document.body.textContent ?? "").not.toMatch(/PIN/)
})

it("senha errada não libera e o campo é apagado da memória da tela", async () => {
  const { onAuthorized } = abrir("admin", async () => Response.json({ error: "invalid_credentials" }, { status: 401 }))
  fireEvent.change(campo(), { target: { value: SENHA } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Liberar" })) })
  expect(onAuthorized).not.toHaveBeenCalled()
  expect(screen.getByText("Senha incorreta.")).toBeTruthy()
  expect(campo().value).toBe("")
})

it("excesso de tentativas mostra espera, sem liberar", async () => {
  const { onAuthorized } = abrir("admin", async () => Response.json({ error: "rate_limited" }, { status: 429 }))
  fireEvent.change(campo(), { target: { value: "x" } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Liberar" })) })
  expect(onAuthorized).not.toHaveBeenCalled()
  expect(screen.getByText(/Muitas tentativas/)).toBeTruthy()
})

it("funcionário STORE não vê campo de senha nem PIN e nada é enviado ao servidor", async () => {
  const { fetchMock, onAuthorized } = abrir("employee", async () => Response.json({ ok: true }))
  expect(screen.queryByLabelText("Senha da administradora")).toBeNull()
  expect(document.querySelector("input")).toBeNull()
  expect(document.body.textContent ?? "").not.toMatch(/PIN|supervisor/i)
  expect(screen.getByText(/Somente a administradora da loja/)).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Entendi" })) })
  expect(fetchMock).not.toHaveBeenCalled()
  expect(onAuthorized).not.toHaveBeenCalled()
})

it("sem sessaoId local, usa a sessão ABERTA do terminal no servidor (mesma reconciliação do fechamento)", async () => {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    url.startsWith("/api/ops/caixa/sessoes") ? Response.json({ sessoes: [{ id: "sessao-servidor" }] }) : Response.json({ ok: true }))
  vi.stubGlobal("fetch", fetchMock)
  const onAuthorized = vi.fn()
  render(React.createElement(StoreAdminReauthDialog, {
    open: true, onOpenChange: vi.fn(), onAuthorized, mode: "admin", storeId: "loja-a", sessaoId: null, terminalId: "term-1",
  }))
  fireEvent.change(campo(), { target: { value: SENHA } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Liberar" })) })
  expect(fetchMock.mock.calls[0]![0]).toContain("terminalId=term-1")
  expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({ password: SENHA, sessaoId: "sessao-servidor" })
  expect(onAuthorized).toHaveBeenCalledTimes(1)
})
