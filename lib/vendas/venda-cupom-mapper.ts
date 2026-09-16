/**
 * Mapeamento ÚNICO `VendaDetalhe` → `CupomData` (comprovante não fiscal).
 *
 * GOAL CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007: a reimpressão a partir da Conferência
 * do Fechamento precisa do MESMO comprovante que o Histórico de Vendas já imprime. Esta
 * aritmética (subtotal reconstituído, imposto residual, troco) vivia inline em
 * `vendas-arquivo-geral.tsx#openCupom`; duplicá-la faria dois comprovantes divergirem
 * silenciosamente para a mesma venda. Função pura — sem React, sem fetch.
 *
 * NADA aqui altera a venda: o comprovante é uma projeção do que já está persistido.
 */

import type { VendaDetalhe } from "@/lib/vendas/venda-detalhe-contract"

/** Identificação da loja impressa no cabeçalho do cupom. */
export type CupomLojaInfo = {
  nome: string
  cnpj?: string
  endereco?: string
}

/**
 * Espelha `CupomData` de `components/dashboard/vendas/cupom-nao-fiscal.tsx`. Declarado
 * aqui (e não importado) para manter esta lib livre de import de componente client —
 * o teste estático trava a compatibilidade dos campos.
 */
export type CupomDataMapeado = {
  numeroPedido: string
  at: string
  lojaNome: string
  lojaCnpj?: string
  lojaEndereco?: string
  clienteNome?: string | null
  clienteCpf?: string | null
  operador?: string | null
  sessaoId?: string | null
  itens: Array<{ nome: string; quantidade: number; precoUnitario: number; lineTotal: number }>
  pagamentos: Array<{ label: string; valor: number }>
  total: number
  subtotal?: number
  taxes?: number
  desconto?: number
  cashTendered?: number
  troco?: number
  status?: string
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/**
 * Projeta o comprovante da venda ORIGINAL.
 *
 * - `subtotal` volta a ser o bruto (soma das linhas + desconto concedido);
 * - `taxes` é o resíduo entre o total cobrado e as linhas — só aparece quando > 0;
 * - `troco` só existe quando houve dinheiro na venda E `cashTendered` foi gravado;
 *   sem esse dado a linha some do cupom em vez de imprimir "R$ 0,00" inventado.
 */
export function mapVendaDetalheToCupom(d: VendaDetalhe, loja: CupomLojaInfo): CupomDataMapeado {
  const desconto = Math.max(0, Number(d.desconto) || 0)
  const subtotalBase = d.itens.reduce((sum, item) => sum + item.lineTotal, 0)
  const subtotal = subtotalBase + desconto
  const dinheiro = d.pagamentos
    .filter((payment) => /dinheiro/i.test(payment.label))
    .reduce((sum, payment) => sum + payment.valor, 0)
  const troco =
    d.cashTendered != null && dinheiro > 0.005
      ? Math.max(0, round2(d.cashTendered - dinheiro))
      : undefined

  return {
    numeroPedido: d.id,
    at: d.at,
    lojaNome: loja.nome,
    lojaCnpj: loja.cnpj,
    lojaEndereco: loja.endereco,
    clienteNome: d.clienteNome,
    clienteCpf: d.clienteCpf,
    operador: d.operador,
    sessaoId: d.sessaoId,
    itens: d.itens,
    pagamentos: d.pagamentos,
    total: d.total,
    subtotal,
    taxes: Math.max(0, d.total + desconto - subtotalBase),
    desconto,
    cashTendered: d.cashTendered ?? undefined,
    troco,
    status: d.status,
  }
}
