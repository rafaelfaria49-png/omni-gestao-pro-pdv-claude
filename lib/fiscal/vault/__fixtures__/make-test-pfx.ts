/**
 * Fábrica de `.pfx` de TESTE (GOAL-008) — descartável, SEM VALOR FISCAL.
 *
 * Gera containers PKCS#12 em memória a partir da chave RSA-2048 de teste já existente
 * (`TEST_KEY_PLAIN_PEM`), variando subject/CNPJ/validade/senha para exercitar o ciclo e o
 * fail-closed. NÃO usa OpenSSL CLI; NÃO grava arquivo; NÃO é resolvido pelo cofre real; NÃO deve
 * emitir nada. Reaproveita a chave (sem keygen) para manter os testes rápidos e determinísticos.
 */
import forge from "node-forge"
import { TEST_KEY_PLAIN_PEM } from "@/lib/fiscal/signing/__fixtures__/test-cert"

const basePrivateKey = forge.pki.privateKeyFromPem(TEST_KEY_PLAIN_PEM)
const basePublicKey = forge.pki.setRsaPublicKey(basePrivateKey.n, basePrivateKey.e)

/** PEM da chave privada de teste (para varredura de segredo nos testes). */
export const TEST_PFX_PRIVATE_KEY_PEM = TEST_KEY_PLAIN_PEM

export type MakeTestPfxOptions = {
  cn?: string
  /** 14 dígitos anexados ao CN no estilo ICP `RAZAO:CNPJ`. `null` = sem CNPJ. */
  cnpj?: string | null
  senha?: string
  notBefore?: Date
  notAfter?: Date
}

export type TestPfx = {
  pfx: Buffer
  senha: string
  cnpj: string | null
  cn: string
  notBefore: Date
  notAfter: Date
}

/** Constrói um `.pfx` de teste conforme as opções. */
export function makeTestPfx(opts: MakeTestPfxOptions = {}): TestPfx {
  const cn = opts.cn ?? "RAFACELL COMERCIO LTDA"
  const cnpj = opts.cnpj === undefined ? "11222333000181" : opts.cnpj
  const senha = opts.senha ?? "senha-pfx-teste"
  const now = Date.now()
  const notBefore = opts.notBefore ?? new Date(now - 24 * 60 * 60 * 1000)
  const notAfter = opts.notAfter ?? new Date(now + 365 * 24 * 60 * 60 * 1000)

  const cert = forge.pki.createCertificate()
  cert.publicKey = basePublicKey
  cert.serialNumber = "0" + Math.floor(Math.random() * 1e15).toString(16)
  cert.validity.notBefore = notBefore
  cert.validity.notAfter = notAfter
  const cnValue = cnpj ? `${cn}:${cnpj}` : cn
  const attrs = [{ name: "commonName", value: cnValue }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(basePrivateKey, forge.md.sha256.create())

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(basePrivateKey, [cert], senha, { algorithm: "3des" })
  const der = forge.asn1.toDer(p12Asn1).getBytes()
  return { pfx: Buffer.from(der, "binary"), senha, cnpj, cn, notBefore, notAfter }
}

/** `.pfx` válido com CNPJ padrão. */
export function validTestPfx(overrides: MakeTestPfxOptions = {}): TestPfx {
  return makeTestPfx(overrides)
}

/** `.pfx` já vencido (para o cenário fail-closed de certificado expirado). */
export function expiredTestPfx(overrides: MakeTestPfxOptions = {}): TestPfx {
  const now = Date.now()
  return makeTestPfx({
    notBefore: new Date(now - 800 * 24 * 60 * 60 * 1000),
    notAfter: new Date(now - 10 * 24 * 60 * 60 * 1000),
    ...overrides,
  })
}
