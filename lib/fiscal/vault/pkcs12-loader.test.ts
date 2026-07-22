/**
 * GOAL-008 — Leitor PKCS#12 seguro (.pfx A1 → PEM). Cobre parse válido, metadados via node:crypto,
 * fail-closed (senha/formato/vazio), zeragem de buffer e ausência de segredo em erros.
 */
import { describe, it, expect } from "vitest"
import { X509Certificate, createPrivateKey } from "node:crypto"
import { loadPkcs12, Pkcs12ParseError, zeroBuffer } from "./pkcs12-loader"
import { makeTestPfx, TEST_PFX_PRIVATE_KEY_PEM } from "./__fixtures__/make-test-pfx"
import { scanForSecrets } from "./secret-scan"

describe("loadPkcs12 · parse válido", () => {
  it("abre um .pfx e devolve PEM consumível pelo node:crypto (chave × certificado conferem)", () => {
    const { pfx, senha } = makeTestPfx({ cn: "RAFACELL COMERCIO LTDA", cnpj: "11222333000181" })
    const material = loadPkcs12(Buffer.from(pfx), senha)

    expect(material.certificatePem).toContain("BEGIN CERTIFICATE")
    expect(material.privateKeyPem).toContain("PRIVATE KEY")
    const x509 = new X509Certificate(material.certificatePem)
    const key = createPrivateKey(material.privateKeyPem)
    expect(x509.checkPrivateKey(key)).toBe(true)
  })

  it("extrai metadados corretos (CNPJ, validade, serial, fingerprint, RSA 2048)", () => {
    const notBefore = new Date("2026-01-01T00:00:00.000Z")
    const notAfter = new Date("2030-01-01T00:00:00.000Z")
    const { pfx, senha } = makeTestPfx({ cnpj: "11222333000181", notBefore, notAfter })
    const { meta, cadeiaDisponivel } = loadPkcs12(Buffer.from(pfx), senha)

    expect(meta.cnpj).toBe("11222333000181")
    expect(meta.chavePublicaRsaBits).toBe(2048)
    expect(meta.fingerprintSha1).toMatch(/^[0-9a-f]{40}$/)
    expect(meta.serialNumber.length).toBeGreaterThan(0)
    expect(meta.notBefore.getTime()).toBe(notBefore.getTime())
    expect(meta.notAfter.getTime()).toBe(notAfter.getTime())
    expect(cadeiaDisponivel).toBe(true)
  })

  it("cnpj = null quando o certificado não tem CNPJ (ex.: cert de teste puro)", () => {
    const { pfx, senha } = makeTestPfx({ cn: "NFCE-TESTE-NAO-FISCAL", cnpj: null })
    expect(loadPkcs12(Buffer.from(pfx), senha).meta.cnpj).toBeNull()
  })
})

describe("loadPkcs12 · fail-closed", () => {
  it("buffer vazio/ausente → pfx_ausente", () => {
    expect(() => loadPkcs12(Buffer.alloc(0), "x")).toThrow(Pkcs12ParseError)
    expect(() => loadPkcs12(null, "x")).toThrowError(/pfx_ausente|ausentes/)
    try {
      loadPkcs12(Buffer.alloc(0), "x")
    } catch (e) {
      expect((e as Pkcs12ParseError).code).toBe("pfx_ausente")
    }
  })

  it("senha incorreta → senha_invalida", () => {
    const { pfx } = makeTestPfx({ senha: "senha-correta" })
    try {
      loadPkcs12(Buffer.from(pfx), "senha-errada")
      throw new Error("deveria ter lançado")
    } catch (e) {
      expect(e).toBeInstanceOf(Pkcs12ParseError)
      expect((e as Pkcs12ParseError).code).toBe("senha_invalida")
    }
  })

  it("bytes que não são PKCS#12 → formato_invalido", () => {
    const lixo = Buffer.from("isto definitivamente nao e um pkcs12 valido de jeito nenhum", "utf8")
    try {
      loadPkcs12(lixo, "x")
      throw new Error("deveria ter lançado")
    } catch (e) {
      expect(e).toBeInstanceOf(Pkcs12ParseError)
      expect((e as Pkcs12ParseError).code).toBe("formato_invalido")
    }
  })
})

describe("loadPkcs12 · higiene de segredo", () => {
  it("zera o buffer do .pfx após o parse", () => {
    const { pfx, senha } = makeTestPfx()
    const buf = Buffer.from(pfx)
    loadPkcs12(buf, senha)
    expect(buf.every((b) => b === 0)).toBe(true)
  })

  it("o erro de senha NÃO contém a senha nem os bytes do .pfx", () => {
    const senha = "SENHA-ULTRA-SECRETA-NAO-VAZAR"
    const { pfx } = makeTestPfx({ senha })
    const bytes = Buffer.from(pfx)
    let erro: unknown
    try {
      loadPkcs12(Buffer.from(pfx), "outra-senha")
    } catch (e) {
      erro = e
    }
    const scan = scanForSecrets(erro, { senha, pfxBytes: bytes })
    expect(scan.vazou).toBe(false)
  })

  it("o material devolvido não expõe a senha; metadados não contêm a chave privada", () => {
    const senha = "SENHA-ULTRA-SECRETA-NAO-VAZAR"
    const { pfx } = makeTestPfx({ senha })
    const material = loadPkcs12(Buffer.from(pfx), senha)
    const scanMeta = scanForSecrets(material.meta, { senha, privateKeyPem: TEST_PFX_PRIVATE_KEY_PEM })
    expect(scanMeta.vazou).toBe(false)
  })
})

describe("zeroBuffer", () => {
  it("zera um buffer não-vazio e ignora nulos", () => {
    const b = Buffer.from([1, 2, 3, 4])
    zeroBuffer(b)
    expect(b.every((x) => x === 0)).toBe(true)
    expect(() => zeroBuffer(null)).not.toThrow()
  })
})
