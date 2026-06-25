/**
 * Tipos do pipeline fiscal ponta-a-ponta (BL-FISCAL-008) — orquestração DORMENTE.
 *
 * Conecta: Snapshot → Tax Engine (congelado) → XML → XMLDSig → Dry-Run → Provider Stub, e devolve
 * um RELATÓRIO CONSOLIDADO. Nunca persiste, nunca transmite, nunca altera banco. Determinístico
 * (sem timestamps no relatório) e sem informação sensível (sem XML/cert/senha — só hashes/status).
 */
import type { DryRunReport } from "../dry-run"
import type { FiscalProviderOperacao, FiscalProviderResultado } from "../provider"

/** Resumo NÃO-volátil de uma operação do provider (sem eventos/timestamps). */
export type ProviderStepSummary = {
  operacao: FiscalProviderOperacao
  ok: boolean
  resultado: FiscalProviderResultado
  statusNota: string | null
  mensagem: string
  chaveAcesso: string | null
  protocolo: string | null
  cStat: string | null
  pendencias: string[]
  erros: Array<{ code: string; mensagem: string }>
}

export type FiscalPipelineEtapaNome =
  | "dry_run"
  | "provider_validacao_snapshot"
  | "provider_preparo"
  | "provider_emissao"

export type FiscalPipelineEtapaStatus = "ok" | "pendente" | "pulada" | "erro"

export type FiscalPipelineEtapa = {
  nome: FiscalPipelineEtapaNome
  status: FiscalPipelineEtapaStatus
  mensagem: string
}

export type FiscalPipelineStatus = "ok" | "pendente" | "erro"

/** Resumo do provider usado no pipeline. */
export type FiscalPipelineProvider = {
  tipo: string
  simulado: boolean
  validacaoSnapshot: ProviderStepSummary | null
  preparo: ProviderStepSummary | null
  emissao: ProviderStepSummary | null
}

/**
 * Relatório consolidado do pipeline (TAREFA "retornar relatório consolidado"). Determinístico,
 * sem dado sensível. `descartado` sempre true: nada foi persistido/transmitido.
 */
export type FiscalPipelineReport = {
  versao: number
  status: FiscalPipelineStatus
  /** true só quando a esteira inteira passou e o provider (stub) autorizou. */
  prontoParaHomologacao: boolean
  etapas: FiscalPipelineEtapa[]
  /** Relatório do Dry-Run aninhado (já determinístico, com hashes). */
  dryRun: DryRunReport
  provider: FiscalPipelineProvider | null
  chaveAcesso: string | null
  assinaturaValida: boolean
  erros: string[]
  warnings: string[]
  descartado: true
}

export const FISCAL_PIPELINE_REPORT_VERSAO = 1
