import "server-only"
import { z } from "zod"
import { comContextoFinanceiro, FinanceiroScopeError, storeDoContexto } from "./financeiro-scope"

const criarSchema = z.object({
  nome: z.string().trim().min(1).max(120), natureza: z.enum(["DESPESA", "RECEITA"]),
}).strict()

export async function criarCategoriaGasto(contexto: unknown, input: unknown) {
  const parsed = criarSchema.safeParse(input)
  if (!parsed.success) throw new FinanceiroScopeError(422)
  const p = parsed.data
  const nomeNormalizado = p.nome.normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("pt-BR")
  return comContextoFinanceiro(contexto, async (tx, ctx) => {
    const row = await tx.categoriaGasto.upsert({
      where: { perfilId_nomeNormalizado_natureza: { perfilId: ctx.perfilId, nomeNormalizado, natureza: p.natureza } },
      create: { ...p, nomeNormalizado, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx) }, update: {},
    })
    if (!row.ativo) throw new FinanceiroScopeError()
    return row
  })
}

const alterarSchema = z.object({ id: z.string().min(1).max(191), ativo: z.boolean() }).strict()
export async function definirCategoriaGastoAtiva(contexto: unknown, input: unknown) {
  const parsed = alterarSchema.safeParse(input)
  if (!parsed.success) throw new FinanceiroScopeError(422)
  return comContextoFinanceiro(contexto, async (tx, ctx) => {
    const where = { id: parsed.data.id, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx) }
    if (!await tx.categoriaGasto.findFirst({ where })) throw new FinanceiroScopeError()
    return tx.categoriaGasto.update({ where: { id: parsed.data.id }, data: { ativo: parsed.data.ativo } })
  })
}
