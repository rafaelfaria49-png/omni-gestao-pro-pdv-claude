/**
 * G003-STORAGE — Gate formal de armazenamento privado real (Cloudflare R2) para o Gestor Money.
 *
 * Reutiliza integralmente a infraestrutura privada existente do OmniGestão:
 *   - `lib/contador/documentos/storage-r2.ts`
 *   - `lib/contador/documentos/config.ts`
 *   - `lib/contador/documentos/storage-types.ts`
 *
 * Invariantes de segurança (fail-closed):
 * 1. `publico: null` (devolvido pela API S3 do R2 em `HeadBucket`) NUNCA é aceito como prova
 *    de privacidade. O gate exige prova positiva explícita de:
 *    - bucket existente;
 *    - subdomínio público `r2.dev` desabilitado (`r2DevPublico === false`);
 *    - zero domínios públicos customizados (`dominiosPublicosCount === 0`);
 *    - sonda anônima sem credenciais explicitamente negada (`probeAnonimoNegado === true`);
 *    - credencial com escopo mínimo restrito ao bucket alvo (sem privilégio global/admin/listagem irrestrita).
 * 2. Sem essa comprovação real — ou com `GESTOR_MONEY_STORAGE_G003_ENABLED !== "true"` —
 *    o runtime permanece bloqueado (503 fail-closed).
 * 3. Toda instância válida carrega uma marca privada (`Symbol`) impossível de forjar fora desta factory.
 * 4. Namespace isolado estritamente em `gastos/v1/{perfilId}/{documentoId}` (jamais toca `contador/...`).
 * 5. Criação exclusiva (não sobrescreve objetos existentes) e download temporário assinado <= 60s.
 * 6. Nenhuma credencial, token, conteúdo de documento ou URL assinada é gravado em erro ou auditoria.
 */
import "server-only"
import {
  ENV_KEY_PROVIDER,
  ENV_KEYS_R2,
  lerStorageProvider,
  lerStorageR2Config,
  StorageConfigError,
  StorageProviderError,
  type StorageR2Config,
} from "@/lib/contador/documentos/config"
import { storageR2 } from "@/lib/contador/documentos/storage-r2"
import type { BucketEstado, StorageDocumentosPort } from "@/lib/contador/documentos/storage-types"
import { documentoStorageRef, type DocumentoStoragePort } from "./documentos-fixture"
import { FinanceiroReadError } from "./read-scope"

export const ENV_KEY_G003_STORAGE_ENABLED = "GESTOR_MONEY_STORAGE_G003_ENABLED" as const
export const G003_STORAGE_DOWNLOAD_MAX_TTL_SEG = 60 as const

const MARCA_STORAGE_G003 = Symbol.for("omni.gestor-money.g003-storage.privado.v1")

type EnvLike = Record<string, string | undefined>

export type CodigoBloqueioGateStorageG003 =
  | "flag_desligada"
  | "provider_invalido"
  | "config_r2_incompleta"
  | "segredo_em_next_public"
  | "bucket_inexistente"
  | "privacidade_bucket_nao_comprovada"
  | "bucket_publico_detectado"
  | "escopo_credencial_invalido"
  | "verificador_indisponivel"

export class GateStorageG003Error extends FinanceiroReadError {
  readonly code: CodigoBloqueioGateStorageG003
  constructor(code: CodigoBloqueioGateStorageG003) {
    super(503)
    this.name = "GateStorageG003Error"
    this.code = code
  }
}

export type ProvaEscopoCredencialR2 = Readonly<{
  /** A credencial deve estar explicitamente restrita ao bucket configurado. */
  restritoAoBucket: boolean
  /** Deve ser `false`: credenciais globais/admin da conta são recusadas. */
  escopoGlobalConta: boolean
  /** Deve ser `false`: permissão ampla de `ListBuckets` indica privilégio excessivo. */
  podeListarTodosBuckets: boolean
  /** Nome do bucket ao qual o token está efetivamente escopado. */
  bucketAutorizado: string
}>

export type ProvaPrivacidadeBucketR2 = Readonly<{
  /** Estado bruto devolvido por `HeadBucket` (`existe: true`). `publico: null` NÃO basta sozinho. */
  bucketExiste: boolean
  /** Deve ser `false`: subdomínio público `*.r2.dev` desligado. */
  r2DevPublico: boolean | null
  /** Deve ser `0`: nenhum domínio customizado público associado ao bucket. */
  dominiosPublicosCount: number | null
  /** Deve ser `true`: tentativa anônima HTTPS sem credenciais foi recusada (401/403/404). */
  probeAnonimoNegado: boolean | null
  /** Validação de privilégio mínimo da credencial utilizada. */
  escopoCredencial: ProvaEscopoCredencialR2 | null
}>

