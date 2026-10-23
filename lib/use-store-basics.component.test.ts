// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useStoreBasics, useStoreBasicsScope } from "./use-store-basics"

const context = vi.hoisted(() => ({ storeId: "store-a", user: "user-a", version: 0 }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: context.user, sessionVersion: context.version } } }) }))
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: context.storeId }) }))

function Editor({ storeId, requireCnpj = false }: { storeId: string; requireCnpj?: boolean }) {
  const e = useStoreBasics(storeId)
  return React.createElement("div", null,
    React.createElement("input", { "aria-label": "Nome", disabled: e.loading || e.saving || !e.draft, value: e.draft?.name ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => e.setField("name", event.target.value) }),
    React.createElement("input", { "aria-label": "Contato", disabled: e.loading || e.saving || !e.draft, value: e.draft?.contactEmail ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => e.setField("contactEmail", event.target.value) }),
    React.createElement("input", { "aria-label": "CNPJ", disabled: e.loading || e.saving || !e.draft, value: e.draft?.cnpj ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => e.setField("cnpj", event.target.value) }),
    React.createElement("button", { onClick: () => void e.save(requireCnpj), disabled: e.loading }, "Salvar"),
    React.createElement("output", null, e.message))
}
function Scope() {
  const { storeId, scope } = useStoreBasicsScope()
  return React.createElement(Editor, { key: scope, storeId })
}
const json = (value: unknown) => Response.json(value)
const input = (label: string) => screen.getByRole("textbox", { name: label }) as HTMLInputElement
afterEach(() => { cleanup(); vi.unstubAllGlobals(); context.storeId = "store-a"; context.user = "user-a"; context.version = 0 })

describe("Editor de dados básicos — ciclo real do hook", () => {
  it.each(["name", "cnpj"])("não confirma campo obrigatório %s limpo remotamente enquanto outro campo é editado", async (key) => {
    const store = { id: context.storeId, name: "Persistido", cnpj: "Identificação persistida" }
    const settings = { storeId: context.storeId, contactEmail: "old@synthetic.invalid" }
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PUT") { Object.assign(url.endsWith("/settings") ? settings : store, JSON.parse(String(options.body))); return json({ ok: true }) }
      return json(url.endsWith("/settings") ? { settings } : { store })
    }))
    render(React.createElement(Editor, { storeId: context.storeId, requireCnpj: true }))
    await waitFor(() => expect(input("Nome").disabled).toBe(false))
    fireEvent.change(input("Contato"), { target: { value: "novo@synthetic.invalid" } })
    store[key as "name" | "cnpj"] = ""
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/dados básicos incompletos/))
    expect(input(key === "name" ? "Nome" : "CNPJ").value).toBe("")
    expect(input("Contato").value).toBe("novo@synthetic.invalid")
  })
  it("espera loja e contatos e não reidrata digitação após nova renderização", async () => {
    let release!: (response: Response) => void
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/settings") ? new Promise<Response>((resolve) => { release = resolve }) : json({ store: { id: context.storeId, name: "Persistido" } })))
    const view = render(React.createElement(Scope))
    expect(input("Nome").disabled).toBe(true)
    await act(async () => release(json({ settings: { storeId: context.storeId, contactEmail: "saved@synthetic.invalid" } })))
    expect(input("Contato").value).toBe("saved@synthetic.invalid")
    fireEvent.change(input("Nome"), { target: { value: "Digitado" } })
    view.rerender(React.createElement(Scope))
    expect(input("Nome").value).toBe("Digitado")
  })
  it.each(["store", "identity", "version"])("troca de %s invalida leitura tardia e descarta rascunho", async (kind) => {
    let release!: (response: Response) => void
    let first = true
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (!url.endsWith("/settings") && first) { first = false; return new Promise<Response>((resolve) => { release = resolve }) }
      return json(url.endsWith("/settings") ? { settings: { storeId: context.storeId, contactEmail: `${context.user}@synthetic.invalid` } } : { store: { id: context.storeId, name: "Atual" } })
    }))
    const view = render(React.createElement(Scope))
    if (kind === "store") context.storeId = "store-b"
    if (kind === "identity") context.user = "user-b"
    if (kind === "version") context.version++
    view.rerender(React.createElement(Scope))
    await waitFor(() => expect(input("Nome").value).toBe("Atual"))
    fireEvent.change(input("Nome"), { target: { value: "Edição atual" } })
    await act(async () => release(json({ store: { id: "store-a", name: "Resposta velha" } })))
    expect(input("Nome").value).toBe("Edição atual")
  })
  it("duplo clique inicia uma só tentativa e mantém o contato digitado após falha parcial", async () => {
    const store = { id: context.storeId, name: "Persistido" }
    const settings = { storeId: context.storeId, contactEmail: "old@synthetic.invalid" }
    let release!: () => void
    let count = 0
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        count++
        if (url.endsWith("/settings")) return new Response("{}", { status: 500 })
        await new Promise<void>((resolve) => { release = resolve })
        Object.assign(store, JSON.parse(String(options.body)))
        return json({ ok: true })
      }
      return json(url.endsWith("/settings") ? { settings } : { store })
    }))
    render(React.createElement(Scope))
    await waitFor(() => expect(input("Nome").disabled).toBe(false))
    fireEvent.change(input("Nome"), { target: { value: "Nome novo" } })
    fireEvent.change(input("Contato"), { target: { value: "novo@synthetic.invalid" } })
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
    await waitFor(() => expect(count).toBe(1))
    await act(async () => release())
    expect(count).toBe(2)
    expect(screen.getByRole("status").textContent).toMatch(/incompleto/)
    expect(input("Nome").value).toBe("Nome novo")
    expect(input("Contato").value).toBe("novo@synthetic.invalid")
  })
})
