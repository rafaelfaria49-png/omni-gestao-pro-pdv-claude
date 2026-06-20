/**
 * Tipos da numeração fiscal por série (GOAL_008).
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
  | "serie_inativa" // não há SerieFiscal ativa para (loja, modelo, ambiente[, série])
  | "bind_falhou" // falha NÃO-conflito ao gravar o número na NotaFiscal (número já reservado/queimado)
  | "conflito_persistente" // colisão de numeração mesmo após o retry controlado

// ── Resultado da alocação ─────────────────────────────────────────────────────────────

export type FiscalNumberAllocation = {
  ok: true
  /** true quando a nota JÁ estava numerada (idempotente) — o contador não foi tocado. */
  reused: boolean
  serieFiscalId: string
  serie: number
  numero: number
  modelo: string
  ambiente: string
}

export type FiscalNumberAllocationError = {
  ok: false
  errorCode: FiscalNumberingErrorCode
  mensagem: string
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
}

/** Série fiscal ATIVA resolvida para a numeração. */
export type NumberingActiveSerie = {
  id: string
  serie: number
  modelo: string
  ambiente: string
}

/** Número reservado de forma atômica (o contador já avançou no banco). */
export type NumberingReservation = {
  serieFiscalId: string
  serie: number
  /** Número reservado (= valor de `proximoNumero` ANTES do incremento). */
  numero: number
}

export type NumberingBindResult =
  | { ok: true }
  | { ok: false; conflito: boolean; mensagem: string }

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
  }) => Promise<NumberingActiveSerie | null>
  /** RESERVA atômica: incrementa `proximoNumero` e devolve o número reservado (anterior). */
  reserveNextNumber: (p: { serieFiscalId: string }) => Promise<NumberingReservation>
  /** Vincula série+número à NotaFiscal. Conflito (número já usado) é sinalizado para retry. */
  bindNotaNumero: (p: {
    notaFiscalId: string
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
