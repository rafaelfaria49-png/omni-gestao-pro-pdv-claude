/**
 * Tipos do Dry-Run fiscal da NFC-e (BL-FISCAL-006 · docs/architecture/FISCAL_DRY_RUN.md).
 *
 * Esteira fiscal A SECO: snapshot → tributação → XML → assinatura simulada → verificação →
 * validação estrutural/XSD → relatório → DESCARTA o XML. 100% dormente, em memória:
 *  - NÃO transmite à SEFAZ, NÃO usa certificado real, NÃO gera DANFE, NÃO persiste nada.
 *  - PURA: sem Prisma/fetch/Next/rede; usa só as camadas fiscais já existentes + node:crypto (hash).
 *  - DETERMINÍSTICA: sem timestamps no relatório (golden-test-friendly).
 *  - SEM informação sensível: o relatório carrega só hashes/status/booleans — nunca o XML, a
 *    chave privada ou a senha.
 */

/** Etapas da esteira (ordem fixa). */
export type DryRunEtapaNome =
  | "snapshot"
  | "tributacao"
  | "xml"
  | "assinatura"
  | "verificacao_assinatura"
  | "validacao_estrutural"
  | "xsd"

export type DryRunEtapaStatus = "ok" | "pendente" | "pulada" | "erro"

export type DryRunEtapa = {
  nome: DryRunEtapaNome
  status: DryRunEtapaStatus
  /** Mensagem curta e SEM segredo. */
  mensagem: string
}

/** Status da validação XSD (TAREFA 3). */
export type DryRunXsdStatus =
  | "xsd_nao_configurado" // não há XSD oficial no repo → gate futuro (default seguro)
  | "xsd_presente_sem_validador" // XSD fornecido, mas validador real ainda não implementado
  | "xsd_ok"
  | "xsd_invalido"

export type DryRunXsd = {
  status: DryRunXsdStatus
  mensagem: string
  /** Violações quando `xsd_invalido` (vazio nos demais). */
  violacoes: string[]
}

export type DryRunValidacaoEstrutural = {
  ok: boolean
  erros: string[]
  pendencias: string[]
}

/** Status geral do Dry-Run. */
export type DryRunStatus = "ok" | "pendente" | "erro"

/**
 * Relatório de prontidão (TAREFA 5). Determinístico e sem dado sensível. `descartado` é sempre
 * true: o XML/assinatura NÃO foram persistidos nem transmitidos — só medidos (hash) e jogados fora.
 */
export type DryRunReport = {
  versao: number
  status: DryRunStatus
  /** true só quando a esteira inteira passou e o XSD validou (gate futuro). */
  prontoParaEmissao: boolean
  etapas: DryRunEtapa[]
  erros: string[]
  warnings: string[]
  /** Chave de acesso (44 díg) — pública, não sensível. Null quando não calculável. */
  chaveAcesso: string | null
  /** Id referenciado na assinatura (NFe<chave>) — público. */
  referenciaId: string | null
  assinaturaPresente: boolean
  assinaturaValida: boolean
  validacaoEstrutural: DryRunValidacaoEstrutural
  xsd: DryRunXsd
  /** SHA-256 (hex) do XML não assinado. Hash, não o conteúdo. Null se não gerado. */
  hashXml: string | null
  /** SHA-256 (hex) do XML assinado. Null se não assinado. */
  hashXmlAssinado: string | null
  /** Sempre true: nada foi persistido/transmitido (P3/P4 · FISCAL_DRY_RUN §5). */
  descartado: true
  /** Numeração usada (placeholder quando não veio no contexto). */
  numeracaoPlaceholder: boolean
}

export const DRY_RUN_REPORT_VERSAO = 1