export interface VerificadorPrivacidadeR2G003 {
  verificarPrivacidadeEEscopo(cfg: Readonly<{
    accountId: string
    bucket: string
    endpoint: string
  }>): Promise<ProvaPrivacidadeBucketR2>
}

export type EventoAuditoriaStorageG003 = Readonly<{
  acao:
    | "GATE_VERIFICADO"
    | "GATE_BLOQUEADO"
    | "OBJETO_GRAVADO"
    | "DOWNLOAD_ASSINADO"
    | "OBJETO_REMOVIDO"
    | "LIMPEZA_ORFAO_FALHOU"
  ambiente: "fixture" | "r2_privado_g003"
  resultado: "OK" | "BLOQUEADO" | "FALHA"
  motivoCodigo?: string
  ttlSegundos?: number
  at: string
}>

export type StoragePrivadoR2G003 = DocumentoStoragePort & {
  readonly ambiente: "r2_privado_g003"
  readonly [MARCA_STORAGE_G003]: true
  readonly onAuditoria?: (evento: EventoAuditoriaStorageG003) => void
}

export function ehStoragePrivadoR2G003(storage: unknown): storage is StoragePrivadoR2G003 {
  return Boolean(
    storage
    && typeof storage === "object"
    && (storage as Record<PropertyKey, unknown>)[MARCA_STORAGE_G003] === true
    && (storage as { ambiente?: unknown }).ambiente === "r2_privado_g003",
  )
}

function validarPathGastos(path: string): void {
  const match = /^gastos\/v1\/([a-zA-Z0-9_-]{1,191})\/([a-zA-Z0-9_-]{1,191})$/.exec(path)
  if (!match || documentoStorageRef(match[1], match[2]) !== path) {
    throw new FinanceiroReadError(404)
  }
}

/**
 * Avaliação pura e estrita da prova de privacidade real e escopo mínimo do R2.
 * Nunca trata `null`/`undefined` como privado.
 */
export function avaliarProvaPrivacidadeR2G003(
  bucketHead: BucketEstado,
  prova: ProvaPrivacidadeBucketR2 | null | undefined,
  bucketEsperado: string,
): Readonly<{ ok: true; bucket: Readonly<{ existe: true; publico: false }> } | { ok: false; code: CodigoBloqueioGateStorageG003 }> {
  if (!bucketHead.existe || !prova?.bucketExiste) {
    return Object.freeze({ ok: false, code: "bucket_inexistente" })
  }
  if (bucketHead.publico === true || prova.r2DevPublico === true || (typeof prova.dominiosPublicosCount === "number" && prova.dominiosPublicosCount > 0)) {
    return Object.freeze({ ok: false, code: "bucket_publico_detectado" })
  }
  // `publico: null` no HeadBucket (padrão S3 do R2) NUNCA é prova de privacidade:
  // exigimos comprovação positiva explícita dos 3 sinais de privacidade.
  if (
    prova.r2DevPublico !== false
    || prova.dominiosPublicosCount !== 0
    || prova.probeAnonimoNegado !== true
  ) {
    return Object.freeze({ ok: false, code: "privacidade_bucket_nao_comprovada" })
  }
  const escopo = prova.escopoCredencial
  if (
    !escopo
    || escopo.restritoAoBucket !== true
    || escopo.escopoGlobalConta !== false
    || escopo.podeListarTodosBuckets !== false
    || escopo.bucketAutorizado.trim() !== bucketEsperado.trim()
  ) {
    return Object.freeze({ ok: false, code: "escopo_credencial_invalido" })
  }
  return Object.freeze({
    ok: true,
    bucket: Object.freeze({ existe: true as const, publico: false as const }),
  })
}

export type DiagnosticoGateStorageG003 = Readonly<{
  gate: "G003-STORAGE"
  runtimeLiberado: boolean
  bloqueioCodigo: CodigoBloqueioGateStorageG003 | null
  flagHabilitada: boolean
  providerDeclaradoValido: boolean
  configR2Completa: boolean
  variaveisObrigatorias: readonly string[]
  variaveisFaltando: readonly string[]
  privacidadeComprovadaNoRuntime: boolean
  reutilizaAdapter: "lib/contador/documentos/storage-r2.ts"
}>

