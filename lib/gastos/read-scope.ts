import "server-only"
import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@/generated/prisma"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import type { FinanceiroContextoAutorizado } from "./types"

export class FinanceiroReadError extends Error {
  constructor(public readonly status = 403) {
    super(status === 404 ? "Registro financeiro indisponível." : "Não foi possível consultar os dados financeiros.")
    this.name = "FinanceiroReadError"
  }
}

type EmpresaPredicate = {
  OR: [{ perfilId: null }, { perfil: { is: { tipo: "EMPRESA"; storeId: string } } }]
}

/** Predicado interno, NÃO autorização. O chamador precisa de um gate vigente.
 * A interseção mantém filtros/OR/AND do consumidor; NULL é legado da mesma loja.
 * Uma loja ausente nunca vira wildcard, nem sequer num helper sem consumidores.
 */
export function leituraEmpresaWhere<T extends object>(storeId: string, filtro: T) {
  if (typeof storeId !== "string" || !storeId.trim()) throw new FinanceiroReadError()
  const perfil: EmpresaPredicate = { OR: [
    { perfilId: null }, { perfil: { is: { tipo: "EMPRESA", storeId } } },
  ] }
  return { ...filtro, storeId, AND: [filtro, perfil] }
}

export const FINANCEIRO_PRIVATE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, x-assistec-loja-id",
})

/** Inclusive respostas vazias/negadas e exports; não guardar resposta sensível no browser/CDN. */
export function respostaFinanceiraPrivada<T extends Response>(response: T): T {
  for (const [key, value] of Object.entries(FINANCEIRO_PRIVATE_HEADERS)) {
    if (key === "Vary") {
      const vary = new Set([...(response.headers.get(key)?.split(/,\s*/) ?? []), ...value.split(/,\s*/)])
      response.headers.set(key, [...vary].join(", "))
    } else response.headers.set(key, value)
  }
  return response
}

/** Gate empresarial do reader. Cookie de assinatura/storeId não identifica um ator.
 * Sem perfil provisionado, legado usa membership REAL e permissão atual, sem criar perfil.
 * Com perfil, soma o grant financeiro vigente ao membership; ADMIN não o ignora.
 * Contador/PDV/OS possuem seus gates próprios; não transportar este resultado ao cliente.
 */
export async function requireLeituraOperacionalEmpresa(
  storeId: string,
  check: (p: EnterprisePermissions) => boolean,
) {
  const { requireEnterpriseSession } = await import("@/lib/auth/guard-enterprise")
  const { canAccessStore, getEnterprisePermissions, getPermissionsFromSession } = await import("@/lib/auth/enterprise-permissions")
  const { prisma } = await import("@/lib/prisma")
  const { gestorMoneyAtivo } = await import("./ativacao")
  const session = await requireEnterpriseSession()
  if (!session.ok) throw new FinanceiroReadError(session.status === 401 ? 401 : 403)
  if (!storeId?.trim() || !canAccessStore(session.session, storeId)) throw new FinanceiroReadError()
  const userId = session.session.user.id
  if (!gestorMoneyAtivo()) {
    // Ativação controlada — desligado, a autoridade é exatamente a da main: sessão cujo callback
    // JWT relê usuário ativo/sessionVersion/vínculos do banco a cada request (canAccessStore sobre
    // allowedStoreIds; lojaId só quando não há vínculo nenhum) e permissões por loja/módulo.
    const permissions = getPermissionsFromSession(session.session, storeId)
    if (!check(permissions)) throw new FinanceiroReadError()
    return { userId, storeId, permissions }
  }
  // Ligado: regra estrita do G003 — usuário ativo relido aqui e vínculo AdminUserStore atual,
  // sem fallback de loja primária que restaure um vínculo revogado.
  const user = await prisma.adminUser.findUnique({ where: { id: userId }, select: { active: true, role: true } })
  if (!user?.active) throw new FinanceiroReadError()
  const permissions = getEnterprisePermissions(user.role)
  if (!check(permissions)) throw new FinanceiroReadError()
  const membership = await prisma.adminUserStore.findUnique({
    where: { adminUserId_storeId: { adminUserId: userId, storeId } }, select: { storeId: true },
  })
  if (!membership) throw new FinanceiroReadError()
  return { userId, storeId, permissions }
}

