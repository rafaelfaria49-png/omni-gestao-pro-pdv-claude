// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const h = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
  signInAction: vi.fn(async () => ({ error: null })),
  purgeResult: { ok: true, supported: true, deletedCaches: ["apis"], deletedEntries: 0, failedCaches: [] as string[] },
  purgeSpy: vi.fn(),
  broadcastSpy: vi.fn(),
}))

vi.mock("next-auth/react", () => ({
  signOut: h.signOut,
  useSession: () => ({ data: { user: { name: "Sintético", email: "qa@pilot.invalid" } }, status: "authenticated" }),
}))
vi.mock("@/app/actions/auth", () => ({ signInAction: h.signInAction }))
vi.mock("@/lib/auth/pwa-cache-privacy", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/pwa-cache-privacy")>()
  return {
    ...actual,
    purgeAuthenticatedBrowserCaches: (...args: unknown[]) => {
      h.purgeSpy(...args)
      return Promise.resolve(h.purgeResult)
    },
    broadcastAuthLogout: (...args: unknown[]) => {
      h.broadcastSpy(...args)
      return actual.broadcastAuthLogout()
    },
  }
})

import { SegurancaSection } from "@/components/configuracoes-v3/features/settings/sections/SegurancaSection"
import { LoginForm } from "@/app/login/login-form"

beforeEach(() => {
  sessionStorage.clear()
  h.signOut.mockClear()
  h.purgeSpy.mockClear()
  h.broadcastSpy.mockClear()
  h.purgeResult = { ok: true, supported: true, deletedCaches: ["apis"], deletedEntries: 0, failedCaches: [] }
})

afterEach(() => {
  cleanup()
})

describe("Logout e entrada em /login — limpeza de cache e tratamento honesto de falhas (Teste L)", () => {
  it("SegurancaSection limpa CacheStorage e avisa outras abas antes de chamar signOut", async () => {
    render(React.createElement(SegurancaSection))
    fireEvent.click(screen.getByRole("button", { name: "Encerrar sessão" }))

    await waitFor(() => expect(h.signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }))
    expect(h.broadcastSpy).toHaveBeenCalledTimes(1)
    expect(h.purgeSpy).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem("omni:pwa-cache-purge-retry")).toBeNull()
  })

  it("falha na limpeza do cache não bloqueia signOut do servidor e marca retry para /login", async () => {
    h.purgeResult = {
      ok: false,
      supported: true,
      deletedCaches: [],
      deletedEntries: 0,
      failedCaches: ["apis"],
    }
    render(React.createElement(SegurancaSection))
    fireEvent.click(screen.getByRole("button", { name: "Encerrar sessão" }))

    await waitFor(() => expect(h.signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }))
    expect(sessionStorage.getItem("omni:pwa-cache-purge-retry")).toBe("1")
  })

  it("LoginForm executa limpeza ao montar e exibe aviso honesto se a limpeza falhar (sem sucesso fictício)", async () => {
    h.purgeResult = {
      ok: false,
      supported: true,
      deletedCaches: [],
      deletedEntries: 0,
      failedCaches: ["apis"],
    }
    render(React.createElement(LoginForm, { showDesktopDownload: false }))

    const warning = await screen.findByRole("status")
    expect(warning.textContent).toContain("Não foi possível limpar automaticamente o cache do navegador")
    expect(h.purgeSpy).toHaveBeenCalled()
  })

  it("LoginForm não exibe alerta quando a limpeza de cache ocorre sem erro", async () => {
    render(React.createElement(LoginForm, { showDesktopDownload: false }))
    await waitFor(() => expect(h.purgeSpy).toHaveBeenCalled())
    expect(screen.queryByRole("status")).toBeNull()
  })
})
