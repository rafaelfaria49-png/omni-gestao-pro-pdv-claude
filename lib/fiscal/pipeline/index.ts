/**
 * Pipeline fiscal ponta-a-ponta (BL-FISCAL-008) — ponto único de import. DORMENTE.
 *
 * `runFiscalPipeline(snapshot, opts)` conecta Snapshot → Tax Engine → XML → XMLDSig → Dry-Run →
 * Provider Stub e devolve um relatório consolidado. Não persiste, não transmite, não altera banco.
 * Sem chamador produtivo — é o "fechamento a seco" da arquitetura fiscal antes da homologação real.
 */
export {
  runFiscalPipeline,
  runFiscalPipelineDetailed,
  type RunFiscalPipelineOptions,
  type RunFiscalPipelineDetailed,
} from "./fiscal-pipeline"
export {
  FISCAL_PIPELINE_REPORT_VERSAO,
  type FiscalPipelineReport,
  type FiscalPipelineStatus,
  type FiscalPipelineEtapa,
  type FiscalPipelineEtapaNome,
  type FiscalPipelineEtapaStatus,
  type FiscalPipelineProvider,
  type ProviderStepSummary,
} from "./fiscal-pipeline.types"