/** Diagnóstico seguro e sem IO de rede: expõe apenas nomes de variáveis, nunca valores/segredos. */
export function diagnosticarGateStorageG003(
  env: EnvLike = process.env,
  opcoes?: { possuiVerificadorPrivacidade?: boolean },
): DiagnosticoGateStorageG003 {
  const variaveisObrigatorias = [
    ENV_KEY_G003_STORAGE_ENABLED,
    ENV_KEY_PROVIDER,
    ENV_KEYS_R2.accountId,
    ENV_KEYS_R2.accessKeyId,
    ENV_KEYS_R2.secretAccessKey,
    ENV_KEYS_R2.bucket,
  ] as const

  const flagHabilitada = (env[ENV_KEY_G003_STORAGE_ENABLED] ?? "").trim().toLowerCase() === "true"
  let providerValido = false
  let configR2Completa = false
  let bloqueioCodigo: CodigoBloqueioGateStorageG003 | null = null
  const faltando: string[] = []

  if (!flagHabilitada) {
    faltando.push(ENV_KEY_G003_STORAGE_ENABLED)
  }

  try {
    lerStorageProvider(env)
    providerValido = true
  } catch (e) {
    if (e instanceof StorageProviderError) {
      faltando.push(ENV_KEY_PROVIDER)
    }
  }

  try {
    lerStorageR2Config(env)
    configR2Completa = true
  } catch (e) {
    if (e instanceof StorageConfigError) {
      const temSegredoPublico = e.faltando.some(item => item.includes("NEXT_PUBLIC"))
      faltando.push(...e.faltando)
      if (temSegredoPublico) bloqueioCodigo = "segredo_em_next_public"
    }
  }

  if (!bloqueioCodigo) {
    if (!flagHabilitada) bloqueioCodigo = "flag_desligada"
    else if (!providerValido) bloqueioCodigo = "provider_invalido"
    else if (!configR2Completa) bloqueioCodigo = "config_r2_incompleta"
    else if (!opcoes?.possuiVerificadorPrivacidade) bloqueioCodigo = "privacidade_bucket_nao_comprovada"
  }

  return Object.freeze({
    gate: "G003-STORAGE",
    runtimeLiberado: bloqueioCodigo === null,
    bloqueioCodigo,
    flagHabilitada,
    providerDeclaradoValido: providerValido,
    configR2Completa,
    variaveisObrigatorias,
    variaveisFaltando: Object.freeze(faltando),
    privacidadeComprovadaNoRuntime: Boolean(opcoes?.possuiVerificadorPrivacidade && bloqueioCodigo === null),
    reutilizaAdapter: "lib/contador/documentos/storage-r2.ts",
  })
}

function emitirAuditoria(
  onAuditoria: ((evento: EventoAuditoriaStorageG003) => void) | undefined,
  evento: Omit<EventoAuditoriaStorageG003, "at">,
): void {
  if (!onAuditoria) return
  try {
    onAuditoria(Object.freeze({ ...evento, at: new Date().toISOString() }))
  } catch {
    // Auditoria nunca derruba operação nem vaza exceção interna.
  }
}

export type CriarStoragePrivadoR2G003Options = Readonly<{
  env?: EnvLike
  /** Default: `storageR2` canônico de `lib/contador/documentos/storage-r2.ts`. */
  storageBase?: Pick<
    StorageDocumentosPort,
    "verificarBucket" | "enviarConteudoPrivado" | "obterMetadata" | "abrirConteudoPrivado" | "criarDownloadAssinado" | "removerObjeto"
  >
  /**
   * Verificador obrigatório de privacidade real e escopo mínimo do bucket R2.
   * Sem verificador real que prove `publico === false`, o gate permanece bloqueado (503).
   */
  verificadorPrivacidade?: VerificadorPrivacidadeR2G003 | null
  /** Sink opcional de auditoria estruturada sem segredos, conteúdo ou URL assinada. */
  onAuditoria?: (evento: EventoAuditoriaStorageG003) => void
}>

function validarConfigGate(env: EnvLike): StorageR2Config {
  if ((env[ENV_KEY_G003_STORAGE_ENABLED] ?? "").trim().toLowerCase() !== "true") {
    throw new GateStorageG003Error("flag_desligada")
  }
  try {
    lerStorageProvider(env)
  } catch {
    throw new GateStorageG003Error("provider_invalido")
  }
  try {
    return lerStorageR2Config(env)
  } catch (e) {
    if (e instanceof StorageConfigError && e.faltando.some(item => item.includes("NEXT_PUBLIC"))) {
      throw new GateStorageG003Error("segredo_em_next_public")
    }
    throw new GateStorageG003Error("config_r2_incompleta")
  }
}

/**
 * Factory formal do adapter privado R2 para o Gestor Money (`G003-STORAGE`).
 *
 * Mesmo construída, TODA operação de `documentos.ts` ainda chama `verificarBucket()`
 * e exige `existe === true && publico === false` comprovado pelo verificador de privacidade.
 */
