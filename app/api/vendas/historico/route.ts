import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * GET /api/vendas/historico
 *
 * Lista vendas reais do banco (model Venda) com KPIs, filtros e paginação.
 * Lê storeId do header x-assistec-loja-id, cookie assistec-active-store ou query storeId.
 *
 * Filtros disponíveis:
 *  q          — busca por pedidoId / clienteNome / item vendido (nome) / SKU / barcode (EAN)
 *  status     — concluida | cancelada | parcialmente_devolvida | devolvida
 *  pagamento  — dinheiro | pix | cartaoDebito | cartaoCredito | carne | aPrazo | creditoVale
 *               (aplicado no `where`, antes da paginação — ver `lib/vendas/historico-pagamento.ts`;
 *               outra chave → 400)
 *  operador   — string parcial no campo operador
 *  terminalId — id do PdvTerminal (ou "sem" p/ vendas legadas/sem terminal selecionado)
 *  from       — ISO date início
 *  to         — ISO date fim
 *  take       — 1..200 (padrão 50)
 *  skip       — paginação, 0..1.000.000
 *
 * `total` conta as vendas que casam com TODOS os filtros de listagem, antes de take/skip.
 * Resposta inclui `terminais` (PDVs da loja, para popular dropdown).
 */
import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected, withPrismaSafe } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import {
  buildHistoricoBuscaOr,
  buildProdutoCodigoWhere,
} from "@/lib/vendas/historico-busca"
import {
  buildHistoricoPagamentoWhere,
  historicoFormasPagamentoLabel,
  parseHistoricoPagamento,
} from "@/lib/vendas/historico-pagamento"
import type { Prisma } from "@/generated/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const TAKE_DEFAULT = 50
const TAKE_MAX = 200
const SKIP_MAX = 1_000_000

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sales")
  if (moduleDenied) return moduleDenied

  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() ?? ""
  const statusFilter = url.searchParams.get("status")?.trim() ?? ""
  const operadorFilter = url.searchParams.get("operador")?.trim() ?? ""
  const fromStr = url.searchParams.get("from")?.trim() ?? ""
  const toStr = url.searchParams.get("to")?.trim() ?? ""
  const take = parseIntParam(url.searchParams.get("take"), TAKE_DEFAULT, 1, TAKE_MAX)
  const skip = parseIntParam(url.searchParams.get("skip"), 0, 0, SKIP_MAX)
  const pagamento = parseHistoricoPagamento(url.searchParams.get("pagamento"))
  if (!pagamento.ok) return NextResponse.json({ ok: false, error: pagamento.error }, { status: 400 })

  try {
    await prismaEnsureConnected()

    // Filtro por terminal: id real, "sem" (sem terminal — null), ou ausente (todos).
    const terminalIdParam = url.searchParams.get("terminalId")?.trim() ?? ""
    const terminalFilter: Prisma.VendaWhereInput | null =
      terminalIdParam === "sem"
        ? { terminalId: null }
        : terminalIdParam
          ? { terminalId: terminalIdParam }
          : null

    // Busca por código de produto (SKU/EAN): uma query indexada por loja que
    // resolve os ids; a venda é casada por `itens: { some: { inventoryId } }`.
    let productIds: string[] = []
    if (q) {
      const produtos = await prisma.produto.findMany({
        where: buildProdutoCodigoWhere({ storeId, q }),
        select: { id: true },
      })
      productIds = produtos.map((p) => p.id)
    }

    const where: Prisma.VendaWhereInput = {
      storeId,
      ...(q
        ? {
            OR: buildHistoricoBuscaOr({ q, productIds }),
          }
        : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(operadorFilter
        ? { operador: { contains: operadorFilter, mode: "insensitive" } }
        : {}),
      ...(terminalFilter ?? {}),
      ...(fromStr || toStr
        ? {
            at: {
              ...(fromStr ? { gte: new Date(fromStr) } : {}),
              ...(toStr ? { lte: new Date(toStr) } : {}),
            },
          }
        : {}),
      // `AND` porque a busca textual já ocupa a chave `OR` do where.
      ...(pagamento.key ? { AND: [buildHistoricoPagamentoWhere(pagamento.key)] } : {}),
    }

    const [rows, totalCount] = await Promise.all([
      prisma.venda.findMany({
        where,
        include: { itens: { select: { quantidade: true } } },
        // `id` desempata vendas no mesmo instante: páginas sem repetição nem salto.
        orderBy: [{ at: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      prisma.venda.count({ where }),
    ])

    // KPIs — escopo da loja (com data e filtro de terminal aplicados, sem buscar
    // por texto/operador/pagamento). Quando o filtro de terminal está ativo, os
    // KPIs refletem o terminal escolhido; sem filtro, são da loja inteira.
    const kpiWhere: Prisma.VendaWhereInput = {
      storeId,
      ...(terminalFilter ?? {}),
      ...(fromStr || toStr
        ? {
            at: {
              ...(fromStr ? { gte: new Date(fromStr) } : {}),
              ...(toStr ? { lte: new Date(toStr) } : {}),
            },
          }
        : {}),
    }

    const [concluidas, canceladas, devolvidoAgg, parcAgg, faturBruto] = await Promise.all([
      prisma.venda.count({ where: { ...kpiWhere, status: "concluida" } }),
      prisma.venda.count({ where: { ...kpiWhere, status: "cancelada" } }),
      prisma.venda.count({ where: { ...kpiWhere, status: "devolvida" } }),
      prisma.venda.count({ where: { ...kpiWhere, status: "parcialmente_devolvida" } }),
      prisma.venda.aggregate({
        where: { ...kpiWhere, status: { not: "cancelada" } },
        _sum: { total: true },
        _count: { id: true },
      }),
    ])

    const devolvidas = devolvidoAgg + parcAgg
    const faturamento = faturBruto._sum.total ?? 0
    const totalVendas = faturBruto._count.id

    // Ticket médio (vendas não canceladas)
    const ticketMedio = totalVendas > 0 ? faturamento / totalVendas : 0

    const vendas = rows.map((r) => ({
      id: r.pedidoId,
      dbId: r.id,
      at: r.at.toISOString(),
      cliente: r.clienteNome || "—",
      total: r.total,
      status: r.status,
      operador: r.operador || null,
      terminalId: r.terminalId ?? null,
      formaPagamento: historicoFormasPagamentoLabel(r.payload),
      quantidadeItens: r.itens.reduce((acc, it) => acc + it.quantidade, 0),
      cancelada: r.status === "cancelada",
      canceladaEm: r.canceladaEm?.toISOString() ?? null,
      motivoCancelamento: r.motivoCancelamento ?? null,
    }))

    // Terminais da loja (para popular dropdown) — gracioso se a tabela não existir.
    const terminais = await withPrismaSafe(
      async (db) =>
        ((await db.pdvTerminal.findMany({
          where: { storeId },
          select: { id: true, code: true, name: true, status: true },
        })) as Array<{ id: string; code: string; name: string; status: string }>).map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          status: t.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        })),
      [] as Array<{ id: string; code: string; name: string; status: string }>,
    )

    return NextResponse.json({
      ok: true,
      vendas,
      total: totalCount,
      kpis: {
        totalVendas,
        faturamento,
        cancelamentos: canceladas,
        devolvidas,
        concluidas,
        ticketMedio,
      },
      terminais,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[vendas/historico]", msg)
    return NextResponse.json(
      {
        ok: false,
        error: "Falha ao carregar histórico",
        vendas: [],
        total: 0,
        kpis: { totalVendas: 0, faturamento: 0, cancelamentos: 0, devolvidas: 0, concluidas: 0, ticketMedio: 0 },
        terminais: [],
      },
      { status: 503 },
    )
  }
}
