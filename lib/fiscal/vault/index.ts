/**
 * Cofre de Segredos Fiscais (BL-FISCAL-005 · ADR-0009) — ponto único de import.
 *
 * Port `FiscalSecretVault` (contrato por referência opaca) + backend `EnvVault` (piloto).
 * Server-only por natureza (lê secrets de plataforma). NUNCA expõe segredo, NUNCA persiste em
 * claro no banco, fail-closed. Produção (KmsStorageVault) implementa o MESMO contrato (futuro).
 */
export {
  FiscalVaultError,
  canonicalEnvRef,
  storeRefSuffix,
  type FiscalSecretVault,
  type FiscalVaultErrorCode,
  type FiscalCertificadoSegredo,
  type VaultRefKind,
} from "./fiscal-secret-vault"
export { EnvVault, createEnvVault, type EnvVaultOptions, type EnvLike } from "./env-vault"