export function criarStoragePrivadoR2G003(options: CriarStoragePrivadoR2G003Options = {}): StoragePrivadoR2G003 {
  const env = options.env ?? process.env
  const cfg = validarConfigGate(env)
  const verificador = options.verificadorPrivacidade ?? null
  if (!verificador) {
    emitirAuditoria(options.onAuditoria, {
      acao: "GATE_BLOQUEADO",
      ambiente: "r2_privado_g003",
      resultado: "BLOQUEADO",
      motivoCodigo: "privacidade_bucket_nao_comprovada",
    })
    throw new GateStorageG003Error("privacidade_bucket_nao_comprovada")
  }

  const base = options.storageBase ?? storageR2
  const onAuditoria = options.onAuditoria

  const adapter: StoragePrivadoR2G003 = {
    ambiente: "r2_privado_g003",
    [MARCA_STORAGE_G003]: true,
    onAuditoria,

    async verificarBucket(): Promise<BucketEstado> {
      try {
        const head = await base.verificarBucket()
        const prova = await verificador.verificarPrivacidadeEEscopo({
          accountId: cfg.accountId,
          bucket: cfg.bucket,
          endpoint: cfg.endpoint,
        })
        const avaliacao = avaliarProvaPrivacidadeR2G003(head, prova, cfg.bucket)
        if (!avaliacao.ok) {
          emitirAuditoria(onAuditoria, {
            acao: "GATE_BLOQUEADO",
            ambiente: "r2_privado_g003",
            resultado: "BLOQUEADO",
            motivoCodigo: avaliacao.code,
          })
          return Object.freeze({
            existe: head.existe,
            publico: avaliacao.code === "bucket_publico_detectado" ? true : null,
          })
        }
        emitirAuditoria(onAuditoria, {
          acao: "GATE_VERIFICADO",
          ambiente: "r2_privado_g003",
          resultado: "OK",
        })
        return avaliacao.bucket
      } catch {
        emitirAuditoria(onAuditoria, {
          acao: "GATE_BLOQUEADO",
          ambiente: "r2_privado_g003",
          resultado: "FALHA",
          motivoCodigo: "verificador_indisponivel",
        })
        throw new GateStorageG003Error("verificador_indisponivel")
      }
    },

    async enviarConteudoPrivado(path: string, conteudo: Uint8Array, mime: string): Promise<void> {
      validarPathGastos(path)
      // Criação exclusiva no namespace `gastos/v1/...`: nunca sobrescreve objeto já existente.
      const existente = await base.obterMetadata(path)
      if (existente !== null) {
        throw new FinanceiroReadError(409)
      }
      await base.enviarConteudoPrivado(path, conteudo, mime)
      emitirAuditoria(onAuditoria, {
        acao: "OBJETO_GRAVADO",
        ambiente: "r2_privado_g003",
        resultado: "OK",
      })
    },

    async obterMetadata(path: string) {
      validarPathGastos(path)
      return base.obterMetadata(path)
    },

    async abrirConteudoPrivado(path: string) {
      validarPathGastos(path)
      return base.abrirConteudoPrivado(path)
    },

    async criarDownloadAssinado(path: string, nomeArquivo: string, expiresInSec = G003_STORAGE_DOWNLOAD_MAX_TTL_SEG) {
      validarPathGastos(path)
      if (!Number.isInteger(expiresInSec) || expiresInSec < 1 || expiresInSec > G003_STORAGE_DOWNLOAD_MAX_TTL_SEG) {
        throw new FinanceiroReadError(404)
      }
      const download = await base.criarDownloadAssinado(path, nomeArquivo, expiresInSec)
      const ttlEfetivo = Math.min(download.expiresInSec, G003_STORAGE_DOWNLOAD_MAX_TTL_SEG)
      emitirAuditoria(onAuditoria, {
        acao: "DOWNLOAD_ASSINADO",
        ambiente: "r2_privado_g003",
        resultado: "OK",
        ttlSegundos: ttlEfetivo,
      })
      return Object.freeze({ signedUrl: download.signedUrl, expiresInSec: ttlEfetivo })
    },

    async removerObjeto(path: string) {
      validarPathGastos(path)
      await base.removerObjeto(path)
      emitirAuditoria(onAuditoria, {
        acao: "OBJETO_REMOVIDO",
        ambiente: "r2_privado_g003",
        resultado: "OK",
      })
    },
  }

  return Object.freeze(adapter)
}

/**
 * Ponto único de resolução em runtime para comprovantes reais do Gestor Money.
 * Sem prova real de privacidade conectada, mantém o runtime bloqueado (`503`, fail-closed).
 */
export function resolverStorageDocumentosG003(options: CriarStoragePrivadoR2G003Options = {}): StoragePrivadoR2G003 {
  return criarStoragePrivadoR2G003(options)
}
