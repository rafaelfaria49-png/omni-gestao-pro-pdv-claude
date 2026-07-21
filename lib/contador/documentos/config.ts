/**
 * Contador HUB · Documentos — configuração de storage e limites (GOAL 010).
 *
 * Lê a configuração do provider (Supabase Storage) do ambiente SERVER-SIDE.
 * A `service_role` NUNCA vai ao navegador, NUNCA é logada e NUNCA aparece em
 * mensagem de erro — o erro tipado carrega apenas quais variáveis faltam.
 *
 * Server-only: este módulo só deve ser importado por código server (rotas API,
 * services, script de setup). Não importar em client component.
 */

/** Teto de tamanho por documento (decisão aprovada 010B). */
export const MAX_BYTES_DOCUMENTO = 25 * 1024 * 1024 // 25 MB

/** Expiração máxima da URL assinada de download (decisão aprovada 010B). */
export const DOWNLOAD_EXPIRACAO_SEG = 300

/** Expiração da URL assinada de upload (curta; o upload é imediato após o intent). */
export const UPLOAD_EXPIRACAO_SEG = 120

/** Nomes das variáveis de ambiente (para mensagens de diagnóstico — nunca os valores). */
export const ENV_KEYS = {
  url: "SUPABASE_URL",
  serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  bucket: "SUPABASE_STORAGE_BUCKET",
} as const

export type StorageConfig = Readonly<{
  url: string
  serviceRoleKey: string
  bucket: string
}>

/** Erro tipado de configuração ausente/incompleta. Mensagem é SEGURA (sem segredos). */
export class StorageConfigError extends Error {
  readonly code = "STORAGE_CONFIG_INDISPONIVEL" as const
  /** Nomes das variáveis faltantes (nunca os valores). */
  readonly faltando: readonly string[]
  constructor(faltando: readonly string[]) {
    super(
      `Storage de documentos indisponível: configure ${faltando.join(", ")} no ambiente server-side.`,
    )
    this.name = "StorageConfigError"
    this.faltando = faltando
  }
}

type EnvLike = Record<string, string | undefined>

function faltantes(env: EnvLike): string[] {
  const faltando: string[] = []
  if (!env[ENV_KEYS.url]?.trim()) faltando.push(ENV_KEYS.url)
  if (!env[ENV_KEYS.serviceRoleKey]?.trim()) faltando.push(ENV_KEYS.serviceRoleKey)
  if (!env[ENV_KEYS.bucket]?.trim()) faltando.push(ENV_KEYS.bucket)
  return faltando
}

/** `true` quando todas as variáveis obrigatórias estão presentes (sem revelar valores). */
export function storageConfigDisponivel(env: EnvLike = process.env): boolean {
  return faltantes(env).length === 0
}

/**
 * Lê a configuração completa. Lança `StorageConfigError` (mensagem segura) quando
 * qualquer variável obrigatória está ausente. Rejeita `service_role` exposta em
 * `NEXT_PUBLIC_*` como erro de segurança explícito.
 */
export function lerStorageConfig(env: EnvLike = process.env): StorageConfig {
  // Falha dura se a service role foi exposta com prefixo público (nunca deve ocorrer).
  for (const chave of Object.keys(env)) {
    if (chave.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE/i.test(chave)) {
      throw new StorageConfigError([
        `${chave} (service role NUNCA pode ter prefixo NEXT_PUBLIC)`,
      ])
    }
  }

  const faltando = faltantes(env)
  if (faltando.length > 0) throw new StorageConfigError(faltando)

  return Object.freeze({
    url: env[ENV_KEYS.url]!.trim(),
    serviceRoleKey: env[ENV_KEYS.serviceRoleKey]!.trim(),
    bucket: env[ENV_KEYS.bucket]!.trim(),
  })
}
