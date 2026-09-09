import { prisma } from "@/lib/prisma"

/**
 * Resolver do usuário admin LOCAL para o bypass de autenticação local
 * (LOCALHOST-DEV-AUTH-BYPASS-002). Só é chamado depois que
 * `evaluateLocalDevAuthBypass` liberou TODOS os guards.
 *
 * Usa o admin local já semeado por `scripts/seed-admin.ts` (padrão:
 * admin@rafacell.com.br). NUNCA cria usuário — se não existir, devolve null
 * (erro honesto no login) para não fabricar identidade por acidente.
 *
 * O payload é idêntico ao do `authorize` de senha, então a sessão gerada é
 * a MESMA sessão oficial do NextAuth (JWT + callbacks de auth.config.ts).
 */

const DEFAULT_BYPASS_EMAIL = "admin@rafacell.com.br"

export interface LocalDevAuthUser {
  id: string
  email: string
  name: string | null
  role: string
  lojaId: string | null
  storeAccess: "all" | "restricted"
  allowedStoreIds?: string[]
}

export async function resolveLocalDevBypassUser(): Promise<LocalDevAuthUser | null> {
  const email = process.env.LOCAL_DEV_AUTH_BYPASS_EMAIL?.trim() || DEFAULT_BYPASS_EMAIL

  const user = await prisma.adminUser.findUnique({ where: { email } })
  if (!user) return null
  if (user.active === false) return null

  const roleUpper = String(user.role).toUpperCase()
  const isAdmin = roleUpper === "SUPER_ADMIN" || roleUpper === "ADMIN"

  let storeAccess: "all" | "restricted" = "all"
  let allowedStoreIds: string[] | undefined

  if (!isAdmin) {
    const memberships = await prisma.adminUserStore.findMany({
      where: { adminUserId: user.id },
      select: { storeId: true },
    })
    if (memberships.length > 0) {
      storeAccess = "restricted"
      allowedStoreIds = memberships.map((m) => m.storeId)
    } else if (user.lojaId?.trim()) {
      storeAccess = "restricted"
      allowedStoreIds = [user.lojaId.trim()]
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as string,
    lojaId: user.lojaId ?? null,
    storeAccess,
    allowedStoreIds,
  }
}
