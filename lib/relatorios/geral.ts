import "server-only"
import { Prisma } from "@/generated/prisma"
import { saoPauloDay, type Cell, type Column, type Report, type ReportQuery } from "./contracts"
import { cashFlowReport, movementCtes, titleCtes, titles } from "./finance"
import { emptyArray, like, numeric, paginate, utcText, type ReportDb } from "./sql"
import {
  buildGeneralSections, cellRows, label, LEDGER_LABEL, ORIGIN_LABEL, PURCHASE_CATEGORIES, RECEIPT_SUB_LABEL, RECEIVABLE_ORIGIN_LABEL, RECORD_LABEL,
  SALE_TYPE_LABEL, SALE_TYPES, STATUS_LABEL, type GeneralRaw, type LedgerRow, type OpenRow,
} from "./geral-model"

type Row = Record<string, Cell>
const CANCELLED = ["cancelado", "cancelada", "estornado", "estornada"]
const norm = (e: Prisma.Sql) => Prisma.sql`regexp_replace(lower(trim(${e})),'[[:space:]]+','_','g')`

/** Venda da loja no período. Payload só quando objeto (JSON não confiável). */
function salesCte(storeId: string, q: ReportQuery) {
  return Prisma.sql`v AS (
    SELECT v.id, v."pedidoId", v.at, v.total::numeric AS total, v."contaReceberTituloId" AS crt, ${norm(Prisma.sql`v.status`)} AS status,
      CASE WHEN jsonb_typeof(v.payload)='object' THEN v.payload END AS payload
    FROM vendas v WHERE v."storeId"=${storeId} AND v.at>=${q.start} AND v.at<${q.end}
  )`
}

/**
 * Tipo da linha. Ordem: identificador virtual gravado (O.S./serviço/avulso, mesmo contrato de
 * lib/os-pdv-virtual-lines) → venda gerada da OS → unidade de aparelho vinculada à venda →
 * modelo serializado → categoria atual do catálogo. Sem produto na loja: Não classificado.
 */
function lineType(storeId: string, inv: Prisma.Sql, venda: Prisma.Sql, osDoc: Prisma.Sql) {
  const i = Prisma.sql`coalesce(${inv},'')`
  return Prisma.sql`CASE
    WHEN starts_with(${i},'__os_servico__') OR starts_with(${i},'__os_pecas__') OR coalesce(${osDoc},false) THEN 'os'
    WHEN starts_with(${i},'__servico__') OR starts_with(${i},'__avulso__svc-') THEN 'servico'
    WHEN starts_with(${i},'__avulso__') THEN 'avulso'
    WHEN ${venda} IS NOT NULL AND EXISTS(SELECT 1 FROM aparelhos_vendas av JOIN aparelhos_fisicos af ON af.id=av."aparelhoId" AND af."storeId"=${storeId}
      WHERE av."storeId"=${storeId} AND av."vendaId"=${venda} AND (af."produtoId"=${i} OR af."produtoId" IN
        (SELECT p.id FROM estoque_produtos p WHERE p."storeId"=${storeId} AND (p.sku=${i} OR p.barcode=${i})))) THEN 'aparelho'
    ELSE coalesce((SELECT CASE WHEN p.metadata->'serializedDevice'->>'version'='1' THEN 'aparelho'
        WHEN concat_ws(' ',p.category,c.nome) ~* 'acess' THEN 'acessorio' ELSE 'produto' END
      FROM estoque_produtos p LEFT JOIN categorias_produto c ON c."lojaId"=p."storeId" AND c.slug=p.category
      WHERE p."storeId"=${storeId} AND ${i}<>'' AND (p.id=${i} OR p.sku=${i} OR p.barcode=${i}) ORDER BY (p.id=${i}) DESC LIMIT 1),'nao_classificado') END`
}

function linesCte(storeId: string) {
  return Prisma.sql`lines AS (
    SELECT i.id, i."vendaId" AS venda_id, v.status, i.quantidade, i."lineTotal"::numeric AS valor,
      ${lineType(storeId, Prisma.sql`i."inventoryId"`, Prisma.sql`i."vendaId"`, Prisma.sql`(v.payload->>'origem')='os'`)} AS tipo
    FROM venda_itens i JOIN v ON v.id=i."vendaId"
  )`
}

function returnsCte(storeId: string, q: ReportQuery) {
  return Prisma.sql`r AS (
    SELECT d.id, d."localId", d."vendaLocalId", d.at, d."valorTotal"::numeric AS total, vv.id AS venda_id,
      (CASE WHEN jsonb_typeof(vv.payload)='object' THEN vv.payload->>'origem' END)='os' AS os_doc
    FROM devolucoes_venda d LEFT JOIN vendas vv ON vv."storeId"=${storeId} AND vv."pedidoId"=d."vendaLocalId"
    WHERE d."storeId"=${storeId} AND d.at>=${q.start} AND d.at<${q.end}
  ), rl AS (
    SELECT r.id AS dev_id, i.quantidade, i."valorTotal"::numeric AS valor,
      ${lineType(storeId, Prisma.sql`i."inventoryId"`, Prisma.sql`r.venda_id`, Prisma.sql`r.os_doc`)} AS tipo
    FROM r JOIN itens_devolucao_venda i ON i."devolucaoId"=r.id
  )`
}

