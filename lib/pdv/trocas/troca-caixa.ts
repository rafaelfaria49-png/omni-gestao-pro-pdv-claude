/**
 * OMNI-PDV-TROCAS-DEVOLUCOES-FINAL-RECOVERY-P1-002 — efeito das devoluções da sessão no caixa.
 *
 * Regra única (pura) usada pelo `sessao-detalhe`, pelo resumo do fechamento e pela rota que
 * fecha o caixa:
 *  - DESCONTAM a gaveta: reembolso em dinheiro e sobra de troca devolvida em dinheiro.
 *  - NÃO descontam a gaveta: vale-troca, crédito consumido na nova venda, reembolso Pix,
 *    estorno de cartão (execução externa) e retorno só ao estoque.
 *  - Reembolso Pix sai da conta (não da gaveta): entra só no "saldo movimentado".
 *  - Devolução legada (`/api/ops/devolucao`, sem forma registrada) de tipo reembolso não
 *    é presumida em nenhuma forma: fica em `legadoSemForma` para conferência humana.
 *
 * A sessão é a da própria devolução (`DevolucaoVenda.sessaoId`) — onde o dinheiro saiu.
 * Cada devolução conta UMA vez (o valor vem do resultado persistido da operação).
 */
import { TROCA_PAYLOAD_SCHEMA, arredonda2 } from "@/lib/pdv/trocas/troca-disponibilidade"

export type DevolucaoCaixaRow = { id: string; tipo: string; valorTotal: number; payload: unknown }

export type ResumoDevolucoesCaixa = {
  qtd: number
  reembolsosDinheiro: number
  reembolsosPix: number
  /** Estorno no cartão registrado, a executar fora do sistema (não sai da gaveta). */
  estornosCartaoPendentes: number
  /** Reembolso legado sem forma registrada — não descontado; exige conferência. */
  legadoSemForma: number
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function resumoDevolucoesCaixa(devolucoes: DevolucaoCaixaRow[]): ResumoDevolucoesCaixa {
  const out: ResumoDevolucoesCaixa = { qtd: 0, reembolsosDinheiro: 0, reembolsosPix: 0, estornosCartaoPendentes: 0, legadoSemForma: 0 }
  for (const d of devolucoes) {
    out.qtd += 1
    const p = asRecord(d.payload)
    const r = p && p.schema === TROCA_PAYLOAD_SCHEMA ? asRecord(p.resultado) : null
    if (r) {
      const reemb = asRecord(r.reembolso)
      const valor = reemb ? Number(reemb.valor) || 0 : 0
      if (valor <= 0) continue
      if (reemb!.forma === "dinheiro") out.reembolsosDinheiro += valor
      else if (reemb!.forma === "pix") out.reembolsosPix += valor
      else if (reemb!.forma === "estorno_cartao") out.estornosCartaoPendentes += valor
      continue
    }
    if (d.tipo === "devolucao" && d.valorTotal > 0) out.legadoSemForma += d.valorTotal
  }
  return {
    qtd: out.qtd,
    reembolsosDinheiro: arredonda2(out.reembolsosDinheiro),
    reembolsosPix: arredonda2(out.reembolsosPix),
    estornosCartaoPendentes: arredonda2(out.estornosCartaoPendentes),
    legadoSemForma: arredonda2(out.legadoSemForma),
  }
}
