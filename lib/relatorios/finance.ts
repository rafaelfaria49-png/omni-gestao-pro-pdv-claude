import "server-only"
import { Prisma } from "@/generated/prisma"
import { bucket, emptyArray, like, numeric, paginate, utcText, type ReportDb } from "./sql"
import { money, type Report, type ReportQuery } from "./contracts"
import { dreClass,originHref } from "./origins"

function movements(storeId: string, q: ReportQuery) {
  return Prisma.sql`WITH m AS (
    SELECT m.id, m.tipo, m.origem, m.valor::numeric AS valor, m."createdAt", m."carteiraId", m."referenciaId",
      coalesce(c.nome,'Sem carteira') AS carteira, coalesce(nullif(p.payload->>'categoria',''),'Sem categoria') AS categoria,
      lower(m.origem) LIKE 'transfer%' AS transferencia
    FROM movimentacoes_financeiras m
    LEFT JOIN carteiras_financeiras c ON c.id=m."carteiraId" AND c."storeId"=${storeId}
    LEFT JOIN contas_pagar_titulos p ON p.id=m."referenciaId" AND p."storeId"=${storeId}
    WHERE m."storeId"=${storeId} AND m."createdAt"<${q.end}
      AND (${q.wallet}='' OR m."carteiraId"=${q.wallet})
      AND (${q.category}='' OR coalesce(nullif(p.payload->>'categoria',''),'Sem categoria')=${q.category})
  )`
}

/** Outstanding is principal minus the SAME payment/reversal event contract used by the services. */
function titles(storeId: string) {
  const eventValue = numeric(Prisma.sql`h->>'valor'`)
  return Prisma.sql`WITH titles AS (
      SELECT id, valor::numeric, vencimento, regexp_replace(lower(trim(status)),'[[:space:]]+','_','g') AS status, payload, 'receber'::text AS lado FROM contas_receber_titulos WHERE "storeId"=${storeId}
      UNION ALL SELECT id, valor::numeric, vencimento, regexp_replace(lower(trim(status)),'[[:space:]]+','_','g'), payload, 'pagar'::text FROM contas_pagar_titulos WHERE "storeId"=${storeId}
    ), payments AS (
      SELECT t.*, coalesce(h.pago,0) AS pago, coalesce(h.eventos,0) AS eventos, coalesce(h.invalidos,0) AS invalidos
      FROM titles t LEFT JOIN LATERAL (
        SELECT sum(CASE WHEN lower(h->>'tipo') IN ('pagamento','liquidacao') THEN ${eventValue}
          WHEN lower(h->>'tipo')='estorno_pagamento' THEN -${eventValue} ELSE 0 END) AS pago,
          count(*) FILTER(WHERE lower(h->>'tipo') IN ('pagamento','liquidacao','estorno_pagamento')) AS eventos,
          count(*) FILTER(WHERE lower(h->>'tipo') IN ('pagamento','liquidacao','estorno_pagamento') AND ${eventValue} IS NULL) AS invalidos
        FROM jsonb_array_elements(${emptyArray(Prisma.sql`t.payload->'historico'`)}) h
      ) h ON true
    ), outstanding AS (
      SELECT *, CASE WHEN status IN ('pago','paga','quitado','liquidado','cancelado','cancelada','estornado','estornada') THEN 0
        WHEN status NOT IN ('pendente','em_aberto','aberto','parcial','parcialmente_pago','vencido','atrasado','vencida') OR invalidos>0 OR (status IN ('parcial','parcialmente_pago') AND eventos=0) THEN NULL
        ELSE greatest(0,valor-pago) END AS aberto,
        CASE WHEN vencimento ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])($|T)' THEN
          CASE WHEN substring(vencimento,9,2)::int <= extract(day from make_date(substring(vencimento,1,4)::int,substring(vencimento,6,2)::int,1)+interval '1 month - 1 day')
            THEN left(vencimento,10) END END AS dia
      FROM payments
    )`
}