/** Títulos a receber da venda: FK Venda.contaReceberTituloId ou localKey `pdv-aprazo-{pedidoId}[-{n}]`. Cancelados não contam. */
function saleTitles(storeId: string, pedido: Prisma.Sql, crt: Prisma.Sql) {
  return Prisma.sql`FROM contas_receber_titulos t WHERE t."storeId"=${storeId} AND ${norm(Prisma.sql`t.status`)} <> ALL(${CANCELLED}::text[])
    AND (t.id=${crt} OR t."localKey"='pdv-aprazo-'||${pedido}
      OR (starts_with(coalesce(t."localKey",''),'pdv-aprazo-'||${pedido}||'-') AND substr(t."localKey",length(${pedido})+13) ~ '^[0-9]+$'))`
}

/** Origem comprovada de um título a receber, só pelo contrato de localKey/payload. */
const receivableOrigin = (t: string) => Prisma.raw(`CASE
  WHEN starts_with(coalesce(${t}."localKey",''),'pdv-aprazo-') THEN 'venda_prazo'
  WHEN starts_with(coalesce(${t}."localKey",''),'os-faturamento:') OR starts_with(coalesce(${t}."localKey",''),'receber:os:')
    OR (jsonb_typeof(${t}.payload)='object' AND (${t}.payload->>'ordemServicoId' IS NOT NULL OR ${t}.payload->>'osId' IS NOT NULL)) THEN 'os'
  WHEN starts_with(coalesce(${t}."localKey",''),'receber:pdv:') THEN 'titulo_pdv'
  WHEN starts_with(coalesce(${t}."localKey",''),'receber:manual:') THEN 'titulo_manual'
  ELSE 'titulo_nao_classificado' END`)

/** Venda de origem de título pdv-aprazo (FK primeiro, depois pedido exato, depois pedido sem sufixo de parcela). */
function saleOfTitle(storeId: string, t: string) {
  const k = Prisma.raw(`substr(${t}."localKey",12)`), id = Prisma.raw(`${t}.id`), key = Prisma.raw(`coalesce(${t}."localKey",'')`)
  return Prisma.sql`LEFT JOIN LATERAL (SELECT sv.at, sv."pedidoId" FROM vendas sv WHERE sv."storeId"=${storeId} AND starts_with(${key},'pdv-aprazo-')
    AND (sv."contaReceberTituloId"=${id} OR sv."pedidoId"=${k} OR sv."pedidoId"=regexp_replace(${k},'-[0-9]+$',''))
    ORDER BY (sv."contaReceberTituloId"=${id}) DESC, (sv."pedidoId"=${k}) DESC LIMIT 1) sv ON true`
}

/** Classe única do movimento (CTE `m` de finance.movements). */
const ledgerClass = Prisma.sql`CASE
  WHEN m.transferencia THEN 'transferencia'
  WHEN m.origem IN ('sangria_pdv','suprimento_pdv') THEN 'tesouraria'
  WHEN lower(m.origem) ~ '^estorno_receber' THEN 'estorno_recebimento'
  WHEN lower(m.origem)='cancelamento_pdv' THEN 'cancelamento_venda'
  WHEN lower(m.origem) ~ '^(devolucao_|devolução_)' THEN 'devolucao'
  WHEN lower(m.origem) ~ '^estorno_pagar' THEN 'estorno_pagamento'
  WHEN m.tipo='entrada' AND lower(m.origem) IN ('venda','pdv') THEN 'venda_avista'
  WHEN m.tipo='entrada' AND lower(m.origem) ~ '^receber' THEN 'recebimento_titulo'
  WHEN m.tipo='entrada' AND lower(m.origem)='os' THEN 'os_direto'
  WHEN m.tipo='entrada' AND lower(m.origem)='marketplace' THEN 'marketplace'
  WHEN m.tipo='saida' AND lower(m.origem) ~ '^pagar' THEN 'pagamento_titulo'
  ELSE 'nao_classificado' END`

function ledgerCte(storeId: string, q: ReportQuery) {
  return Prisma.sql`${movementCtes(storeId, { ...q, wallet: "", category: "" })}, rt AS (
    SELECT t.id, ${receivableOrigin("t")} AS orig, sv.at AS venda_at FROM contas_receber_titulos t ${saleOfTitle(storeId, "t")}
    WHERE t."storeId"=${storeId} AND t.id IN (SELECT "referenciaId" FROM m WHERE "createdAt">=${q.start} AND tipo='entrada' AND lower(origem) ~ '^receber')
  ), cls AS (
    SELECT m.*, ${ledgerClass} AS classe, CASE m.tipo WHEN 'entrada' THEN m.valor WHEN 'saida' THEN -m.valor END AS sinal,
      CASE WHEN m.tipo='entrada' AND lower(m.origem) ~ '^receber' THEN
        CASE WHEN rt.id IS NULL THEN 'titulo_nao_encontrado' WHEN rt.orig<>'venda_prazo' THEN rt.orig
          WHEN rt.venda_at IS NULL THEN 'parcela_sem_venda' WHEN rt.venda_at>=${q.start} THEN 'parcela_venda_periodo' ELSE 'parcela_venda_anterior' END END AS sub,
      lower(m.categoria) = ANY(${PURCHASE_CATEGORIES}::text[]) AS compra
    FROM m LEFT JOIN rt ON rt.id=m."referenciaId" WHERE m."createdAt">=${q.start}
  )`
}

