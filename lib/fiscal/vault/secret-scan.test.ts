/**
 * GOAL-008 — Varredura automatizada de segredos (itens 11–12). Detecta senha, bytes do .pfx
 * (base64/hex), corpo da chave privada e material decodificado; e não gera falso-positivo no limpo.
 */
import { describe, it, expect } from "vitest"
import { scanForSecrets, assertNoSecretLeak, SecretLeakError, toSearchable } from "./secret-scan"
import { TEST_KEY_PLAIN_PEM, TEST_CERT_PEM } from "@/lib/fiscal/signing/__fixtures__/test-cert"

const SENHA = "SENHA-ULTRA-SECRETA-1234"
const PFX = Buffer.from("conteudo-binario-do-pfx-de-teste-para-varredura-0123456789", "utf8")

describe("scanForSecrets · detecção", () => {
  it("detecta a senha em texto", () => {
    const r = scanForSecrets(`erro ao processar: ${SENHA} (fim)`, { senha: SENHA })
    expect(r.vazou).toBe(true)
    expect(r.ocorrencias).toContain("senha")
  })

  it("detecta bytes do .pfx em base64 e hex", () => {
    expect(scanForSecrets(PFX.toString("base64"), { pfxBytes: PFX }).ocorrencias).toContain("pfx_base64")
    expect(scanForSecrets(PFX.toString("hex"), { pfxBytes: PFX }).ocorrencias).toContain("pfx_hex")
  })

  it("detecta o corpo da chave privada PEM", () => {
    const r = scanForSecrets(`dump=${TEST_KEY_PLAIN_PEM}`, { privateKeyPem: TEST_KEY_PLAIN_PEM })
    expect(r.ocorrencias).toContain("chave_privada")
  })

  it("detecta material decodificado (ex.: certificado tratado como sensível)", () => {
    const r = scanForSecrets(TEST_CERT_PEM, { materialDecodificado: TEST_CERT_PEM })
    expect(r.ocorrencias).toContain("material_decodificado")
  })

  it("procura em objetos e em Error (mensagem + stack)", () => {
    const err = new Error(`falhou com senha ${SENHA}`)
    expect(scanForSecrets(err, { senha: SENHA }).vazou).toBe(true)
    expect(scanForSecrets({ nested: { a: [SENHA] } }, { senha: SENHA }).vazou).toBe(true)
  })
})

describe("scanForSecrets · limpo (sem falso-positivo)", () => {
  it("payload sem segredo ⇒ vazou=false", () => {
    const payload = { ok: true, status: "ATIVO", cnpj: "11222333000181", fingerprint: "abcdef" }
    const r = scanForSecrets(payload, { senha: SENHA, pfxBytes: PFX, privateKeyPem: TEST_KEY_PLAIN_PEM })
    expect(r.vazou).toBe(false)
    expect(r.ocorrencias).toEqual([])
  })

  it("ignora segredos triviais (curtos demais) para não gerar ruído", () => {
    expect(scanForSecrets("status=ok", { senha: "ok" }).vazou).toBe(false)
  })
})

describe("assertNoSecretLeak", () => {
  it("lança SecretLeakError quando há vazamento; a mensagem NÃO contém o segredo", () => {
    let err: unknown
    try {
      assertNoSecretLeak(`vazou ${SENHA}`, { senha: SENHA }, "resposta-http")
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(SecretLeakError)
    expect((err as Error).message).not.toContain(SENHA)
    expect((err as SecretLeakError).ocorrencias).toContain("senha")
  })

  it("não lança quando limpo", () => {
    expect(() => assertNoSecretLeak({ ok: true }, { senha: SENHA })).not.toThrow()
  })
})

describe("toSearchable", () => {
  it("serializa Buffer como base64 e Error com stack", () => {
    expect(toSearchable(Buffer.from("abc"))).toContain(Buffer.from("abc").toString("base64"))
    expect(toSearchable(new Error("x"))).toContain("x")
  })
})
