/**
 * GOAL-008 — Validação do certificado A1 pelo cofre (ciclo, isolamento multi-loja, fail-closed, CNPJ).
 *
 * Prova: PENDENTE_VALIDACAO → ATIVO só com validação verde (statusSugerido=ATIVO); e a matriz
 * fail-closed exigida no comando (blobRef/senhaRef ausentes, senha incorreta, certificado
 * inválido/vencido, CNPJ divergente, ref de outra loja). Nenhum segredo no resultado.
 */
import { describe, it, expect } from "vitest"
import { EnvVault } from "./env-vault"
import { canonicalEnvRef } from "./fiscal-secret-vault"
import { validarCertificadoLoja } from "./certificado-validacao"
import { scanForSecrets } from "./secret-scan"
import { makeTestPfx, expiredTestPfx, TEST_PFX_PRIVATE_KEY_PEM } from "./__fixtures__/make-test-pfx"

const CNPJ_LOJA = "11.222.333/0001-81" // dígitos: 11222333000181

function seedVault(storeId: string, pfx: Buffer, senha: string) {
  const blobRef = canonicalEnvRef("pfx", storeId)
  const senhaRef = canonicalEnvRef("senha", storeId)
  const env: Record<string, string | undefined> = {
    [blobRef]: pfx.toString("base64"),
    [senhaRef]: senha,
  }
  return { vault: new EnvVault({ env }), blobRef, senhaRef, env }
}

describe("validarCertificadoLoja · ciclo (validação verde habilita ATIVO)", () => {
  it("certificado válido + CNPJ compatível ⇒ ok=true, statusSugerido=ATIVO, vigente, cnpj confere", async () => {
    const { pfx, senha } = makeTestPfx({ cnpj: "11222333000181" })
    const { vault, blobRef, senhaRef } = seedVault("loja-1", pfx, senha)

    const r = await validarCertificadoLoja({ vault, storeId: "loja-1", blobRef, senhaRef, cnpjLoja: CNPJ_LOJA })

    expect(r.ok).toBe(true)
    expect(r.statusSugerido).toBe("ATIVO") // habilita a transição PENDENTE_VALIDACAO → ATIVO
    expect(r.validade.vigente).toBe(true)
    expect(r.cnpj).toMatchObject({ certificado: "11222333000181", loja: "11222333000181", confere: true })
    expect(r.cadeiaDisponivel).toBe(true)
    expect(r.motivos).toEqual([])
  })
})

