/**
 * Assinador XMLDSig da NFC-e (BL-FISCAL-005 · TAREFA 4/5) — PURO e DORMENTE.
 *
 * `signNfceXml(xml, certificado, senha?)` assina o XML produzido em BL-FISCAL-004 (envelopada,
 * Reference ao `infNFe`, digest SHA-256, RSA-SHA256). NÃO transmite, NÃO chama SEFAZ, NÃO integra
 * provider, NÃO gera DANFE, NÃO toca PDV/Venda/Caixa/Financeiro. Usa apenas `node:crypto` + o
 * canonicalizador local — sem banco/Prisma/fetch/Next.
 *
 * Segredo: a chave privada/senha entram por parâmetro (a orquestração as resolve via
 * `FiscalSecretVault`/ADR-0009). NUNCA são logados nem aparecem em mensagens de erro.
 */

import { X509Certificate, createPrivateKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto"
import {
  attrOf,
  canonicalizeElement,
  findFirst,
  parseXml,
  textOf,
  type C14nElement,
} from "./c14n"
import {
  buildSignatureXml,
  buildSignedInfoXml,
  canonicalizeSignedInfo,
  digestInfNFe,
  insertSignatureIntoNFe,
  locateInfNFe,
  nfeDefaultNs,
  sha256Base64,
} from "./xmldsig-builder"
import {
  DSIG_NS,
  NfceSignError,
  type FiscalCertificateMaterial,
  type SignNfceOptions,
  type SignNfceResult,
  type VerifyNfceResult,
} from "./signer.types"

type LoadedMaterial = {
  privateKey: ReturnType<typeof createPrivateKey>
  certificate: X509Certificate
  certBase64: string
}

/** Quebra base64 em linhas de 64 chars (reconstrução de PEM a partir do X509Data). */
function wrap64(b64: string): string {
  return b64.replace(/\s+/g, "").replace(/(.{64})/g, "$1\n").trim()
}

function certPemFromBase64(b64: string): string {
  return `-----BEGIN CERTIFICATE-----\n${wrap64(b64)}\n-----END CERTIFICATE-----\n`
}

/** Carrega chave privada + certificado do material PEM, mapeando falhas (sem expor segredo). */
function loadMaterial(material: FiscalCertificateMaterial | null | undefined, senha: string): LoadedMaterial {
  if (!material || !material.privateKeyPem?.trim() || !material.certificatePem?.trim()) {
    throw new NfceSignError("material_ausente", "Material do certificado ausente (chave privada/certificado).")
  }

  let certificate: X509Certificate
  try {
    certificate = new X509Certificate(material.certificatePem)
  } catch {
    throw new NfceSignError("certificado_invalido", "Certificado X.509 inválido ou ilegível.")
  }

  const encrypted = /ENCRYPTED/i.test(material.privateKeyPem)
  let privateKey: ReturnType<typeof createPrivateKey>
  try {
    privateKey = encrypted
      ? createPrivateKey({ key: material.privateKeyPem, passphrase: senha })
      : createPrivateKey({ key: material.privateKeyPem })
  } catch {
    // Em chave cifrada, a causa mais comum é senha incorreta/ausente.
    if (encrypted) throw new NfceSignError("senha_invalida", "Senha do certificado incorreta ou ausente.")
    throw new NfceSignError("chave_privada_invalida", "Chave privada inválida ou ilegível.")
  }

  return { privateKey, certificate, certBase64: Buffer.from(certificate.raw).toString("base64") }
}

function assertValidade(cert: X509Certificate, agora: Date): void {
  const de = new Date(cert.validFrom)
  const ate = new Date(cert.validTo)
  if (Number.isFinite(de.getTime()) && agora.getTime() < de.getTime()) {
    throw new NfceSignError("certificado_expirado", "Certificado ainda não é válido (validFrom no futuro).")
  }
  if (Number.isFinite(ate.getTime()) && agora.getTime() > ate.getTime()) {
    throw new NfceSignError("certificado_expirado", "Certificado expirado (validTo no passado).")
  }
}

/** Remove um `<Signature>...</Signature>` existente (para reassinatura). */
function stripSignature(xml: string): string {
  const start = xml.indexOf("<Signature")
  const endTag = "</Signature>"
  const end = xml.indexOf(endTag)
  if (start < 0 || end < 0) return xml
  return xml.slice(0, start) + xml.slice(end + endTag.length)
}

/** Detecta se o XML já contém uma assinatura. */
export function isNfceSigned(xml: string): boolean {
  try {
    const root = parseXml(xml)
    return findFirst(root, "Signature") !== null
  } catch {
    return false
  }
}

/** Assina e devolve o resultado detalhado (XML + digest + signatureValue + certificado). */
export function signNfceXmlDetailed(
  xml: string,
  certificado: FiscalCertificateMaterial,
  senha = "",
  options: SignNfceOptions = {},
): SignNfceResult {
  if (typeof xml !== "string" || xml.trim() === "") {
    throw new NfceSignError("xml_invalido", "XML vazio ou inválido.")
  }

  let working = xml
  let root: C14nElement
  try {
    root = parseXml(working)
  } catch {
    throw new NfceSignError("xml_invalido", "XML mal-formado.")
  }

  if (findFirst(root, "Signature")) {
    if (!options.permitirReassinatura) {
      throw new NfceSignError("ja_assinado", "XML já contém assinatura (use permitirReassinatura para reassinar).")
    }
    working = stripSignature(working)
    root = parseXml(working)
  }

  if (findFirst(root, "NFe") == null && root.name !== "NFe") {
    throw new NfceSignError("xml_invalido", "Documento não é uma NFe (elemento <NFe> ausente).")
  }

  const located = locateInfNFe(root)
  if (!located) throw new NfceSignError("sem_infnfe", "Elemento <infNFe> não encontrado.")
  if (!located.id) throw new NfceSignError("infnfe_sem_id", "<infNFe> sem atributo Id (Id=\"NFe...\").")

  const { privateKey, certificate, certBase64 } = loadMaterial(certificado, senha)
  if (!options.ignorarValidade) assertValidade(certificate, options.agora ?? new Date())
  if (!certificate.checkPrivateKey(privateKey)) {
    throw new NfceSignError("chave_incompativel", "A chave privada não corresponde ao certificado informado.")
  }

  // 1) Digest do infNFe canonicalizado.
  const digestValue = digestInfNFe(root, located.el)
  // 2) SignedInfo + canonicalização.
  const signedInfoXml = buildSignedInfoXml(located.id, digestValue)
  const signedInfoCanon = canonicalizeSignedInfo(signedInfoXml, DSIG_NS)
  // 3) Assinatura RSA-SHA256 (PKCS#1 v1.5 — determinística) do SignedInfo canonicalizado.
  let signatureValue: string
  try {
    signatureValue = cryptoSign("sha256", Buffer.from(signedInfoCanon, "utf8"), privateKey).toString("base64")
  } catch {
    throw new NfceSignError("chave_privada_invalida", "Falha ao assinar com a chave privada.")
  }
  // 4) Signature + envelopamento.
  const signatureXml = buildSignatureXml({ signedInfoXml, signatureValue, certificadoBase64: certBase64 })
  const signedXml = insertSignatureIntoNFe(working, signatureXml)

  return { xml: signedXml, referenciaId: located.id, digestValue, signatureValue, certificadoBase64: certBase64 }
}

/**
 * Assina o XML da NFC-e e devolve o XML ASSINADO (string). Pura: mesmos
 * (xml, certificado, senha) ⇒ mesma saída (RSA PKCS#1 v1.5 é determinístico).
 */
export function signNfceXml(
  xml: string,
  certificado: FiscalCertificateMaterial,
  senha = "",
  options: SignNfceOptions = {},
): string {
  return signNfceXmlDetailed(xml, certificado, senha, options).xml
}

/**
 * Verifica a assinatura de um XML NFC-e assinado: recomputa o digest do `infNFe` e confere o
 * `SignatureValue` (RSA-SHA256) contra a chave pública do `X509Certificate` embutido.
 * Não valida cadeia ICP/SEFAZ (fora de escopo): apenas integridade/autoconsistência do XMLDSig.
 */
export function verifyNfceSignature(xml: string): VerifyNfceResult {
  const problemas: string[] = []
  let root: C14nElement
  try {
    root = parseXml(xml)
  } catch {
    return { valido: false, assinado: false, digestConfere: false, assinaturaConfere: false, referenciaId: null, problemas: ["xml_invalido"] }
  }

  const signature = findFirst(root, "Signature")
  if (!signature) {
    return { valido: false, assinado: false, digestConfere: false, assinaturaConfere: false, referenciaId: null, problemas: ["nao_assinado"] }
  }

  const signedInfo = findFirst(signature, "SignedInfo")
  const reference = signedInfo ? findFirst(signedInfo, "Reference") : null
  const digestValue = textOf(signedInfo ? findFirst(signedInfo, "DigestValue") : null)
  const signatureValue = textOf(findFirst(signature, "SignatureValue"))
  const certB64 = textOf(findFirst(signature, "X509Certificate"))
  const referenciaId = (attrOf(reference, "URI") || "").replace(/^#/, "") || null

  if (!signedInfo || !digestValue || !signatureValue || !certB64) {
    return { valido: false, assinado: true, digestConfere: false, assinaturaConfere: false, referenciaId, problemas: ["assinatura_incompleta"] }
  }

  // 1) Digest do infNFe.
  let digestConfere = false
  const infNFe = findFirst(root, "infNFe")
  if (infNFe) {
    const recomputed = sha256Base64(canonicalizeElement(infNFe, nfeDefaultNs(root)))
    digestConfere = recomputed === digestValue
  }
  if (!digestConfere) problemas.push("digest_invalido")

  // 2) SignatureValue sobre o SignedInfo canonicalizado.
  let assinaturaConfere = false
  try {
    const inheritedNs = attrOf(signature, "xmlns") || DSIG_NS
    const canon = canonicalizeElement(signedInfo, inheritedNs)
    const pub = new X509Certificate(certPemFromBase64(certB64)).publicKey
    assinaturaConfere = cryptoVerify("sha256", Buffer.from(canon, "utf8"), pub, Buffer.from(signatureValue, "base64"))
  } catch {
    assinaturaConfere = false
  }
  if (!assinaturaConfere) problemas.push("assinatura_invalida")

  return {
    valido: digestConfere && assinaturaConfere,
    assinado: true,
    digestConfere,
    assinaturaConfere,
    referenciaId,
    problemas,
  }
}

/** Carrega material a partir de PEMs (conveniência pura — sem I/O). */
export function loadCertificateMaterialFromPem(privateKeyPem: string, certificatePem: string): FiscalCertificateMaterial {
  return { privateKeyPem, certificatePem }
}
