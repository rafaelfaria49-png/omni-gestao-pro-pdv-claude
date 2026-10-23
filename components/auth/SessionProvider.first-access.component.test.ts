// @vitest-environment jsdom
import React from "react"
import type { Session } from "next-auth"
import { useSession } from "next-auth/react"
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SessionProvider } from "./SessionProvider"

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function Probe() {
  const { data, status } = useSession()
  return React.createElement("div", null,
    React.createElement("output", null, JSON.stringify({ status, id: data?.user?.id, version: data?.user?.sessionVersion })),
    React.createElement("input", { "aria-label": "Rascunho" }))
}
const tree = (session: Session | null) => React.createElement(SessionProvider, { session }, React.createElement(Probe))
it("a sessão nula da tela de login dá lugar à identidade autenticada recebida do servidor", () => {
  const view = render(tree(null))
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({ status: "unauthenticated" })
  const session = { user: { id: "synthetic-store", sessionVersion: 0 }, expires: "2099-01-01" } as Session
  view.rerender(tree(session))
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({ status: "authenticated", id: "synthetic-store", version: 0 })
  fireEvent.change(screen.getByRole("textbox", { name: "Rascunho" }), { target: { value: "Digitado" } })
  view.rerender(tree({ ...session, user: { ...session.user, name: "Nome relido" } }))
  expect((screen.getByRole("textbox", { name: "Rascunho" }) as HTMLInputElement).value).toBe("Digitado")
  view.rerender(tree({ ...session, user: { ...session.user, sessionVersion: 1 } }))
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({ status: "authenticated", id: "synthetic-store", version: 1 })
  view.rerender(tree(null))
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({ status: "unauthenticated" })
})
