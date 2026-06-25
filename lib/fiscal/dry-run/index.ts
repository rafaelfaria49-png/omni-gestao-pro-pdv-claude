/**
 * Dry-Run fiscal da NFC-e (BL-FISCAL-006 · FISCAL_DRY_RUN.md) — ponto único de import. DORMENTE.
 *
 * Esteira A SECO que exercita snapshot → tributação(congelada) → XML → assinatura de TESTE →
 * verificação → validação estrutural → XSD(placeholder) → relatório, DESCARTANDO o XML. Não
 * transmite à SEFAZ, não usa certificado real, não gera DANFE, não persiste nada. Sem chamador
 * produtivo. Serve como gate técnico entre F4 (assinatura) e F5 (transmissão) e em CI.
 */
export { runFiscalDryRun, runFiscalDryRunDetailed } from "./dry-run-pipeline"
export type { RunFiscalDryRunOptions, RunFiscalDryRunDetailed } from "./dry-run-pipeline"
export { buildDryRunReport, type DryRunReportParts } from "./dry-run-report"
export { validarEstruturaNfce, validarXsd, type ValidarXsdOptions } from "./dry-run-validation"
export {
  DRY_RUN_TEST_CERT,
  DRY_RUN_TEST_PASSPHRASE,
  dryRunSnapshot,
  type DryRunCaseKind,
} from "./dry-run-fixtures"
export {
  DRY_RUN_REPORT_VERSAO,
  type DryRunReport,
  type DryRunStatus,
  type DryRunEtapa,
  type DryRunEtapaNome,
  type DryRunEtapaStatus,
  type DryRunXsd,
  type DryRunXsdStatus,
  type DryRunValidacaoEstrutural,
} from "./dry-run.types"
