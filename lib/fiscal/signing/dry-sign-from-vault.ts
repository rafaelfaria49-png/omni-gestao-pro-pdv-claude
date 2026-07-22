/**
 * Ponte mínima Cofre → Assinatura "a seco" (GOAL-008 · itens 1 e 10).
 *
 * Este é o ponto de integração que CONECTA o `EnvVault` (ADR-0009) ao assinador puro: resolve o
 * `.pfx`+senha por REFERÊNCIA (escopo `storeId`), abre o PKCS#12 EM MEMÓRIA (`loadPkcs12`) e assina
 * o XML sintético com `node:crypto`. "A seco" = NÃO transmite, NÃO chama SEFAZ, NÃO persiste, NÃO
 * gera DANFE. Fail-closed: referência/segredo ausente ⇒ `NfceSignError("vault_erro")`.
 *
 * Segurança: o segredo (bytes/senha/PEM) NUNCA aparece no retorno, em log ou em erro. O material PEM
 * decodificado vive só durante a assinatura e o buffer do `.pfx` é zerado em seguida.
 */
import { loadPkcs12, zeroBuffer, Pkcs12ParseError } from "../vault/pkcs12-loader"
import type { FiscalSecretVault } from "../vault/fiscal-secret-vault"
import { FiscalVaultError } from "../vault/fiscal-secret-vault"
import { signNfceXmlDetailed, loadCertificateMaterialFromPem } from "./nfce-signer"
import { NfceSignError, type SignNfceResult } from "./signer.types"

export type DrySignParams = {
  vault: FiscalSecretVault
  storeId: string
  blobRef: string | null | undefined
  senhaRef: string | null | undefined
  /** XML sintético da NFC-e a assinar (produzido pelo builder — nunca um documento real). */
  xml: string
  /** Instante de referência para a validade do certificado (default: agora). */
  agora?: Date
  /** Ignora a checagem de validade (somente prova a seco com cert de teste). Default false. */
  ignorarValidade?: boolean
}

export type DrySignResult = {
  xml: string
  referenciaId: string
  digestValue: string
  signatureValue: string
  certificadoBase64: string
  /** Metadados públicos do certificado usado (sem segredo). */
  certificado: {
    titularCn: string
    cnpj: string | null
    serialNumber: string
    fingerprintSha1: string
    notBefore: string
    notAfter: string
  }
}

/**
 * Resolve o certificado do cofre e assina o XML "a seco". Lança `NfceSignError` em falha
 * (fail-closed), sempre sem expor segredo.
 */
export async function drySignNfceFromVault(params: DrySignParams): Promise<DrySignResult> {
  const { vault, storeId, blobRef, senhaRef, xml } = params

  if (!String(blobRef ?? "").trim() || !String(senhaRef ?? "").trim()) {
    throw new NfceSignError("vault_erro", "Referência de certificado ausente (fail-closed).")
  }

  let pfx: Buffer | null = null
  let senha: string | null = null
  let material: ReturnType<typeof loadCertificateMaterialFromPem> | null = null
  try {
    try {
      pfx = await vault.getCertificadoPfx(storeId, blobRef)
      senha = await vault.getCertificadoSenha(storeId, senhaRef)
    } catch (e) {
      if (e instanceof FiscalVaultError) {
        throw new NfceSignError("vault_erro", "Falha ao resolver certificado no cofre (fail-closed).")
      }
      throw e
    }

    if (!pfx || pfx.length === 0 || !senha) {
      throw new NfceSignError("vault_erro", "Segredo do certificado ausente no cofre (fail-closed).")
    }

    let loaded
    try {
      loaded = loadPkcs12(pfx, senha)
    } catch (e) {
      if (e instanceof Pkcs12ParseError) {
        const code = e.code === "senha_invalida" ? "senha_invalida" : "certificado_invalido"
        throw new NfceSignError(code, "Certificado do cofre inválido para assinatura (fail-closed).")
      }
      throw new NfceSignError("vault_erro", "Falha ao abrir o certificado do cofre (fail-closed).")
    }

    // A chave já sai decifrada do container → o assinador recebe senha vazia.
    material = loadCertificateMaterialFromPem(loaded.privateKeyPem, loaded.certificatePem)
    const signed: SignNfceResult = signNfceXmlDetailed(xml, material, "", {
      agora: params.agora,
      ignorarValidade: params.ignorarValidade ?? false,
    })

    return {
      xml: signed.xml,
      referenciaId: signed.referenciaId,
      digestValue: signed.digestValue,
      signatureValue: signed.signatureValue,
      certificadoBase64: signed.certificadoBase64,
      certificado: {
        titularCn: loaded.meta.titularCn,
        cnpj: loaded.meta.cnpj,
        serialNumber: loaded.meta.serialNumber,
        fingerprintSha1: loaded.meta.fingerprintSha1,
        notBefore: loaded.meta.notBefore.toISOString(),
        notAfter: loaded.meta.notAfter.toISOString(),
      },
    }
  } finally {
    zeroBuffer(pfx)
    pfx = null
    senha = null
    material = null
  }
}
