/**
 * EnvVault — backend do piloto/homologação do cofre fiscal (BL-FISCAL-005 · ADR-0009 D2).
 *
 * Resolve as referências opacas para NOMES DE VARIÁVEIS DE AMBIENTE (secrets de plataforma,
 * cifrados em repouso pela Vercel), por loja. Espelha o precedente do WhatsApp
 * (`resolveStoreWhatsAppCredentials` / `tokenEnvKey`, ADR-0006):
 *  - `blobRef`     → env com o `.pfx` em base64.
 *  - `senhaRef`    → env com a senha do `.pfx`.
 *  - `cscTokenRef` → env com o token CSC.
 *
 * Garantias: NUNCA loga o segredo; NUNCA persiste no banco; FAIL-CLOSED (ref vazia/env vazia ⇒
 * `null` ⇒ caller não emite); multi-loja estrito (rejeita ref canônica de outra loja). A escrita
 * (rotação) é MANUAL no piloto (provisionamento de secret na plataforma) → `put*`/`revoke`
 * lançam `operacao_nao_suportada`, salvo quando um store de env mutável é injetado (testes/dev).
 */

import {
  FiscalVaultError,
  canonicalEnvRef,
  storeRefSuffix,
  type FiscalSecretVault,
  type VaultRefKind,
} from "./fiscal-secret-vault"

export type EnvLike = Record<string, string | undefined>

export type EnvVaultOptions = {
  /** Fonte das variáveis (default `process.env`). */
  env?: EnvLike
  /**
   * Permite gravar no `env` injetado (apenas testes/dev com store em memória). Default false:
   * no piloto o provisionamento é manual e `put*`/`revoke` ficam fail-closed (não fingem persistir).
   */
  allowWrite?: boolean
}

function clean(v: string | null | undefined): string {
  return String(v ?? "").trim()
}

export class EnvVault implements FiscalSecretVault {
  private readonly env: EnvLike
  private readonly allowWrite: boolean

  constructor(opts: EnvVaultOptions = {}) {
    this.env = opts.env ?? (process.env as EnvLike)
    this.allowWrite = opts.allowWrite ?? false
  }

  /** Multi-loja: uma ref canônica `FISCAL_*` só vale para a própria loja (sem cruzar lojas). */
  private assertScope(storeId: string, ref: string): void {
    if (ref.startsWith("FISCAL_")) {
      const suffix = storeRefSuffix(storeId)
      if (!suffix || !ref.endsWith(`_${suffix}`)) {
        throw new FiscalVaultError(
          "ref_fora_de_escopo",
          `Referência fiscal não pertence à loja informada (esperado sufixo _${suffix}).`,
          storeId,
        )
      }
    }
  }

  /** Resolve o valor cru de uma referência (env). `null` quando vazio (fail-closed). */
  private resolveRaw(storeId: string, ref: string | null | undefined): string | null {
    const id = clean(storeId)
    if (!id) throw new FiscalVaultError("store_invalida", "storeId é obrigatório para resolver segredo fiscal.")
    const name = clean(ref)
    if (!name) return null // ref ausente → fail-closed
    this.assertScope(id, name)
    const value = clean(this.env[name])
    return value || null // env vazia → fail-closed
  }

  async getCertificadoPfx(storeId: string, blobRef: string | null | undefined): Promise<Buffer | null> {
    const b64 = this.resolveRaw(storeId, blobRef)
    if (!b64) return null
    try {
      const buf = Buffer.from(b64, "base64")
      return buf.length > 0 ? buf : null
    } catch {
      // base64 corrompido → trata como ausente (sem expor conteúdo).
      return null
    }
  }

  async getCertificadoSenha(storeId: string, senhaRef: string | null | undefined): Promise<string | null> {
    return this.resolveRaw(storeId, senhaRef)
  }

  async getCscToken(storeId: string, cscTokenRef: string | null | undefined): Promise<string | null> {
    return this.resolveRaw(storeId, cscTokenRef)
  }

  /** Escrita — só com store de env mutável injetado (allowWrite). Senão, provisionamento manual. */
  private writeOrThrow(storeId: string, kind: VaultRefKind, value: string): string {
    const id = clean(storeId)
    if (!id) throw new FiscalVaultError("store_invalida", "storeId é obrigatório.")
    const ref = canonicalEnvRef(kind, id)
    if (!this.allowWrite) {
      throw new FiscalVaultError(
        "operacao_nao_suportada",
        `EnvVault (piloto) não persiste segredo em runtime — provisione a env "${ref}" na plataforma.`,
        id,
      )
    }
    this.env[ref] = value
    return ref
  }

  async putCertificadoPfx(storeId: string, pfx: Buffer, senha: string): Promise<{ blobRef: string; senhaRef: string }> {
    const blobRef = this.writeOrThrow(storeId, "pfx", pfx.toString("base64"))
    const senhaRef = this.writeOrThrow(storeId, "senha", clean(senha))
    return { blobRef, senhaRef }
  }

  async putCscToken(storeId: string, token: string): Promise<{ cscTokenRef: string }> {
    const cscTokenRef = this.writeOrThrow(storeId, "csc", clean(token))
    return { cscTokenRef }
  }

  async revoke(storeId: string, ref: string): Promise<void> {
    const id = clean(storeId)
    if (!id) throw new FiscalVaultError("store_invalida", "storeId é obrigatório.")
    const name = clean(ref)
    if (!name) return
    this.assertScope(id, name)
    if (!this.allowWrite) {
      throw new FiscalVaultError(
        "operacao_nao_suportada",
        `EnvVault (piloto) não remove secret em runtime — remova a env "${name}" na plataforma.`,
        id,
      )
    }
    delete this.env[name]
  }
}

/** Conveniência: instancia o EnvVault sobre `process.env` (piloto, leitura fail-closed). */
export function createEnvVault(opts: EnvVaultOptions = {}): EnvVault {
  return new EnvVault(opts)
}