export async function generalAggregates(db: ReportDb, storeId: string, q: ReportQuery, options: { service: boolean }): Promise<GeneralRaw> {
  const today = saoPauloDay()
  const pb = (k: string) => numeric(Prisma.sql`v.payload->'paymentBreakdown'->>${k}`)
  const [salesTypes, salesTotals, returnTypes, returnTotals, split, ledger, open, flowReport, conference] = await Promise.all([
    db.$queryRaw<GeneralRaw["salesTypes"]>(Prisma.sql`WITH ${salesCte(storeId, q)}, ${linesCte(storeId)}
      SELECT tipo, count(DISTINCT venda_id)::int AS vendas, coalesce(sum(quantidade),0)::float8 AS quantidade, coalesce(sum(valor),0)::float8 AS bruto
      FROM lines WHERE status<>'cancelada' GROUP BY tipo`),
    db.$queryRaw<GeneralRaw["salesTotals"][]>(Prisma.sql`WITH ${salesCte(storeId, q)}
      SELECT count(*) FILTER(WHERE status<>'cancelada')::int AS vendas, coalesce(sum(total) FILTER(WHERE status<>'cancelada'),0)::float8 AS total,
        coalesce((SELECT sum(i."lineTotal") FROM venda_itens i JOIN v x ON x.id=i."vendaId" WHERE x.status<>'cancelada'),0)::float8 AS linhas,
        count(*) FILTER(WHERE status='cancelada')::int AS canceladas, coalesce(sum(total) FILTER(WHERE status='cancelada'),0)::float8 AS "totalCanceladas",
        count(*) FILTER(WHERE status='devolvida')::int AS devolvidas, count(*) FILTER(WHERE status='parcialmente_devolvida')::int AS parciais FROM v`),
    db.$queryRaw<GeneralRaw["returnTypes"]>(Prisma.sql`WITH ${returnsCte(storeId, q)}
      SELECT tipo, coalesce(sum(quantidade),0)::float8 AS quantidade, coalesce(sum(valor),0)::float8 AS valor FROM rl GROUP BY tipo`),
    db.$queryRaw<GeneralRaw["returnTotals"][]>(Prisma.sql`WITH ${returnsCte(storeId, q)}, docs AS (
        SELECT r.*, (SELECT coalesce(sum(valor),0) FROM rl WHERE rl.dev_id=r.id) AS itens FROM r)
      SELECT count(*)::int AS documentos, coalesce(sum(total),0)::float8 AS total, coalesce(sum(itens),0)::float8 AS itens,
        count(*) FILTER(WHERE venda_id IS NULL)::int AS "semVenda", count(*) FILTER(WHERE abs(total-itens)>=0.01)::int AS divergentes FROM docs`),
    db.$queryRaw<GeneralRaw["split"][]>(Prisma.sql`WITH ${salesCte(storeId, q)}, pay AS (
        SELECT v.total, coalesce((v.payload->>'origem')='os',false) AS os_doc, jsonb_typeof(v.payload->'paymentBreakdown')='object' AS has_pb,
          (SELECT coalesce(sum(m.valor),0) FROM movimentacoes_financeiras m WHERE m."storeId"=${storeId} AND m."referenciaId"=v."pedidoId" AND m.origem='venda' AND m.tipo='entrada')::numeric AS avista,
          (SELECT coalesce(sum(t.valor),0) ${saleTitles(storeId, Prisma.sql`v."pedidoId"`, Prisma.sql`v.crt`)})::numeric AS aprazo,
          ${pb("dinheiro")} AS dinheiro, ${pb("pix")} AS pix, ${pb("cartaoDebito")} AS debito, ${pb("cartaoCredito")} AS credito_cartao,
          ${pb("carne")} AS carne, ${pb("aPrazo")} AS aprazo_decl, ${pb("creditoVale")} AS credito
        FROM v WHERE v.status<>'cancelada'
      ), x AS (SELECT *, CASE WHEN os_doc THEN 0 ELSE greatest(0,total-avista-aprazo-coalesce(credito,0)) END AS falta,
          greatest(0,avista+aprazo+coalesce(credito,0)-total) AS sobra FROM pay)
      SELECT coalesce(sum(total),0)::float8 AS total, coalesce(sum(avista),0)::float8 AS avista, coalesce(sum(aprazo),0)::float8 AS aprazo,
        coalesce(sum(credito),0)::float8 AS credito, coalesce(sum(total) FILTER(WHERE os_doc),0)::float8 AS "osDoc", count(*) FILTER(WHERE os_doc)::int AS "osDocCount",
        coalesce(sum(falta),0)::float8 AS "semComprovacao", count(*) FILTER(WHERE falta>=0.01)::int AS "semComprovacaoCount",
        coalesce(sum(sobra),0)::float8 AS excedente, count(*) FILTER(WHERE sobra>=0.01)::int AS "excedenteCount",
        coalesce(sum(dinheiro),0)::float8 AS dinheiro, coalesce(sum(pix),0)::float8 AS pix, coalesce(sum(debito),0)::float8 AS debito,
        coalesce(sum(credito_cartao),0)::float8 AS "creditoCartao", coalesce(sum(carne),0)::float8 AS carne, coalesce(sum(aprazo_decl),0)::float8 AS "aprazoDeclarado",
        count(*) FILTER(WHERE NOT coalesce(has_pb,false) AND NOT os_doc)::int AS "semBreakdown",
        count(*) FILTER(WHERE has_pb AND NOT os_doc AND abs(avista-(total-coalesce(aprazo_decl,0)-coalesce(credito,0)))>=0.01)::int AS "divergenciaAvista",
        coalesce(sum(abs(avista-(total-coalesce(aprazo_decl,0)-coalesce(credito,0)))) FILTER(WHERE has_pb AND NOT os_doc AND abs(avista-(total-coalesce(aprazo_decl,0)-coalesce(credito,0)))>=0.01),0)::float8 AS "divergenciaAvistaValor",
        count(*) FILTER(WHERE coalesce(aprazo_decl,0)>=0.01 AND aprazo<0.01)::int AS "aprazoSemTitulo" FROM x`),
    db.$queryRaw<LedgerRow[]>(Prisma.sql`WITH ${ledgerCte(storeId, q)}
      SELECT classe, sub, CASE WHEN classe IN ('pagamento_titulo','estorno_pagamento') THEN categoria END AS categoria, bool_or(compra) AS compra,
        count(*)::int AS registros, coalesce(sum(sinal),0)::float8 AS valor, count(*) FILTER(WHERE sinal IS NULL)::int AS invalidos
      FROM cls GROUP BY 1,2,3`),
    db.$queryRaw<OpenRow[]>(Prisma.sql`${titles(storeId)}, o AS (
        SELECT outstanding.*, CASE WHEN lado='receber' THEN ${receivableOrigin("outstanding")} ELSE coalesce(nullif(payload->>'categoria',''),'Sem categoria') END AS grupo
        FROM outstanding)
      SELECT lado, grupo, count(*) FILTER(WHERE aberto>0)::int AS titulos, coalesce(sum(aberto),0)::float8 AS aberto,
        coalesce(sum(aberto) FILTER(WHERE dia<${today}),0)::float8 AS vencido, coalesce(sum(aberto) FILTER(WHERE dia>=${q.from} AND dia<=${q.to}),0)::float8 AS "noPeriodo",
        count(*) FILTER(WHERE aberto IS NULL OR (aberto>0 AND dia IS NULL))::int AS indeterminados
      FROM o GROUP BY 1,2 HAVING count(*) FILTER(WHERE aberto IS NULL OR aberto>0)>0 ORDER BY 1,2`),
    cashFlowReport(db, storeId, { ...q, wallet: "", category: "", search: "", page: 1, pageSize: 1 }),
    db.$queryRaw<GeneralRaw["conference"][]>(Prisma.sql`WITH ${salesCte(storeId, q)}, ${linesCte(storeId)}, osl AS (
        SELECT DISTINCT substr(i."inventoryId", CASE WHEN starts_with(i."inventoryId",'__os_servico__') THEN 15 ELSE 13 END) AS os_id, i."lineTotal" AS valor
        FROM venda_itens i JOIN v ON v.id=i."vendaId" WHERE v.status<>'cancelada' AND (starts_with(coalesce(i."inventoryId",''),'__os_servico__') OR starts_with(coalesce(i."inventoryId",''),'__os_pecas__'))
      ), osdup AS (SELECT os_id, sum(valor) AS valor FROM osl WHERE EXISTS(
          SELECT 1 FROM contas_receber_titulos t JOIN movimentacoes_financeiras mm ON mm."storeId"=${storeId} AND mm."referenciaId"=t.id AND mm.tipo='entrada' AND lower(mm.origem) ~ '^receber'
          WHERE t."storeId"=${storeId} AND (t."localKey" IN ('os-faturamento:'||${storeId}||':'||osl.os_id,'receber:os:'||${storeId}||':'||osl.os_id)
            OR (jsonb_typeof(t.payload)='object' AND (t.payload->>'ordemServicoId'=osl.os_id OR t.payload->>'osId'=osl.os_id))))
        GROUP BY os_id)
      SELECT
        (SELECT count(*) FROM v WHERE status='cancelada' AND EXISTS(SELECT 1 FROM movimentacoes_financeiras m WHERE m."storeId"=${storeId} AND m."referenciaId"=v."pedidoId" AND m.origem='venda' AND m.tipo='entrada')
          AND NOT EXISTS(SELECT 1 FROM movimentacoes_financeiras m WHERE m."storeId"=${storeId} AND m."referenciaId"=v."pedidoId" AND m.origem='cancelamento_pdv'))::int AS "cancelSemEstorno",
        coalesce((SELECT sum(m.valor) FROM v JOIN movimentacoes_financeiras m ON m."storeId"=${storeId} AND m."referenciaId"=v."pedidoId" AND m.origem='venda' AND m.tipo='entrada'
          WHERE v.status='cancelada' AND NOT EXISTS(SELECT 1 FROM movimentacoes_financeiras c WHERE c."storeId"=${storeId} AND c."referenciaId"=v."pedidoId" AND c.origem='cancelamento_pdv')),0)::float8 AS "cancelSemEstornoValor",
        (SELECT count(*) FROM osdup)::int AS "osDupla", coalesce((SELECT sum(valor) FROM osdup),0)::float8 AS "osDuplaValor",
        coalesce((SELECT sum(valor) FROM caixa_operacoes WHERE "storeId"=${storeId} AND at>=${q.start} AND at<${q.end} AND lower(tipo)='recebimento_cr'),0)::float8 AS "caixaRecebimentos",
        coalesce((SELECT sum(valor) FROM caixa_operacoes WHERE "storeId"=${storeId} AND at>=${q.start} AND at<${q.end} AND lower(tipo)='estorno_recebimento_cr'),0)::float8 AS "caixaEstornos",
        0::float8 AS "aprazoAbertoCoorte",
        ${options.service ? Prisma.sql`(SELECT count(*) FROM ordens_servico WHERE "storeId"=${storeId} AND "createdAt">=${q.start} AND "createdAt"<${q.end})::int` : Prisma.sql`NULL::int`} AS "osCriadas",
        (SELECT count(*) FROM aparelhos_vendas av JOIN v ON v.id=av."vendaId" WHERE av."storeId"=${storeId} AND v.status<>'cancelada')::int AS "aparelhosUnidades",
        coalesce((SELECT sum(av."precoVenda") FROM aparelhos_vendas av JOIN v ON v.id=av."vendaId" WHERE av."storeId"=${storeId} AND v.status<>'cancelada'),0)::float8 AS "aparelhosValor"`),
  ])
  // Em aberto de títulos a prazo das vendas deste período: mesma regra de saldo dos títulos.
  const [cohort] = await db.$queryRaw<{ valor: number }[]>(Prisma.sql`${titles(storeId)}
    SELECT coalesce(sum(o.aberto),0)::float8 AS valor FROM outstanding o ${saleOfTitle(storeId, "o")}
    WHERE o.lado='receber' AND sv.at>=${q.start} AND sv.at<${q.end}`)
  const metric = (key: string) => flowReport.metrics.find(x => x.key === key)?.value ?? null
  return {
    salesTypes, salesTotals: salesTotals[0], returnTypes, returnTotals: returnTotals[0], split: split[0], ledger, open,
    flow: { initial: metric("initial"), incoming: metric("incoming") ?? 0, outgoing: metric("outgoing") ?? 0, openingAdjustments: metric("openingAdjustments"), final: metric("final") },
    conference: { ...conference[0], aprazoAbertoCoorte: cohort.valor },
  }
}

