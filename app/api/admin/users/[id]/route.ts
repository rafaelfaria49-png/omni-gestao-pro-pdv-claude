import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import type { Session } from "next-auth"
import { auth } from "@/auth"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { UserRole } from "@/generated/prisma"
import {
  assertActorMayAssignRole,
  canAccessAdminUsersApi,
  isElevatedRole,
  normalizeAllowedStoreIdsForActor,
} from "@/lib/auth/admin-users-policy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const roleSchema = z.enum([
  "SUPER_ADMIN",
  "ADMIN",
  "GERENTE",
  "OPERADOR",
  "CAIXA",
  "TECNICO",
  "VENDEDOR",
])

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  lojaId: z.string().trim().min(1).max(64).nullable().optional(),
  allowedStoreIds: z.array(z.string().trim().min(1)).optional(),
  password: z.string().min(6).max(128).optional(),
})

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

async function countOtherActiveElevated(excludeId: string): Promise<number> {
  return prisma.adminUser.count({
    where: {
      id: { not: excludeId },
      active: true,
      role: { in: ["SUPER_ADMIN", "ADMIN"] },
    },
  })
}

function actorMayEditTarget(
  session: Session,
  targetStores: string[],
  targetRole: UserRole,
): boolean {
  const r = String(session.user.role || "").toUpperCase()
  if (r === "SUPER_ADMIN" || r === "ADMIN") return true
  if (isElevatedRole(targetRole)) return false
  if (session.user.storeAccess !== "restricted") return true
  const allowed = new Set(session.user.allowedStoreIds ?? [])
  if (allowed.size === 0) return false
  return targetStores.some((id) => allowed.has(id))
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!canAccessAdminUsersApi(session)) {
    return jsonError("Não autorizado a alterar usuários.", 403)
  }
  const { id: rawId } = await ctx.params
  const id = String(rawId || "").trim()
  if (!id) return jsonError("Identificador inválido.", 400)

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return jsonError("Dados inválidos.", 400)
  }
  if (Object.keys(body).length === 0) {
    return jsonError("Nenhum campo para atualizar.", 400)
  }

  try {
    await prismaEnsureConnected()
    const existing = await prisma.adminUser.findUnique({
      where: { id },
      include: { adminUserStores: { select: { storeId: true } } },
    })
    if (!existing) return jsonError("Usuário não encontrado.", 404)

    const targetStoreIds = existing.adminUserStores.map((s) => s.storeId)
    const effectiveStores =
      targetStoreIds.length > 0 ? targetStoreIds : existing.lojaId ? [existing.lojaId] : []

    if (!actorMayEditTarget(session!, effectiveStores, existing.role)) {
      return jsonError("Sem permissão para editar este usuário.", 403)
    }

    const nextRole = (body.role ?? existing.role) as UserRole
    const nextActive = body.active ?? existing.active

    if (body.role !== undefined && body.role !== existing.role) {
      assertActorMayAssignRole(session!.user.role, String(nextRole))
    }

    if (existing.id === session!.user.id && body.role !== undefined && body.role !== existing.role) {
      return jsonError("Não é possível alterar o próprio papel por aqui.", 400)
    }

    if (isElevatedRole(existing.role) && (!nextActive || !isElevatedRole(nextRole))) {
      const others = await countOtherActiveElevated(id)
      if (others === 0) {
        return jsonError("Deve permanecer pelo menos um administrador ativo na conta.", 400)
      }
    }

    const isNextAdminLike = nextRole === "SUPER_ADMIN" || nextRole === "ADMIN"

    let lojaIdNext = existing.lojaId
    if (body.lojaId !== undefined) lojaIdNext = body.lojaId?.trim() || null

    let storeRows: string[] | undefined
    if (body.allowedStoreIds !== undefined) {
      storeRows = isNextAdminLike ? [] : normalizeAllowedStoreIdsForActor(session!, body.allowedStoreIds)
      if (!isNextAdminLike && storeRows.length === 0) {
        const fb = (lojaIdNext || existing.lojaId || "").trim()
        if (fb) storeRows = [fb]
        else return jsonError("Informe ao menos uma unidade com acesso.", 400)
      }
      if (!isNextAdminLike && storeRows.length > 0 && !lojaIdNext) lojaIdNext = storeRows[0]!
    }

    const data: {
      name?: string
      role?: UserRole
      active?: boolean
      lojaId?: string | null
      password?: string
    } = {}
    if (body.name !== undefined) data.name = body.name.trim()
    if (body.role !== undefined) data.role = nextRole
    if (body.active !== undefined) data.active = nextActive
    if (body.lojaId !== undefined || storeRows !== undefined) {
      data.lojaId = lojaIdNext ?? null
    }
    if (body.password?.trim()) {
      data.password = await bcrypt.hash(body.password.trim(), 12)
    }

    await prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id },
        data,
      })
      if (storeRows !== undefined) {
        await tx.adminUserStore.deleteMany({ where: { adminUserId: id } })
        if (!isNextAdminLike && storeRows.length > 0) {
          await tx.adminUserStore.createMany({
            data: storeRows.map((storeId) => ({ adminUserId: id, storeId })),
            skipDuplicates: true,
          })
        }
      }
    })

    const fresh = await prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lojaId: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        adminUserStores: { select: { storeId: true } },
      },
    })

    return NextResponse.json({
      ok: true,
      user: fresh
        ? {
            id: fresh.id,
            name: fresh.name,
            email: fresh.email,
            role: fresh.role,
            lojaId: fresh.lojaId,
            active: fresh.active,
            createdAt: fresh.createdAt.toISOString(),
            updatedAt: fresh.updatedAt.toISOString(),
            storeIds: fresh.adminUserStores.map((s) => s.storeId),
          }
        : null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("permissão") || msg.includes("Gerentes") || msg.includes("Unidade")) {
      return jsonError(msg, 403)
    }
    return jsonError(msg, 400)
  }
}
