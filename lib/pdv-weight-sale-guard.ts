/**
 * ESTOQUE-MANUAL-KG-001 — orientação do PDV para produto declarado por peso.
 *
 * O estoque em KG já aceita entrada manual, mas a VENDA por peso (quantidade,
 * preço por kg, pagamento e baixa) segue bloqueada no servidor. Sem este guard o
 * PDV dizia "sem saldo no estoque" (mandando o operador repor) ou, com saldo,
 * deixava vender 1 unidade e só recusava no pagamento. Chamado antes de qualquer
 * checagem de estoque em todo `addToCart`.
 */
export type PdvWeightSaleNotice = { title: string; description: string }

export function pdvWeightSaleBlockedNotice(product: {
  name: string
  vendaPesoIndisponivel?: boolean
}): PdvWeightSaleNotice | null {
  if (!product.vendaPesoIndisponivel) return null
  return {
    title: "Venda por peso ainda não liberada",
    description: `${product.name} é vendido por kg e ainda não pode ser registrado no PDV. Não venda como unidade nem como item avulso; o estoque não precisa de ajuste.`,
  }
}
