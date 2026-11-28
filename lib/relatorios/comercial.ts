import "server-only"
import { Prisma } from "@/generated/prisma"
import { emptyArray, like, numeric, paginate, utcText, type ReportDb } from "./sql"
import { money, REPORT_TITLES, type Cell, type Metric, type Report, type ReportQuery, type ReportSection } from "./contracts"
import { centavosParaReais, diasEntre, ESTOQUE_PARADO_DIAS, margemHistorica } from "./comercial-helpers"

const DAY_MS = 86_400_000
const reais = (v: number | string | null | undefined) => centavosParaReais(v)
const round1 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10)

const BASIS = "Competência comercial: aquisição pela data de entrada da unidade, venda pela data da venda da unidade (venda ≠ recebimento; compra ≠ apropriação de custo). Valores em reais a partir de centavos inteiros."
const SOURCE = "Unidades (aparelhos_fisicos), perfil comercial, lançamentos de custo ativos, custo congelado na venda (comercial_vendas_custos), aquisições, vendas e eventos de aparelhos, vendas com payload.comercial e movimentações de estoque do PDV — sempre da loja selecionada."
const BASE_LIMITATIONS = [
  "O custo é CONGELADO no momento da venda: alterar custos depois não muda a margem histórica já registrada.",
  "Custo desconhecido nunca é somado como zero: unidades com custo desconhecido aparecem como \"Incompleto\" e deixam o capital imobilizado parcial.",
  "Margem bruta histórica considera apenas vendas com custo congelado completo; vendas legadas ou com custo incompleto ficam fora da margem e são contadas à parte. Margem bruta não é lucro líquido (tributos e despesas fixas fora).",
  "Compra não é custo do período: o custo de aquisição entra no capital imobilizado até a venda. Recebimentos e caixa são tratados em Fluxo de caixa, não aqui.",
]

/** CTEs de unidade (u/l/x): custos em centavos; NULL = desconhecido. Sempre filtradas pela loja. */
function unitCtes(storeId: string) {
  return Prisma.sql`u AS (
      SELECT f.id, f."codigoInterno", btrim(f.marca||' '||f.modelo) AS modelo, f.status, f.propriedade, f."precoVenda", f."entradaEstoqueEm", f."createdAt",
        coalesce(f."entradaEstoqueEm", f."createdAt") AS adquirido,
        coalesce(p.categoria,'') AS categoria, coalesce(p."etapaPreparacao",'nenhuma') AS etapa,
        -- Espelha statusCustoAquisicao (lib/comercial/custos/contracts.ts): zero só é custo conhecido
        -- quando confirmado com justificativa no prontuário; senão é DESCONHECIDO (nunca margem de 100%).
        CASE WHEN p."custoAquisicaoStatus"='desconhecido' THEN NULL
             WHEN f."custoAquisicao" > 0 THEN round(f."custoAquisicao"*100)::bigint
             WHEN p."custoAquisicaoStatus" IN ('conhecido','estimado') AND length(btrim(coalesce(p."custoAquisicaoJustificativa",''))) >= 10 THEN 0::bigint
             ELSE NULL END AS acq,
        round(f.despesas*100)::bigint AS desp
      FROM aparelhos_fisicos f
      LEFT JOIN comercial_perfis_unidade p ON p."aparelhoId"=f.id AND p."storeId"=f."storeId"
      WHERE f."storeId"=${storeId}
    ), l AS (
      SELECT "aparelhoId", coalesce(sum("valorCentavos") FILTER(WHERE "valorCentavos" IS NOT NULL),0)::bigint AS conhecido,
        count(*) FILTER(WHERE "valorCentavos" IS NULL)::int AS nd
      FROM comercial_custos_lancamentos WHERE "storeId"=${storeId} AND status='ativo' GROUP BY "aparelhoId"
    ), x AS (
      SELECT u.*, coalesce(l.conhecido,0)::bigint AS ap, coalesce(l.nd,0)::int AS nd,
        CASE WHEN u.acq IS NULL OR coalesce(l.nd,0)>0 THEN NULL ELSE u.acq+u.desp+coalesce(l.conhecido,0) END AS total
      FROM u LEFT JOIN l ON l."aparelhoId"=u.id
    )`
}

