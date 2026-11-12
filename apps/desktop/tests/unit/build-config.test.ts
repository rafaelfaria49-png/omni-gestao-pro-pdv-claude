import { describe, expect, it } from "vitest"
import { PRODUCTION_ORIGIN, validateBuildConfig, validateOriginForChannel, windowTitle } from "../../src/shared/build-config"

describe("validateOriginForChannel", () => {
  it("produção aceita só a origem canônica", () => {
    expect(validateOriginForChannel("production", PRODUCTION_ORIGIN)).toBe(PRODUCTION_ORIGIN)
    expect(validateOriginForChannel("production", `${PRODUCTION_ORIGIN}/`)).toBe(PRODUCTION_ORIGIN)
    expect(() => validateOriginForChannel("production", "https://omni-gestao-pi.vercel.app")).toThrow(/legado/)
    expect(() => validateOriginForChannel("production", "https://omni-gestao-pro-git-x.vercel.app")).toThrow()
    expect(() => validateOriginForChannel("production", "http://omni-gestao-pro.vercel.app")).toThrow()
  })

  it("QA nunca se passa por produção", () => {
    expect(() => validateOriginForChannel("qa", PRODUCTION_ORIGIN)).toThrow(/Produção/)
    expect(validateOriginForChannel("qa", "https://omni-gestao-pro-git-abc-team.vercel.app")).toBe(
      "https://omni-gestao-pro-git-abc-team.vercel.app",
    )
    expect(() => validateOriginForChannel("qa", "http://x.vercel.app")).toThrow(/https/)
    expect(() => validateOriginForChannel("qa", "https://evil.com")).toThrow()
    expect(() => validateOriginForChannel("qa", "https://vercel.app.evil.com")).toThrow()
    expect(() => validateOriginForChannel("qa", "https://omni-gestao-pi.vercel.app")).toThrow(/legado/)
  })

  it("development só em loopback", () => {
    expect(validateOriginForChannel("development", "http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000")
    expect(validateOriginForChannel("development", "http://localhost:3000")).toBe("http://localhost:3000")
    expect(() => validateOriginForChannel("development", "http://192.168.0.10:3000")).toThrow()
  })

  it("recusa caminho, query, credenciais e lixo", () => {
    expect(() => validateOriginForChannel("production", `${PRODUCTION_ORIGIN}/dashboard`)).toThrow(/caminho/)
    expect(() => validateOriginForChannel("production", `${PRODUCTION_ORIGIN}/?a=1`)).toThrow(/query/)
    expect(() => validateOriginForChannel("qa", "https://u:p@x.vercel.app")).toThrow(/credenciais/)
    expect(() => validateOriginForChannel("production", "")).toThrow()
    expect(() => validateOriginForChannel("production", 42)).toThrow()
  })
})

describe("validateBuildConfig", () => {
  it("canal inválido falha", () => {
    expect(() => validateBuildConfig({ channel: "staging", origin: PRODUCTION_ORIGIN })).toThrow()
    expect(() => validateBuildConfig(null)).toThrow()
  })
  it("manifesto de atualização precisa estar na mesma origem e em https", () => {
    expect(() =>
      validateBuildConfig({ channel: "production", origin: PRODUCTION_ORIGIN, updateManifestUrl: "https://evil.com/m.json" }),
    ).toThrow(/mesma origem/)
    const ok = validateBuildConfig({
      channel: "production",
      origin: PRODUCTION_ORIGIN,
      updateManifestUrl: `${PRODUCTION_ORIGIN}/desktop/production.json`,
    })
    expect(ok.updateManifestUrl).toBe(`${PRODUCTION_ORIGIN}/desktop/production.json`)
    expect(validateBuildConfig({ channel: "production", origin: PRODUCTION_ORIGIN }).updateManifestUrl).toBeNull()
  })
})

describe("windowTitle", () => {
  it("QA aparece identificado no título", () => {
    expect(windowTitle({ channel: "production", origin: PRODUCTION_ORIGIN })).toBe("OmniGestão Pro")
    expect(windowTitle({ channel: "qa", origin: "https://x-git-y.vercel.app" })).toBe("OmniGestão Pro — QA (x-git-y.vercel.app)")
  })
})
