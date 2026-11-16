// @vitest-environment jsdom
// "Sair da conta" em /conta/seguranca para qualquer papel (falha da homologação: CAIXA não tinha logout).
import React from "react"
import type { Session } from "next-auth"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const h = vi.hoisted(() => ({ session: null as Session | null, signOut: vi.fn(async () => {}) }))
vi.mock("next-auth/react", () => ({ signOut: h.signOut }))
vi.mock("@/auth", () => ({ auth: async () => h.session }))
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`) }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...rest }, children) }))

import { SignOutButton } from "./SignOutButton"
import AccountSecurityPage from "@/app/conta/seguranca/page"

const user = (role: string, mustChangePassword: boolean) =>
  ({ user: { id: "u", email: "u@x.invalid", role, accessScope: "STORE", platformAuthority: false, mustChangePassword, allowedStoreIds: ["loja-a"] }, expires: "2099-01-01" }) as unknown as Session

afterEach(() => { cleanup(); h.signOut.mockClear() })

describe("SignOutButton", () => {
  it("usa o signOut oficial do NextAuth e volta ao login", () => {
    render(React.createElement(SignOutButton))
    fireEvent.click(screen.getByRole("button", { name: "Sair da conta" }))
    expect(h.signOut).toHaveBeenCalledWith({ callbackUrl: "/login" })
    expect(screen.getByRole("button", { name: "Saindo…" })).toHaveProperty("disabled", true)
  })
  it("falha de rede: avisa e libera o botão para tentar de novo", async () => {
    h.signOut.mockRejectedValueOnce(new Error("offline"))
    render(React.createElement(SignOutButton))
    fireEvent.click(screen.getByRole("button", { name: "Sair da conta" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/Não foi possível sair/)
    expect(screen.getByRole("button", { name: "Sair da conta" })).toHaveProperty("disabled", false)
  })
})

describe("/conta/seguranca", () => {
  for (const [role, must] of [["CAIXA", false], ["CAIXA", true], ["ADMIN", false], ["VENDEDOR", true]] as const) {
    it(`${role}${must ? " no primeiro acesso" : ""}: tem "Sair da conta" e nada administrativo`, async () => {
      h.session = user(role, must)
      render(await AccountSecurityPage())
      expect(screen.getByRole("button", { name: "Sair da conta" })).toBeTruthy()
      expect(screen.queryByText(/Master Console|Gestão da Rede|Configurações/)).toBeNull()
      expect(Boolean(screen.queryByRole("link", { name: "Voltar ao início" }))).toBe(!must)
    })
  }
  it("sem sessão: manda para o login (nenhum botão renderizado)", async () => {
    h.session = null
    await expect(AccountSecurityPage()).rejects.toThrow("redirect:/login")
  })
})
