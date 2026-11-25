import "server-only"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { requireFinanceiroPerfilAccess, revalidateFinanceiroContexto } from "./access"
import { storeDoContexto, type FinanceiroDb } from "./financeiro-scope"
import type { FinanceiroContextoAutorizado } from "./types"
import { hashOperacaoGasto, identificadorOperacao, instante, normalizarPropostaGasto, OperacaoGastoError } from "./operacao-schema"
import { z } from "zod"
import { aplicarContextoRls } from "./rls-contexto"

export async function lockGasto(tx: FinanceiroDb, partes: readonly string[]) {
  const chave = JSON.stringify(["gastos:g004", ...partes])
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))::text AS lock`
}

/** Seletor empresarial resolvido no servidor. Nenhum perfil/owner do body é usado. */
export async function contextoEmpresaOperacao(storeId: string) {
  const perfil = await prisma.financeiroPerfil.findUnique({ where: { storeId }, select: { id: true } })
  if (!perfil) throw new OperacaoGastoError("acesso_negado", 403)
  const acesso = await requireFinanceiroPerfilAccess({ tipo: "EMPRESA", storeId, perfilId: perfil.id }, "edit")
  if (!acesso.ok) throw new OperacaoGastoError("acesso_negado", acesso.status)
  return acesso.contexto
}

/** A mesma ordem dos writers G002: títulos antes do perfil e das carteiras.
 * O contexto vem exclusivamente do revalidador opaco G001, nunca do request.
 */
export async function autorizarOperacaoNaTransacao(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado) {
  const user = await tx.adminUser.findUnique({ where: { id: ctx.userId }, select: { active: true, role: true } })
  if (!user?.active || !getEnterprisePermissions(user.role).financeiro.edit) throw new OperacaoGastoError("acesso_negado", 403)
  await tx.$queryRaw`SELECT id FROM financeiro_perfis WHERE id=${ctx.perfilId} FOR SHARE`
  const perfil = await tx.financeiroPerfil.findFirst({ where: { id: ctx.perfilId, ativo: true,
    ...(ctx.tipo === "PESSOAL" ? { tipo: "PESSOAL", ownerAdminUserId: ctx.userId, storeId: null }
      : { tipo: "EMPRESA", storeId: ctx.storeId }) } })
  if (!perfil) throw new OperacaoGastoError("acesso_negado", 403)
  if (ctx.tipo === "EMPRESA") {
    const grant = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT m.id FROM financeiro_perfil_membros m
      JOIN admin_user_stores s ON s."adminUserId"=m."adminUserId" AND s."storeId"=m."storeId"
      WHERE m."perfilId"=${ctx.perfilId} AND m."storeId"=${ctx.storeId}
        AND m."adminUserId"=${ctx.userId} AND m."revogadoEm" IS NULL FOR SHARE OF m,s`
    if (!grant.length) throw new OperacaoGastoError("acesso_negado", 403)
  }
}

/** Sem retry de deadlock nem sucesso após falha SQL. Retorna somente após COMMIT. */
export async function emTransacaoGasto<T>(contexto: unknown,
  fn: (tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado) => Promise<T>): Promise<T> {
  const access = await revalidateFinanceiroContexto(contexto, "edit")
  if (!access.ok) throw new OperacaoGastoError("acesso_negado", access.status)
  return prisma.$transaction(async tx => {
    // RLS: linhas pessoais só nesta transação e só para o dono revalidado acima.
    await aplicarContextoRls(tx, access.contexto)
    await tx.$queryRaw`SELECT id FROM admin_users WHERE id=${access.contexto.userId} FOR SHARE`
    return fn(tx, access.contexto)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 20000 })
}

const prepararSchema = z.object({ grupoChave: identificadorOperacao, proposta: z.unknown(), expiraEm: instante.optional() }).strict()
const alterarSchema = z.object({ revisaoId: identificadorOperacao, versaoEsperada: z.number().int().positive(),
  proposta: z.unknown(), expiraEm: instante.optional() }).strict()
const decidirSchema = z.object({ revisaoId: identificadorOperacao, versaoEsperada: z.number().int().positive() }).strict()

/** Autoridade temporal única: relógio do PostgreSQL lido na própria transação (G006 · clock skew).
 * Web e worker podem rodar em hosts com relógios diferentes; prazo e expiração nunca usam Date.now(). */
export async function agoraDoBanco(tx: FinanceiroDb): Promise<Date> {
  const [row] = await tx.$queryRaw<Array<{ agora: Date }>>`SELECT clock_timestamp() AS agora`
  if (!(row?.agora instanceof Date)) throw new OperacaoGastoError("relogio_indisponivel", 503)
  return row.agora
}

function expiracao(agora: Date, input?: string) {
  const t = agora.getTime(), expira = input ? new Date(input) : new Date(t + 30 * 60_000)
  if (expira.getTime() <= t || expira.getTime() > t + 86_400_000) throw new OperacaoGastoError("expiracao_invalida")
  return expira
}

