import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { auth } from "@/auth"

const ADMIN_COOKIE = "assistec_admin_session"

export async function requireAdmin(): Promise<
  | { ok: true; admin: { id: string; name: string } }
  | { ok: false; res: NextResponse }
> {
  // NextAuth v5: aceitar sessão JWT ativa como admin
  try {
    const session = await auth()
    if (session?.user) {
      const name = session.user.name ?? session.user.email ?? "admin"
      const id = session.user.email ?? "nextauth"
      return { ok: true, admin: { id, name } }
    }
  } catch {
    // auth() pode falhar fora do contexto de request; continua para fallback legacy
  }

  // Fallback: cookie legacy assistec_admin_session
  const jar = await cookies()
  const id = String(jar.get(ADMIN_COOKIE)?.value || "").trim()
  if (!id) {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  try {
    await prismaEnsureConnected()
    const u = await prisma.user.findFirst({ where: { id, OR: [{ role: "ADMIN" }, { role: "admin" }] } })
    if (!u) return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
    return { ok: true, admin: { id: u.id, name: u.name } }
  } catch {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
}

