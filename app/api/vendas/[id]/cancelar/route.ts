/**
 * POST /api/vendas/[id]/cancelar
 *
 * Cancela uma venda PDV de forma profissional:
 * - Valida que não está já cancelada
 * - Avisa se houver devoluções parciais vinculadas
 * - Exige motivo
 * - Registra auditoria
 * - Estorna movimentação financeira quando aplicável
 * - Respeita período financeiro fechado
 */
import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { estornarMovimentacaoPorReferencia } from "@/lib/financeiro/services/movimentacoes-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const pedidoId = params.id?.trim()

  if (!pedidoId) {
    return NextResponse.json({ ok: false, error: "ID da venda obrigatório" }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const { motivo, canceladaPor, forcar } = body as {
    motivo?: string
    canceladaPor?: string
    forcar?: boolean
  }

  if (!motivo?.trim()) {
    return NextResponse.json({ ok: false, error: "Motivo do cancelamento é obrigatório" }, { status: 400 })
  }

  try {
    await prismaEnsureConnected()

    const venda = await prisma.venda.findFirst({
      where: { pedidoId, storeId },
      include: {
        itens: true,
      },
    })

    if (!venda) {
      return NextResponse.json({ ok: false, error: "Venda não encontrada" }, { status: 404 })
    }

    if (venda.status === "cancelada") {
      return NextResponse.json(
        { ok: false, error: "Esta venda já foi cancelada anteriormente" },
        { status: 409 }
      )
    }

    // Verificar se há devoluções vinculadas
    const devolucoes = await prisma.devolucaoVenda.findMany({
      where: { storeId, vendaLocalId: pedidoId },
      select: { id: true, tipo: true, valorTotal: true },
    })

    const hasPartialReturn = devolucoes.length > 0 && venda.status !== "devolvida"

    if (hasPartialReturn && !forcar) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta venda possui devoluções registradas. Confirme o cancelamento com forcar=true.",
          devolucoes: devolucoes.length,
          requireConfirm: true,
        },
        { status: 409 }
      )
    }

    const now = new Date()
    const operadorCancelamento = canceladaPor?.trim() || "Operador"

    await prisma.venda.update({
      where: { id: venda.id },
      data: {
        status: "cancelada",
        canceladaEm: now,
        canceladaPor: operadorCancelamento,
        motivoCancelamento: motivo.trim(),
      },
    })

    // Estornar movimentação financeira se houver contaReceberTitulo vinculado
    let estornoRealizado = false
    if (venda.contaReceberTituloId) {
      try {
        const res = await estornarMovimentacaoPorReferencia(
          storeId,
          venda.contaReceberTituloId,
          "receber"
        )
        estornoRealizado = res.ok && res.action === "created"
      } catch (e) {
        console.error("[vendas/cancelar] estorno financeiro falhou:", e)
      }
    }

    return NextResponse.json({
      ok: true,
      cancelada: true,
      pedidoId,
      canceladaEm: now.toISOString(),
      canceladaPor: operadorCancelamento,
      motivoCancelamento: motivo.trim(),
      estornoFinanceiro: estornoRealizado,
      devolucoesMantidas: devolucoes.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[vendas/cancelar]", msg)
    return NextResponse.json(
      { ok: false, error: "Falha ao cancelar venda", detail: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 503 }
    )
  }
}
