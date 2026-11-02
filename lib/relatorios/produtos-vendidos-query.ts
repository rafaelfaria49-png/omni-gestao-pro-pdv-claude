/**
 * RELATORIOS-PRODUTOS-VENDIDOS-REAL-001 — leitura (somente SELECT) dos dados do
 * relatório "Produtos Mais Vendidos". Toda consulta é escopada por `storeId`.
 * A agregação/regra de negócio fica em `produtos-vendidos.ts` (pura, testável).
 */
import "server-only"
import type { prisma as prismaClient } from "@/lib/prisma"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import type { DadosProdutosVendidos, LinhaItem, PeriodoRelatorio } from "./produtos-vendidos"

type Db = typeof prismaClient

/** Folga para devoluções registradas com relógio adiantado em relação à venda. */
const FOLGA_DEVOLUCAO_MS = 2 * 24 * 60 * 60 * 1000
const LOTE_IN = 500

function lotes<T>(arr: T[], n = LOTE_IN): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export async function carregarDadosProdutosVendidos(
  db: Db,
  storeId: string,
  periodo: PeriodoRelatorio,
): Promise<DadosProdutosVendidos> {
  const at = { gte: periodo.inicio, lte: periodo.fim }

  const selectDevolucao = {
    id: true,
    vendaLocalId: true,
    at: true,
    itens: { select: { inventoryId: true, nome: true, quantidade: true, valorTotal: true } },
  } as const

  const [grupos, vendasAgg, canceladasAgg, devolucoesPorData, categorias, coorteDevolvida] = await Promise.all([
    db.itemVenda.groupBy({
      by: ["inventoryId", "nome"],
      where: { venda: { storeId, at, status: { not: "cancelada" } } },
      _sum: { quantidade: true, lineTotal: true },
    }),
    db.venda.aggregate({
      where: { storeId, at, status: { not: "cancelada" } },
      _sum: { total: true },
      _count: { id: true },
    }),
    db.venda.aggregate({
      where: { storeId, at, status: "cancelada" },
      _sum: { total: true },
      _count: { id: true },
    }),
    // Devolução (relógio do servidor) não é anterior à venda: o que aponta para a coorte
    // foi registrado a partir do início do período, salvo PDV com relógio adiantado —
    // coberto abaixo pelas vendas da coorte já marcadas como devolvidas.
    db.devolucaoVenda.findMany({
      where: { storeId, at: { gte: new Date(periodo.inicio.getTime() - FOLGA_DEVOLUCAO_MS) } },
      select: selectDevolucao,
    }),
    db.categoriaProduto.findMany({ where: { storeId }, select: { slug: true, nome: true } }),
    db.venda.findMany({
      where: { storeId, at, status: { in: ["devolvida", "parcialmente_devolvida"] } },
      select: { pedidoId: true },
    }),
  ])

  // Todas as devoluções das vendas devolvidas da coorte (dedup por id com as da janela).
  const devolucoesExtras = (
    await Promise.all(
      lotes(coorteDevolvida.map((v) => v.pedidoId)).map((ids) =>
        db.devolucaoVenda.findMany({ where: { storeId, vendaLocalId: { in: ids } }, select: selectDevolucao }),
      ),
    )
  ).flat()
  const devolucoesRaw = [...new Map([...devolucoesPorData, ...devolucoesExtras].map((d) => [d.id, d])).values()]

  // Vendas (da loja) referenciadas pelas devoluções — vínculo por `pedidoId`.
  const pedidoIds = [...new Set(devolucoesRaw.map((d) => d.vendaLocalId.trim()).filter(Boolean))]
  const vendasVinculadas = (
    await Promise.all(
      lotes(pedidoIds).map((ids) =>
        db.venda.findMany({
          where: { storeId, pedidoId: { in: ids } },
          select: {
            pedidoId: true,
            at: true,
            status: true,
            itens: { select: { inventoryId: true, nome: true, quantidade: true, lineTotal: true } },
          },
        }),
      ),
    )
  ).flat()

  const existentes = new Set(vendasVinculadas.map((v) => v.pedidoId))
  const coorte = vendasVinculadas.filter(
    (v) => v.status !== "cancelada" && v.at >= periodo.inicio && v.at <= periodo.fim,
  )
  const coorteIds = new Set(coorte.map((v) => v.pedidoId))

  const devolucoes = devolucoesRaw
    .filter((d) => coorteIds.has(d.vendaLocalId.trim()))
    .map((d) => ({
      vendaLocalId: d.vendaLocalId.trim(),
      itens: d.itens.map((i): LinhaItem => ({ inventoryId: i.inventoryId, nome: i.nome, quantidade: i.quantidade, valor: i.valorTotal })),
    }))

  const semVenda = { documentos: 0, quantidade: 0, valor: 0 }
  for (const d of devolucoesRaw) {
    if (d.at < periodo.inicio || d.at > periodo.fim) continue
    const ref = d.vendaLocalId.trim()
    if (ref && existentes.has(ref)) continue
    semVenda.documentos += 1
    for (const i of d.itens) {
      semVenda.quantidade += i.quantidade
      semVenda.valor += i.valorTotal
    }
  }

  // Catálogo atual dos produtos citados (id, ou SKU/código de barras em linhas legadas).
  const refs = new Set<string>()
  const addRef = (id: string | null) => {
    const v = id?.trim()
    if (v && !isVirtualSaleLine(v)) refs.add(v)
  }
  for (const g of grupos) addRef(g.inventoryId)
  for (const v of coorte) for (const i of v.itens) addRef(i.inventoryId)
  for (const d of devolucoes) for (const i of d.itens) addRef(i.inventoryId)

  const produtos = (
    await Promise.all(
      lotes([...refs]).map((ids) =>
        db.produto.findMany({
          where: { storeId, OR: [{ id: { in: ids } }, { sku: { in: ids } }, { barcode: { in: ids } }] },
          select: { id: true, name: true, sku: true, barcode: true, category: true, brand: true, active: true },
        }),
      ),
    )
  ).flat()

  return {
    grupos: grupos.map((g) => ({
      inventoryId: g.inventoryId,
      nome: g.nome,
      quantidade: g._sum.quantidade ?? 0,
      receita: g._sum.lineTotal ?? 0,
    })),
    vendasComDevolucao: coorte.map((v) => ({
      pedidoId: v.pedidoId,
      itens: v.itens.map((i): LinhaItem => ({ inventoryId: i.inventoryId, nome: i.nome, quantidade: i.quantidade, valor: i.lineTotal })),
    })),
    devolucoes,
    produtos: [...new Map(produtos.map((p) => [p.id, p])).values()],
    categorias,
    vendas: { quantidade: vendasAgg._count.id, total: vendasAgg._sum.total ?? 0 },
    canceladas: { quantidade: canceladasAgg._count.id, total: canceladasAgg._sum.total ?? 0 },
    devolucoesSemVenda: semVenda,
  }
}
