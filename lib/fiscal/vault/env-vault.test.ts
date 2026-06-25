/**
 * BL-FISCAL-005 — EnvVault (cofre piloto). Resolve referências, fail-closed, multi-loja,
 * nunca expõe segredo, escrita não suportada em runtime (provisionamento manual).
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { EnvVault } from "./env-vault"
import { FiscalVaultError, canonicalEnvRef } from "./fiscal-secret-vault"

afterEach(() => vi.restoreAllMocks())

const STORE = "loja-1"
const PFX_REF = canonicalEnvRef("pfx", STORE) // FISCAL_A1_PFX_B64_LOJA_1
const SENHA_REF = canonicalEnvRef("senha", STORE)
const CSC_REF = canonicalEnvRef("csc", STORE)

function vaultWith(env: Record<string, string | undefined>) {
  return new EnvVault({ env })
}

describe("EnvVault · resolução de referências", () => {
  it("resolve .pfx (base64), senha e CSC a partir das envs nomeadas", async () => {
    const pfxBytes = Buffer.from("conteudo-pfx-fake")
    const v = vaultWith({
      [PFX_REF]: pfxBytes.toString("base64"),
      [SENHA_REF]: "senha-da-loja",
      [CSC_REF]: "token-csc-da-loja",
    })
    const pfx = await v.getCertificadoPfx(STORE, PFX_REF)
    expect(pfx?.equals(pfxBytes)).toBe(true)
    expect(await v.getCertificadoSenha(STORE, SENHA_REF)).toBe("senha-da-loja")
    expect(await v.getCscToken(STORE, CSC_REF)).toBe("token-csc-da-loja")
  })
})

describe("EnvVault · fail-closed", () => {
  it("ref vazia/nula → null (não cai em global)", async () => {
    const v = vaultWith({ [PFX_REF]: "QUFB" })
    expect(await v.getCertificadoPfx(STORE, "")).toBeNull()
    expect(await v.getCertificadoSenha(STORE, null)).toBeNull()
    expect(await v.getCscToken(STORE, undefined)).toBeNull()
  })

  it("segredo inexistente (env ausente/vazia) → null", async () => {
    const v = vaultWith({}) // nenhuma env definida
    expect(await v.getCertificadoPfx(STORE, PFX_REF)).toBeNull()
    expect(await v.getCertificadoSenha(STORE, SENHA_REF)).toBeNull()
  })

  it("storeId ausente → erro controlado (store_invalida)", async () => {
    const v = vaultWith({ [PFX_REF]: "QUFB" })
    await expect(v.getCertificadoPfx("", PFX_REF)).rejects.toMatchObject({ code: "store_invalida" })
  })
})

describe("EnvVault · multi-loja estrito", () => {
  it("rejeita ref canônica de OUTRA loja (ref_fora_de_escopo)", async () => {
    const outraRef = canonicalEnvRef("pfx", "loja-2") // FISCAL_A1_PFX_B64_LOJA_2
    const v = vaultWith({ [outraRef]: "QUFB" })
    await expect(v.getCertificadoPfx(STORE, outraRef)).rejects.toBeInstanceOf(FiscalVaultError)
    await expect(v.getCertificadoPfx(STORE, outraRef)).rejects.toMatchObject({ code: "ref_fora_de_escopo" })
  })
})

describe("EnvVault · escrita (piloto = provisionamento manual)", () => {
  it("put/revoke lançam operacao_nao_suportada sem allowWrite", async () => {
    const v = vaultWith({})
    await expect(v.putCertificadoPfx(STORE, Buffer.from("x"), "p")).rejects.toMatchObject({ code: "operacao_nao_suportada" })
    await expect(v.putCscToken(STORE, "t")).rejects.toMatchObject({ code: "operacao_nao_suportada" })
    await expect(v.revoke(STORE, PFX_REF)).rejects.toMatchObject({ code: "operacao_nao_suportada" })
  })

  it("com allowWrite (store em memória) grava e devolve refs canônicas", async () => {
    const env: Record<string, string | undefined> = {}
    const v = new EnvVault({ env, allowWrite: true })
    const { blobRef, senhaRef } = await v.putCertificadoPfx(STORE, Buffer.from("pfx"), "minha-senha")
    expect(blobRef).toBe(PFX_REF)
    expect(senhaRef).toBe(SENHA_REF)
    expect(await v.getCertificadoSenha(STORE, senhaRef)).toBe("minha-senha")
    await v.revoke(STORE, senhaRef)
    expect(await v.getCertificadoSenha(STORE, senhaRef)).toBeNull()
  })
})

describe("EnvVault · não expõe segredo em erros/log", () => {
  it("erro de escopo e store NÃO contêm o segredo", async () => {
    const segredo = "SENHA-SUPER-SECRETA-NAO-VAZAR"
    const outraRef = canonicalEnvRef("senha", "loja-9")
    const v = vaultWith({ [outraRef]: segredo })
    let erro: unknown
    try {
      await v.getCertificadoSenha(STORE, outraRef)
    } catch (e) {
      erro = e
    }
    expect(erro).toBeInstanceOf(FiscalVaultError)
    expect((erro as Error).message).not.toContain(segredo)
  })
})
