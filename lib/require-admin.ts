import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/auth"
import { isElevatedRole } from "@/lib/auth/admin-users-policy"

/** Papéis que podem mutar lojas, settings administrativos e APIs protegidas por `requireAdmin`. */
export const REQUIRE_ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"] as const

export function isRequireAdminRole(role: string | undefined | null): boolean {
  return isElevatedRole(String(role ?? ""))
}

export async function requireAdmin(): Promise<
  | { ok: true; admin: { id: string; name: string; role: string }; session: Session }
  | { ok: false; res: NextResponse }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Não autorizado. Faça login." }, { status: 401 }),
    }
  }

  const role = String(session.user.role ?? "").trim().toUpperCase()
  if (!role || !isRequireAdminRole(role)) {
    return {
      ok: false,
      res: NextResponse.json(
        {
          ok: false,
          error: "Apenas administradores (ADMIN ou SUPER_ADMIN) podem executar esta ação.",
        },
        { status: 403 },
      ),
    }
  }

  const name = session.user.name ?? session.user.email ?? "admin"
  return {
    ok: true,
    admin: { id: session.user.id, name, role },
    session,
  }
}
