import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { prisma } from "@/lib/prisma"
import { STATUS_SOLICITACAO, atualizarStatusSolicitacao, type SolicitacaoDb } from "@/lib/comercial/solicitacao-teste"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SEM_CACHE = { "Cache-Control": "no-store" }
const NEGADO = () => NextResponse.json({ ok: false, error: "Somente a plataforma vê solicitações comerciais." }, { status: 403, headers: SEM_CACHE })

/** Caixa de entrada da equipe: solicitações da página `/gestao-lojas`. Só sessão da plataforma. */
export async function GET() {
  const session = await auth()
  if (!isPlatformSession(session) || session?.user.mustChangePassword) return NEGADO()
  const solicitacoes = await prisma.solicitacaoTesteComercial.findMany({
    orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, protocolo: true, nome: true, nomeLoja: true, email: true, whatsapp: true, ramo: true, planoInteresse: true, mensagem: true, status: true, createdAt: true },
  })
  return NextResponse.json({ ok: true, solicitacoes }, { headers: SEM_CACHE })
}

const patchSchema = z.object({ id: z.string().min(1).max(64), status: z.enum(STATUS_SOLICITACAO) }).strict()

export async function PATCH(req: Request) {
  const session = await auth()
  if (!isPlatformSession(session) || session?.user.mustChangePassword) return NEGADO()
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400, headers: SEM_CACHE })
  const r = await atualizarStatusSolicitacao(prisma as unknown as SolicitacaoDb, { ...parsed.data, por: session?.user?.email ?? "plataforma" })
  return NextResponse.json(r, { status: r.ok ? 200 : 409, headers: SEM_CACHE })
}
