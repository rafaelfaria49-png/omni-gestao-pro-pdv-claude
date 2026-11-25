import "server-only"
import type { ContaPagarTitulo } from "@/generated/prisma"
import { precisaoLegada, storeDoContexto, type FinanceiroDb } from "./financeiro-scope"
import type { FinanceiroContextoAutorizado } from "./types"
import { OperacaoGastoError, ordemBinaria } from "./operacao-schema"

export function centavosLegadosExatos(valor: number): bigint {
  const p = precisaoLegada(valor)
  if (!p.valorCentavos) throw new OperacaoGastoError("precisao_legada_exige_revisao", 409)
  return BigInt(p.valorCentavos)
}

export async function travarTitulosGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado, ids: string[]) {
  for (const id of [...new Set(ids)].sort(ordemBinaria)) {
    await tx.$queryRaw`SELECT id FROM contas_pagar_titulos WHERE id=${id} AND "storeId" IS NOT DISTINCT FROM ${storeDoContexto(ctx)}
      AND ("perfilId"=${ctx.perfilId} OR ("perfilId" IS NULL AND ${ctx.tipo === "EMPRESA"})) FOR NO KEY UPDATE`
  }
  const rows = await tx.contaPagarTitulo.findMany({ where: { id: { in: ids }, storeId: storeDoContexto(ctx), ativo: true,
    ...(ctx.tipo === "PESSOAL" ? { perfilId: ctx.perfilId } : { OR: [{ perfilId: ctx.perfilId }, { perfilId: null }] }) } })
  if (rows.length !== new Set(ids).size) throw new OperacaoGastoError("titulo_indisponivel", 404)
  return rows
}

/** Só os eventos sem pagamentoId são legado. A projeção G004 nunca entra duas vezes. */
export async function saldoTituloGasto(tx: FinanceiroDb, row: ContaPagarTitulo) {
  if (!row.ativo || ["cancelado", "estornado"].includes(row.status)) throw new OperacaoGastoError("titulo_encerrado", 409)
  const total = centavosLegadosExatos(row.valor)
  if (row.valorCentavos !== null && BigInt(row.valorCentavos.toString()) !== total) throw new OperacaoGastoError("precisao_legada_exige_revisao", 409)
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {}
  const historico = Array.isArray(payload.historico) ? payload.historico : []
  let pago = BigInt(0)
  for (const e of historico) {
    if (!e || typeof e !== "object" || Array.isArray(e) || e.pagamentoId) continue
    if (["pagamento", "liquidacao", "estorno_pagamento"].includes(String(e.tipo))) {
      if (typeof e.valor !== "number") throw new OperacaoGastoError("historico_exige_revisao", 409)
      pago += centavosLegadosExatos(e.valor) * (e.tipo === "estorno_pagamento" ? -BigInt(1) : BigInt(1))
    }
  }
  const alocacoes = await tx.alocacaoPagamento.findMany({ where: { pagarTituloId: row.id }, include: { pagamento: { select: { tipo: true } } } })
  for (const a of alocacoes) pago += BigInt(a.valorCentavos.toString()) * (a.pagamento.tipo === "ESTORNO" ? -BigInt(1) : BigInt(1))
  if (total <= BigInt(0) || pago < BigInt(0) || pago > total || (row.status === "pago" && pago !== total)) {
    throw new OperacaoGastoError("historico_exige_revisao", 409)
  }
  return { total, pago, restante: total - pago }
}

export type AlocacaoPlanejada = { tituloId?: string; gastoId?: string; valor: bigint; compensaAlocacaoId?: string }
