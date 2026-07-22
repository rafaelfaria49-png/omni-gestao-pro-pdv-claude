/**
 * Assinatura Digital A1 (XMLDSig) da NFC-e (BL-FISCAL-005 · F4) — ponto único de import. DORMENTE.
 *
 * Camada PURA que assina o XML de BL-FISCAL-004 (envelopada, digest SHA-1, RSA-SHA1 — `fixed` pelo
 * schema oficial da NF-e, ver ADR-0011). NÃO
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
  ALG_SIGNATURE_RSA_SHA1,
  ALG_DIGEST_SHA1,
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
// GOAL-008 — ponte Cofre → assinatura "a seco" (resolve o A1 do EnvVault e assina sintético).
export {
  drySignNfceFromVault,
  type DrySignParams,
  type DrySignResult,
} from "./dry-sign-from-vault"
