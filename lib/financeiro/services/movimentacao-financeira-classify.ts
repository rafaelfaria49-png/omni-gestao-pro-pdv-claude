/**
 * Classificação compartilhada de MovimentacaoFinanceira para DRE, relatórios e fluxo.
 * FASE 13 — consolidação pós-PDV/OS (cancelamentos, devoluções, transferências, estornos).
 */

const O = (s: string | null | undefined) => (s ?? "").toLowerCase().trim()

/** Transferência entre carteiras: neutra no resultado (duas pernas). */
export function isOrigemTransferenciaInterna(origem: string | null | undefined): boolean {
  const o = O(origem)
  return o === "transferencia" || o === "transferência" || o.startsWith("transfer")
}

/** Estorno de recebimento (reverte entrada de CR): reduz receita, não é despesa operacional. */
export function isOrigemEstornoReceber(origem: string | null | undefined): boolean {
  return O(origem).startsWith("estorno_receber")
}

/** Estorno de pagamento (reverte saída de CP): reduz despesa, não é receita. */
export function isOrigemEstornoPagar(origem: string | null | undefined): boolean {
  return O(origem).startsWith("estorno_pagar")
}

/** Devolução PDV em dinheiro: abate receita (não classificar como despesa fixa/variável). */
export function isOrigemDevolucaoPdv(origem: string | null | undefined): boolean {
  const o = O(origem)
  return o === "devolucao_pdv" || o.startsWith("devolucao_") || o.startsWith("devolução_")
}

/** Sangria / suprimento de caixa PDV (após integração em MovimentacaoFinanceira). */
export function isOrigemSangriaPdv(origem: string | null | undefined): boolean {
  return O(origem) === "sangria_pdv"
}

export function isOrigemSuprimentoPdv(origem: string | null | undefined): boolean {
  return O(origem) === "suprimento_pdv"
}

/** Qualquer estorno (receber ou pagar). */
export function isOrigemEstorno(origem: string | null | undefined): boolean {
  return isOrigemEstornoReceber(origem) || isOrigemEstornoPagar(origem)
}
