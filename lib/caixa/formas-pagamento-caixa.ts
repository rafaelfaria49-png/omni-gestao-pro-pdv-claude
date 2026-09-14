/**
 * Vocabulário de FORMA DE PAGAMENTO no fechamento de caixa
 * (GOAL CAIXA-FECHAMENTO-ORIGENS-PAGAMENTO-003A).
 *
 * A mesma forma chega ao caixa com grafias diferentes, conforme o fluxo que gravou:
 *  - venda do PDV: chaves do `PaymentBreakdownFull` (`cartaoDebito`, `creditoVale`…);
 *  - PDV F5 / lote: ids de configuração (`cartao_debito`, `credito_vale`, `boleto`…);
 *  - Operações V3 (O.S.): `debito` / `credito`;
 *  - tela Financeiro (`vincular-caixa`): rótulo em minúsculas (`"cartão de débito"`);
 *  - `sessao-detalhe`: `a_prazo` / `vale`.
 *
 * `normalizarFormaPagamento` reduz todas à chave canônica (as chaves do
 * `PaymentBreakdownFull`). Forma não reconhecida devolve `null` — quem chama apresenta
 * "forma não identificada" em vez de inventar uma.
 */

export type FormaCanonica =
  | "dinheiro"
  | "pix"
  | "cartaoDebito"
  | "cartaoCredito"
  | "carne"
  | "creditoVale"
  | "aPrazo"

/** Ordem de apresentação. */
export const FORMAS_CANONICAS: readonly FormaCanonica[] = [
  "dinheiro",
  "pix",
  "cartaoDebito",
  "cartaoCredito",
  "carne",
  "creditoVale",
  "aPrazo",
]

export const FORMA_CANONICA_LABEL: Record<FormaCanonica, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartaoDebito: "Débito",
  cartaoCredito: "Crédito",
  carne: "Carnê",
  creditoVale: "Crédito / Vale",
  aPrazo: "À prazo",
}

/**
 * Slug → forma canônica. Somente grafias REAIS dos fluxos acima.
 * `boleto` grava como carnê na venda (`toPaymentMethodType`); `crediario` vem do rótulo
 * "Carnê / Crediário" da configuração; `carteira` é o "crédito do cliente" das O.S.
 */
const ALIAS: Record<string, FormaCanonica> = {
  dinheiro: "dinheiro",
  pix: "pix",
  cartao_debito: "cartaoDebito",
  cartaodebito: "cartaoDebito",
  cartao_de_debito: "cartaoDebito",
  debito: "cartaoDebito",
  cartao_credito: "cartaoCredito",
  cartaocredito: "cartaoCredito",
  cartao_de_credito: "cartaoCredito",
  credito: "cartaoCredito",
  carne: "carne",
  carne_crediario: "carne",
  crediario: "carne",
  boleto: "carne",
  credito_vale: "creditoVale",
  creditovale: "creditoVale",
  vale: "creditoVale",
  carteira: "creditoVale",
  a_prazo: "aPrazo",
  aprazo: "aPrazo",
}

/** Marcas de acento que o `normalize("NFD")` separa da letra (U+0300 a U+036F). */
const DIACRITICOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g")

/** `"Cartão de Débito"` → `cartao_de_debito` (sem acento, minúsculo, separador único). */
function slugForma(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/** Forma canônica da grafia gravada; `null` quando ausente ou não reconhecida. */
export function normalizarFormaPagamento(raw: unknown): FormaCanonica | null {
  if (typeof raw !== "string") return null
  const slug = slugForma(raw)
  return slug ? (ALIAS[slug] ?? null) : null
}
