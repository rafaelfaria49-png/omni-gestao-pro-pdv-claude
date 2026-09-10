import { describe, expect, it } from "vitest"
import { decideLocalDevEntry, normalizeLocalCallbackPath } from "./local-dev-entry"

/**
 * Cenários do GOAL LOCALHOST-DEV-DIRECT-DASHBOARD-002B (seções 2, 6 e 8).
 * A matriz de "é local seguro?" (cenários B, E–I do GOAL 002) já é coberta por
 * lib/local-dev-auth-guard.test.ts — aqui está a decisão de entrada + anti open-redirect.
 */

describe("normalizeLocalCallbackPath — sem open redirect", () => {
  it("mantém caminhos relativos da própria origem", () => {
    expect(normalizeLocalCallbackPath("/dashboard")).toBe("/dashboard")
    expect(normalizeLocalCallbackPath("/dashboard/operacoes-v4-preview")).toBe(
      "/dashboard/operacoes-v4-preview"
    )
    expect(normalizeLocalCallbackPath("/login")).toBe("/login")
  })

  it("callbackUrl ausente/vazia → /dashboard", () => {
    expect(normalizeLocalCallbackPath(null)).toBe("/dashboard")
    expect(normalizeLocalCallbackPath(undefined)).toBe("/dashboard")
    expect(normalizeLocalCallbackPath("")).toBe("/dashboard")
    expect(normalizeLocalCallbackPath("   ")).toBe("/dashboard")
  })

  it("URL absoluta externa → /dashboard (nada de open redirect)", () => {
    expect(normalizeLocalCallbackPath("https://evil.example.com/rouba")).toBe("/dashboard")
    expect(normalizeLocalCallbackPath("http://localhost:3001/dashboard")).toBe("/dashboard")
  })

  it("protocol-relative e variações de escape → /dashboard", () => {
    expect(normalizeLocalCallbackPath("//evil.example.com")).toBe("/dashboard")
    expect(normalizeLocalCallbackPath("/\\evil.example.com")).toBe("/dashboard")
  })

  it.each(["/\t/evil.example.com", "/\n/evil.example.com", "/\r/evil.example.com", "/dashboard\u0000"])(
    "rejeita controles no callback: %j",
    (callback) => {
      expect(normalizeLocalCallbackPath(callback)).toBe("/dashboard")
    },
  )

  it("não-caminho (sem barra inicial) → /dashboard", () => {
    expect(normalizeLocalCallbackPath("dashboard")).toBe("/dashboard")
  })
})

describe("decideLocalDevEntry", () => {
  it("guard negado → landing (produção/flag off/host externo/banco remoto)", () => {
    expect(decideLocalDevEntry({ guardAllowed: false, hasSession: false })).toBe("landing")
    expect(decideLocalDevEntry({ guardAllowed: false, hasSession: true })).toBe("landing")
  })

  it("local seguro + sessão existente → dashboard direto", () => {
    expect(decideLocalDevEntry({ guardAllowed: true, hasSession: true })).toBe("dashboard")
  })

  it("local seguro + sem sessão → auto-login", () => {
    expect(decideLocalDevEntry({ guardAllowed: true, hasSession: false })).toBe("auto-login")
  })
})
