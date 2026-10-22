import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { actorMayManageUser, assertActorMayAssignRole, canAccessAdminUsersApi, normalizeAllowedStoreIdsForActor } from "@/lib/auth/admin-users-policy"
import { isPlatformAuthority, isPlatformSession } from "@/lib/auth/access-policy"
import { newPasswordSchema } from "@/lib/auth/password-policy"
import { adminUserSelect as userSelect } from "@/lib/auth/admin-user-select"
import { canUseModule } from "@/lib/auth/enterprise-permissions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const schema = z.object({ name: z.string().trim().min(1).max(200).optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "GERENTE", "OPERADOR", "CAIXA", "TECNICO", "VENDEDOR"]).optional(),
  active: z.boolean().optional(), lojaId: z.string().trim().min(1).nullable().optional(),
  allowedStoreIds: z.array(z.string().trim().min(1)).optional(), password: newPasswordSchema.optional(),
  accessScope: z.enum(["STORE", "PLATFORM"]).optional(),
}).strict()
const error = (message: string, status: number) => NextResponse.json({ ok: false, error: message }, { status })

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !canAccessAdminUsersApi(session)) return error("Não autorizado a alterar usuários.", 403)
  const { id } = await ctx.params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || !Object.keys(parsed.data).length) return error("Dados inválidos.", 400)
  const b = parsed.data
  try {
    const existing = await prisma.adminUser.findUnique({ where: { id }, include: { adminUserStores: true } })
    if (!existing || !actorMayManageUser(session, existing)) return error("Usuário indisponível para este ator.", 403)
    const targetStores = [...existing.adminUserStores.map((s) => s.storeId), ...(existing.lojaId ? [existing.lojaId] : [])]
    if (targetStores.some((sid) => !canUseModule(session, "settings", sid))) return error("Gestão de equipe não liberada nesta unidade.", 403)
    if (b.role) assertActorMayAssignRole(session, b.role)
    if (b.accessScope !== undefined && !isPlatformSession(session)) return error("Somente a plataforma altera autoridade.", 403)
    // O responsável não pode ser desativado, rebaixado ou ter credenciais trocadas pela gestão de equipe.
    if (isPlatformAuthority(existing) && (b.active === false || b.role || b.accessScope || b.password)) return error("Conta da plataforma protegida. Use segurança da própria conta para senha.", 403)
    if (id === session.user.id && (b.role || b.active === false || b.accessScope)) return error("Não é possível alterar o próprio acesso por aqui.", 403)
    const role = b.role ?? existing.role
    const accessScope = b.accessScope ?? existing.accessScope
    if (role === "SUPER_ADMIN" && accessScope !== "PLATFORM") return error("SUPER_ADMIN exige autoridade explícita.", 400)
    const ids = normalizeAllowedStoreIdsForActor(session, b.allowedStoreIds ?? existing.adminUserStores.map((s) => s.storeId))
    if (ids.some((sid) => !canUseModule(session, "settings", sid))) return error("Gestão de equipe não liberada nesta unidade.", 403)
    const lojaId = b.lojaId !== undefined ? b.lojaId : existing.lojaId
    normalizeAllowedStoreIdsForActor(session, lojaId ? [lojaId] : [])
    if (accessScope === "STORE" && !ids.length) return error("Informe ao menos uma unidade.", 400)
    if (lojaId && !ids.includes(lojaId)) return error("A loja principal deve pertencer às unidades permitidas.", 400)
    if (await prisma.store.count({ where: { id: { in: ids } } }) !== ids.length) return error("Unidade inválida.", 400)
    const password = b.password ? await bcrypt.hash(b.password, 12) : undefined
    const user = await prisma.$transaction(async (tx) => {
      await tx.adminUserStore.deleteMany({ where: { adminUserId: id } })
      return tx.adminUser.update({ where: { id }, data: {
        name: b.name, role, active: b.active, accessScope, lojaId,
        ...(password ? { password, mustChangePassword: true } : {}), sessionVersion: { increment: 1 },
        adminUserStores: { create: ids.map((storeId) => ({ storeId })) },
      }, select: userSelect })
    })
    return NextResponse.json({ ok: true, user: { ...user, storeIds: ids } })
  } catch (e) {
    if (e instanceof Error && /permissão|Unidade/.test(e.message)) return error(e.message, 403)
    return error("Não foi possível alterar o usuário.", 400)
  }
}
