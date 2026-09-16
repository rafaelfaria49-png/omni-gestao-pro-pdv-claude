/**
 * Elegibilidade do ESTORNO diante das Contas a Receber da venda —
 * GOAL CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007A (BLOCKER-2).
 *
 * O problema fechado aqui: `cancelContaReceber` recusa título `PAGO`
 * (`titulo_pago_nao_cancela_aqui`), mas devolve `{ ok: false }` em vez de lançar — e a
 * rota tratava a recusa como sucesso. Resultado: venda cancelada, estoque reposto e o
 * título permanecendo PAGO, contradizendo o ledger.
 *
 * Regra deste corretivo: venda com recebível JÁ QUITADO não passa pelo fluxo simples de
 * estorno. O recebimento precisa ser regularizado antes, pelo Financeiro — é lá que o
 * domínio sabe reconciliar dinheiro já recebido.
 *
 * Parcialmente pago NÃO é bloqueado: a merge-readiness provou que esse caminho
 * reconcilia (o recebido é revertido por `estornarMovimentacaoPorReferencia` e o título,
 * ainda não PAGO, é cancelado). Bloquear parcial seria mudar regra comercial sem pedido.
 *
 * Função PURA — sem Prisma, sem React. O servidor e a UI decidem pelo MESMO predicado,
 * então a porta da API e a do menu não podem divergir.
 */

import { RECEBER_STATUS, normalizeReceberStatus } from "@/lib/financeiro/contracts/status"

/** Estado mínimo de um título para a decisão. `pago` = soma do histórico de baixas. */
export type TituloParaEstorno = {
  status: string | null | undefined
  valor: number
  pago: number
}

export const ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO =
  "Conta a receber já quitada — estorne o recebimento no Financeiro antes de estornar a venda."

export const ESTORNO_BLOQUEIO_RECEBIVEL_CODE = "recebivel_quitado"

/** Tolerância de centavo: `pago` vem de soma de floats do histórico. */
const EPS = 0.005

/**
 * `true` quando o título está quitado — por status canônico OU porque as baixas já
 * cobrem o valor. O segundo caso existe porque um título pode ter recebido o total sem
 * que o status tenha sido normalizado para `pago` (histórico legado).
 *
 * Título CANCELADO ou ESTORNADO não conta como quitado: já foi neutralizado.
 */
export function tituloQuitado(t: TituloParaEstorno): boolean {
  const st = normalizeReceberStatus(t.status)
  if (st === RECEBER_STATUS.CANCELADO || st === RECEBER_STATUS.ESTORNADO) return false
  if (st === RECEBER_STATUS.PAGO) return true
  const valor = Number.isFinite(t.valor) ? t.valor : 0
  const pago = Number.isFinite(t.pago) ? t.pago : 0
  return valor > EPS && pago >= valor - EPS
}

export type RecebivelEstornoVeredito =
  | { bloqueado: false }
  | { bloqueado: true; motivo: string; code: string; titulosQuitados: number }

/**
 * Veredito para o CONJUNTO de títulos da venda.
 *
 * Basta UM título quitado para bloquear: numa venda parcelada, a parcela já quitada é
 * dinheiro que entrou e que este fluxo não sabe devolver com consistência de status.
 * Mistura pendente + quitado bloqueia pelo mesmo motivo.
 */
export function avaliarRecebiveisParaEstorno(
  titulos: readonly TituloParaEstorno[],
): RecebivelEstornoVeredito {
  const quitados = titulos.filter(tituloQuitado).length
  if (quitados === 0) return { bloqueado: false }
  return {
    bloqueado: true,
    motivo: ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO,
    code: ESTORNO_BLOQUEIO_RECEBIVEL_CODE,
    titulosQuitados: quitados,
  }
}
