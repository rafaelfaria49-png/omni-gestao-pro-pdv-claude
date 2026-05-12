import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOpsSubscription, opsLojaIdFromRequest } from "@/lib/ops-api-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireOpsSubscription()
  if (!gate.ok) return gate.res

  const lojaId = opsLojaIdFromRequest(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 }
    )
  }

  const url = new URL(req.url)
  const sessaoId = url.searchParams.get("sessaoId")
  if (!sessaoId) {
    return NextResponse.json({ error: "sessaoId obrigatório." }, { status: 400 })
  }

  try {
    const sessao = await prisma.sessaoCaixa.findFirst({
      where: { id: sessaoId, storeId: lojaId },
      include: {
        operacoes: {
          orderBy: { at: "asc" },
        },
        devolucoes: {
          select: {
            id: true,
            localId: true,
            tipo: true,
            valorTotal: true,
            creditoEmitido: true,
            clienteNome: true,
            operador: true,
            at: true,
            _count: { select: { itens: true } },
          },
          orderBy: { at: "asc" },
        },
      },
    })

    if (!sessao) {
      return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 })
    }

    // Calcular totais da sessão
    const sangrias = sessao.operacoes
      .filter((o) => o.tipo === "sangria")
      .reduce((s, o) => s + o.valor, 0)
    const suprimentos = sessao.operacoes
      .filter((o) => o.tipo === "suprimento")
      .reduce((s, o) => s + o.valor, 0)
    const totalDevolucoes = sessao.devolucoes.reduce((s, d) => s + d.valorTotal, 0)

    return NextResponse.json({
      ok: true,
      sessao,
      totais: { sangrias, suprimentos, totalDevolucoes },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/caixa/sessao-detalhe]", msg)
    return NextResponse.json({ error: "Falha ao carregar detalhes da sessão" }, { status: 500 })
  }
}
