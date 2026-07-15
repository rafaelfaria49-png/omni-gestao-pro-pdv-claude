/** Tipos determinísticos do dry-run fiscal da NFC-e. */
export type DryRunEtapaNome =
  | "snapshot"
  | "tributacao"
  | "xml"
  | "xsd"
  | "assinatura"
  | "verificacao_assinatura"
  | "validacao_estrutural"

export type DryRunEtapaStatus = "ok" | "pendente" | "pulada" | "erro"

export type DryRunEtapa = {
  nome: DryRunEtapaNome
  status: DryRunEtapaStatus
  mensagem: string
}

/** Status fail-closed da validação contra o pacote XSD oficial. */
export type DryRunXsdStatus =
  | "xsd_ok"
  | "xsd_invalido"
  | "xsd_politica_rejeitada"
  | "xsd_falha_infraestrutura"

export type DryRunXsd = {
  status: DryRunXsdStatus
  mensagem: string
  outcome: import("../xsd").XsdValidationOutcome
  engine: import("../xsd").XsdValidationEngine | null
  /** Mensagens sanitizadas; nunca inclui o XML integral. */
  violacoes: string[]
}

export type DryRunValidacaoEstrutural = {
  ok: boolean
  erros: string[]
  pendencias: string[]
}

export type DryRunStatus = "ok" | "pendente" | "erro"

export type DryRunReport = {
  versao: number
  status: DryRunStatus
  prontoParaEmissao: boolean
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
  descartado: true
  numeracaoPlaceholder: boolean
}

export const DRY_RUN_REPORT_VERSAO = 2
