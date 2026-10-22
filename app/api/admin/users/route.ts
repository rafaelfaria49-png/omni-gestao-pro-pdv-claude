import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { assertActorMayAssignRole, canAccessAdminUsersApi, normalizeAllowedStoreIdsForActor } from "@/lib/auth/admin-users-policy"
import { generateTemporaryPassword, newPasswordSchema } from "@/lib/auth/password-policy"
import { adminUserSelect as userSelect } from "@/lib/auth/admin-user-select"
import { canUseModule } from "@/lib/auth/enterprise-permissions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const schema = z.object({
  name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "GERENTE", "OPERADOR", "CAIXA", "TECNICO", "VENDEDOR"]),
  lojaId: z.string().trim().min(1).max(64).nullable().optional(),
  allowedStoreIds: z.array(z.string().trim().min(1)).default([]),
  password: newPasswordSchema.optional(), accessScope: z.enum(["STORE", "PLATFORM"]).default("STORE"),
}).strict()
const error = (message: string, status: number) => NextResponse.json({ ok: false, error: message }, { status })
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !canAccessAdminUsersApi(session)) return error("Não autorizado a consultar usuários.", 403)
  const requested = new URL(req.url).searchParams.get("storeId")?.trim()
  const allowed = (session.user.allowedStoreIds ?? []).filter((sid) => canUseModule(session, "settings", sid))
  if (requested && !isPlatformSession(session) && !allowed.includes(requested)) return error("Unidade não permitida.", 403)
  const ids = requested ? [requested] : allowed
  const scope: Prisma.AdminUserWhereInput = isPlatformSession(session) ? {} : {
    role: { notIn: ["ADMIN", "GERENTE", "SUPER_ADMIN"] },
    adminUserStores: { none: { storeId: { notIn: allowed } } },
    AND: [
      { OR: [{ accessScope: "STORE" }, { accessScope: null }] },
      { OR: [{ lojaId: null }, { lojaId: { in: allowed } }] },
      { OR: [{ lojaId: { in: ids } }, { adminUserStores: { some: { storeId: { in: ids } } } }] },
    ],
  }
  try {
    const users = await prisma.adminUser.findMany({ where: scope, select: userSelect, orderBy: { name: "asc" } })
    return NextResponse.json({ ok: true, users: users.map(({ adminUserStores, ...u }) => ({ ...u, storeIds: adminUserStores.map((s) => s.storeId) })) })
  } catch { return error("Falha ao consultar usuários.", 500) }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !canAccessAdminUsersApi(session)) return error("Não autorizado a criar usuários.", 403)
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return error("Dados inválidos. A senha deve ter ao menos 12 caracteres, maiúsculas, minúsculas e números.", 400)
  const body = parsed.data
  try {
    assertActorMayAssignRole(session, body.role)
    if ((body.accessScope === "PLATFORM" || body.role === "SUPER_ADMIN") && !isPlatformSession(session)) return error("Autoridade da plataforma obrigatória.", 403)
    if (body.role === "SUPER_ADMIN" && body.accessScope !== "PLATFORM") return error("SUPER_ADMIN exige concessão explícita de plataforma.", 400)
    const ids = normalizeAllowedStoreIdsForActor(session, [...body.allowedStoreIds, ...(body.lojaId ? [body.lojaId] : [])])
    if (ids.some((sid) => !canUseModule(session, "settings", sid))) return error("Gestão de equipe não liberada nesta unidade.", 403)
    if (body.accessScope === "STORE" && !ids.length) return error("Informe ao menos uma unidade autorizada.", 400)
    if (await prisma.store.count({ where: { id: { in: ids } } }) !== ids.length) return error("Unidade inválida.", 400)
    const plain = body.password ?? generateTemporaryPassword()
    const hash = await bcrypt.hash(plain, 12)
    const created = await prisma.adminUser.create({ data: {
      name: body.name, email: body.email.toLowerCase(), role: body.role, password: hash,
      accessScope: body.accessScope, lojaId: body.lojaId || ids[0] || null,
      mustChangePassword: true, adminUserStores: { create: ids.map((storeId) => ({ storeId })) },
    }, select: userSelect })
    return NextResponse.json({ ok: true, user: { ...created, storeIds: ids }, temporaryPassword: body.password ? undefined : plain }, { status: 201, headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    if (e instanceof Error && /permissão|Unidade/.test(e.message)) return error(e.message, 403)
    return error("Não foi possível criar o usuário. Confira email e unidades.", 400)
  }
}
