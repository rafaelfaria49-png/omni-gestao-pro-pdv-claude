/**
 * Assinatura Digital A1 (XMLDSig) da NFC-e (BL-FISCAL-005 · F4) — ponto único de import. DORMENTE.
 *
 * Camada PURA que assina o XML de BL-FISCAL-004 (envelopada, digest SHA-256, RSA-SHA256). NÃO
 * transmite, NÃO chama SEFAZ, NÃO integra provider, NÃO gera DANFE, sem chamador produtivo.
 * O segredo (chave/senha) é resolvido pela orquestração via `FiscalSecretVault` (ADR-0009) e
 * entregue por parâmetro — nunca logado, nunca persistido.
 */
export {
  signNfceXml,
  signNfceXmlDetailed,
  verifyNfceSignature,
  isNfceSigned,
  loadCertificateMaterialFromPem,
} from "./nfce-signer"
export {
  DSIG_NS,
  ALG_C14N,
  ALG_ENVELOPED,
  ALG_SIGNATURE_RSA_SHA256,
  ALG_DIGEST_SHA256,
  NfceSignError,
} from "./signer.types"
export type {
  FiscalCertificateMaterial,
  SignNfceOptions,
  SignNfceResult,
  VerifyNfceResult,
  NfceSignErrorCode,
} from "./signer.types"
export {
  parseXml,
  canonicalizeElement,
  findFirst,
  findById,
  attrOf,
  textOf,
  XmlParseError,
  type C14nElement,
} from "./c14n"
