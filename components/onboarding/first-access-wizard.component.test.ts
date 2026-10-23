// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const h = vi.hoisted(() => ({ store: "store-a", incomplete: true }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "synthetic", sessionVersion: 0 } } }) }))
vi.mock("next/link", () => ({ default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => React.createElement("a", { href, onClick }, children) }))
vi.mock("@/lib/loja-ativa", () => ({ ASSISTEC_STORES_SYNC_STORAGE_KEY: "store-sync", useLojaAtiva: () => ({ lojaAtivaId: h.store, lojaAtivaRaw: { nomeFantasia: h.store }, storesLoaded: true, cadastroBasicoIncompleto: h.incomplete, refreshStoresList: async () => {} }) }))
vi.mock("@/lib/use-store-business", () => ({ useStoreBusiness: () => ({ canConfigure: true, ready: true, configured: true, branch: "padaria", resource: () => ({ enabled: false }), permissions: { hubs: { cadastros: true } } }) }))
vi.mock("@/lib/store-settings-provider", () => ({ useStoreSettings: () => ({ refresh: async () => {} }) }))
import { FirstAccessWizard } from "./first-access-wizard"

beforeEach(() => { h.store = "store-a"; h.incomplete = true })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("concluir e fechar não conserva confirmação antiga quando Geral torna o cadastro incompleto de novo", async () => {
  const store = { id: "store-a", name: "Padaria sintética", cnpj: "" }
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "PUT") { Object.assign(store, JSON.parse(String(options.body))); return Response.json({ ok: true }) }
    return Response.json(url.endsWith("/settings") ? { settings: null } : { store })
  }))
  const view = render(React.createElement(FirstAccessWizard))
  await waitFor(() => expect((screen.getByLabelText("Nome da loja (nome fantasia)") as HTMLInputElement).value).toBe(store.name))
  fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "00.000.000/0001-00" } })
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }))
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }))
  fireEvent.click(screen.getByRole("button", { name: "Concluir" }))
  await screen.findByRole("heading", { name: "Dados básicos da loja concluídos" })
  h.incomplete = false
  view.rerender(React.createElement(FirstAccessWizard))
  fireEvent.click(screen.getByRole("button", { name: "Fechar" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  store.cnpj = ""; h.incomplete = true
  view.rerender(React.createElement(FirstAccessWizard))
  await waitFor(() => expect((screen.getByLabelText("CNPJ") as HTMLInputElement).value).toBe(""))
  expect(screen.queryByRole("heading", { name: "Dados básicos da loja concluídos" })).toBeNull()
  expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy()
})

it("Voltar depois na loja A não dispensa o formulário da loja B", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/settings") ? { settings: null } : { store: { id: h.store, name: h.store } })))
  const view = render(React.createElement(FirstAccessWizard))
  await screen.findByLabelText("Nome da loja (nome fantasia)")
  fireEvent.click(screen.getByRole("button", { name: "Voltar depois" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  h.store = "store-b"
  view.rerender(React.createElement(FirstAccessWizard))
  await waitFor(() => expect((screen.getByLabelText("Nome da loja (nome fantasia)") as HTMLInputElement).value).toBe("store-b"))
  expect(screen.getByTestId("first-access-store").textContent).toContain("store-b")
})

it("retomar relê os dados persistidos por Geral enquanto o assistente estava fechado", async () => {
  const store = { id: "store-a", name: "Padaria sintética", cnpj: "", phone: "111" }
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/settings") ? { settings: null } : { store })))
  render(React.createElement(FirstAccessWizard))
  await screen.findByLabelText("Nome da loja (nome fantasia)")
  fireEvent.click(screen.getByRole("button", { name: "Voltar depois" }))
  store.name = "Nome salvo em Geral"; store.phone = "222"
  fireEvent.click(screen.getByRole("button", { name: "Retomar configuração inicial" }))
  await waitFor(() => expect((screen.getByLabelText("Nome da loja (nome fantasia)") as HTMLInputElement).value).toBe(store.name))
  fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "Identificação sintética" } })
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }))
  expect((screen.getByLabelText("Telefone") as HTMLInputElement).value).toBe("222")
})