const geralHref = (source: string, q: ReportQuery) => `/dashboard/relatorios/geral?source=${encodeURIComponent(source)}&from=${q.from}&to=${q.to}`
const flowHref = (id: string, q: ReportQuery) => `/dashboard/relatorios/fluxo-caixa?source=${encodeURIComponent(id)}&from=${q.from}&to=${q.to}`

/** Origem do registro de detalhe a partir da classe do ledger. */
const movementOrigin = Prisma.sql`CASE classe WHEN 'venda_avista' THEN 'pdv' WHEN 'os_direto' THEN 'os' WHEN 'marketplace' THEN 'marketplace'
  WHEN 'recebimento_titulo' THEN CASE WHEN sub='os' THEN 'os' WHEN sub IN ('titulo_manual') THEN 'manual' WHEN sub IN ('titulo_nao_classificado','titulo_nao_encontrado') THEN 'nao_classificado' ELSE 'receber' END
  WHEN 'pagamento_titulo' THEN 'pagar' WHEN 'estorno_pagamento' THEN 'pagar' WHEN 'tesouraria' THEN 'tesouraria' WHEN 'transferencia' THEN 'transferencia'
  WHEN 'estorno_recebimento' THEN 'estorno' WHEN 'cancelamento_venda' THEN 'estorno' WHEN 'devolucao' THEN 'estorno' ELSE 'nao_classificado' END`


