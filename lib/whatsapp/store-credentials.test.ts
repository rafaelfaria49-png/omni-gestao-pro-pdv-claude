/**
 * CP3 (MULTI_LOJA-S-003 · F-04/DT-07): credenciais Meta POR LOJA no caminho de envio.
 * Unit do helper puro `resolveCredentialsFromRow` + guard estático de que o cliente Graph
 * não lê mais número/token de env global.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { resolveCredentialsFromRow } from "./store-credentials"

const ENV: Record<string, string | undefined> = {
  WHATSAPP_ACCESS_TOKEN: "tok-loja-1",
  WHATSAPP_ACCESS_TOKEN_LOJA2: "tok-loja-2",
}

describe("resolveCredentialsFromRow — credenciais Meta por loja", () => {
  it("row nulo (loja sem número ativo) → null", () => {
    expect(resolveCredentialsFromRow(null, ENV)).toBeNull()
  })

  it("número + token presentes → credenciais da loja", () => {
    expect(
      resolveCredentialsFromRow({ phoneNumberId: "111", tokenEnvKey: "WHATSAPP_ACCESS_TOKEN" }, ENV)
    ).toEqual({ phoneNumberId: "111", accessToken: "tok-loja-1" })
  })

  it("tokenEnvKey por loja resolve token distinto (multi-loja)", () => {
    expect(
      resolveCredentialsFromRow({ phoneNumberId: "222", tokenEnvKey: "WHATSAPP_ACCESS_TOKEN_LOJA2" }, ENV)
    ).toEqual({ phoneNumberId: "222", accessToken: "tok-loja-2" })
  })

  it("env do token ausente → null (não envia, sem fallback global)", () => {
    expect(
      resolveCredentialsFromRow({ phoneNumberId: "333", tokenEnvKey: "WHATSAPP_ACCESS_TOKEN_INEXISTENTE" }, ENV)
    ).toBeNull()
  })

  it("phoneNumberId ausente → null", () => {
    expect(
      resolveCredentialsFromRow({ phoneNumberId: "", tokenEnvKey: "WHATSAPP_ACCESS_TOKEN" }, ENV)
    ).toBeNull()
  })

  it("tokenEnvKey ausente → null", () => {
    expect(resolveCredentialsFromRow({ phoneNumberId: "444", tokenEnvKey: "" }, ENV)).toBeNull()
  })

  it("trim em número e token", () => {
    expect(
      resolveCredentialsFromRow({ phoneNumberId: "  555  ", tokenEnvKey: "WHATSAPP_ACCESS_TOKEN" }, {
        WHATSAPP_ACCESS_TOKEN: "  tok-x  ",
      })
    ).toEqual({ phoneNumberId: "555", accessToken: "tok-x" })
  })
})

const readSrc = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8")

describe("CP3 — caminho de envio sem credencial global", () => {
  it("lib/whatsapp.ts NÃO lê WHATSAPP_PHONE_NUMBER_ID nem WHATSAPP_ACCESS_TOKEN", () => {
    const src = readSrc("lib/whatsapp.ts")
    expect(src).not.toContain("WHATSAPP_PHONE_NUMBER_ID")
    expect(src).not.toContain("WHATSAPP_ACCESS_TOKEN")
  })

  it("whatsapp-service.ts resolve credenciais por loja antes de enviar", () => {
    expect(readSrc("lib/whatsapp/whatsapp-service.ts")).toContain("resolveStoreWhatsAppCredentials")
  })

  it("send/route.ts NÃO referencia número/token global", () => {
    const src = readSrc("app/api/whatsapp/send/route.ts")
    expect(src).not.toContain("WHATSAPP_PHONE_NUMBER_ID")
    expect(src).not.toContain("WHATSAPP_ACCESS_TOKEN")
  })
})
