import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/auth"
import { isElevatedRole } from "@/lib/auth/admin-users-policy"

export async function requireAdmin(): Promise<
  | { ok: true; admin: { id: string; name: string; role: string }; session: Session }
  | { ok: false; res: NextResponse }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const role = String(session.user.role ?? "").toUpperCase()
  if (!isElevatedRole(role)) {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  const name = session.user.name ?? session.user.email ?? "admin"
  return {
    ok: true,
    admin: { id: session.user.id, name, role },
    session,
  }
}
