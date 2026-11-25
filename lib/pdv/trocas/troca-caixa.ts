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

export type RegularizacaoSessaoItem = {
  tipo: "venda_substituta" | "devolucao"
  referencia: string
  dataEconomica: string
  registradaEm: string
  operador: string
  justificativa: string
  horarioAproximado: boolean
  /** Efeito em DINHEIRO na gaveta da sessão: + entrada da diferença, − reembolso/sobra em dinheiro. */
  dinheiro: number
}

/**
 * P1-003 — operações registradas DEPOIS do fechamento, por regularização, que pertencem a esta
 * sessão. O fechamento original (saldo gravado, resumo persistido) nunca é reescrito: estes itens
 * são exibidos à parte, com o total recalculado e a diferença.
 */
export function regularizacoesDaSessao(
  vendas: Array<{ pedidoId: string; payload: unknown }>,
  devolucoes: Array<{ id: string; localId: string; payload: unknown }>,
): { itens: RegularizacaoSessaoItem[]; dinheiroLiquido: number } {
  const itens: RegularizacaoSessaoItem[] = []
  for (const v of vendas) {
    const p = asRecord(v.payload)
    const reg = asRecord(p?.regularizacaoTroca)
    if (!reg) continue
    const pb = asRecord(p?.paymentBreakdown)
    itens.push({
      tipo: "venda_substituta",
      referencia: v.pedidoId,
      dataEconomica: String(reg.dataEconomica ?? ""),
      registradaEm: String(reg.registradaEm ?? ""),
      operador: String(reg.operador ?? ""),
      justificativa: String(reg.justificativa ?? ""),
      horarioAproximado: reg.horarioAproximado === true,
      dinheiro: arredonda2(Number(pb?.dinheiro) || 0),
    })
  }
  for (const d of devolucoes) {
    const p = asRecord(d.payload)
    const r = p && p.schema === TROCA_PAYLOAD_SCHEMA ? asRecord(p.resultado) : null
    const reg = asRecord(r?.regularizacao)
    if (!reg) continue
    const reemb = asRecord(r?.reembolso)
    const dinheiro = reemb && reemb.forma === "dinheiro" ? -(Number(reemb.valor) || 0) : 0
    itens.push({
      tipo: "devolucao",
      referencia: d.localId,
      dataEconomica: String(reg.dataEconomica ?? ""),
      registradaEm: String(reg.registradaEm ?? ""),
      operador: String(reg.operador ?? ""),
      justificativa: String(reg.justificativa ?? ""),
      horarioAproximado: reg.horarioAproximado === true,
      dinheiro: arredonda2(dinheiro),
    })
  }
  itens.sort((a, b) => a.dataEconomica.localeCompare(b.dataEconomica))
  return { itens, dinheiroLiquido: arredonda2(itens.reduce((s, i) => s + i.dinheiro, 0)) }
}