export async function requireLeituraFinanceiraEmpresa(
  storeId: string,
  check: (p: EnterprisePermissions) => boolean = p => p.financeiro.view,
) {
  const base = await requireLeituraOperacionalEmpresa(storeId, p => p.financeiro.view && check(p))
  const { prisma } = await import("@/lib/prisma")
  const { userId } = base
  const { gestorMoneyAtivo } = await import("./ativacao")
  // Desligado: a leitura empresarial segue a autoridade da main — perfil desativado ou sem grant
  // (de uma ativação anterior) não bloqueia o Financeiro existente.
  if (!gestorMoneyAtivo()) return { ...base, perfilId: null }
  const perfil = await prisma.financeiroPerfil.findUnique({
    where: { storeId },
    select: { id: true, tipo: true, ativo: true,
      membros: { where: { adminUserId: userId, storeId, revogadoEm: null }, select: { id: true } } },
  })
  if (perfil && (perfil.tipo !== "EMPRESA" || !perfil.ativo || !perfil.membros.length)) throw new FinanceiroReadError()
  return { ...base, perfilId: perfil?.id ?? null }
}

/** O scope nominal seleciona a fonte, mas o request atual continua sendo a autoridade.
 * Contador externo possui sessão/vínculo próprios, sem identidade AdminUser emprestada.
 */
export async function requireLeituraContadorEmpresa(scope: Readonly<{ storeId: string; userId: string }>) {
  try {
    if (!scope?.storeId?.trim() || !scope.userId?.trim()) throw new FinanceiroReadError()
    if (!("papel" in scope)) {
      const atual = await requireLeituraFinanceiraEmpresa(scope.storeId, p => p.hubs.contador)
      if (atual.userId !== scope.userId) throw new FinanceiroReadError()
      return
    }
    const { cookies } = await import("next/headers")
    const { CONTADOR_EXTERNO_COOKIE } = await import("@/lib/contador/auth-externa/sessao")
    const { criarRepoAuthExterna } = await import("@/lib/contador/auth-externa/repo-prisma")
    const { resolverEscopoExterno } = await import("@/lib/contador/auth-externa/escopo-externo")
    const repo = criarRepoAuthExterna()
    // Assinatura, expiração, revogação, usuário/versão e vínculo são conferidos pelo
    // mesmo validador. Somente metadados de uso/renovação ficam no guard HTTP.
    const somenteLeitura = { ...repo,
      tocarUltimoUsoSessao: async () => { /* reader não altera sessão */ },
      estenderSessao: async () => { /* reader não renova sessão */ },
    }
    const atual = await resolverEscopoExterno(somenteLeitura, {
      token: (await cookies()).get(CONTADOR_EXTERNO_COOKIE)?.value, storeId: scope.storeId,
    })
    if (!atual.ok || atual.usuario.id !== scope.userId || atual.papel !== scope.papel) throw new FinanceiroReadError()
    const { prisma } = await import("@/lib/prisma")
    const { gestorMoneyAtivo } = await import("./ativacao")
    const perfil = gestorMoneyAtivo() ? await prisma.financeiroPerfil.findUnique({
      where: { storeId: scope.storeId }, select: { tipo: true, ativo: true, ownerAdminUserId: true },
    }) : null
    if (perfil && (perfil.tipo !== "EMPRESA" || !perfil.ativo || perfil.ownerAdminUserId !== null)) throw new FinanceiroReadError()
  } catch (e) {
    if (e instanceof FinanceiroReadError) throw e
    throw new FinanceiroReadError(503)
  }
}