async function installed(db: ReportDb): Promise<boolean> {
  const [r] = await db.$queryRaw<{ ok: boolean }[]>(Prisma.sql`SELECT
    to_regclass('public.aparelhos_fisicos') IS NOT NULL AND to_regclass('public.comercial_perfis_unidade') IS NOT NULL
    AND to_regclass('public.comercial_custos_lancamentos') IS NOT NULL AND to_regclass('public.comercial_vendas_custos') IS NOT NULL
    AND to_regclass('public.aparelhos_vendas') IS NOT NULL AND to_regclass('public.aparelhos_eventos') IS NOT NULL
    AND to_regclass('public.aparelhos_aquisicoes') IS NOT NULL AS ok`)
  return !!r?.ok
}

function notInstalled(): Report {
  return {
    kind: "comercial", title: REPORT_TITLES.comercial, basis: BASIS, source: SOURCE,
    limitations: ["Recursos comerciais não instalados neste banco: as tabelas de aparelhos/custos comerciais ainda não existem. Nenhum valor foi estimado.", ...BASE_LIMITATIONS],
    metrics: [], columns: [], rows: [], total: 0, trend: [],
  }
}

export async function comercialReport(db: ReportDb, storeId: string, q: ReportQuery): Promise<Report> {
  if (!(await installed(db))) return notInstalled()
  const cte = unitCtes(storeId)
  const now = new Date()
  const stoppedCutoff = new Date(now.getTime() - ESTOQUE_PARADO_DIAS * DAY_MS)
  const inPeriod = (col: Prisma.Sql) => Prisma.sql`${col}>=${q.start} AND ${col}<${q.end}`
  const effDate = Prisma.sql`CASE WHEN v.payload->'comercial'->'retroativa'->>'dataEfetivaVenda' ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      THEN v.payload->'comercial'->'retroativa'->>'dataEfetivaVenda' END`
  const saleCtes = Prisma.sql`sv AS (
      SELECT v.id, v."pedidoId", v.payload, ${effDate} AS eff,
        to_char((v.at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS dia
      FROM vendas v WHERE v."storeId"=${storeId} AND lower(v.status) NOT IN ('cancelada','cancelado') AND jsonb_typeof(v.payload)='object'
    )`
  const soldJoin = Prisma.sql`FROM aparelhos_vendas v
      JOIN aparelhos_fisicos f ON f.id=v."aparelhoId" AND f."storeId"=v."storeId"
      LEFT JOIN comercial_perfis_unidade p ON p."aparelhoId"=f.id AND p."storeId"=f."storeId"
      LEFT JOIN comercial_vendas_custos c ON c."aparelhoVendaId"=v.id AND c."storeId"=v."storeId"
      WHERE v."storeId"=${storeId} AND v.status='ativa' AND v."dataVenda">=${q.start} AND v."dataVenda"<${q.end}`
  const complete = Prisma.sql`(c.completo AND c."custoTotalCentavos" IS NOT NULL)`
  const search = like(q.search)

  const [units, launches, sold, prep, retro, gifts, byCategory, bySupplier, rows] = await Promise.all([
    db.$queryRaw<{ adquiridos: number; acqCentavos: number; acqDesconhecidos: number; emPreparacao: number; disponiveis: number
      capital: number; capitalParcial: number; parados: number; capitalParado: number }[]>(Prisma.sql`WITH ${cte}
      SELECT count(*) FILTER(WHERE propriedade='loja' AND ${inPeriod(Prisma.sql`adquirido`)})::int AS adquiridos,
        coalesce(sum(acq) FILTER(WHERE propriedade='loja' AND ${inPeriod(Prisma.sql`adquirido`)}),0)::float8 AS "acqCentavos",
        count(*) FILTER(WHERE propriedade='loja' AND ${inPeriod(Prisma.sql`adquirido`)} AND acq IS NULL)::int AS "acqDesconhecidos",
        count(*) FILTER(WHERE status='em_revisao' AND etapa IN ('em_preparacao','em_testes'))::int AS "emPreparacao",
        count(*) FILTER(WHERE status='disponivel')::int AS disponiveis,
        coalesce(sum(coalesce(acq,0)+desp+ap) FILTER(WHERE propriedade='loja' AND status NOT IN ('vendido','baixado','devolvido')),0)::float8 AS capital,
        count(*) FILTER(WHERE propriedade='loja' AND status NOT IN ('vendido','baixado','devolvido') AND (acq IS NULL OR nd>0))::int AS "capitalParcial",
        count(*) FILTER(WHERE status='disponivel' AND propriedade='loja' AND "entradaEstoqueEm" IS NOT NULL AND "entradaEstoqueEm"<${stoppedCutoff})::int AS parados,
        coalesce(sum(coalesce(acq,0)+desp+ap) FILTER(WHERE status='disponivel' AND propriedade='loja' AND "entradaEstoqueEm" IS NOT NULL AND "entradaEstoqueEm"<${stoppedCutoff}),0)::float8 AS "capitalParado"
      FROM x`),
    db.$queryRaw<{ conhecido: number; desconhecidos: number; n: number }[]>(Prisma.sql`
      SELECT coalesce(sum("valorCentavos") FILTER(WHERE "valorCentavos" IS NOT NULL),0)::float8 AS conhecido,
        count(*) FILTER(WHERE "valorCentavos" IS NULL)::int AS desconhecidos, count(*)::int AS n
      FROM comercial_custos_lancamentos WHERE "storeId"=${storeId} AND status='ativo' AND ${inPeriod(Prisma.sql`"createdAt"`)}`),
    db.$queryRaw<{ vendidos: number; completos: number; margem: number; receita: number; dias: number | null }[]>(Prisma.sql`
      SELECT count(*)::int AS vendidos, count(*) FILTER(WHERE ${complete})::int AS completos,
        coalesce(sum(c."precoVendaCentavos"-c."custoTotalCentavos") FILTER(WHERE ${complete}),0)::float8 AS margem,
        coalesce(sum(c."precoVendaCentavos") FILTER(WHERE ${complete}),0)::float8 AS receita,
        (avg(extract(epoch FROM (v."dataVenda"-f."entradaEstoqueEm"))) FILTER(WHERE f."entradaEstoqueEm" IS NOT NULL AND v."dataVenda">=f."entradaEstoqueEm")/86400)::float8 AS dias
      ${soldJoin}`),
    db.$queryRaw<{ n: number; dias: number | null }[]>(Prisma.sql`
      SELECT count(*)::int AS n, (avg(extract(epoch FROM (e."createdAt"-i."createdAt")))/86400)::float8 AS dias
      FROM aparelhos_eventos e
      JOIN LATERAL (SELECT i."createdAt" FROM aparelhos_eventos i WHERE i."storeId"=${storeId} AND i."aparelhoId"=e."aparelhoId"
        AND i.tipo='preparacao_iniciada' AND i."createdAt"<=e."createdAt" ORDER BY i."createdAt" DESC LIMIT 1) i ON true
      WHERE e."storeId"=${storeId} AND e.tipo='preparacao_concluida' AND ${inPeriod(Prisma.sql`e."createdAt"`)}`),
    db.$queryRaw<{ n: number }[]>(Prisma.sql`WITH ${saleCtes}
      SELECT count(*)::int AS n FROM sv v WHERE jsonb_typeof(v.payload->'comercial'->'retroativa')='object'
        AND coalesce(v.eff,v.dia)>=${q.from} AND coalesce(v.eff,v.dia)<=${q.to}`),
    db.$queryRaw<{ n: number; conhecido: number; desconhecidos: number }[]>(Prisma.sql`WITH ${saleCtes}
      SELECT count(*)::int AS n, coalesce(sum(m."custoUnitario"*g.qtd) FILTER(WHERE m."custoUnitario" IS NOT NULL AND g.qtd IS NOT NULL),0)::float8 AS conhecido,
        count(*) FILTER(WHERE m."custoUnitario" IS NULL OR g.qtd IS NULL)::int AS desconhecidos
      FROM sv v
      CROSS JOIN LATERAL (SELECT b->>'produtoRef' AS ref, ${numeric(Prisma.sql`b->>'quantidade'`)} AS qtd
        FROM jsonb_array_elements(${emptyArray(Prisma.sql`v.payload->'comercial'->'brindes'`)}) b) g
      LEFT JOIN LATERAL (SELECT m."custoUnitario" FROM movimentacoes_estoque m WHERE m."storeId"=${storeId} AND m.tipo='saida' AND m.origem='pdv'
        AND m.documento=v."pedidoId" AND m."produtoId"=g.ref AND m."custoUnitario">0 ORDER BY m."createdAt" LIMIT 1) m ON true
      WHERE coalesce(v.eff,v.dia)>=${q.from} AND coalesce(v.eff,v.dia)<=${q.to}`),
    db.$queryRaw<{ categoria: string; vendidos: number; completos: number; receita: number; custo: number; margem: number }[]>(Prisma.sql`
      SELECT coalesce(nullif(p.categoria,''),'Sem categoria') AS categoria, count(*)::int AS vendidos, count(*) FILTER(WHERE ${complete})::int AS completos,
        coalesce(sum(c."precoVendaCentavos") FILTER(WHERE ${complete}),0)::float8 AS receita,
        coalesce(sum(c."custoTotalCentavos") FILTER(WHERE ${complete}),0)::float8 AS custo,
        coalesce(sum(c."precoVendaCentavos"-c."custoTotalCentavos") FILTER(WHERE ${complete}),0)::float8 AS margem
      ${soldJoin} GROUP BY 1 ORDER BY 6 DESC, 1 LIMIT 50`),
    db.$queryRaw<{ fornecedor: string; compras: number; unidades: number; valor: number }[]>(Prisma.sql`
      SELECT coalesce(nullif(fo.name,''), nullif(a."vendedorNome",''), 'Sem identificação') AS fornecedor, count(*)::int AS compras,
        coalesce(sum(n.un),0)::int AS unidades, coalesce(sum(a."valorTotal"),0)::float8 AS valor
      FROM aparelhos_aquisicoes a
      LEFT JOIN fornecedores fo ON fo.id=a."fornecedorId" AND fo."storeId"=a."storeId"
      LEFT JOIN LATERAL (SELECT count(*) AS un FROM aparelhos_fisicos f WHERE f."aquisicaoId"=a.id AND f."storeId"=${storeId}) n ON true
      WHERE a."storeId"=${storeId} AND a.status='confirmada' AND ${inPeriod(Prisma.sql`coalesce(a."aprovadaEm",a."createdAt")`)}
      GROUP BY 1 ORDER BY 4 DESC, 1 LIMIT 50`),
    db.$queryRaw<{ id: string; codigo: string; modelo: string; categoria: string; status: string; acq: number | null; ap: number; nd: number; total: number | null
      preco: number; adquirido: string; vendido: boolean; pc: number | null; ct: number | null; completo: boolean | null; total_rows: number }[]>(Prisma.sql`WITH ${cte}
      SELECT x.id, x."codigoInterno" AS codigo, x.modelo, x.categoria, x.status, x.acq::float8 AS acq, x.ap::float8 AS ap, x.nd, x.total::float8 AS total,
        x."precoVenda"::float8 AS preco, ${utcText(Prisma.sql`x.adquirido`)} AS adquirido, (x.status='vendido') AS vendido,
        s.pc::float8 AS pc, s.ct::float8 AS ct, s.completo, count(*) OVER()::int AS total_rows
      FROM x
      LEFT JOIN LATERAL (SELECT c."precoVendaCentavos" AS pc, c."custoTotalCentavos" AS ct, c.completo FROM aparelhos_vendas v
        JOIN comercial_vendas_custos c ON c."aparelhoVendaId"=v.id AND c."storeId"=${storeId}
        WHERE v."storeId"=${storeId} AND v."aparelhoId"=x.id AND v.status='ativa' ORDER BY v."dataVenda" DESC LIMIT 1) s ON true
      WHERE x.propriedade='loja'
        AND (${inPeriod(Prisma.sql`x.adquirido`)} OR x.status NOT IN ('vendido','baixado','devolvido')
          OR EXISTS (SELECT 1 FROM aparelhos_vendas v WHERE v."storeId"=${storeId} AND v."aparelhoId"=x.id AND v.status='ativa' AND ${inPeriod(Prisma.sql`v."dataVenda"`)}))
        AND (x."codigoInterno" ILIKE ${search} OR x.modelo ILIKE ${search})
        AND (${q.status}='' OR x.status=${q.status}) AND (${q.category}='' OR x.categoria=${q.category})
      ORDER BY x.adquirido DESC, x.id ${paginate(q)}`),
  ])

  const u = units[0], la = launches[0], so = sold[0], pr = prep[0], rt = retro[0], gf = gifts[0]
  const missingSalesCost = so.vendidos - so.completos
  const capitalLabel = u.capitalParcial > 0 ? "Capital imobilizado (parcial)" : "Capital imobilizado"
  const metrics: Metric[] = [
    { key: "acquired", label: "Aparelhos adquiridos no período", value: u.adquiridos, format: "number" },
    { key: "inPreparation", label: "Em preparação (agora)", value: u.emPreparacao, format: "number" },
    { key: "available", label: "Disponíveis (agora)", value: u.disponiveis, format: "number" },
    { key: "sold", label: "Vendidos no período", value: so.vendidos, format: "number" },
    { key: "acquisitionCost", label: u.acqDesconhecidos > 0 ? "Custo de aquisição dos adquiridos (parcial)" : "Custo de aquisição dos adquiridos", value: reais(u.acqCentavos), format: "money",
      ...(u.acqDesconhecidos > 0 ? { reason: `${u.acqDesconhecidos} unidade(s) com custo de aquisição desconhecido não somadas.` } : {}) },
    { key: "appliedCosts", label: la.desconhecidos > 0 ? "Custos aplicados no período (parcial)" : "Custos aplicados no período", value: reais(la.conhecido), format: "money" },
    { key: "unknownCosts", label: "Lançamentos de custo com valor desconhecido", value: la.desconhecidos, format: "number" },
    { key: "capital", label: capitalLabel, value: reais(u.capital), format: "money",
      ...(u.capitalParcial > 0 ? { reason: `${u.capitalParcial} unidade(s) com custo incompleto: o valor é um mínimo, não o total.` } : {}) },
    { key: "margin", label: "Margem bruta histórica (custo congelado completo)", value: so.completos > 0 ? reais(so.margem) : null, format: "money",
      reason: "Nenhuma venda do período com custo congelado completo." },
    { key: "marginPct", label: "Margem bruta histórica (%)", value: so.completos > 0 && so.receita > 0 ? Math.round((so.margem / so.receita) * 10000) / 100 : null, format: "percent",
      reason: "Sem venda com custo completo e preço positivo no período." },
    { key: "salesWithoutCost", label: "Vendas sem custo congelado completo (fora da margem)", value: missingSalesCost, format: "number" },
    { key: "stalled", label: `Estoque parado (> ${ESTOQUE_PARADO_DIAS} dias)`, value: u.parados, format: "number" },
    { key: "stalledCapital", label: "Capital em estoque parado", value: reais(u.capitalParado), format: "money" },
    { key: "prepDays", label: "Tempo médio de preparação (dias)", value: round1(pr.dias), format: "number", reason: "Sem preparação concluída no período." },
    { key: "daysToSale", label: "Tempo médio até a venda (dias)", value: round1(so.dias), format: "number", reason: "Sem venda com data de entrada em estoque no período." },
    { key: "retroactive", label: "Vendas retroativas no período (data efetiva)", value: rt.n, format: "number" },
    { key: "gifts", label: "Brindes no período", value: gf.n, format: "number" },
    { key: "giftsCost", label: gf.desconhecidos > 0 ? "Custo histórico dos brindes (parcial)" : "Custo histórico dos brindes", value: gf.n > 0 ? money(gf.conhecido) : 0, format: "money",
      ...(gf.desconhecidos > 0 ? { reason: `${gf.desconhecidos} brinde(s) sem movimentação de estoque correspondente: custo desconhecido, não somado.` } : {}) },
  ]

  const limitations = [...BASE_LIMITATIONS,
    `Vendas do período sem custo congelado completo (legadas ou com componente desconhecido), excluídas da margem: ${missingSalesCost}.`,
    "Estoque parado considera unidades disponíveis com data de entrada em estoque registrada; unidades sem essa data não são classificadas.",
    "Capital imobilizado, em preparação e disponíveis refletem a posição atual das unidades, não o fim do período.",
    "Tempo até a venda usa a primeira entrada em estoque da unidade; unidades recompradas podem distorcer a média.",
    "Brindes: custo = custo unitário histórico da saída do PDV correspondente (documento e produto) × quantidade; sem movimentação correspondente o custo é desconhecido.",
    gf.desconhecidos > 0 ? `Brindes com custo desconhecido: ${gf.desconhecidos}.` : "",
  ].filter(Boolean)

  const mapped = rows.map(r => {
    const frozen = margemHistorica(r.pc, r.ct, r.completo === true)
    const row: Record<string, Cell> = {
      id: r.id, codigo: r.codigo, modelo: r.modelo, categoria: r.categoria || "—", status: r.status,
      acquisition: reais(r.acq), applied: reais(r.ap), total: r.total === null ? "Incompleto" : reais(r.total), price: money(r.preco),
      margin: r.vendido ? (frozen ? frozen.valor : "Sem custo completo") : null,
      days: r.vendido ? null : diasEntre(new Date(r.adquirido), now),
    }
    return row
  })

  const sections: ReportSection[] = [
    { key: "indicadores", title: "Indicadores comerciais", note: "Aparelhos, custos e rentabilidade da loja no período; posições atuais indicadas no rótulo.", metrics },
    { key: "rentabilidade", title: "Rentabilidade por categoria", note: "Vendas de aparelhos no período. Receita, custo e margem só de vendas com custo congelado completo.", metrics: [],
      columns: [{ key: "categoria", label: "Categoria" }, { key: "vendidos", label: "Vendidos", format: "number" }, { key: "completos", label: "Com custo completo", format: "number" },
        { key: "receita", label: "Receita (custo completo)", format: "money" }, { key: "custo", label: "Custo congelado", format: "money" }, { key: "margem", label: "Margem bruta", format: "money" }],
      rows: byCategory.map(r => ({ id: r.categoria, categoria: r.categoria, vendidos: r.vendidos, completos: r.completos, receita: reais(r.receita), custo: reais(r.custo), margem: r.completos > 0 ? reais(r.margem) : null })) },
    { key: "compras", title: "Compras por fornecedor", note: "Aquisições confirmadas no período (data de aprovação), agrupadas por fornecedor ou vendedor informado.", metrics: [],
      columns: [{ key: "fornecedor", label: "Fornecedor / vendedor" }, { key: "compras", label: "Aquisições", format: "number" }, { key: "unidades", label: "Unidades", format: "number" }, { key: "valor", label: "Valor total", format: "money" }],
      rows: bySupplier.map(r => ({ id: r.fornecedor, fornecedor: r.fornecedor, compras: r.compras, unidades: r.unidades, valor: money(r.valor) })) },
  ]

  return {
    kind: "comercial", title: REPORT_TITLES.comercial, basis: BASIS, source: SOURCE, limitations, metrics,
    columns: [{ key: "codigo", label: "Código" }, { key: "modelo", label: "Modelo" }, { key: "categoria", label: "Categoria" }, { key: "status", label: "Situação" },
      { key: "acquisition", label: "Custo de aquisição", format: "money" }, { key: "applied", label: "Custos aplicados", format: "money" }, { key: "total", label: "Custo total", format: "money" },
      { key: "price", label: "Preço", format: "money" }, { key: "margin", label: "Margem histórica", format: "money" }, { key: "days", label: "Dias em estoque", format: "number" }],
    rows: mapped, total: rows[0]?.total_rows ?? 0, trend: [], sections,
  }
}
