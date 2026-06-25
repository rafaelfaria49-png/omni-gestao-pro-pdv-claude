/**
 * Montagem do relatório do Dry-Run fiscal (BL-FISCAL-006 · TAREFA 5).
 *
 * PURO e DETERMINÍSTICO: não tem timestamp, não acessa I/O, não inclui XML/segredo. Recebe as
 * partes coletadas pela esteira e devolve o `DryRunReport` (hashes + status + booleans).
 */

import {
  DRY_RUN_REPORT_VERSAO,
  type DryRunEtapa,
  type DryRunReport,
  type DryRunStatus,
  type DryRunValidacaoEstrutural,
  type DryRunXsd,
} from "./dry-run.types"

export type DryRunReportParts = {
  etapas: DryRunEtapa[]
  erros: string[]
  warnings: string[]
  chaveAcesso: string | null
  referenciaId: string | null
  assinaturaPresente: boolean
  assinaturaValida: boolean
  validacaoEstrutural: DryRunValidacaoEstrutural
  xsd: DryRunXsd
  hashXml: string | null
  hashXmlAssinado: string | null
  numeracaoPlaceholder: boolean
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list.filter((s) => typeof s === "string" && s.trim() !== "")))
}

export function buildDryRunReport(parts: DryRunReportParts): DryRunReport {
  const erros = dedupe(parts.erros)
  const warnings = dedupe(parts.warnings)

  const temErroEtapa = parts.etapas.some((e) => e.status === "erro")
  const status: DryRunStatus =
    erros.length > 0 || temErroEtapa || !parts.validacaoEstrutural.ok
      ? "erro"
      : warnings.length > 0 || parts.xsd.status !== "xsd_ok" || parts.numeracaoPlaceholder
        ? "pendente"
        : "ok"

  const prontoParaEmissao =
    status === "ok" &&
    parts.assinaturaPresente &&
    parts.assinaturaValida &&
    parts.validacaoEstrutural.ok &&
    parts.xsd.status === "xsd_ok" &&
    !parts.numeracaoPlaceholder

  return {
    versao: DRY_RUN_REPORT_VERSAO,
    status,
    prontoParaEmissao,
    etapas: parts.etapas,
    erros,
    warnings,
    chaveAcesso: parts.chaveAcesso,
    referenciaId: parts.referenciaId,
    assinaturaPresente: parts.assinaturaPresente,
    assinaturaValida: parts.assinaturaValida,
    validacaoEstrutural: parts.validacaoEstrutural,
    xsd: parts.xsd,
    hashXml: parts.hashXml,
    hashXmlAssinado: parts.hashXmlAssinado,
    descartado: true,
    numeracaoPlaceholder: parts.numeracaoPlaceholder,
  }
}
