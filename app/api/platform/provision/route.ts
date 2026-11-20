import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { provisionClient, provisionClientSchema } from "@/lib/auth/provision-client"
import { prisma } from "@/lib/prisma"
import { atualizarStatusSolicitacao, type SolicitacaoDb } from "@/lib/comercial/solicitacao-teste"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(req: Request) {
  const session = await auth()
  if (!isPlatformSession(session) || session?.user.mustChangePassword) return NextResponse.json({ ok: false, error: "Somente a plataforma pode provisionar clientes." }, { status: 403 })
  const body = await req.json().catch(() => null)
  // `solicitacaoId` (opcional) liga a conta ao pedido da página `/gestao-lojas`; o resto segue o schema estrito existente.
  const { solicitacaoId, ...resto } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const parsed = provisionClientSchema.safeParse(resto)
  if (!parsed.success || (solicitacaoId !== undefined && (typeof solicitacaoId !== "string" || !solicitacaoId || solicitacaoId.length > 64))) {
    return NextResponse.json({ ok: false, error: "Dados de provisionamento inválidos." }, { status: 400 })
  }
  // Pedido ligado precisa estar aberto ANTES de criar a conta: não nasce loja para pedido descartado ou já atendido.
  if (typeof solicitacaoId === "string") {
    const pedido = await prisma.solicitacaoTesteComercial.findUnique({ where: { id: solicitacaoId }, select: { status: true } })
    if (!pedido || (pedido.status !== "recebida" && pedido.status !== "em_contato")) {
      return NextResponse.json({ ok: false, error: "O pedido ligado já foi encerrado ou não existe. Nada foi criado. Recarregue a lista." }, { status: 409 })
    }
  }
  let created: Awaited<ReturnType<typeof provisionClient>>
  try {
    created = await provisionClient(parsed.data)
  } catch { return NextResponse.json({ ok: false, error: "Não foi possível provisionar. Confira se o email já está cadastrado." }, { status: 409 }) }

  // A conta já existe: falhar ao marcar o pedido não desfaz nada, só avisa a equipe.
  let solicitacao: { ok: true } | { ok: false; erro: string } | undefined
  if (typeof solicitacaoId === "string") {
    solicitacao = await atualizarStatusSolicitacao(prisma as unknown as SolicitacaoDb, {
      id: solicitacaoId, status: "provisionada", por: session?.user?.email ?? "plataforma",
      vinculo: { storeId: created.store.id, userId: created.user.id },
    }).catch(() => ({ ok: false as const, erro: "Não foi possível marcar o pedido." }))
  }
  return NextResponse.json({ ok: true, ...created, ...(solicitacao ? { solicitacao } : {}) }, { status: 201, headers: { "Cache-Control": "no-store" } })
}
