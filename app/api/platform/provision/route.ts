import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { provisionClient, provisionClientSchema } from "@/lib/auth/provision-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(req: Request) {
  const session = await auth()
  if (!isPlatformSession(session) || session?.user.mustChangePassword) return NextResponse.json({ ok: false, error: "Somente a plataforma pode provisionar clientes." }, { status: 403 })
  const parsed = provisionClientSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Dados de provisionamento inválidos." }, { status: 400 })
  try {
    const created = await provisionClient(parsed.data)
    return NextResponse.json({ ok: true, ...created }, { status: 201, headers: { "Cache-Control": "no-store" } })
  } catch { return NextResponse.json({ ok: false, error: "Não foi possível provisionar. Confira se o email já está cadastrado." }, { status: 409 }) }
}