function validarSeletoresEmpresa(req: Request | undefined, storeId: string) {
  if (req) {
      const url = new URL(req.url)
      const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)assistec-active-store=([^;]*)/)
      const seletores = [req.headers.get("x-assistec-loja-id"), url.searchParams.get("storeId"),
        url.searchParams.get("lojaId"), cookie ? decodeURIComponent(cookie[1]) : null]
      if (seletores.some(value => value !== null && value.trim() !== storeId)
        || ["perfilId", "ownerAdminUserId", "tipoPerfil"].some(key => url.searchParams.has(key))
        || req.headers.has("x-financeiro-perfil-id")) throw new FinanceiroReadError()
  }
}

export async function apiGuardLeituraFinanceira(
  storeId: string,
  check?: (p: EnterprisePermissions) => boolean,
  req?: Request,
): Promise<NextResponse | null> {
  try {
    validarSeletoresEmpresa(req, storeId)
    await requireLeituraFinanceiraEmpresa(storeId, check)
    return null
  } catch (e) {
    const status = e instanceof FinanceiroReadError ? e.status : 503
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Não foi possível consultar os dados financeiros." }, { status }))
  }
}

export async function apiGuardLeituraOperacional(
  storeId: string,
  check: (p: EnterprisePermissions) => boolean,
  req?: Request,
): Promise<NextResponse | null> {
  try {
    validarSeletoresEmpresa(req, storeId)
    await requireLeituraOperacionalEmpresa(storeId, check)
    return null
  } catch (e) {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Não foi possível consultar os dados." },
      { status: e instanceof FinanceiroReadError ? e.status : 503 }))
  }
}

/** Comandos são empresariais. Sem grant financeiro atual, nem seus resultados históricos são públicos ao HUB. */
export async function leituraComandosOmniEmpresaWhere(storeId: string): Promise<Prisma.OmniAgentCommandWhereInput> {
  await requireLeituraOperacionalEmpresa(storeId, p => p.workspace.omniAgent)
  try {
    await requireLeituraFinanceiraEmpresa(storeId)
    return { storeId }
  } catch {
    return { storeId, NOT: { OR: ["FINANCE_SUMMARY", "EXPENSE_CREATE", "RECEIVABLE_CREATE"].map(intent => ({
      interpretacao: { path: ["intent"], equals: intent },
    })) } }
  }
}

/** Snapshot privado read-only. Revalida o token opaco G001 E os grants no snapshot.
 * Não provisiona/adota registros e o PostgreSQL recusa qualquer escrita no callback.
 */
export async function comLeituraFinanceira<T>(
  input: unknown,
  ler: (db: Prisma.TransactionClient, ctx: FinanceiroContextoAutorizado) => Promise<T>,
): Promise<T> {
  const { revalidateFinanceiroContexto } = await import("./access")
  const access = await revalidateFinanceiroContexto(input, "view")
  if (!access.ok) throw new FinanceiroReadError(access.status)
  const ctx = access.contexto
  const { prisma } = await import("@/lib/prisma")
  const { getEnterprisePermissions } = await import("@/lib/auth/enterprise-permissions")
  return prisma.$transaction(async db => {
    await db.$executeRaw`SET TRANSACTION READ ONLY`
    // RLS: linhas pessoais só nesta transação e só para o dono revalidado acima.
    const { aplicarContextoRls } = await import("./rls-contexto")
    await aplicarContextoRls(db, ctx)
    const user = await db.adminUser.findUnique({ where: { id: ctx.userId }, select: { active: true, role: true } })
    if (!user?.active || !getEnterprisePermissions(user.role).financeiro.view) throw new FinanceiroReadError()
    if (ctx.tipo === "EMPRESA" && !await db.adminUserStore.findUnique({
      where: { adminUserId_storeId: { adminUserId: ctx.userId, storeId: ctx.storeId } }, select: { storeId: true },
    })) throw new FinanceiroReadError()
    const perfil = await db.financeiroPerfil.findFirst({ where: {
      id: ctx.perfilId, ativo: true,
      ...(ctx.tipo === "PESSOAL"
        ? { tipo: "PESSOAL", storeId: null, ownerAdminUserId: ctx.userId }
        : { tipo: "EMPRESA", storeId: ctx.storeId, ownerAdminUserId: null,
            membros: { some: { adminUserId: ctx.userId, storeId: ctx.storeId, revogadoEm: null } } }),
    }, select: { id: true } })
    if (!perfil) throw new FinanceiroReadError()
    return ler(db, ctx)
  }, { isolationLevel: "RepeatableRead" }).catch((e: unknown) => {
    if (e instanceof FinanceiroReadError) throw e
    throw new FinanceiroReadError(503)
  })
}

