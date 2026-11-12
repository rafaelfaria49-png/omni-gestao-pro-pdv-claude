/**
 * Compra de aparelho × Financeiro (OMNI-APARELHOS-PR347-FINALIZACAO-MERGE-SEGURO-002).
 *
 * Contrato canônico reaproveitado, sem caminho paralelo:
 * - APROVAÇÃO da compra registra a OBRIGAÇÃO: um título em Contas a Pagar (`ContaPagarTitulo`,
 *   status pendente), na MESMA transação da aprovação. Idempotente por `(storeId, localKey)` com a
 *   chave oficial `pagar:manual:{storeId}:aparelho-aquisicao-{id}`.
 * - PAGAMENTO EFETIVO só acontece pelo fluxo existente de Contas a Pagar (Financeiro HUB →
 *   `/api/financeiro/pagar`), que exige permissão financeira e gera a saída de caixa/carteira com a
 *   sua própria idempotência. Este módulo nunca marca pago nem cria movimento de dinheiro.
 * - "Crédito na loja" e "Abatimento em venda" não têm contrato canônico de liquidação → recusados
 *   no servidor (`PAGAMENTO_NAO_INTEGRADO`), em vez de registrar uma quitação fictícia.
 */
import type { Prisma } from "@/generated/prisma"
import { buildContaPagarLocalKey } from "@/lib/financeiro/contracts/local-key"
import { appendFinanceiroHistorico, buildContaPagarPayload } from "@/lib/financeiro/contracts/payload"
import { FINANCEIRO_ORIGEM } from "@/lib/financeiro/contracts/origem"
import { localDateKey } from "./warranty"

export const FORMAS_PAGAMENTO_AQUISICAO = ["dinheiro", "pix", "transferencia", "outro"] as const
export const FORMAS_PAGAMENTO_NAO_INTEGRADAS = ["credito_loja", "abatimento_venda"] as const

export function contaPagarLocalKeyDaAquisicao(storeId: string, aquisicaoId: string): string {
  return buildContaPagarLocalKey({ kind: "pagar_manual", storeId, uuid: `aparelho-aquisicao-${aquisicaoId}` })
}

/** Situação exibida da compra: vem SEMPRE do título em Contas a Pagar, nunca de um campo local. */
export type SituacaoPagamentoAquisicao =
  | "aguardando_aprovacao" // sem obrigação ainda
  | "sem_valor" // compra aprovada de valor zero
  | "a_pagar" // título pendente
  | "parcial"
  | "pago"
  | "cancelado" // título cancelado/estornado no Financeiro
  | "recusada"

export const SITUACAO_PAGAMENTO_LABEL: Record<SituacaoPagamentoAquisicao, string> = {
  aguardando_aprovacao: "pagamento só após a aprovação",
  sem_valor: "sem valor a pagar",
  a_pagar: "a pagar no Financeiro",
  parcial: "pago parcialmente no Financeiro",
  pago: "pago no Financeiro",
  cancelado: "título cancelado no Financeiro",
  recusada: "compra recusada — nada a pagar",
}

export function situacaoPagamento(
  aq: { status: string; valorTotal: number },
  titulo: { status: string } | null | undefined,
): SituacaoPagamentoAquisicao {
  if (aq.status === "recusada") return "recusada"
  if (aq.status !== "confirmada") return "aguardando_aprovacao"
  if (!(aq.valorTotal > 0)) return "sem_valor"
  const s = (titulo?.status ?? "").toLowerCase()
  if (s === "pago") return "pago"
  if (s === "parcial") return "parcial"
  if (s === "cancelado" || s === "estornado") return "cancelado"
  return "a_pagar"
}

/**
 * Cria (uma única vez) o título a pagar da compra aprovada. Roda dentro da transação da aprovação:
 * se qualquer passo falhar, nem a aprovação nem o título existem.
 */
export async function registrarObrigacaoAquisicaoTx(
  tx: Prisma.TransactionClient,
  args: {
    storeId: string
    aquisicao: { id: string; protocolo: string; tipo: string; valorTotal: number; formaPagamento: string; vendedorNome: string; fornecedorId: string | null }
    operador: string
  },
): Promise<{ localKey: string; tituloId: string } | null> {
  const { storeId, aquisicao: aq } = args
  if (!(aq.valorTotal > 0)) return null
  const localKey = contaPagarLocalKeyDaAquisicao(storeId, aq.id)
  const payload = appendFinanceiroHistorico(
    buildContaPagarPayload({
      origem: FINANCEIRO_ORIGEM.SISTEMA,
      // Categoria e forma lidas pelo HUB (pickStringFromPayload planoContas/categoria, formaPagamento).
      planoContas: "Compra de aparelhos (estoque)",
      categoria: "Compra de aparelhos (estoque)",
      formaPagamento: aq.formaPagamento,
      referencia: aq.protocolo,
      numeroDocumento: aq.protocolo,
      createdFrom: "aparelhos.aquisicao",
      ...(aq.fornecedorId ? { fornecedorId: aq.fornecedorId } : {}),
      ...(aq.vendedorNome ? { fornecedorNome: aq.vendedorNome } : {}),
      metadata: { aparelhoAquisicaoId: aq.id, protocolo: aq.protocolo, tipo: aq.tipo, formaPagamentoCombinada: aq.formaPagamento },
    }),
    { tipo: "criacao", userLabel: args.operador, observacao: `Compra de aparelho aprovada (${aq.protocolo})` },
  )
  // createMany + skipDuplicates: nunca sobrescreve um título que o Financeiro já movimentou.
  await tx.contaPagarTitulo.createMany({
    data: [{
      storeId,
      localKey,
      fornecedorId: aq.fornecedorId,
      descricao: `Compra de aparelho ${aq.tipo === "compra_cliente" ? "de cliente" : ""} ${aq.protocolo}${aq.vendedorNome ? ` — ${aq.vendedorNome}` : ""}`.replace(/\s+/g, " ").trim(),
      valor: Math.round(aq.valorTotal * 100) / 100,
      vencimento: localDateKey(new Date()),
      status: "pendente",
      numeroDocumento: aq.protocolo,
      payload: payload as Prisma.InputJsonValue,
    }],
    skipDuplicates: true,
  })
  const titulo = await tx.contaPagarTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId, localKey } }, select: { id: true } })
  return { localKey, tituloId: titulo.id }
}