export async function cashFlowReport(db: ReportDb, storeId: string, q: ReportQuery): Promise<Report> {
  const cte = movements(storeId, q)
  const [totals, rows, daily, pending, wallets, categories] = await Promise.all([
    db.$queryRaw<{ entradas: number; saidas: number; anterior: number; transferencias: number; tesouraria: number; total: number }[]>(Prisma.sql`${cte}
      SELECT coalesce(sum(valor) FILTER(WHERE tipo='entrada' AND "createdAt">=${q.start} AND (NOT transferencia OR ${!!q.wallet})),0)::float8 AS entradas,
        coalesce(sum(valor) FILTER(WHERE tipo='saida' AND "createdAt">=${q.start} AND (NOT transferencia OR ${!!q.wallet})),0)::float8 AS saidas,
        coalesce(sum(CASE tipo WHEN 'entrada' THEN valor WHEN 'saida' THEN -valor ELSE 0 END) FILTER(WHERE "createdAt"<${q.start} AND (NOT transferencia OR ${!!q.wallet})),0)::float8 AS anterior,
        coalesce(sum(valor) FILTER(WHERE transferencia AND "createdAt">=${q.start}),0)::float8 AS transferencias,
        coalesce(sum(CASE tipo WHEN 'entrada' THEN valor ELSE -valor END) FILTER(WHERE origem IN ('sangria_pdv','suprimento_pdv') AND "createdAt">=${q.start}),0)::float8 AS tesouraria,
        count(*) FILTER(WHERE "createdAt">=${q.start} AND (carteira ILIKE ${like(q.search)} OR categoria ILIKE ${like(q.search)} OR origem ILIKE ${like(q.search)}))::int AS total FROM m`),
    db.$queryRaw<Record<string, string | number | null>[]>(Prisma.sql`${cte}
      SELECT id, ${utcText(Prisma.sql`"createdAt"`)} AS date, origem AS origin, carteira AS wallet, categoria AS category,
        CASE WHEN tipo='entrada' THEN valor ELSE 0 END::float8 AS incoming,
        CASE WHEN tipo='saida' THEN valor ELSE 0 END::float8 AS outgoing,
        CASE WHEN transferencia THEN 'Transferência interna' WHEN origem IN ('sangria_pdv','suprimento_pdv') THEN 'Tesouraria' ELSE 'Realizado no ledger' END AS class
      FROM m WHERE "createdAt">=${q.start} AND (carteira ILIKE ${like(q.search)} OR categoria ILIKE ${like(q.search)} OR origem ILIKE ${like(q.search)})
      ORDER BY "createdAt" DESC,id ${paginate(q)}`),
    db.$queryRaw<{ label: string; value: number; secondary: number }[]>(Prisma.sql`${cte}
      SELECT ${bucket(Prisma.sql`"createdAt"`, q)} AS label,
        coalesce(sum(valor) FILTER(WHERE tipo='entrada'),0)::float8 AS value, coalesce(sum(valor) FILTER(WHERE tipo='saida'),0)::float8 AS secondary
      FROM m WHERE "createdAt">=${q.start} AND (NOT transferencia OR ${!!q.wallet}) GROUP BY 1 ORDER BY 1`),
    db.$queryRaw<{ receber: number; pagar: number; vencidosReceber: number; vencidosPagar: number; indeterminados: number }[]>(Prisma.sql`${titles(storeId)}
      SELECT coalesce(sum(aberto) FILTER(WHERE lado='receber' AND dia>=${q.from} AND dia<=${q.to}),0)::float8 AS receber,
        coalesce(sum(aberto) FILTER(WHERE lado='pagar' AND dia>=${q.from} AND dia<=${q.to}),0)::float8 AS pagar,
        coalesce(sum(aberto) FILTER(WHERE lado='receber' AND dia<${q.from}),0)::float8 AS "vencidosReceber",
        coalesce(sum(aberto) FILTER(WHERE lado='pagar' AND dia<${q.from}),0)::float8 AS "vencidosPagar",
        count(*) FILTER(WHERE aberto IS NULL OR (aberto>0 AND dia IS NULL))::int AS indeterminados FROM outstanding`),
    db.$queryRaw<{ value: string; label: string; inicial: number; opening: boolean }[]>(Prisma.sql`SELECT id AS value,nome AS label,"saldoInicial"::float8 AS inicial,"createdAt"<${q.start} AS opening FROM carteiras_financeiras WHERE "storeId"=${storeId} AND "createdAt"<${q.end} ORDER BY nome`),
    db.$queryRaw<{ value: string; label: string }[]>(Prisma.sql`${cte} SELECT DISTINCT categoria AS value,categoria AS label FROM m WHERE "createdAt">=${q.start} ORDER BY 1 LIMIT 500`),
  ])
  const t = totals[0], p = pending[0]
  const selectedWallets = wallets.filter(w => !q.wallet || w.value === q.wallet)
  const initial = money(t.anterior + selectedWallets.filter(w => w.opening).reduce((sum,w) => sum + w.inicial,0))
  const openedInPeriod = money(selectedWallets.filter(w => !w.opening).reduce((sum,w) => sum + w.inicial,0))
  const final = money(initial + openedInPeriod + t.entradas - t.saidas)
  return {
    kind: "fluxo-caixa", title: "Fluxo de caixa", basis: "Realizado: data do lançamento. Previsto: vencimento dos títulos na posição atual.", source: "MovimentacaoFinanceira, CarteiraFinanceira e histórico de ContaReceberTitulo/ContaPagarTitulo.",
    limitations: ["Saldo do ledger disponível, incluindo saldos iniciais das carteiras cadastradas antes do período. Não comprova saldo bancário conciliado nem cobertura de todo o histórico.",
      "Venda não recebida não entra no realizado. Não há soma de Venda, sessão de caixa ou histórico de baixas ao ledger; cada movimento financeiro é contado uma vez.",
      "Transferências são neutras no consolidado; na carteira selecionada, suas pernas afetam o saldo. Sangria e suprimento são tesouraria, sem receita operacional. Saldos iniciais de carteiras criadas durante o período são ajustes de cobertura separados, não recebimentos.",
      "Previsões são a posição atual dos títulos, sem reconstrução histórica, e independem do filtro de carteira/categoria: o schema não garante essa atribuição. Comparativos de previsões são indisponíveis.",
      `Títulos sem saldo/vencimento confiável excluídos das previsões: ${p.indeterminados}. Formas de pagamento consolidadas indisponíveis: o ledger não preserva esse atributo em todos os lançamentos.`],
    metrics: [{ key: "initial", label: "Saldo inicial do ledger", value: q.category?null:initial, format: "money", reason: "Não há saldo inicial atribuível a categoria." }, { key: "incoming", label: "Entradas realizadas", value: money(t.entradas), format: "money" },
      { key: "outgoing", label: "Saídas realizadas", value: money(t.saidas), format: "money" }, { key: "openingAdjustments", label: "Saldo inicial de carteiras criadas no período", value: q.category?null:openedInPeriod, format: "money", reason: "Não atribuível a categoria." },
      { key: "final", label: "Saldo final do ledger", value: q.category?null:final, format: "money", reason: "Não há saldo final atribuível a categoria." },
      { key: "forecastIncoming", label: "A receber — vencimento no período", value: money(p.receber), format: "money" }, { key: "forecastOutgoing", label: "A pagar — vencimento no período", value: money(p.pagar), format: "money" },
      { key: "overdueIncoming", label: "A receber — vencido antes do início", value: money(p.vencidosReceber), format: "money" }, { key: "overdueOutgoing", label: "A pagar — vencido antes do início", value: money(p.vencidosPagar), format: "money" },
      { key: "projection", label: "Projeção indicativa (sem vencidos)", value: q.wallet || q.category || p.indeterminados ? null : money(final + p.receber - p.pagar), format: "money", reason: "Projeção indisponível com filtro de carteira/categoria ou títulos sem cobertura." }],
    columns: [{ key: "date", label: "Lançamento", format: "date" }, { key: "origin", label: "Origem" }, { key: "wallet", label: "Carteira" }, { key: "category", label: "Categoria" }, { key: "class", label: "Natureza" }, { key: "incoming", label: "Entrada", format: "money" }, { key: "outgoing", label: "Saída", format: "money" }],
    rows: rows.map(r => ({ ...r, href: originHref("fluxo-caixa",String(r.id),q) })), total: t.total, trend: daily, options: { wallets, categories },
  }
}

