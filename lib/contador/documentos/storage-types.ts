/**
 * Contador HUB · Documentos — contrato (porta) do adapter de storage privado (GOAL 010).
 *
 * O service depende SOMENTE desta porta; o adapter real (Supabase) e o fake de teste
 * a implementam. Nenhum método devolve URL pública permanente: uploads e downloads
 * usam URLs assinadas de curta duração, e `storageRef` é sempre o path privado.
 */

/** URL assinada de upload direto do navegador ao storage (o binário não passa pela API). */
export type UploadAssinado = Readonly<{
  /** Path privado definitivo do objeto (é o que vira `storageRef`). */
  storageRef: string
  /** URL assinada para o PUT direto do navegador. */
  signedUrl: string
  /** Token de upload (Supabase `createSignedUploadUrl`). */
  token: string
  /** Validade da autorização de upload, em segundos. */
  expiresInSec: number
}>

/** URL assinada de download (attachment) de curta duração. */
export type DownloadAssinado = Readonly<{
  signedUrl: string
  expiresInSec: number
}>

/** Metadados mínimos do objeto armazenado. */
export type ObjetoMetadata = Readonly<{
  bytes: number
  /** MIME reportado pelo storage (pode ser `null` quando não disponível). */
  mime: string | null
}>

/** Estado do bucket configurado (para o setup/diagnóstico). */
export type BucketEstado = Readonly<{
  existe: boolean
  /** `true` se público; o Contador exige `false`. `null` quando indeterminado. */
  publico: boolean | null
}>

/**
 * Porta de storage privado. Implementada pelo adapter Supabase (server-only) e por
 * um fake in-memory nos testes. Erros externos são convertidos em `StorageError`.
 */
export interface StorageDocumentosPort {
  /** Verifica existência e visibilidade do bucket (nunca cria). */
  verificarBucket(): Promise<BucketEstado>
  /** Cria a autorização assinada de upload direto para `storageRef`. `upsert` desabilitado. */
  criarUploadAssinado(storageRef: string, expiresInSec?: number): Promise<UploadAssinado>
  /** Metadados do objeto, ou `null` se não existir. */
  obterMetadata(storageRef: string): Promise<ObjetoMetadata | null>
  /** Baixa o conteúdo privado inteiro para validação/hash server-side. */
  abrirConteudoPrivado(storageRef: string): Promise<Buffer>
  /** Cria URL assinada de download (attachment) com validade curta. */
  criarDownloadAssinado(
    storageRef: string,
    nomeArquivo: string,
    expiresInSec?: number,
  ): Promise<DownloadAssinado>
  /** Remove o objeto (usado só na limpeza pós-validação inválida). */
  removerObjeto(storageRef: string): Promise<void>
  /** `true` se o objeto existe no storage. */
  verificarExistencia(storageRef: string): Promise<boolean>
}

/** Erro externo de storage já convertido — mensagem SEGURA, sem token/URL assinada. */
export class StorageError extends Error {
  readonly code = "STORAGE_ERRO" as const
  readonly operacao: string
  constructor(operacao: string, message: string) {
    super(message)
    this.name = "StorageError"
    this.operacao = operacao
  }
}