/** Detalhamento unificado. Valores de tipos de registro diferentes nunca são somados. */
function detailCte(storeId: string, q: ReportQuery) {
  const today = saoPauloDay()
  return Prisma.sql`WITH ${ledgerCte(storeId, q)}, ${salesCte(storeId, q)}, ${linesCte(storeId)}, ${returnsCte(storeId, q)}, ${titleCtes(storeId)},
  tsel AS (
    SELECT o.*, CASE WHEN o.lado='receber' THEN ${receivableOrigin("o")} END AS orig FROM outstanding o
    WHERE (o.dia>=${q.from} AND o.dia<=${q.to}) OR (o."createdAt">=${q.start} AND o."createdAt"<${q.end})
      OR (o.aberto>0 AND (o.dia<${q.from} OR o.dia IS NULL)) OR o.aberto IS NULL
  ), d AS (
    SELECT 'venda:'||v."pedidoId" AS id, v.at AS ts, ${utcText(Prisma.sql`v.at`)} AS date, 'venda'::text AS record,
      CASE WHEN (v.payload->>'origem')='os' OR EXISTS(SELECT 1 FROM lines l WHERE l.venda_id=v.id AND l.tipo='os') THEN 'os' ELSE 'pdv' END AS origin,
      coalesce((SELECT array_agg(DISTINCT 'tipo:'||l.tipo) FROM lines l WHERE l.venda_id=v.id),'{}'::text[]) AS cats,
      CASE WHEN v.status IN ('concluida','cancelada','parcialmente_devolvida','devolvida') THEN v.status ELSE 'outro' END AS status,
      v."pedidoId" AS reference, v.total::float8 AS amount, NULL::float8 AS open, v."pedidoId" AS link
    FROM v
    UNION ALL SELECT 'mov:'||c.id, c."createdAt", ${utcText(Prisma.sql`c."createdAt"`)}, 'movimento', ${movementOrigin},
      array_remove(ARRAY['classe:'||c.classe, CASE WHEN c.sub IS NOT NULL THEN 'sub:'||c.sub END,
        CASE WHEN c.classe IN ('pagamento_titulo','estorno_pagamento') THEN 'despesa:'||c.categoria END], NULL),
      'realizado', c."referenciaId", c.sinal::float8, NULL::float8, c.id FROM cls c
    UNION ALL SELECT 'dev:'||r.id, r.at, ${utcText(Prisma.sql`r.at`)}, 'devolucao', 'pdv',
      coalesce((SELECT array_agg(DISTINCT 'tipo:'||rl.tipo) FROM rl WHERE rl.dev_id=r.id),'{}'::text[]), 'devolvido', r."vendaLocalId", -r.total::float8, NULL::float8,
      CASE WHEN r.venda_id IS NOT NULL THEN r."vendaLocalId" END FROM r
    UNION ALL SELECT 'titulo:'||t.lado||':'||t.id, coalesce((t.dia||' 15:00:00')::timestamp, t."createdAt"), coalesce(t.dia, ${utcText(Prisma.sql`t."createdAt"`)}), t.lado,
      CASE WHEN t.lado='pagar' THEN 'pagar' WHEN t.orig='os' THEN 'os' WHEN t.orig IN ('venda_prazo','titulo_pdv') THEN 'pdv' WHEN t.orig='titulo_manual' THEN 'manual' ELSE 'nao_classificado' END,
      CASE WHEN t.lado='pagar' THEN ARRAY['despesa:'||coalesce(nullif(t.payload->>'categoria',''),'Sem categoria')] ELSE ARRAY['receber:'||t.orig] END,
      CASE WHEN t.status = ANY(${CANCELLED}::text[]) THEN 'cancelado' WHEN t.aberto IS NULL OR (t.aberto>0 AND t.dia IS NULL) THEN 'indeterminado'
        WHEN t.aberto<=0 THEN 'quitado' WHEN t.dia<${today} THEN 'vencido' ELSE 'em_aberto' END,
      t.id, t.valor::float8, t.aberto::float8, t.lado||':'||t.id FROM tsel t
  ), f AS (
    SELECT * FROM d WHERE (${q.record}='' OR record=${q.record}) AND (${q.origin}='' OR origin=${q.origin})
      AND (${q.status}='' OR status=${q.status}) AND (${q.category}='' OR ${q.category}=ANY(cats))
      AND (${q.search}='' OR coalesce(reference,'') ILIKE ${like(q.search)} OR id ILIKE ${like(q.search)})
  )`
}

