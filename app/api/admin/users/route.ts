import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { UserRole } from "@/generated/prisma"
import {
  assertActorMayAssignRole,
  canAccessAdminUsersApi,
  isElevatedRole,
  normalizeAllowedStoreIdsForActor,
} from "@/lib/auth/admin-users-policy"
import type { Prisma } from "@/generated/prisma"

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

const postSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  role: roleSchema,
  lojaId: z.string().trim().min(1).max(64).optional().nullable(),
  allowedStoreIds: z.array(z.string().trim().min(1)).optional().default([]),
  password: z.string().min(6).max(128).optional(),
})

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

function buildListWhere(filterStoreId: string | undefined): Prisma.AdminUserWhereInput {
  if (!filterStoreId) return {}
  return {
    OR: [
      { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
      { lojaId: filterStoreId },
      { adminUserStores: { some: { storeId: filterStoreId } } },
    ],
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!canAccessAdminUsersApi(session)) {
    return jsonError("Não autorizado a consultar usuários.", 403)
  }
  try {
    await prismaEnsureConnected()
    const url = new URL(req.url)
    const filterStoreId = url.searchParams.get("storeId")?.trim() || undefined
    const allowed = session!.user.allowedStoreIds ?? []
    if (
      filterStoreId &&
      session!.user.storeAccess === "restricted" &&
      !allowed.includes(filterStoreId)
    ) {
      return NextResponse.json({ ok: true, users: [] })
    }
    const where = buildListWhere(filterStoreId)
    const users = await prisma.adminUser.findMany({
      where,
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
      orderBy: [{ active: "desc" }, { name: "asc" }],
    })
    return NextResponse.json({
      ok: true,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        lojaId: u.lojaId,
        active: u.active,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        storeIds: u.adminUserStores.map((s) => s.storeId),
      })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao listar usuários"
    return jsonError(msg, 500)
  }
}

function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
  const len = 12
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let s = ""
  for (let i = 0; i < len; i++) s += alphabet[bytes[i]! % alphabet.length]
  return s
}

export async function POST(req: Request) {
  const session = await auth()
  if (!canAccessAdminUsersApi(session)) {
    return jsonError("Não autorizado a criar usuários.", 403)
  }
  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(await req.json())
  } catch {
    return jsonError("Dados inválidos.", 400)
  }
  try {
    const isAdminLike = body.role === "SUPER_ADMIN" || body.role === "ADMIN"
    assertActorMayAssignRole(session!.user.role, body.role)
    const normalizedStores = isAdminLike ? [] : normalizeAllowedStoreIdsForActor(session!, body.allowedStoreIds)

    let lojaPrincipal = body.lojaId?.trim() || null
    const storeRows =
      normalizedStores.length > 0 ? normalizedStores : lojaPrincipal && !isAdminLike ? [lojaPrincipal] : []
    if (!lojaPrincipal && storeRows.length > 0) lojaPrincipal = storeRows[0]!
    if (!isAdminLike && storeRows.length === 0) {
      return jsonError("Informe a loja principal ou ao menos uma unidade com acesso.", 400)
    }

    const plain = body.password?.trim() || generateTempPassword()
    const generated = !body.password?.trim()
    if (plain.length < 6) return jsonError("Senha deve ter pelo menos 6 caracteres.", 400)

    const hash = await bcrypt.hash(plain, 12)

    await prismaEnsureConnected()

    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.adminUser.create({
        data: {
          name: body.name.trim(),
          email: body.email.trim().toLowerCase(),
          password: hash,
          role: body.role as UserRole,
          lojaId: lojaPrincipal,
          active: true,
        },
        select: { id: true, name: true, email: true, role: true, lojaId: true, active: true, createdAt: true },
      })
      if (!isAdminLike && storeRows.length > 0) {
        await tx.adminUserStore.createMany({
          data: storeRows.map((storeId) => ({ adminUserId: u.id, storeId })),
          skipDuplicates: true,
        })
      }
      return u
    })

    return NextResponse.json({
      ok: true,
      user: {
        ...created,
        createdAt: created.createdAt.toISOString(),
        storeIds: isAdminLike ? [] : storeRows,
      },
      ...(generated ? { temporaryPassword: plain } : {}),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (String(msg).includes("Unique constraint") || String(msg).includes("unique")) {
      return jsonError("Este e-mail já está em uso.", 409)
    }
    if (msg.includes("permissão") || msg.includes("Unidade")) {
      return jsonError(msg, 403)
    }
    return jsonError(msg, 400)
  }
}