/** Somente dentro de comLeituraFinanceira; contexto serializado nunca é autorizado. */
export function leituraPerfilWhere(ctx: FinanceiroContextoAutorizado) {
  return ctx.tipo === "PESSOAL"
    ? { storeId: null, perfilId: ctx.perfilId }
    : { storeId: ctx.storeId, OR: [{ perfilId: ctx.perfilId }, { perfilId: null }] }
}

const filtroPrivado = z.object({
  carteiraId: z.string().trim().min(1).max(191).optional(),
  take: z.number().int().min(1).max(100).default(50),
}).strict()

/** Fundação interna de consulta por perfil; não é Action/API nem ativa pessoal no produto. */
export async function lerFinanceiroPerfil(contexto: unknown, input: unknown = {}) {
  const parsed = filtroPrivado.safeParse(input)
  if (!parsed.success) throw new FinanceiroReadError(422)
  return comLeituraFinanceira(contexto, async (db, ctx) => {
    const scope = leituraPerfilWhere(ctx)
    const { carteiraId, take } = parsed.data
    if (carteiraId && !await db.carteiraFinanceira.findFirst({
      where: { ...scope, id: carteiraId, ativo: true }, select: { id: true },
    })) throw new FinanceiroReadError(404)
    const where = { ...scope, ...(carteiraId ? { carteiraId } : {}) }
    const [contas, pagar, receber, movimentos, categorias] = await Promise.all([
      db.carteiraFinanceira.findMany({ where: { ...scope, ...(carteiraId ? { id: carteiraId } : {}) },
        select: { id: true, nome: true, tipo: true, ativo: true, saldoAtual: true }, take, orderBy: { id: "asc" } }),
      db.contaPagarTitulo.findMany({ where, select: { id: true, descricao: true, valor: true, valorCentavos: true, status: true, vencimento: true }, take, orderBy: { id: "asc" } }),
      db.contaReceberTitulo.findMany({ where, select: { id: true, descricao: true, valor: true, valorCentavos: true, status: true, vencimento: true }, take, orderBy: { id: "asc" } }),
      db.movimentacaoFinanceira.findMany({ where, select: { id: true, tipo: true, descricao: true, valor: true, valorCentavos: true, ocorridoEm: true }, take, orderBy: { id: "asc" } }),
      db.categoriaGasto.findMany({ where: { perfilId: ctx.perfilId, storeId: ctx.tipo === "PESSOAL" ? null : ctx.storeId },
        select: { id: true, nome: true, natureza: true, ativo: true }, take, orderBy: { id: "asc" } }),
    ])
    const dinheiro = <R extends { valorCentavos: { toString(): string } | null }>(row: R) => ({
      ...row, valorCentavos: row.valorCentavos?.toString() ?? null,
    })
    return { contas, pagar: pagar.map(dinheiro), receber: receber.map(dinheiro),
      movimentos: movimentos.map(row => ({ ...dinheiro(row), ocorridoEm: row.ocorridoEm?.toISOString() ?? null })), categorias }
  })
}
