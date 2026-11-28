import "server-only"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireEnterpriseSession } from "@/lib/auth/guard-enterprise"
import { canAccessStore, canUseModule, getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
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
const negado = (): FinanceiroAccessResult => ({
  ok: false, status: 403, error: "Sem acesso ao perfil financeiro.",
})

/** Identidade vem da sessão; ownership e concessões são lidos do banco a cada chamada. */
export async function requireFinanceiroPerfilAccess(
  input: unknown,
  acao: FinanceiroAcao = "view",
): Promise<FinanceiroAccessResult> {
  try {
    const base = await requireEnterpriseSession()
    if (!base.ok) return { ok: false, status: base.status === 401 ? 401 : 403, error: base.error }
    const parsed = seletorSchema.safeParse(input)
    if (!parsed.success || (acao !== "view" && acao !== "edit")) return negado()
    const userId = base.session.user.id
    const user = await prisma.adminUser.findUnique({
      where: { id: userId }, select: { active: true, role: true },
    })
    if (!user?.active) return negado()
    const permissions = getEnterprisePermissions(user.role)
    if (!permissions.financeiro[acao]) return negado()

    const seletor = parsed.data
    // Reconciliação main: EMPRESA também exige o módulo finance contratado para a loja (access-policy).
    if (seletor.tipo === "EMPRESA" && (!canAccessStore(base.session, seletor.storeId)
      || !canUseModule(base.session, "finance", seletor.storeId))) return negado()
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
    return { ok: true, contexto }
  } catch {
    return { ok: false, status: 503, error: "Não foi possível validar o acesso financeiro." }
  }
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
  const result = await requireFinanceiroPerfilAccess(seletor, acao)
  if (result.ok && result.contexto.userId !== contexto.userId) return negado()
  return result
}
