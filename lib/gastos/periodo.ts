import "server-only"
import type { FinanceiroDb } from "./financeiro-scope"
import type { FinanceiroContextoAutorizado } from "./types"
import { diaSaoPaulo, OperacaoGastoError, type PropostaGasto, ordemBinaria } from "./operacao-schema"

/** Mesma chave no fechamento e na aplicação; nunca usa a loja para PESSOAL. */
export async function travarCompetenciaFinanceira(tx: FinanceiroDb, storeId: string, competencia: string) {
  const chave = `financeiro:periodo:${storeId}:${competencia}`
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))::text AS lock`
}

export function datasDaProposta(p: PropostaGasto): string[] {
  return [...new Set([
    ...("dataGasto" in p ? [p.dataGasto] : []),
    ...("dataPagamento" in p ? [diaSaoPaulo(p.dataPagamento)] : []),
    ...("competencia" in p && p.competencia ? [p.competencia + "-01"] : []),
  ])].sort(ordemBinaria)
}

export async function travarPeriodosGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado, datas: string[]) {
  if (ctx.tipo === "PESSOAL") return // O schema atual não tem fechamento pessoal; não inventar Store.
  for (const c of [...new Set(datas.map(d => d.slice(0, 7)))].sort(ordemBinaria)) {
    await travarCompetenciaFinanceira(tx, ctx.storeId, c)
  }
}

export async function exigirPeriodosAbertosGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado, datas: string[]) {
  if (ctx.tipo === "PESSOAL") return
  for (const d of datas) {
    const fechado = await tx.fechamentoFinanceiro.findFirst({ where: { storeId: ctx.storeId, status: "fechado", OR: [
      { tipo: "diario", dataReferencia: d }, { tipo: "mensal", dataReferencia: d.slice(0, 7) + "-01" },
    ] }, select: { id: true } })
    if (fechado) throw new OperacaoGastoError("periodo_fechado", 409, "Período financeiro fechado. Reabra o período para aplicar esta operação.")
  }
}