const catLabel = (c: string) => {
  const [kind, ...rest] = c.split(":"), key = rest.join(":")
  if (kind === "tipo") return label(SALE_TYPE_LABEL, key)
  if (kind === "classe") return label(LEDGER_LABEL, key)
  if (kind === "sub") return label(RECEIPT_SUB_LABEL, key)
  if (kind === "receber") return label(RECEIVABLE_ORIGIN_LABEL, key)
  return key
}

export const GENERAL_COLUMNS: Column[] = [{ key: "date", label: "Data", format: "date" }, { key: "record", label: "Registro" }, { key: "origin", label: "Origem" },
  { key: "category", label: "Classificação" }, { key: "status", label: "Situação" }, { key: "reference", label: "Referência" },
  { key: "amount", label: "Valor do registro", format: "money" }, { key: "open", label: "Saldo em aberto", format: "money" }]

type DetailRow = { id: string; date: string; record: string; origin: string; cats: string[]; status: string; reference: string | null; amount: number | null; open: number | null; link: string | null }

export async function generalReport(db: ReportDb, storeId: string, q: ReportQuery, options: { service: boolean }): Promise<Report> {
  const cte = detailCte(storeId, q)
  const raw = await generalAggregates(db, storeId, q, options)
  const [rows, count] = await Promise.all([
    db.$queryRaw<DetailRow[]>(Prisma.sql`${cte} SELECT id, date, record, origin, cats, status, reference, amount, open, link FROM f ORDER BY ts DESC NULLS LAST, id ${paginate(q)}`),
    db.$queryRaw<{ total: number }[]>(Prisma.sql`${cte} SELECT count(*)::int AS total FROM f`),
  ])
  const built = buildGeneralSections(raw, options)
  const expenseCats = [...new Set([...raw.ledger.filter(r => r.categoria).map(r => r.categoria!), ...raw.open.filter(o => o.lado === "pagar").map(o => o.grupo)])].sort()
  const href = (r: DetailRow) => !r.link ? null
    : r.record === "movimento" ? flowHref(r.link, q)
    : r.record === "receber" || r.record === "pagar" ? geralHref(`titulo:${r.link}`, q)
    : geralHref(`venda:${r.link}`, q)
  return {
    kind: "geral", title: "Relatório Geral da Loja",
    basis: "Vendas por competência (data da venda). Recebimentos, pagamentos e saldos por caixa (data do lançamento no ledger). Títulos na posição atual.",
    source: "Venda, ItemVenda, AparelhoVenda, DevolucaoVenda, MovimentacaoFinanceira, CarteiraFinanceira, ContaReceberTitulo, ContaPagarTitulo e CaixaOperacao (só conferência), da loja autorizada.",
    limitations: [...built.limitations,
      "Filtros de origem, classificação, situação, registro e busca refinam somente o detalhamento. Os blocos consolidados são sempre o total da loja no período.",
      "No detalhamento, cada linha é um registro original. Venda, movimento, título e devolução não são somados entre si."],
    metrics: built.metrics, sections: built.sections, columns: GENERAL_COLUMNS,
    rows: cellRows(rows.map(r => ({ id: r.id, date: r.date, record: label(RECORD_LABEL, r.record), origin: label(ORIGIN_LABEL, r.origin),
      category: r.cats.length ? r.cats.map(catLabel).join(" · ") : "Não classificado", status: label(STATUS_LABEL, r.status),
      reference: r.reference, amount: r.amount, open: r.open, href: href(r) }))),
    total: count[0].total, trend: [],
    options: {
      records: Object.entries(RECORD_LABEL).map(([value, l]) => ({ value, label: l })),
      origins: Object.entries(ORIGIN_LABEL).map(([value, l]) => ({ value, label: l })),
      statuses: Object.entries(STATUS_LABEL).map(([value, l]) => ({ value, label: l })),
      categories: [...SALE_TYPES.map(t => ({ value: `tipo:${t}`, label: `Venda: ${SALE_TYPE_LABEL[t]}` })),
        ...Object.entries(LEDGER_LABEL).map(([k, l]) => ({ value: `classe:${k}`, label: `Ledger: ${l}` })),
        ...Object.entries(RECEIPT_SUB_LABEL).map(([k, l]) => ({ value: `sub:${k}`, label: `Recebimento: ${l}` })),
        ...expenseCats.map(c => ({ value: `despesa:${c}`, label: `Despesa: ${c}` }))],
    },
  }
}

