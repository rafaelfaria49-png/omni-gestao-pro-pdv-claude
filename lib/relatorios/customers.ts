import "server-only"
import { Prisma } from "@/generated/prisma"
import { bucket, like, paginate, utcText, type ReportDb } from "./sql"
import { money, type Report, type ReportQuery } from "./contracts"
import { originHref } from "./origins"

export async function customerReport(db: ReportDb, storeId: string, q: ReportQuery): Promise<Report> {
  const cte = Prisma.sql`WITH sales AS (
      SELECT v.id,v."clienteId",v.at,v.total::numeric - least(greatest(v.total::numeric,0),coalesce(d.valor,0)) AS net
      FROM vendas v LEFT JOIN LATERAL (
        SELECT sum(d."valorTotal"::numeric) AS valor FROM devolucoes_venda d WHERE d."storeId"=${storeId} AND d."vendaLocalId"=v."pedidoId"
      ) d ON true WHERE v."storeId"=${storeId} AND v.at<${q.end} AND v.status<>'cancelada'
    ), customers AS (
      SELECT c.id,c.name,c.active,c."createdAt",c."documentKey",
        count(s.id) FILTER(WHERE s.at>=${q.start})::int AS frequency,
        coalesce(sum(s.net) FILTER(WHERE s.at>=${q.start}),0)::float8 AS spent,
        max(s.at) AS last, count(s.id)::int AS lifetime,
        extract(day from ${q.end}::timestamptz-max(s.at))::int AS recency
      FROM clientes_importados c LEFT JOIN sales s ON s."clienteId"=c.id
      WHERE c."storeId"=${storeId} AND c."createdAt"<${q.end} GROUP BY c.id
    ), eligible AS (
      SELECT id, ceil(cume_dist() OVER(ORDER BY last ASC)*5)::text || '-' || ceil(cume_dist() OVER(ORDER BY frequency)*5)::text || '-' || ceil(cume_dist() OVER(ORDER BY spent)*5)::text AS rfm,
        count(*) OVER() AS sample FROM customers WHERE "documentKey" IS NOT NULL AND frequency>0
    ), filtered AS (
      SELECT c.*,CASE WHEN e.sample>=10 THEN e.rfm ELSE NULL END AS rfm FROM customers c LEFT JOIN eligible e ON e.id=c.id
      WHERE c.name ILIKE ${like(q.search)} AND (${q.status}='' OR (${q.status}='ativo' AND c.active) OR (${q.status}='inativo' AND NOT c.active)
        OR (${q.status}='recorrente' AND c.frequency>=2) OR (${q.status}='sem-compras-recentes' AND (c.last IS NULL OR c.last<${new Date(q.end.getTime()-90*86400000)})))
    )`
  if (q.entity) {
    const [rows, count] = await Promise.all([
      db.$queryRaw<Record<string,string|number|null>[]>(Prisma.sql`${cte}
        SELECT s.id,v."pedidoId" AS number,${utcText(Prisma.sql`s.at`)} AS date,v.total::float8 AS gross,s.net::float8 AS net,v.status
        FROM sales s JOIN vendas v ON v.id=s.id AND v."storeId"=${storeId}
        JOIN customers c ON c.id=s."clienteId" WHERE c.id=${q.entity} AND s.at>=${q.start}
        ORDER BY s.at DESC,s.id ${paginate(q)}`),
      db.$queryRaw<{ total: number }[]>(Prisma.sql`${cte} SELECT count(*)::int AS total FROM sales s JOIN customers c ON c.id=s."clienteId" WHERE c.id=${q.entity} AND s.at>=${q.start}`),
    ])
    return { kind: "clientes", title: "Histórico de compras do cadastro", basis: "Somente vendas com FK do cliente na loja autorizada.", source: "Venda.clienteId + Cliente.id; devoluções vinculadas.",
      limitations: ["Cadastros duplicados permanecem separados. As vendas canceladas ficam fora dos valores e da frequência. Valores líquidos não são recebimentos financeiros."],
      metrics: [{ key: "purchases", label: "Compras no período", value: count[0].total, format: "number" }],
      columns: [{ key: "number", label: "Venda" }, { key: "date", label: "Data", format: "date" }, { key: "gross", label: "Total gravado", format: "money" }, { key: "net", label: "Líquido de devoluções", format: "money" }, { key: "status", label: "Status" }],
      rows: rows.map(r => ({ ...r, href: `${originHref("clientes",`venda:${r.number}`,q)}&entity=${encodeURIComponent(q.entity)}` })), total: count[0].total, trend: [] }
  }
  const [rows, metrics, unknown, trend] = await Promise.all([
    db.$queryRaw<Record<string,string|number|null>[]>(Prisma.sql`${cte}
      SELECT id,name,CASE WHEN active THEN 'Cadastro ativo' ELSE 'Cadastro inativo' END AS status,frequency,spent,
        CASE WHEN frequency>0 THEN spent/frequency ELSE NULL END::float8 AS average,${utcText(Prisma.sql`last`)} AS last,recency,rfm,count(*) OVER()::int AS total
      FROM filtered ORDER BY CASE WHEN ${q.sort}='name' THEN name END ASC,
        CASE WHEN ${q.sort}='quantity' THEN frequency END DESC,spent DESC,id ${paginate(q)}`),
    db.$queryRaw<{ registered: number; active: number; fresh: number; recurring: number; inactivePurchases: number; spent: number; purchases: number; total: number }[]>(Prisma.sql`${cte}
      SELECT count(*)::int AS registered,count(*) FILTER(WHERE active)::int AS active,count(*) FILTER(WHERE "createdAt">=${q.start})::int AS fresh,
        count(*) FILTER(WHERE frequency>=2)::int AS recurring,count(*) FILTER(WHERE last IS NULL OR last<${new Date(q.end.getTime()-90*86400000)})::int AS "inactivePurchases",
        coalesce(sum(spent),0)::float8 AS spent,coalesce(sum(frequency),0)::int AS purchases,(SELECT count(*)::int FROM filtered) AS total FROM customers`),
    db.$queryRaw<{ quantity: number; value: number }[]>(Prisma.sql`${cte} SELECT count(*)::int AS quantity,coalesce(sum(net),0)::float8 AS value FROM sales s
      WHERE s.at>=${q.start} AND NOT EXISTS(SELECT 1 FROM clientes_importados c WHERE c.id=s."clienteId" AND c."storeId"=${storeId})`),
    db.$queryRaw<{ label: string; value: number }[]>(Prisma.sql`SELECT ${bucket(Prisma.sql`"createdAt"`,q)} AS label,count(*)::float8 AS value FROM clientes_importados WHERE "storeId"=${storeId} AND "createdAt">=${q.start} AND "createdAt"<${q.end} GROUP BY 1 ORDER BY 1`),
  ])
  const t=metrics[0], u=unknown[0]
  return {
    kind: "clientes",title:"Clientes",basis:"Compras por FK do cadastro; novos clientes por data de criação. Ativo/inativo refere-se ao cadastro atual.",source:"Cliente + Venda.clienteId + DevolucaoVenda, sempre na mesma loja.",
    limitations:["Não há correspondência por nome, telefone ou documento legado. Cadastros duplicados permanecem separados; vendas sem FK não são atribuídas.",
      "Recorrente: pelo menos duas compras não canceladas no período. Sem compras recentes: nenhuma compra até o fim do período ou última compra há mais de 90 dias.",
      "RFM por cadastro com documentKey canônica e compra no recorte; quintis de recência, frequência e valor, com empates no mesmo escore, somente com pelo menos 10 cadastros elegíveis. Cadastro sem identidade forte: indisponível.",
      "Totais líquidos de devoluções vinculadas até a consulta; não incluem OS nem valores auxiliares totalSpent. Estado ativo e identidade são atuais, não um snapshot histórico. Documentos, telefones e emails não são retornados.",
      `Vendas sem cliente identificado/vínculo válido: ${u.quantity}, valor líquido R$ ${money(u.value).toFixed(2)}.`],
    metrics:[{key:"registered",label:"Cadastros até o fim do período",value:t.registered,format:"number"},{key:"active",label:"Cadastros ativos (estado atual)",value:t.active,format:"number"},
      {key:"inactive",label:"Cadastros inativos (estado atual)",value:t.registered-t.active,format:"number"},{key:"new",label:"Novos cadastros",value:t.fresh,format:"number"},
      {key:"recurring",label:"Clientes recorrentes no período",value:t.recurring,format:"number"},{key:"cold",label:"Sem compra nos últimos 90 dias",value:t.inactivePurchases,format:"number"},
      {key:"spent",label:"Compras líquidas identificadas",value:money(t.spent),format:"money"},{key:"ticket",label:"Ticket médio identificado",value:t.purchases?money(t.spent/t.purchases):null,format:"money",reason:"Sem compras identificadas no período."}],
    columns:[{key:"name",label:"Cliente"},{key:"status",label:"Cadastro"},{key:"frequency",label:"Compras",format:"number"},{key:"spent",label:"Total líquido",format:"money"},
      {key:"average",label:"Ticket médio",format:"money"},{key:"last",label:"Última compra",format:"date"},{key:"recency",label:"Recência (dias)",format:"number"},{key:"rfm",label:"R-F-M"}],
    rows:rows.map(r=>({...r,href:`/dashboard/relatorios/clientes?entity=${encodeURIComponent(String(r.id))}&from=${q.from}&to=${q.to}`})),total:t.total,trend,
  }
}
