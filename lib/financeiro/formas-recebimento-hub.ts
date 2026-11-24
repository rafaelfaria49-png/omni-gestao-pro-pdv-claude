/**
 * Formas de recebimento aceitas no Financeiro HUB e rótulo legível para o comprovante.
 * O servidor grava o `id` em `payload.historico[].formaPagamento`; o PDV grava os ids da
 * Config V3 — ids desconhecidos aparecem como vieram (sem inventar forma).
 */
export const FORMAS_RECEBIMENTO_HUB = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "PIX" },
  { id: "credito", label: "Cartão de crédito" },
  { id: "debito", label: "Cartão de débito" },
  { id: "boleto", label: "Boleto" },
  { id: "transferencia", label: "Transferência" },
] as const

const ROTULOS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  credito: "Cartão de crédito",
  cartao_credito: "Cartão de crédito",
  debito: "Cartão de débito",
  cartao_debito: "Cartão de débito",
  boleto: "Boleto",
  transferencia: "Transferência",
}

export function rotuloFormaRecebimento(forma: string | null | undefined): string {
  const raw = String(forma ?? "").trim()
  if (!raw) return ""
  return raw
    .split(" + ")
    .map((f) => ROTULOS[f.trim().toLowerCase()] ?? f.trim())
    .join(" + ")
}
