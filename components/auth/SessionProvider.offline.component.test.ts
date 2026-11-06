// @vitest-environment jsdom
/** PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001 — falha de rede não encerra a sessão; logout real encerra. */
import React from "react"
import type { Session } from "next-auth"
import { useSession } from "next-auth/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { SessionProvider } from "./SessionProvider"

let online = true
beforeEach(() => {
  online = true
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

function Probe() {
  const { status } = useSession()
  return React.createElement("output", null, status)
}
const session = { user: { id: "synthetic-store", sessionVersion: 0 }, expires: "2099-01-01" } as Session
const mount = () => render(React.createElement(SessionProvider, { session } as React.ComponentProps<typeof SessionProvider>, React.createElement(Probe)))
const status = () => screen.getByRole("status").textContent

it("rede caída (fetch falha) no ciclo de revalidação mantém a sessão — o PDV não some", async () => {
  const fetchMock = vi.fn(async () => { throw new TypeError("Failed to fetch") })
  vi.stubGlobal("fetch", fetchMock)
  mount()
  expect(status()).toBe("authenticated")
  await act(async () => { vi.advanceTimersByTime(31_000) })
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")) })
  expect(fetchMock).toHaveBeenCalled()
  expect(status()).toBe("authenticated")
})

it("navegador offline nem consulta; 5xx também é inconclusivo", async () => {
  online = false
  const fetchMock = vi.fn(async () => new Response("erro", { status: 503 }))
  vi.stubGlobal("fetch", fetchMock)
  mount()
  await act(async () => { vi.advanceTimersByTime(31_000) })
  expect(fetchMock).not.toHaveBeenCalled()
  online = true
  await act(async () => { vi.advanceTimersByTime(31_000) })
  expect(fetchMock).toHaveBeenCalled()
  expect(status()).toBe("authenticated")
})

it("mudança de papel/lojas no servidor também faz o NextAuth reler (não só id/versão)", async () => {
  const fetchMock = vi.fn(async () => Response.json({ ...session, user: { ...session.user, role: "OPERADOR" } }))
  vi.stubGlobal("fetch", fetchMock)
  mount()
  await act(async () => { vi.advanceTimersByTime(31_000) })
  // Revalidação + releitura pelo NextAuth (canal "next-auth").
  await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2))
})

it("servidor responde sem sessão (logout/revogação): o NextAuth relê e a sessão termina", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(null)))
  mount()
  expect(status()).toBe("authenticated")
  await act(async () => { vi.advanceTimersByTime(31_000) })
  await waitFor(() => expect(status()).toBe("unauthenticated"))
})
