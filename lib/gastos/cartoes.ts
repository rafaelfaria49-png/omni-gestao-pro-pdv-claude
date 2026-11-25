import "server-only"
import { z } from "zod"
import type { FinanceiroDb } from "./financeiro-scope"
import { storeDoContexto } from "./financeiro-scope"
import type { FinanceiroContextoAutorizado } from "./types"
import { autorizarOperacaoNaTransacao, emTransacaoGasto } from "./operacoes"
import { competencia, dataCivil, identificadorOperacao, OperacaoGastoError, ordemBinaria } from "./operacao-schema"

const cartaoSchema = z.object({ nome: z.string().trim().min(1).max(120),
  ultimos4: z.string().regex(/^\d{4}$/).optional(), bandeira: z.string().trim().min(1).max(40).optional() }).strict()
const cicloSchema = z.object({ cartaoId: identificadorOperacao, identificador: identificadorOperacao,
  competencia, vencimento: dataCivil, fechamentoEm: dataCivil.optional() }).strict()

export async function cadastrarCartaoGasto(contexto: unknown, input: unknown) {
  const p = cartaoSchema.safeParse(input)
  if (!p.success) throw new OperacaoGastoError("cartao_invalido")
  return emTransacaoGasto(contexto, async (tx, ctx) => {
    await autorizarOperacaoNaTransacao(tx, ctx)
    return tx.cartaoInstrumento.create({ data: { ...p.data, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx) } })
  })
}

export async function cadastrarCicloGasto(contexto: unknown, input: unknown) {
  const p = cicloSchema.safeParse(input)
  if (!p.success) throw new OperacaoGastoError("ciclo_invalido")
  return emTransacaoGasto(contexto, async (tx, ctx) => {
    await tx.$queryRaw`SELECT id FROM cartoes_instrumentos WHERE id=${p.data.cartaoId} AND "perfilId"=${ctx.perfilId} FOR SHARE`
    await autorizarOperacaoNaTransacao(tx, ctx)
    if (!await tx.cartaoInstrumento.findFirst({ where: { id: p.data.cartaoId, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), ativo: true } })) {
      throw new OperacaoGastoError("cartao_indisponivel", 404)
    }
    const data = { ...p.data, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx),
      vencimento: new Date(p.data.vencimento + "T00:00:00Z"),
      fechamentoEm: p.data.fechamentoEm ? new Date(p.data.fechamentoEm + "T00:00:00Z") : null }
    await tx.cartaoCiclo.createMany({ data: [data], skipDuplicates: true })
    const row = await tx.cartaoCiclo.findUniqueOrThrow({ where: { cartaoId_identificador: {
      cartaoId: p.data.cartaoId, identificador: p.data.identificador } } })
    if (!row.ativo || row.competencia !== data.competencia || row.vencimento.getTime() !== data.vencimento.getTime()
      || row.fechamentoEm?.getTime() !== data.fechamentoEm?.getTime()) throw new OperacaoGastoError("ciclo_divergente", 409)
    return row
  })
}

/** Instrumentos antes dos ciclos, sempre ordenados, antes de qualquer título. */
export async function travarCiclosGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado, ids: string[]) {
  const where = { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), id: { in: [...new Set(ids)] } }
  const base = await tx.cartaoCiclo.findMany({ where })
  if (base.length !== new Set(ids).size) throw new OperacaoGastoError("ciclo_indisponivel", 404)
  for (const id of [...new Set(base.map(c => c.cartaoId))].sort(ordemBinaria)) {
    await tx.$queryRaw`SELECT id FROM cartoes_instrumentos WHERE id=${id} AND "perfilId"=${ctx.perfilId} FOR SHARE`
  }
  for (const id of [...new Set(ids)].sort(ordemBinaria)) {
    await tx.$queryRaw`SELECT id FROM cartoes_ciclos WHERE id=${id} AND "perfilId"=${ctx.perfilId} FOR UPDATE`
  }
  const rows = await tx.cartaoCiclo.findMany({ where, include: { cartao: true } })
  if (rows.some(c => !c.ativo || !c.cartao.ativo)) throw new OperacaoGastoError("ciclo_indisponivel", 404)
  return rows
}
