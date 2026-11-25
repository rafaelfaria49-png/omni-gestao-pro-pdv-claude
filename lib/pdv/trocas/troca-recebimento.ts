/**
 * OMNI-PDV-TROCAS-DEVOLUCOES-FINAL-RECOVERY-P1-002 — quanto da venda foi EFETIVAMENTE recebido.
 *
 * Devolução financeira (reembolso, vale-troca ou crédito de troca) só pode devolver o que a
 * loja recebeu. Distingue:
 *  - recebido: parte à vista (dinheiro, Pix, cartões, vale usado) + pagamentos dos títulos
 *    a prazo (histórico canônico do Contas a Receber, `sumPagamentosHistorico`);
 *  - saldo a receber: parcela a prazo ainda não paga + carnê;
 *  - carnê: o motor de venda não gera título para carnê, então não há como saber se foi
 *    pago → tratado como NÃO recebido (fail-closed).
 *
 * Enquanto não existir o ajuste da obrigação financeira (abater o título em vez de devolver
 * dinheiro/crédito), venda com saldo em aberto tem a devolução financeira BLOQUEADA; o
 * retorno só ao estoque continua permitido.
 */
import { RECEBER_STATUS, normalizeReceberStatus } from "@/lib/financeiro/contracts/status"
import { arredonda2 } from "@/lib/pdv/trocas/troca-disponibilidade"

export type TituloVenda = { status: string | null | undefined; valor: number; pago: number }

export type RecebimentoDaVenda = {
  total: number
  aVista: number
  aPrazo: number
  aPrazoRecebido: number
  carne: number
  /** Valor efetivamente recebido pela loja nesta venda. */
  recebido: number
  /** Ainda a receber (a prazo não pago + carnê). */
  saldoAberto: number
}

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v)
  return Number.isFinite(x) && x > 0 ? x : 0
}

export function recebimentoDaVenda(total: number, paymentBreakdown: unknown, titulos: TituloVenda[]): RecebimentoDaVenda {
  const pb = paymentBreakdown && typeof paymentBreakdown === "object" ? (paymentBreakdown as Record<string, unknown>) : {}
  const aPrazo = arredonda2(n(pb.aPrazo))
  const carne = arredonda2(n(pb.carne))
  const t = arredonda2(n(total))
  const aVista = arredonda2(Math.max(0, t - aPrazo - carne))
  let aPrazoRecebido = 0
  for (const tit of titulos) {
    const st = normalizeReceberStatus(tit.status)
    if (st === RECEBER_STATUS.CANCELADO || st === RECEBER_STATUS.ESTORNADO) continue
    const valor = n(tit.valor)
    aPrazoRecebido += st === RECEBER_STATUS.PAGO ? valor : Math.min(valor, n(tit.pago))
  }
  aPrazoRecebido = arredonda2(Math.min(aPrazo, aPrazoRecebido))
  const recebido = arredonda2(aVista + aPrazoRecebido)
  return { total: t, aVista, aPrazo, aPrazoRecebido, carne, recebido, saldoAberto: arredonda2(Math.max(0, t - recebido)) }
}
