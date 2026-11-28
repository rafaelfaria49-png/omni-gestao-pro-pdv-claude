import "server-only"
import { z } from "zod"
import { comContextoFinanceiro, FinanceiroScopeError, storeDoContexto, validarCentavos } from "./financeiro-scope"

const criarSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  tipo: z.enum(["caixa", "banco", "dinheiro", "credito", "debito", "investimento"]),
  saldoInicialCentavos: z.union([z.string(), z.number()]).default("0"),
  identificadorInstrumento: z.string().trim().min(1).max(120).optional(),
  instituicao: z.string().trim().min(1).max(120).optional(),
}).strict()

/** Conta não é perfil, categoria ou forma de pagamento. Nenhum chamador operacional pessoal. */
export async function criarContaFinanceira(contexto: unknown, input: unknown) {
  const parsed = criarSchema.safeParse(input)
  if (!parsed.success) throw new FinanceiroScopeError(422)
  const p = parsed.data
  const cents = validarCentavos(p.saldoInicialCentavos, true)
  return comContextoFinanceiro(contexto, (tx, ctx) => tx.carteiraFinanceira.create({ data: {
    nome: p.nome, tipo: p.tipo, instituicao: p.instituicao,
    identificadorInstrumento: p.identificadorInstrumento, storeId: storeDoContexto(ctx), perfilId: ctx.perfilId,
    saldoInicial: Number(cents) / 100, saldoAtual: Number(cents) / 100,
    saldoInicialCentavos: cents.toString(), saldoAtualCentavos: cents.toString(), precisaoStatus: "CENTAVOS",
  } }))
}

const alterarSchema = z.object({ id: z.string().min(1).max(191), ativo: z.boolean() }).strict()
export async function definirContaFinanceiraAtiva(contexto: unknown, input: unknown) {
  const parsed = alterarSchema.safeParse(input)
  if (!parsed.success) throw new FinanceiroScopeError(422)
  return comContextoFinanceiro(contexto, async (tx, ctx) => {
    const where = { id: parsed.data.id, perfilId: ctx.perfilId, storeId: storeDoContexto(ctx) }
    if (!await tx.carteiraFinanceira.findFirst({ where })) throw new FinanceiroScopeError()
    return tx.carteiraFinanceira.update({ where: { id: parsed.data.id }, data: { ativo: parsed.data.ativo } })
  })
}
