import { describe, expect, it } from "vitest"
import { classifyLoadFailure, hasForbiddenDebugSwitch, parseSquirrelEvent } from "../../src/shared/startup"
import { compareSemver, isUpdateAvailable, parseUpdateManifest } from "../../src/shared/update-manifest"
import { isAuthSessionCookie } from "../../src/main/privacy"

describe("Squirrel", () => {
  it("lê o evento do segundo argumento", () => {
    expect(parseSquirrelEvent(["app.exe", "--squirrel-install", "0.1.0"])).toBe("install")
    expect(parseSquirrelEvent(["app.exe", "--squirrel-uninstall"])).toBe("uninstall")
    expect(parseSquirrelEvent(["app.exe", "--squirrel-firstrun"])).toBe("firstrun")
    expect(parseSquirrelEvent(["app.exe"])).toBeNull()
    expect(parseSquirrelEvent(["app.exe", "--outra"])).toBeNull()
  })
})

describe("porta de depuração", () => {
  it("produção recusa; QA permite (E2E do pacote)", () => {
    const argv = ["app.exe", "--remote-debugging-port=9222"]
    expect(hasForbiddenDebugSwitch(argv, "production")).toBe(true)
    expect(hasForbiddenDebugSwitch(["app.exe", "--inspect"], "production")).toBe(true)
    expect(hasForbiddenDebugSwitch(["app.exe", "--remote-debugging-pipe"], "production")).toBe(true)
    expect(hasForbiddenDebugSwitch(argv, "qa")).toBe(false)
    expect(hasForbiddenDebugSwitch(["app.exe"], "production")).toBe(false)
  })
})

describe("falhas de carregamento", () => {
  it("separa offline, certificado, cancelado e outros", () => {
    expect(classifyLoadFailure(-106)).toBe("offline")
    expect(classifyLoadFailure(-105)).toBe("offline")
    expect(classifyLoadFailure(-102)).toBe("offline")
    expect(classifyLoadFailure(-3)).toBe("ignored")
    expect(classifyLoadFailure(-202)).toBe("certificate")
    expect(classifyLoadFailure(-201)).toBe("certificate")
    expect(classifyLoadFailure(-324)).toBe("other")
  })
})

describe("manifesto de atualização", () => {
  const base = {
    channel: "production",
    version: "0.2.0",
    downloadPageUrl: "https://omni-gestao-pro.vercel.app/desktop",
    sha256: "a".repeat(64),
    signed: true,
  }
  it("compara semver", () => {
    expect(compareSemver("0.2.0", "0.1.9")).toBe(1)
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0)
    expect(compareSemver("0.10.0", "0.9.0")).toBe(1)
    expect(() => compareSemver("1.0", "1.0.0")).toThrow()
  })
  it("aceita manifesto válido e detecta versão nova", () => {
    const m = parseUpdateManifest(base, "production")
    expect(isUpdateAvailable(m, "0.1.0")).toBe(true)
    expect(isUpdateAvailable(m, "0.2.0")).toBe(false)
  })
  it("recusa outro canal, binário sem assinatura em produção, página insegura e hash ruim", () => {
    expect(() => parseUpdateManifest({ ...base, channel: "qa" }, "production")).toThrow(/canal/)
    expect(() => parseUpdateManifest({ ...base, signed: false }, "production")).toThrow(/assinado/)
    expect(parseUpdateManifest({ ...base, channel: "qa", signed: false }, "qa").signed).toBe(false)
    expect(() => parseUpdateManifest({ ...base, downloadPageUrl: "http://x.com" }, "production")).toThrow()
    expect(() => parseUpdateManifest({ ...base, sha256: "xyz" }, "production")).toThrow(/sha256/)
  })
})

describe("cookie de sessão do NextAuth", () => {
  it("reconhece o token e os pedaços", () => {
    expect(isAuthSessionCookie("authjs.session-token")).toBe(true)
    expect(isAuthSessionCookie("__Secure-authjs.session-token")).toBe(true)
    expect(isAuthSessionCookie("__Secure-authjs.session-token.1")).toBe(true)
    expect(isAuthSessionCookie("authjs.csrf-token")).toBe(false)
    expect(isAuthSessionCookie("assistec_staff_session")).toBe(false)
  })
})
