import "server-only"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { canAccessStore, canUseModule, getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { resolveStoreModules } from "@/lib/auth/access-policy"
import { declararDonoPessoalRls } from "./rls-contexto"
import type {
  FinanceiroAcao,
  FinanceiroAccessResult,
  FinanceiroContextoAutorizado,
} from "./types"

const id = z.string().trim().min(1).max(191)
const seletorSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("PESSOAL"), perfilId: id }).strict(),
  z.object({ tipo: z.literal("EMPRESA"), perfilId: id, storeId: id }).strict(),
])
const emitidos = new WeakSet<object>()
/**
 * Como revalidar cada contexto emitido. Sessão web: relê a sessão. Principal verificado (canal GESTAO, G007):
 * reexecuta o verificador do vínculo — sem cookie de navegador — e relê o banco do mesmo jeito.
 */
const origens = new WeakMap<object, VerificadorPrincipalFinanceiro>()

/**
 * Prova de identidade emitida no SERVIDOR por um vínculo verificado (G007), nunca por dado do cliente.
 * Devolve o userId enquanto o vínculo estiver ativo; null = revogado/inexistente (fail-closed).
 */
export type VerificadorPrincipalFinanceiro = () => Promise<{ userId: string } | null>
const negado = (): FinanceiroAccessResult => ({
  ok: false, status: 403, error: "Sem acesso ao perfil financeiro.",
})

/** Identidade vem da sessão; ownership e concessões são lidos do banco a cada chamada. */
export async function requireFinanceiroPerfilAccess(
  input: unknown,
  acao: FinanceiroAcao = "view",
): Promise<FinanceiroAccessResult> {
  try {
    // Import tardio: o caminho por principal (worker G008) não carrega NextAuth/React de sessão web.
    const { requireEnterpriseSession } = await import("@/lib/auth/guard-enterprise")
    const base = await requireEnterpriseSession()
    if (!base.ok) return { ok: false, status: base.status === 401 ? 401 : 403, error: base.error }
    const parsed = seletorSchema.safeParse(input)
    if (!parsed.success || (acao !== "view" && acao !== "edit")) return negado()
    const userId = base.session.user.id
    const seletor = parsed.data
    // Reconciliação main: EMPRESA também exige o módulo finance contratado para a loja (access-policy).
    if (seletor.tipo === "EMPRESA" && (!canAccessStore(base.session, seletor.storeId)
      || !canUseModule(base.session, "finance", seletor.storeId))) return negado()
    return await emitirContexto(userId, seletor, acao, null)
  } catch {
    return { ok: false, status: 503, error: "Não foi possível validar o acesso financeiro." }
  }
}

/**
 * Mesmo contrato de `requireFinanceiroPerfilAccess`, com a identidade vinda de um principal verificado pelo
 * servidor (vínculo WhatsApp G007) em vez da sessão web. O que a sessão provaria é lido do BANCO a cada
 * chamada: usuário ativo e sem troca de senha pendente, permissão financeira do papel e, em EMPRESA,
 * vínculo à loja (membro do perfil, FK com AdminUserStore) e módulo `finance` contratado pela loja.
 */
export async function requireFinanceiroPerfilAccessPorPrincipal(
  verificar: VerificadorPrincipalFinanceiro,
  input: unknown,
  acao: FinanceiroAcao = "view",
): Promise<FinanceiroAccessResult> {
  try {
    if (typeof verificar !== "function") return negado()
    const principal = await verificar()
    const parsed = seletorSchema.safeParse(input)
    if (!principal || typeof principal.userId !== "string" || !principal.userId || !parsed.success
      || (acao !== "view" && acao !== "edit")) return negado()
    const seletor = parsed.data
    if (seletor.tipo === "EMPRESA") {
      const [user, store] = await Promise.all([
        prisma.adminUser.findUnique({ where: { id: principal.userId }, select: { mustChangePassword: true, role: true } }),
        prisma.store.findUnique({ where: { id: seletor.storeId }, select: { moduleAccess: true } }),
      ])
      if (!user || user.mustChangePassword || !store || !resolveStoreModules(store.moduleAccess).includes("finance")
        || !getEnterprisePermissions(user.role).hubs.financeiro) return negado()
    }
    return await emitirContexto(principal.userId, seletor, acao, verificar)
  } catch {
    return { ok: false, status: 503, error: "Não foi possível validar o acesso financeiro." }
  }
}

async function emitirContexto(userId: string, seletor: z.infer<typeof seletorSchema>, acao: FinanceiroAcao,
  verificar: VerificadorPrincipalFinanceiro | null): Promise<FinanceiroAccessResult> {
    const user = await prisma.adminUser.findUnique({
      where: { id: userId }, select: { active: true, role: true, mustChangePassword: true },
    })
    if (!user?.active || (verificar && user.mustChangePassword)) return negado()
    const permissions = getEnterprisePermissions(user.role)
    if (!permissions.financeiro[acao]) return negado()
    const buscarPerfil = (db: Pick<typeof prisma, "financeiroPerfil">) => db.financeiroPerfil.findFirst({
      where: seletor.tipo === "PESSOAL"
        ? { id: seletor.perfilId, tipo: "PESSOAL", ativo: true, ownerAdminUserId: userId }
        : {
            id: seletor.perfilId, tipo: "EMPRESA", ativo: true, storeId: seletor.storeId,
            membros: { some: { adminUserId: userId, storeId: seletor.storeId, revogadoEm: null } },
          },
      select: { id: true, tipo: true, storeId: true, ownerAdminUserId: true },
    })
    // RLS (contrato 20261126150000): o perfil PESSOAL só é visível na transação que declara o dono
    // — o próprio usuário da sessão, nunca um id vindo do cliente.
    const perfil = seletor.tipo === "PESSOAL"
      ? await prisma.$transaction(async (tx) => {
          await declararDonoPessoalRls(tx, userId)
          return buscarPerfil(tx)
        })
      : await buscarPerfil(prisma)
    if (!perfil) return negado()
    // A FK composta do membro exige AdminUserStore atual; sua exclusão revoga o grant.
    const escopo = perfil.tipo === "PESSOAL"
      ? { tipo: "PESSOAL" as const, ownerAdminUserId: userId }
      : { tipo: "EMPRESA" as const, storeId: perfil.storeId! }
    const contexto = Object.freeze({ userId, perfilId: perfil.id, ...escopo }) as FinanceiroContextoAutorizado
    emitidos.add(contexto)
    if (verificar) origens.set(contexto, verificar)
    return { ok: true, contexto }
}

/** Rejeita JSON/clones/objetos forjados e recarrega autorização; usar antes de cada ato. */
export async function revalidateFinanceiroContexto(
  input: unknown,
  acao: FinanceiroAcao = "view",
): Promise<FinanceiroAccessResult> {
  if (typeof input !== "object" || input === null || !emitidos.has(input)) return negado()
  const contexto = input as FinanceiroContextoAutorizado
  const seletor = contexto.tipo === "PESSOAL"
    ? { tipo: contexto.tipo, perfilId: contexto.perfilId }
    : { tipo: contexto.tipo, perfilId: contexto.perfilId, storeId: contexto.storeId }
  const verificar = origens.get(contexto)
  const result = verificar
    ? await requireFinanceiroPerfilAccessPorPrincipal(verificar, seletor, acao)
    : await requireFinanceiroPerfilAccess(seletor, acao)
  if (result.ok && result.contexto.userId !== contexto.userId) return negado()
  return result
}