export async function prepararRevisaoGasto(contexto: unknown, input: unknown) {
  const parsed = prepararSchema.safeParse(input)
  if (!parsed.success) throw new OperacaoGastoError("revisao_invalida")
  const { grupoChave } = parsed.data, proposta = normalizarPropostaGasto(parsed.data.proposta), payloadHash = hashOperacaoGasto(proposta)
  return emTransacaoGasto(contexto, async (tx, ctx) => {
    await lockGasto(tx, ["grupo", ctx.perfilId, grupoChave])
    await autorizarOperacaoNaTransacao(tx, ctx)
    const atual = await tx.gastoRevisao.findFirst({ where: { perfilId: ctx.perfilId, grupoChave }, orderBy: { versao: "desc" } })
    if (atual) {
      if (atual.payloadHash !== payloadHash) throw new OperacaoGastoError("grupo_conteudo_divergente", 409)
      return atual
    }
    return tx.gastoRevisao.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), criadoPorAdminUserId: ctx.userId,
      grupoChave, versao: 1, tipo: proposta.tipo, proposta: proposta as Prisma.InputJsonObject,
      payloadHash, expiraEm: expiracao(await agoraDoBanco(tx), parsed.data.expiraEm) } })
  })
}

export async function travarRevisaoGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado, id: string) {
  const base = await tx.gastoRevisao.findFirst({ where: { id, perfilId: ctx.perfilId } })
  if (!base) throw new OperacaoGastoError("revisao_indisponivel", 404)
  await lockGasto(tx, ["grupo", ctx.perfilId, base.grupoChave])
  await tx.$queryRaw`SELECT id FROM gastos_revisoes WHERE id=${id} AND "perfilId"=${ctx.perfilId} FOR UPDATE`
  return tx.gastoRevisao.findFirstOrThrow({ where: { id, perfilId: ctx.perfilId } })
}

export function exigirRevisaoPronta(row: { versao: number; estado: string; expiraEm: Date }, versao: number, agora: Date) {
  if (row.versao !== versao || row.estado !== "PRONTA") throw new OperacaoGastoError("revisao_desatualizada", 409)
  if (row.expiraEm.getTime() <= agora.getTime()) throw new OperacaoGastoError("revisao_expirada", 409)
}

export async function corrigirRevisaoGasto(contexto: unknown, input: unknown) {
  const parsed = alterarSchema.safeParse(input)
  if (!parsed.success) throw new OperacaoGastoError("revisao_invalida")
  const p = parsed.data, proposta = normalizarPropostaGasto(p.proposta)
  return emTransacaoGasto(contexto, async (tx, ctx) => {
    const atual = await travarRevisaoGasto(tx, ctx, p.revisaoId)
    await autorizarOperacaoNaTransacao(tx, ctx)
    const agora = await agoraDoBanco(tx)
    exigirRevisaoPronta(atual, p.versaoEsperada, agora)
    const cas = await tx.gastoRevisao.updateMany({ where: { id: atual.id, perfilId: ctx.perfilId, versao: p.versaoEsperada, estado: "PRONTA" },
      data: { estado: "SUBSTITUIDA", decididaEm: agora } })
    if (cas.count !== 1) throw new OperacaoGastoError("revisao_desatualizada", 409)
    return tx.gastoRevisao.create({ data: { perfilId: ctx.perfilId, storeId: storeDoContexto(ctx), criadoPorAdminUserId: ctx.userId,
      grupoChave: atual.grupoChave, versao: atual.versao + 1, correcaoDeId: atual.id, tipo: proposta.tipo,
      proposta: proposta as Prisma.InputJsonObject, payloadHash: hashOperacaoGasto(proposta), expiraEm: expiracao(agora, p.expiraEm) } })
  })
}

async function decidirRevisao(contexto: unknown, input: unknown, estado: "CANCELADA" | "EXPIRADA") {
  const parsed = decidirSchema.safeParse(input)
  if (!parsed.success) throw new OperacaoGastoError("revisao_invalida")
  const p = parsed.data
  return emTransacaoGasto(contexto, async (tx, ctx) => {
    const row = await travarRevisaoGasto(tx, ctx, p.revisaoId)
    await autorizarOperacaoNaTransacao(tx, ctx)
    const agora = await agoraDoBanco(tx)
    if (row.versao !== p.versaoEsperada || row.estado !== "PRONTA"
      || (estado === "EXPIRADA" && row.expiraEm.getTime() > agora.getTime())) throw new OperacaoGastoError("revisao_desatualizada", 409)
    return tx.gastoRevisao.update({ where: { id: row.id }, data: { estado, decididaEm: agora } })
  })
}

export const cancelarRevisaoGasto = (contexto: unknown, input: unknown) => decidirRevisao(contexto, input, "CANCELADA")
export const expirarRevisaoGasto = (contexto: unknown, input: unknown) => decidirRevisao(contexto, input, "EXPIRADA")