export async function dreReport(db: ReportDb, storeId: string, q: ReportQuery): Promise<Report> {
  const cte = movements(storeId, q)
  const [rows] = await Promise.all([db.$queryRaw<{ name: string; value: number; total: number }[]>(Prisma.sql`${cte}, classified AS (
      SELECT ${dreClass} AS name,
        CASE tipo WHEN 'entrada' THEN valor WHEN 'saida' THEN -valor ELSE 0 END AS value
      FROM m WHERE "createdAt">=${q.start} AND NOT transferencia AND origem NOT IN ('sangria_pdv','suprimento_pdv')
    ), grouped AS (SELECT name,sum(value)::float8 AS value FROM classified GROUP BY name)
    SELECT *,count(*) OVER()::int AS total FROM grouped WHERE name ILIKE ${like(q.search)} ORDER BY name ${paginate(q)}`)])
  // A separate aggregate ignores table pagination/search so summary is always complete.
  const [t] = await db.$queryRaw<{ recebimentos: number; reversoes: number; pagamentos: number; naoClassificado: number }[]>(Prisma.sql`${cte}
    SELECT coalesce(sum(valor) FILTER(WHERE tipo='entrada' AND lower(origem) ~ '^(receber|pdv$|venda$|os$|marketplace$)' AND "createdAt">=${q.start}),0)::float8 AS recebimentos,
      coalesce(sum(CASE tipo WHEN 'saida' THEN valor ELSE -valor END) FILTER(WHERE lower(origem) ~ '^(estorno_receber|devolucao_|devolução_)' AND "createdAt">=${q.start}),0)::float8 AS reversoes,
      coalesce(sum(CASE tipo WHEN 'saida' THEN valor ELSE -valor END) FILTER(WHERE lower(origem) ~ '^(pagar|estorno_pagar)' AND "createdAt">=${q.start}),0)::float8 AS pagamentos,
      count(*) FILTER(WHERE "createdAt">=${q.start} AND NOT transferencia AND lower(origem) !~ '^(receber|pdv$|venda$|os$|marketplace$|pagar|estorno_pagar|estorno_receber|devolucao_|devolução_|sangria_pdv$|suprimento_pdv$)')::int AS "naoClassificado" FROM m`)
  return {
    kind: "dre", title: "DRE gerencial parcial", basis: "Regime de caixa. Demonstrativo parcial de recebimentos e pagamentos, sem DRE contábil oficial.",
    source: "MovimentacaoFinanceira e categorias de títulos a pagar vinculados por ID e loja.",
    limitations: ["Recebimentos não equivalem à receita por competência. Receita bruta e deduções por competência permanecem indisponíveis.",
      "Pagamentos de estoque não são CMV do período. Sem custo histórico completo, lucro bruto, resultado operacional/líquido e margens são indisponíveis.",
      "Impostos, depreciação, EBITDA e demais componentes não são estimados. Transferências e sangria/suprimento ficam fora do resultado.",
      `Lançamentos sem classificação comprovada: ${t.naoClassificado}. A categoria do título é atual e pode ter sido alterada após o pagamento.`],
    metrics: [{ key: "grossAccrual", label: "Receita bruta por competência", value: null, reason: "Cobertura de competência insuficiente." },
      { key: "receipts", label: "Recebimentos brutos — caixa", value: money(t.recebimentos), format: "money" }, { key: "deductions", label: "Reversões comprovadas — caixa", value: money(t.reversoes), format: "money" },
      { key: "netReceipts", label: "Recebimentos líquidos — caixa", value: money(t.recebimentos-t.reversoes), format: "money" }, { key: "payments", label: "Pagamentos líquidos (inclui compras)", value: money(t.pagamentos), format: "money" },
      ...["CMV / custo de serviços", "Lucro bruto", "Despesas operacionais por competência", "Resultado operacional", "Resultado líquido"].map((label,i) => ({ key: `unavailable${i}`, label, value: null, reason: "Sem cobertura histórica/classificação integral comprovada." }))],
    columns: [{ key: "name", label: "Classificação de caixa" }, { key: "value", label: "Valor com sinal", format: "money" }], rows:rows.map(r=>({...r,href:originHref("dre",r.name,q)})), total: rows[0]?.total ?? 0, trend: [],
  }
}
