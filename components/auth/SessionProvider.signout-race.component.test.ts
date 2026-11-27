// @vitest-environment jsdom
import React from "react"
import type { Session } from "next-auth"
import { useSession } from "next-auth/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { SessionProvider } from "./SessionProvider"
import {
  AUTH_PRIVACY_CHANNEL,
  broadcastAuthLogout,
  isLocalSignOutInProgress,
  setLocalSignOutInProgress,
  type AuthPrivacyBroadcastMessage,
} from "@/lib/auth/pwa-cache-privacy"

function Probe() {
  const { status } = useSession()
  return React.createElement("output", null, status)
}

const activeSession = {
  user: { id: "user-loja-a", email: "caixa@pilot.invalid", role: "CAIXA", lojaId: "loja-a", sessionVersion: 0 },
  expires: "2099-01-01T00:00:00.000Z",
} as unknown as Session

beforeEach(() => {
  setLocalSignOutInProgress(false)
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  setLocalSignOutInProgress(false)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("SessionProvider — proteção contra corrida de logout na mesma aba e entre abas", () => {
  it("broadcastAuthLogout na própria aba NÃO dispara eco de getSession concorrente e aborta revalidação em andamento", async () => {
    let aborted = false
    const nextAuthMessages: unknown[] = []
    const nextAuthSpy = new BroadcastChannel("next-auth")
    nextAuthSpy.onmessage = (event) => nextAuthMessages.push(event.data)

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true
          reject(new DOMException("Aborted", "AbortError"))
        })
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    render(
      React.createElement(
        SessionProvider,
        { session: activeSession } as React.ComponentProps<typeof SessionProvider>,
        React.createElement(Probe),
      ),
    )

    // Inicia uma revalidação periódica em voo (GET /api/auth/session pendente).
    await act(async () => {
      vi.advanceTimersByTime(31_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(aborted).toBe(false)

    // Usuário clica em "Encerrar sessão" na mesma aba.
    await act(async () => {
      broadcastAuthLogout()
      vi.advanceTimersByTime(50)
    })

    // 1. A revalidação em voo foi abortada imediatamente.
    expect(aborted).toBe(true)
    expect(isLocalSignOutInProgress()).toBe(true)
    // 2. Nenhum eco para BroadcastChannel("next-auth") foi disparado na mesma aba.
    expect(nextAuthMessages).toEqual([])
    // 3. Enquanto o logout está em andamento, novos ticks não disparam GET /api/auth/session.
    await act(async () => {
      vi.advanceTimersByTime(65_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    nextAuthSpy.close()
  })

  it("duas abas autenticadas: OMNI_LOGOUT originado em OUTRA aba notifica next-auth, limpa sessão e preserva vendas offline no localStorage", async () => {
    const offlineKey = "assistec-pro-ops-v1-loja-a"
    localStorage.setItem(offlineKey, JSON.stringify({ sales: [{ id: "PDV-OFF-1", syncPending: true }] }))

    const fetchMock = vi.fn(async () => Response.json(null))
    vi.stubGlobal("fetch", fetchMock)

    render(
      React.createElement(
        SessionProvider,
        { session: activeSession } as React.ComponentProps<typeof SessionProvider>,
        React.createElement(Probe),
      ),
    )

    expect(screen.getByRole("status").textContent).toBe("authenticated")

    // Outra aba (senderTabId distinto) envia OMNI_LOGOUT via BroadcastChannel real.
    const otherTabChannel = new BroadcastChannel(AUTH_PRIVACY_CHANNEL)
    await act(async () => {
      otherTabChannel.postMessage({
        type: "OMNI_LOGOUT",
        at: Date.now(),
        senderTabId: "other-tab-id-002",
      } satisfies AuthPrivacyBroadcastMessage)
    })
    otherTabChannel.close()

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("unauthenticated"))
    // Vendas pendentes offline e dados operacionais locais NUNCA são apagados.
    expect(localStorage.getItem(offlineKey)).toContain('"PDV-OFF-1"')
    localStorage.removeItem(offlineKey)
  })

  it("após falha de rede no logout, reset de localSignOutInProgress reabilita revalidação normalmente", async () => {
    const fetchMock = vi.fn(async () => Response.json(activeSession))
    vi.stubGlobal("fetch", fetchMock)

    render(
      React.createElement(
        SessionProvider,
        { session: activeSession } as React.ComponentProps<typeof SessionProvider>,
        React.createElement(Probe),
      ),
    )

    broadcastAuthLogout()
    expect(isLocalSignOutInProgress()).toBe(true)

    setLocalSignOutInProgress(false)
    expect(isLocalSignOutInProgress()).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(31_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
