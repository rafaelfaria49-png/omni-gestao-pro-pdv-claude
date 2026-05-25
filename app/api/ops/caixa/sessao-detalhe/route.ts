import { NextResponse } from "next/server"
import { prisma, withPrismaSafe } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const lojaId = opsLojaIdFromRequest(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 }
    )
  }

  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.hubs.caixaHistorico,
    "Sem permissão para consultar o histórico de caixa.",
  )
  if (denied) return denied

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

    // Totais de sangria/suprimento/devoluções existentes
    const sangrias = sessao.operacoes
      .filter((o) => o.tipo === "sangria")
      .reduce((s, o) => s + o.valor, 0)
    const suprimentos = sessao.operacoes
      .filter((o) => o.tipo === "suprimento")
      .reduce((s, o) => s + o.valor, 0)
    const totalDevolucoes = sessao.devolucoes.reduce((s, d) => s + d.valorTotal, 0)

    // Total de vendas a partir do ledger financeiro (MovimentacaoFinanceira origem="venda").
    // Usa o intervalo da sessão (abertaEm → fechadaEm ou agora para sessões abertas).
    const fimPeriodo = sessao.fechadaEm ?? new Date()
    const movFinAgg = await prisma.movimentacaoFinanceira.aggregate({
      where: {
        storeId: lojaId,
        origem: "venda",
        tipo: "entrada",
        createdAt: { gte: sessao.abertaEm, lte: fimPeriodo },
      },
      _sum: { valor: true },
      _count: true,
    })
    const totalVendas = Math.round((movFinAgg._sum.valor ?? 0) * 100) / 100
    const totalVendasCount = movFinAgg._count

    // Vendas reais desta sessão (filtro por terminal — mais preciso que janela temporal).
    // Quando a sessão tem terminalId, agrega só vendas deste terminal no período.
    let totalVendasTerminal: number | null = null
    let totalVendasCountTerminal: number | null = null
    if (sessao.terminalId) {
      const agg = await prisma.venda.aggregate({
        where: {
          storeId: lojaId,
          terminalId: sessao.terminalId,
          status: { not: "cancelada" },
          at: { gte: sessao.abertaEm, lte: fimPeriodo },
        },
        _sum: { total: true },
        _count: { id: true },
      })
      totalVendasTerminal = Math.round((agg._sum.total ?? 0) * 100) / 100
      totalVendasCountTerminal = agg._count.id
    }

    // Info do terminal (gracioso se a tabela ainda não existir).
    const terminal = sessao.terminalId
      ? await withPrismaSafe(
          async (db) =>
            (await db.pdvTerminal.findFirst({
              where: { id: sessao.terminalId!, storeId: lojaId },
              select: { id: true, code: true, name: true },
            })) as { id: string; code: string; name: string } | null,
          null as { id: string; code: string; name: string } | null,
        )
      : null

    return NextResponse.json({
      ok: true,
      sessao,
      terminal,
      totais: {
        sangrias,
        suprimentos,
        totalDevolucoes,
        totalVendas,
        totalVendasCount,
        totalVendasTerminal,
        totalVendasCountTerminal,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/caixa/sessao-detalhe]", msg)
    return NextResponse.json({ error: "Falha ao carregar detalhes da sessão" }, { status: 500 })
  }
}