describe("validarCertificadoLoja · fail-closed", () => {
  it("blobRef ausente ⇒ INVALIDO/blobRef_ausente (sem tocar o cofre)", async () => {
    const { pfx, senha } = makeTestPfx()
    const { vault, senhaRef } = seedVault("loja-1", pfx, senha)
    const r = await validarCertificadoLoja({ vault, storeId: "loja-1", blobRef: "", senhaRef, cnpjLoja: CNPJ_LOJA })
    expect(r.ok).toBe(false)
    expect(r.statusSugerido).toBe("INVALIDO")
    expect(r.motivos).toContain("blobRef_ausente")
  })

  it("senhaRef ausente ⇒ INVALIDO/senhaRef_ausente", async () => {
    const { pfx, senha } = makeTestPfx()
    const { vault, blobRef } = seedVault("loja-1", pfx, senha)
    const r = await validarCertificadoLoja({ vault, storeId: "loja-1", blobRef, senhaRef: null, cnpjLoja: CNPJ_LOJA })
    expect(r.motivos).toContain("senhaRef_ausente")
  })

  it("pfx inexistente no cofre ⇒ INVALIDO/pfx_ausente", async () => {
    const { pfx, senha } = makeTestPfx()
    const { blobRef, senhaRef, env } = seedVault("loja-1", pfx, senha)
    delete env[blobRef] // remove só o .pfx
    const vault = new EnvVault({ env })
    const r = await validarCertificadoLoja({ vault, storeId: "loja-1", blobRef, senhaRef, cnpjLoja: CNPJ_LOJA })
    expect(r.motivos).toContain("pfx_ausente")
  })

  it("senha incorreta no cofre ⇒ INVALIDO/senha_incorreta", async () => {
    const { pfx } = makeTestPfx({ senha: "senha-correta" })
    const { vault, blobRef, senhaRef } = seedVault("loja-1", pfx, "senha-errada")
    const r = await validarCertificadoLoja({ vault, storeId: "loja-1", blobRef, senhaRef, cnpjLoja: CNPJ_LOJA })
    expect(r.motivos).toContain("senha_incorreta")
    expect(r.statusSugerido).toBe("INVALIDO")
  })

  it("bytes inválidos ⇒ INVALIDO/certificado_invalido", async () => {
    const lixo = Buffer.from("nao-e-um-pkcs12-de-jeito-nenhum-mesmo", "utf8")
    const { vault, blobRef, senhaRef } = seedVault("loja-1", lixo, "qualquer")
    const r = await validarCertificadoLoja({ vault, storeId: "loja-1", blobRef, senhaRef, cnpjLoja: CNPJ_LOJA })
    expect(r.motivos).toContain("certificado_invalido")
  })

  it("certificado vencido ⇒ EXPIRADO/certificado_vencido, vigente=false", async () => {
    const { pfx, senha } = expiredTestPfx({ cnpj: "11222333000181" })
    const { vault, blobRef, senhaRef } = seedVault("loja-1", pfx, senha)
    const r = await validarCertificadoLoja({ vault, storeId: "loja-1", blobRef, senhaRef, cnpjLoja: CNPJ_LOJA })
    expect(r.ok).toBe(false)
    expect(r.statusSugerido).toBe("EXPIRADO")
    expect(r.motivos).toContain("certificado_vencido")
    expect(r.validade.vigente).toBe(false)
  })

  it("CNPJ divergente ⇒ INVALIDO/cnpj_divergente", async () => {
    const { pfx, senha } = makeTestPfx({ cnpj: "11222333000181" })
    const { vault, blobRef, senhaRef } = seedVault("loja-1", pfx, senha)
    const r = await validarCertificadoLoja({ vault, storeId: "loja-1", blobRef, senhaRef, cnpjLoja: "99.999.999/0001-99" })
    expect(r.ok).toBe(false)
    expect(r.cnpj.confere).toBe(false)
    expect(r.motivos).toContain("cnpj_divergente")
  })
})

describe("validarCertificadoLoja · isolamento multi-loja (ADR-0003)", () => {
  it("ref canônica de OUTRA loja ⇒ INVALIDO/ref_fora_de_escopo (não cruza lojas)", async () => {
    const { pfx, senha } = makeTestPfx()
    // Vault contém a ref da loja-2, mas validamos no escopo da loja-1.
    const refLoja2Pfx = canonicalEnvRef("pfx", "loja-2")
    const refLoja2Senha = canonicalEnvRef("senha", "loja-2")
    const vault = new EnvVault({ env: { [refLoja2Pfx]: pfx.toString("base64"), [refLoja2Senha]: senha } })
    const r = await validarCertificadoLoja({
      vault, storeId: "loja-1", blobRef: refLoja2Pfx, senhaRef: refLoja2Senha, cnpjLoja: CNPJ_LOJA,
    })
    expect(r.ok).toBe(false)
    expect(r.motivos).toContain("ref_fora_de_escopo")
  })
})

describe("validarCertificadoLoja · não vaza segredo", () => {
  it("o resultado sanitizado não contém senha, bytes do .pfx nem a chave privada", async () => {
    const senha = "SENHA-ULTRA-SECRETA-NAO-VAZAR"
    const { pfx } = makeTestPfx({ senha, cnpj: "11222333000181" })
    const bytes = Buffer.from(pfx)
    const { vault, blobRef, senhaRef } = seedVault("loja-1", pfx, senha)
    const r = await validarCertificadoLoja({ vault, storeId: "loja-1", blobRef, senhaRef, cnpjLoja: CNPJ_LOJA })
    const scan = scanForSecrets(r, { senha, pfxBytes: bytes, privateKeyPem: TEST_PFX_PRIVATE_KEY_PEM })
    expect(scan.vazou).toBe(false)
  })
})
