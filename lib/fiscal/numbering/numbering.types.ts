/**
 * Tipos da numeração fiscal por série (GOAL_010).
 *
 * A alocação é feita por (storeId, modelo, série, ambiente) sobre `SerieFiscal.proximoNumero`
 * e gravada em `NotaFiscal` (serieFiscalId/serie/numero). O orquestrador (`allocateFiscalNumber`)
 * é PURO: opera sobre PORTAS injetadas (sem Prisma), mantendo-se testável. A atomicidade e a
 * concorrência segura ficam na porta `reserveNextNumber` (incremento atômico no banco).
 *
 * DORMENTE: nada é emitido de verdade — a numeração apenas PREPARA a NotaFiscal para a emissão
 * simulada do pipeline (GOAL_007 + STUB_HOMOLOGACAO do GOAL_006). Sem XML/DANFE/SEFAZ.
 */

export type FiscalNumberingErrorCode =
  | "parametros_invalidos"
  | "nota_nao_encontrada"
  | "nota_numeracao_inconsistente"
  | "serie_nao_encontrada"
  | "serie_inativa"
  | "serie_outra_loja"
  | "modelo_incompativel"
  | "ambiente_incompativel"
  | "serie_invalida"
  | "sequencia_invalida"
  | "sequencia_esgotada"
  | "reserva_conflito"
  | "reserva_falhou"
  | "bind_falhou" // falha NÃO-conflito ao gravar o número na NotaFiscal (número já reservado/queimado)
  | "conflito_persistente" // colisão de numeração mesmo após o retry controlado

// ── Resultado da alocação ─────────────────────────────────────────────────────────────

export const FISCAL_NUMERO_MINIMO = 1
export const FISCAL_NUMERO_MAXIMO = 999_999_999

/**
 * Número consumido pelo contador, mas não vinculado a esta NotaFiscal. O contrato é suficiente
 * para auditoria e para uma futura inutilização; este GOAL não chama a SEFAZ.
 */
export type FiscalNumberingGap = {
  storeId: string
  notaFiscalId: string
  localKey: string | null
  serieFiscalId: string
  modelo: string
  ambiente: string
  serie: number
  numero: number
  motivo: "bind_falhou" | "nota_ja_numerada"
  requerInutilizacao: true
}

export type FiscalNumberAllocation = {
  ok: true
  /** true quando a nota JÁ estava numerada (idempotente) — o contador não foi tocado. */
  reused: boolean
  storeId: string
  notaFiscalId: string
  localKey: string | null
  serieFiscalId: string
  serie: number
  numero: number
  modelo: string
  ambiente: string
  /** Reservas não vinculadas detectadas nesta chamada; nunca são devolvidas ao contador. */
  lacunas: FiscalNumberingGap[]
}

export type FiscalNumberAllocationError = {
  ok: false
  errorCode: FiscalNumberingErrorCode
  mensagem: string
  /** Reserva já consumida antes da falha, para auditoria/futura inutilização. */
  lacunas: FiscalNumberingGap[]
}

export type FiscalNumberAllocationOutcome = FiscalNumberAllocation | FiscalNumberAllocationError

// ── Visões mínimas usadas pelas portas ──────────────────────────────────────────────────

/** Subconjunto da NotaFiscal vigente necessário à numeração. */
export type NumberingNota = {
  id: string
  storeId: string
  vendaId: string
  modelo: string
  ambiente: string
  serie: number | null
  numero: number | null
  serieFiscalId: string | null
  localKey?: string | null
}

/** Série fiscal resolvida para validação; o alocador exige que esteja ativa e compatível. */
export type NumberingActiveSerie = {
  id: string
  storeId?: string
  serie: number
  modelo: string
  ambiente: string
  ativo?: boolean
  proximoNumero?: number
}

/** Número reservado de forma atômica (o contador já avançou no banco). */
export type NumberingReservation = {
  serieFiscalId: string
  serie: number
  /** Número reservado (= valor de `proximoNumero` ANTES do incremento). */
  numero: number
}

export type NumberingReservationFailure = {
  ok: false
  errorCode:
    | "serie_nao_encontrada"
    | "serie_inativa"
    | "serie_outra_loja"
    | "modelo_incompativel"
    | "ambiente_incompativel"
    | "serie_invalida"
    | "sequencia_invalida"
    | "sequencia_esgotada"
    | "reserva_conflito"
    | "reserva_falhou"
  mensagem: string
  retryable?: boolean
}

export type NumberingBindResult =
  | { ok: true }
  | {
      ok: false
      conflito: boolean
      motivo?: "numero_em_uso" | "nota_ja_numerada" | "falha"
      mensagem: string
    }

// ── Portas (dependency injection) ─────────────────────────────────────────────────────

/**
 * Efeitos do alocador. Mantém `allocateFiscalNumber` livre de Prisma (testável com portas
 * falsas). A concorrência segura/atomicidade é responsabilidade de `reserveNextNumber`.
 */
export type FiscalNumberingPorts = {
  /** Carrega a NotaFiscal vigente (e sua numeração atual, p/ idempotência). */
  getNota: (p: { storeId: string; notaFiscalId: string }) => Promise<NumberingNota | null>
  /** Resolve a SerieFiscal ATIVA para (loja, modelo, ambiente[, série]). null = inexistente/inativa. */
  findActiveSerie: (p: {
    storeId: string
    modelo: string
    ambiente: string
    serie?: number | null
    serieFiscalId?: string | null
  }) => Promise<NumberingActiveSerie | null>
  /**
   * RESERVA atômica e condicionada ao contexto completo. Incrementa `proximoNumero` somente
   * se a série continuar ativa, compatível e dentro do intervalo permitido.
   */
  reserveNextNumber: (p: {
    serieFiscalId: string
    storeId: string
    modelo: string
    ambiente: string
    serie: number
  }) => Promise<NumberingReservation | NumberingReservationFailure>
  /** Vincula série+número por compare-and-swap; nunca sobrescreve nota já numerada. */
  bindNotaNumero: (p: {
    notaFiscalId: string
    storeId: string
    modelo: string
    ambiente: string
    serieFiscalId: string
    serie: number
    numero: number
  }) => Promise<NumberingBindResult>
}

export type AllocateFiscalNumberInput = {
  storeId: string
  notaFiscalId: string
  /** Máximo de tentativas em caso de conflito de numeração (default 3, teto 10). */
  maxTentativas?: number
}
