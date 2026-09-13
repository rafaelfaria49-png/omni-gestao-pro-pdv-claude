/**
 * Formatação de APRESENTAÇÃO da Conferência do fechamento de caixa.
 *
 * Nada aqui altera identificador persistido: o número completo da venda
 * (`VDA-L01-2026-000407`) continua nos dados, na auditoria, na impressão e nos
 * detalhes — só a linha principal da lista mostra a forma curta (`#000407`).
 */

/** Número de venda com prefixo + sequência numérica final (`VDA-2026-0590`, `VDA-L01-2026-000407`). */
const NUMERO_VENDA_RE = /^[A-Za-z]+(?:-[A-Za-z0-9]+)*-(\d{3,})$/

/**
 * Forma curta do número da venda para a lista: `VDA-L01-2026-000407` → `#000407`.
 * Identificadores fora do padrão (ids legados, cuid) voltam inalterados.
 */
export function numeroVendaCurto(numero: string): string {
  const valor = numero.trim()
  const m = NUMERO_VENDA_RE.exec(valor)
  return m ? `#${m[1]}` : valor
}

const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Débito",
  cartao_credito: "Crédito",
  carne: "Carnê",
  a_prazo: "A prazo",
  vale: "Crédito/Vale",
  multiplo: "Múltiplas formas",
}

/** Rótulo legível da forma de pagamento (`cartao_debito` → `Débito`); desconhecida volta como veio. */
export function formaPagamentoLabel(forma: string | null | undefined): string | null {
  const valor = (forma ?? "").trim()
  if (!valor) return null
  return FORMA_PAGAMENTO_LABEL[valor.toLowerCase()] ?? valor
}

/** Data (`12/09/2026`) e hora (`17:10`) separadas para a coluna da Conferência; `null` se inválida. */
export function dataHoraConferencia(at: string): { data: string; hora: string } | null {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  return {
    data: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  }
}