/** Movimentos com a mesma classe única do relatório (alias `m`, como em finance.movementCtes). */
const movementRows = (storeId: string, refs: Prisma.Sql) => Prisma.sql`SELECT m.id, m."createdAt", m.origem, m.tipo, m.valor, m."referenciaId", ${ledgerClass} AS classe
  FROM (SELECT mm.*, lower(mm.origem) LIKE 'transfer%' AS transferencia FROM movimentacoes_financeiras mm WHERE mm."storeId"=${storeId} AND mm."referenciaId" IN (${refs})) m`
const originColumns: Column[] = [{ key: "record", label: "Registro" }, { key: "reference", label: "ID de origem" }, { key: "date", label: "Data", format: "date" },
  { key: "label", label: "Descrição gravada" }, { key: "type", label: "Classificação" }, { key: "quantity", label: "Quantidade", format: "number" },
  { key: "amount", label: "Valor", format: "money" }]
type OriginRaw = { record: string; reference: string; date: string | null; label: string | null; type: string | null; quantity: number | null; amount: number | null; link: string | null; kind: string | null }
const ORIGIN_LIMIT = 2000

/** Rastreio até o registro original. Identificador e loja; sem nomes, contatos, documentos ou payload bruto. */
export async function generalOriginReport(db: ReportDb, storeId: string, q: ReportQuery): Promise<Report> {
  const detail = (title: string, source: string, rows: Row[], limitations: string[]): Report => ({
    kind: "geral", title, basis: "Registro individual e seus vínculos na loja autorizada, em qualquer data.", source,
    limitations: ["Identificador consultado somente na loja ativa. Não há comparação temporal de um registro individual.",
      ...(rows.length >= ORIGIN_LIMIT ? [`Vínculos limitados a ${ORIGIN_LIMIT} linhas: este detalhe está INCOMPLETO.`] : []), ...limitations],
    metrics: [{ key: "records", label: "Registros vinculados", value: rows.length, format: "number" }], columns: originColumns, rows, total: rows.length, trend: [] })
  const finish = (rows: OriginRaw[]): Row[] => rows.map(r => ({
    id: `${r.record}:${r.reference}`, record: r.record, reference: r.reference, date: r.date, label: r.label,
    type: r.kind === "tipo" ? label(SALE_TYPE_LABEL, r.type) : r.kind === "classe" ? label(LEDGER_LABEL, r.type) : r.kind === "status" ? label(STATUS_LABEL, r.type) : r.type,
    quantity: r.quantity, amount: r.amount,
    href: r.record === "Movimento financeiro" && r.date ? flowHref(r.reference, { ...q, from: saoPauloDay(new Date(r.date)), to: saoPauloDay(new Date(r.date)) })
      : r.link ? geralHref(r.link, q) : null }))
  const movementSelect = Prisma.sql`SELECT 'Movimento financeiro', mv.id, ${utcText(Prisma.sql`mv."createdAt"`)}, mv.origem, mv.classe, NULL::float8,
    (CASE mv.tipo WHEN 'entrada' THEN mv.valor WHEN 'saida' THEN -mv.valor END)::float8, NULL::text, 'classe', 9 FROM mv`
  if (q.source.startsWith("venda:")) {
    const pedido = q.source.slice(6)
    const rows = await db.$queryRaw<OriginRaw[]>(Prisma.sql`WITH v AS (
        SELECT v.id, v."pedidoId", v.at, v.total, v."contaReceberTituloId" AS crt, ${norm(Prisma.sql`v.status`)} AS status,
          CASE WHEN jsonb_typeof(v.payload)='object' THEN v.payload END AS payload FROM vendas v WHERE v."storeId"=${storeId} AND v."pedidoId"=${pedido}
      ), st AS (SELECT t.id, t.valor, t.vencimento, ${norm(Prisma.sql`t.status`)} AS status FROM contas_receber_titulos t, v WHERE t."storeId"=${storeId}
          AND (t.id=v.crt OR t."localKey"='pdv-aprazo-'||v."pedidoId"
            OR (starts_with(coalesce(t."localKey",''),'pdv-aprazo-'||v."pedidoId"||'-') AND substr(t."localKey",length(v."pedidoId")+13) ~ '^[0-9]+$'))),
      dv AS (SELECT d.id, d."localId", d.at, d."valorTotal" FROM devolucoes_venda d WHERE d."storeId"=${storeId} AND d."vendaLocalId"=${pedido} AND EXISTS(SELECT 1 FROM v)),
      mv AS (${movementRows(storeId, Prisma.sql`SELECT "pedidoId" FROM v UNION ALL SELECT id FROM st UNION ALL SELECT id FROM dv`)}),
      o AS (
        SELECT 'Venda' AS record, v."pedidoId" AS reference, ${utcText(Prisma.sql`v.at`)} AS date, NULL::text AS label, v.status AS type, NULL::float8 AS quantity, v.total::float8 AS amount, NULL::text AS link, 'status'::text AS kind, 0 AS ord FROM v
        UNION ALL SELECT 'Linha da venda', i.id, NULL, i.nome, ${lineType(storeId, Prisma.sql`i."inventoryId"`, Prisma.sql`i."vendaId"`, Prisma.sql`(v.payload->>'origem')='os'`)},
          i.quantidade::float8, i."lineTotal"::float8, NULL, 'tipo', 1 FROM venda_itens i JOIN v ON v.id=i."vendaId"
        UNION ALL SELECT 'Título a receber', st.id, CASE WHEN st.vencimento ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}' THEN left(st.vencimento,10) END, NULL, st.status, NULL, st.valor::float8, 'titulo:receber:'||st.id, NULL, 2 FROM st
        UNION ALL SELECT 'Devolução', dv."localId", ${utcText(Prisma.sql`dv.at`)}, NULL, NULL, NULL, -dv."valorTotal"::float8, NULL, NULL, 3 FROM dv
        UNION ALL ${movementSelect})
      SELECT record, reference, date, label, type, quantity, amount, link, kind FROM o ORDER BY ord, date NULLS FIRST, reference LIMIT ${ORIGIN_LIMIT}`)
    return detail(rows.length ? `Venda ${pedido}` : "Venda não encontrada nesta loja", "Venda.pedidoId + ItemVenda + títulos pdv-aprazo / FK + DevolucaoVenda + MovimentacaoFinanceira.referenciaId.",
      finish(rows), ["Linhas com valores gravados na venda, sem rateio de desconto geral. Movimentos listados em qualquer data: a parcela paga aparece no mês em que foi recebida.",
        "Venda cancelada é exibida com seus estornos, para conferência. Nome do item é o texto gravado na linha; não há dados do cliente."])
  }
  if (q.source.startsWith("titulo:")) {
    const [, lado, id] = q.source.split(":")
    if ((lado !== "receber" && lado !== "pagar") || !id) return detail("Origem não encontrada", "Identificador inválido.", [], [])
    const rows = await db.$queryRaw<OriginRaw[]>(Prisma.sql`WITH ${titleCtes(storeId)}, t AS (SELECT * FROM outstanding WHERE lado=${lado} AND id=${id}),
      sv0 AS (SELECT sv."pedidoId" FROM t ${saleOfTitle(storeId, "t")} WHERE sv."pedidoId" IS NOT NULL),
      mv AS (${movementRows(storeId, Prisma.sql`SELECT id FROM t`)}),
      o AS (
        SELECT 'Título' AS record, t.id AS reference, t.dia AS date, NULL::text AS label, t.status AS type, NULL::float8 AS quantity, t.valor::float8 AS amount, NULL::text AS link, NULL::text AS kind, 0 AS ord FROM t
        UNION ALL SELECT 'Saldo em aberto comprovado', t.id, NULL, NULL, CASE WHEN t.aberto IS NULL THEN 'Indisponível' END, NULL, t.aberto::float8, NULL, NULL, 1 FROM t
        UNION ALL SELECT 'Evento do histórico', t.id||'#'||h.n::text, NULL, NULL,
          CASE WHEN lower(h.e->>'tipo') IN ('pagamento','liquidacao','estorno_pagamento','criacao','criado','cancelamento') THEN lower(h.e->>'tipo') ELSE 'Tipo sem classificação' END,
          NULL, ${numeric(Prisma.sql`h.e->>'valor'`)}::float8, NULL, NULL, 2
          FROM t CROSS JOIN LATERAL jsonb_array_elements(${emptyArray(Prisma.sql`t.payload->'historico'`)}) WITH ORDINALITY h(e,n)
        UNION ALL SELECT 'Venda de origem', sv0."pedidoId", NULL, NULL, NULL, NULL, NULL, 'venda:'||sv0."pedidoId", NULL, 3 FROM sv0
        UNION ALL ${movementSelect})
      SELECT record, reference, date, label, type, quantity, amount, link, kind FROM o ORDER BY ord, date NULLS FIRST, reference LIMIT ${ORIGIN_LIMIT}`)
    return detail(rows.length ? `Título a ${lado} ${id}` : "Título não encontrado nesta loja", "ContaReceberTitulo/ContaPagarTitulo.id + payload.historico (tipo e valor) + MovimentacaoFinanceira.referenciaId.",
      finish(rows), ["Histórico mostra apenas tipo e valor do evento. Observações, usuários, cliente e descrição livre não são retornados.",
        "Saldo em aberto pelo mesmo contrato do Fluxo de Caixa; quando o histórico não comprova os pagamentos, aparece Indisponível."])
  }
  return detail("Origem não encontrada", "Identificador sem origem compatível com este relatório.", [], [])
}
