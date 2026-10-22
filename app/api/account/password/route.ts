import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { newPasswordSchema } from "@/lib/auth/password-policy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const schema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: newPasswordSchema }).strict()

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 })
  const origin = req.headers.get("origin")
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Use ao menos 12 caracteres, com maiúsculas, minúsculas e números (até 72 bytes)." }, { status: 400 })
  const user = await prisma.adminUser.findUnique({ where: { id: session.user.id } })
  if (!user?.active || !await bcrypt.compare(parsed.data.currentPassword, user.password)) {
    return NextResponse.json({ ok: false, error: "Senha atual inválida." }, { status: 400 })
  }
  if (await bcrypt.compare(parsed.data.newPassword, user.password)) return NextResponse.json({ ok: false, error: "Escolha uma senha diferente da atual." }, { status: 400 })
  const hash = await bcrypt.hash(parsed.data.newPassword, 12)
  // Compare-and-swap protege duas trocas concorrentes e desativação após a leitura.
  const result = await prisma.adminUser.updateMany({
    where: { id: user.id, active: true, password: user.password, sessionVersion: user.sessionVersion },
    data: { password: hash, mustChangePassword: false, sessionVersion: { increment: 1 } },
  })
  if (result.count !== 1) return NextResponse.json({ ok: false, error: "A conta mudou. Entre novamente." }, { status: 409 })
  return NextResponse.json({ ok: true, signInRequired: true }, { headers: { "Cache-Control": "no-store" } })
}
