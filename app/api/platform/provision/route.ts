import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { provisionClient, provisionClientSchema } from "@/lib/auth/provision-client"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import { vincularProvisionamento, type SolicitacaoDb } from "@/lib/comercial/solicitacao-teste"

/** Pedido ligado não pôde ser fechado: a transação é desfeita e nenhuma conta nasce. */
class PedidoNaoVinculado extends Error {}

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
  // Checagem rápida antes do bcrypt; a garantia de verdade é o vínculo dentro da transação, abaixo.
  if (typeof solicitacaoId === "string") {
    const pedido = await prisma.solicitacaoTesteComercial.findUnique({ where: { id: solicitacaoId }, select: { status: true, email: true } })
    if (!pedido || (pedido.status !== "recebida" && pedido.status !== "em_contato")) {
      return NextResponse.json({ ok: false, error: "O pedido ligado já foi encerrado ou não existe. Nada foi criado. Recarregue a lista." }, { status: 409 })
    }
    // Conta ligada ao pedido é a da pessoa do pedido: o servidor garante, não só a tela.
    if (pedido.email.trim().toLowerCase() !== parsed.data.email.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "O email não é o do pedido ligado. Nada foi criado. Desligue do pedido para usar outro email." }, { status: 400 })
    }
  }
  // Loja, usuário e fechamento do pedido numa só transação: ou os três gravam, ou nenhum.
  // Dois operadores no mesmo pedido usam o mesmo email (garantido acima): o UNIQUE de email
  // barra a segunda conta, e o compare-and-set do pedido só fecha uma vez.
  const vincular = typeof solicitacaoId === "string"
    ? async (tx: Prisma.TransactionClient, c: { store: { id: string }; user: { id: string } }) => {
        const r = await vincularProvisionamento(tx as unknown as SolicitacaoDb, { id: solicitacaoId, por: session?.user?.email ?? "plataforma", storeId: c.store.id, userId: c.user.id })
        if (!r.ok) throw new PedidoNaoVinculado(r.erro)
      }
    : undefined
  let created: Awaited<ReturnType<typeof provisionClient>>
  try {
    created = await provisionClient(parsed.data, vincular ? { aoCriar: vincular } : undefined)
  } catch (e) {
    if (e instanceof PedidoNaoVinculado) return NextResponse.json({ ok: false, error: "O pedido ligado já foi encerrado ou mudou. Nada foi criado. Recarregue a lista." }, { status: 409 })
    // Mapear por `code`: `instanceof` de erro do Prisma falha no bundle do Next.
    if ((e as { code?: unknown })?.code === "P2002") return NextResponse.json({ ok: false, error: "Não foi possível provisionar. Confira se o email já está cadastrado." }, { status: 409 })
    return NextResponse.json({ ok: false, error: "Não foi possível provisionar agora. Nada foi criado. Tente de novo." }, { status: 503 })
  }
  return NextResponse.json({ ok: true, ...created, ...(vincular ? { solicitacao: { ok: true } } : {}) }, { status: 201, headers: { "Cache-Control": "no-store" } })
}
