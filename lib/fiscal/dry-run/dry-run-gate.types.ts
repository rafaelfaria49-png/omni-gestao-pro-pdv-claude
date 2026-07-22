/**
 * Gate executável do Dry-Run fiscal (GOAL-007 — FISCAL-DRY-RUN-GATE-REDEFINE-007).
 *
 * Redefine o antigo "dry-run verde" (que podia passar sem comprovação real — ver
 * AUDITORIA_FISCAL_RECONCILIACAO_CODIGO_001 §9, D2/D3/D9) por um GATE de 11 itens, cada um com
 * AUTORIDADE (quem decide) e EVIDÊNCIA (o que prova). O gate só fica verde com 11/11 aprovados;
 * nenhum item pode ser aprovado por ausência de verificação, e uma falha permanece falha (nunca
 * vira aviso para alcançar 11/11).
 *
 * Continua 100% A SECO: não persiste em banco, não transmite à SEFAZ, provider simulado, sem
 * numeração de produção, sem segredo real, sem certificado real.
 */

/** Os 11 itens do gate — número estável (usado no relatório item × autoridade × evidência). */
export type DryRunGateItemNumero = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

/**
 * Status de cada item:
 *  - `aprovado`      autoridade verificou e passou.
 *  - `reprovado`     autoridade verificou e REPROVOU (falha permanece falha).
 *  - `nao_auferivel` a autoridade não pôde ser exercida com as dependências atuais (ex.: worker
 *                    XSD real ausente). NUNCA conta como aprovado — o gate só é verde com 11/11
 *                    `aprovado`. Distinto de `reprovado` para o relatório ser honesto sobre o motivo.
 */
export type DryRunGateItemStatus = "aprovado" | "reprovado" | "nao_auferivel"

/** Um item do gate: número · nome · status · autoridade · evidência · erro (quando houver). */
export type DryRunGateItem = {
  numero: DryRunGateItemNumero
  nome: string
  status: DryRunGateItemStatus
  /** Quem decide este item (contrato/teste/worker/ADR). */
  autoridade: string
  /** Prova estruturada, determinística e SEM SEGREDO. */
  evidencia: Record<string, unknown>
  /** Mensagem de falha/indisponibilidade (null quando aprovado). */
  erro: string | null
}

/** Relatório consolidado do gate — determinístico e sem informação sensível. */
export type DryRunGateReport = {
  versao: number
  /** true SOMENTE quando os 11 itens estão `aprovado`. */
  aprovado: boolean
  aprovados: number
  total: number
  itens: DryRunGateItem[]
  /** Resumo seguro (não-sensível) para inspeção rápida. */
  chaveAcesso: string | null
  hashXmlAssinado: string | null
  /** Deve ser `false` no modo gate (numeração real alocada, não placeholder). */
  numeracaoPlaceholder: boolean
  /** Invariante a seco: nada foi persistido/transmitido. */
  descartado: true
}

export const DRY_RUN_GATE_REPORT_VERSAO = 1
export const DRY_RUN_GATE_TOTAL_ITENS = 11
