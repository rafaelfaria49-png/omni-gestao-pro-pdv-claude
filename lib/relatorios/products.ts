import "server-only"
import { Prisma } from "@/generated/prisma"
import { agregarProdutosVendidos, criarResolvedor, type DadosProdutosVendidos, type LinhaItem } from "./produtos-vendidos"
import { originHref,productOriginReport } from "./origins"
import { bucket, type ReportDb } from "./sql"
import type { Report, ReportQuery } from "./contracts"

/** PR318 reducer reused; return documents are selected by the authorized sale cohort. */
export async function productReport(db: ReportDb, storeId: string, q: ReportQuery): Promise<Report> {
  const at = { gte: q.start, lt: q.end }
  const [groups, sales, cancelled, linkedReturns, orphanReturns, categories, trend] = await Promise.all([
    db.itemVenda.groupBy({ by: ["inventoryId", "nome"], where: { venda: { storeId, at, status: { not: "cancelada" } } }, _sum: { quantidade: true, lineTotal: true } }),
    db.venda.aggregate({ where: { storeId, at, status: { not: "cancelada" } }, _sum: { total: true }, _count: { id: true } }),
    db.venda.aggregate({ where: { storeId, at, status: "cancelada" }, _sum: { total: true }, _count: { id: true } }),
    db.$queryRaw<{ pedidoId: string; itens: LinhaItem[]; devolucoes: LinhaItem[] }[]>(Prisma.sql`
      SELECT v."pedidoId",
        (SELECT coalesce(jsonb_agg(jsonb_build_object('inventoryId',i."inventoryId",'nome',i.nome,'quantidade',i.quantidade,'valor',i."lineTotal")), '[]') FROM venda_itens i WHERE i."vendaId"=v.id) AS itens,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('inventoryId',i."inventoryId",'nome',i.nome,'quantidade',i.quantidade,'valor',i."valorTotal")), '[]')
          FROM devolucoes_venda d JOIN itens_devolucao_venda i ON i."devolucaoId"=d.id
          WHERE d."storeId"=${storeId} AND d."vendaLocalId"=v."pedidoId") AS devolucoes
      FROM vendas v WHERE v."storeId"=${storeId} AND v.at>=${q.start} AND v.at<${q.end} AND v.status<>'cancelada'
        AND EXISTS (SELECT 1 FROM devolucoes_venda d WHERE d."storeId"=${storeId} AND d."vendaLocalId"=v."pedidoId")`),
    db.$queryRaw<{ documentos: number; quantidade: number; valor: number }[]>(Prisma.sql`
      SELECT count(DISTINCT d.id)::int AS documentos, coalesce(sum(i.quantidade),0)::float8 AS quantidade, coalesce(sum(i."valorTotal"),0)::float8 AS valor
      FROM devolucoes_venda d LEFT JOIN itens_devolucao_venda i ON i."devolucaoId"=d.id
      WHERE d."storeId"=${storeId} AND d.at>=${q.start} AND d.at<${q.end}
        AND NOT EXISTS(SELECT 1 FROM vendas v WHERE v."storeId"=${storeId} AND v."pedidoId"=d."vendaLocalId")`),
    db.categoriaProduto.findMany({ where: { storeId }, select: { slug: true, nome: true } }),
    db.$queryRaw<{ label: string; value: number }[]>(Prisma.sql`
      SELECT ${bucket(Prisma.sql`v.at`, q)} AS label, sum(i."lineTotal")::float8 AS value
      FROM vendas v JOIN venda_itens i ON i."vendaId"=v.id WHERE v."storeId"=${storeId}
      AND v.at>=${q.start} AND v.at<${q.end} AND v.status<>'cancelada' GROUP BY 1 ORDER BY 1`),
  ])
  if (groups.length > 100_000) throw new Error("REPORT_COHORT_TOO_LARGE")
  const refs = [...new Set(groups.map(g => g.inventoryId).filter((r): r is string => !!r))]
  const products: DadosProdutosVendidos["produtos"] = []
  // Batches of references, never one query per product, and no whole catalog download.
  for (let i = 0; i < refs.length; i += 1000) {
    const ids = refs.slice(i, i + 1000)
    products.push(...await db.produto.findMany({ where: { storeId, OR: [{ id: { in: ids } }, { sku: { in: ids } }, { barcode: { in: ids } }] },
      select: { id: true, name: true, sku: true, barcode: true, category: true, brand: true, active: true } }))
  }
  if(q.source){
    const resolve=criarResolvedor(products)
    return productOriginReport(db,storeId,q,groups.filter(g=>resolve(g.inventoryId,g.nome).chave===q.source).map(g=>({inventoryId:g.inventoryId,nome:g.nome})))
  }
  const data: DadosProdutosVendidos = {
    grupos: groups.map(g => ({ inventoryId: g.inventoryId, nome: g.nome, quantidade: g._sum.quantidade ?? 0, receita: g._sum.lineTotal ?? 0 })),
    vendasComDevolucao: linkedReturns.map(v => ({ pedidoId: v.pedidoId, itens: v.itens })),
    devolucoes: linkedReturns.map(v => ({ vendaLocalId: v.pedidoId, itens: v.devolucoes })),
    produtos: [...new Map(products.map(p => [p.id, p])).values()], categorias: categories,
    vendas: { quantidade: sales._count.id, total: sales._sum.total ?? 0 }, canceladas: { quantidade: cancelled._count.id, total: cancelled._sum.total ?? 0 },
    devolucoesSemVenda: orphanReturns[0],
  }
  const result = agregarProdutosVendidos(data, { busca: q.search, categoria: q.category, marca: q.brand, chave: q.entity,
    ordem: q.sort === "quantity" ? "quantidade" : "receita", limite: q.pageSize, offset: (q.page - 1) * q.pageSize })
  return {
    kind: "produtos", title: "Produtos mais vendidos", basis: "Coorte por data da venda; valores das linhas, líquidos de devoluções vinculadas.",
    source: "Venda + ItemVenda + DevolucaoVenda + ItemDevolucaoVenda; catálogo apenas para identidade e filtros.",
    limitations: [
      "Margem indisponível: custo histórico não é comprovado por ItemVenda. O custo atual do produto não é utilizado.",
      `Desconto/acréscimo geral não rateado: R$ ${result.diagnostico.ajusteNaoRateado.toFixed(2)}. Receita líquida das linhas não equivale a recebimento de caixa.`,
      "Categoria e marca refletem o cadastro atual. SKU antigo sem correspondência comprovada permanece fora do catálogo. Curva ABC: receita do recorte, limites de 80% e 95% antes de cada item.",
      "Tendência mostra receita bruta de todas as linhas da coorte, antes dos filtros de produto/categoria/marca. Quantidade é a unidade inteira persistida em ItemVenda; pesos sem unidade histórica confiável não são convertidos em kg.",
      `Devoluções sem venda vinculada: ${data.devolucoesSemVenda.documentos}. Quantidades acima do vendido descartadas: ${result.diagnostico.quantidadeDevolvidaDescartada}.`,
    ],
    metrics: [
      { key: "quantity", label: "Quantidade líquida (unidades registradas)", value: result.totais.quantidadeLiquida, format: "number" },
      { key: "gross", label: "Receita bruta das linhas", value: result.totais.receitaBruta, format: "money" },
      { key: "returns", label: "Devoluções vinculadas", value: result.totais.valorDevolvido, format: "money" },
      { key: "net", label: "Receita líquida das linhas", value: result.totais.receitaLiquida, format: "money" },
      { key: "cancelled", label: "Vendas canceladas (fora do ranking)", value: data.canceladas.total, format: "money" },
      { key: "margin", label: "Margem", value: null, reason: "Sem custo histórico comprovado." },
    ],
    columns: [{ key: "name", label: "Produto" }, { key: "sku", label: "SKU / código" }, { key: "category", label: "Categoria" }, { key: "brand", label: "Marca" },
      { key: "grossQuantity", label: "Qtd. bruta", format: "number" }, { key: "returnedQuantity", label: "Qtd. devolvida", format: "number" },
      { key: "quantity", label: "Qtd. líquida", format: "number" }, { key: "gross", label: "Bruto", format: "money" }, { key: "returns", label: "Devolvido", format: "money" },
      { key: "net", label: "Líquido das linhas", format: "money" }, { key: "average", label: "Preço médio", format: "money" }, { key: "share", label: "Participação", format: "percent" }, { key: "abc", label: "ABC" }],
    rows: result.produtos.map(p => ({ id: p.chave, name: p.nome, sku: p.sku ?? p.codigoBarras, category: p.categoriaNome, brand: p.marca,
      grossQuantity: p.quantidadeBruta, returnedQuantity: p.quantidadeDevolvida, quantity: p.quantidadeLiquida,
      gross: p.receitaBruta, returns: p.valorDevolvido, net: p.receitaLiquida, average: p.precoMedio, share: p.participacaoReceita * 100, abc: p.abc ?? null,
      href: originHref("produtos",p.chave,q) })),
    total: result.totalProdutos, trend,
    options: { categories: result.categorias.map(c => ({ value: c.chave, label: c.nome })), brands: [...new Set(products.map(p => p.brand).filter((b): b is string => !!b))].sort() },
  }
}
