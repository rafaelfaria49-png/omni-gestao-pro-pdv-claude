-- A1.1 — conferência curta do fechamento do caixa antigo da loja-5. Só SELECT; sessão com
-- default_transaction_read_only=on (PGOPTIONS); identidade conferida antes; termina em ROLLBACK.
\pset footer off
\pset null '-'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo '## 0. identidade'
SELECT current_setting('neon.project_id', true) AS project_id, current_setting('neon.branch_id', true) AS branch_id,
       current_setting('neon.endpoint_id', true) AS endpoint_id, current_database() AS db,
       current_setting('transaction_read_only') AS tx_read_only, current_setting('default_transaction_read_only') AS default_ro,
       now()::timestamptz(0) AS agora;
SELECT coalesce(current_setting('neon.project_id', true) = 'dry-mouse-36002471'
            AND current_setting('neon.branch_id', true) = 'br-muddy-meadow-ac7ah2wl'
            AND current_setting('neon.endpoint_id', true) = 'ep-summer-tooth-acltc6wi'
            AND current_database() = 'omnigestao_prod'
            AND current_setting('transaction_read_only') = 'on'
            AND current_setting('default_transaction_read_only') = 'on', false) AS identidade_ok \gset
\if :identidade_ok
\echo IDENTIDADE_OK
\else
\echo IDENTIDADE_DIVERGENTE — nenhuma consulta executada
ROLLBACK;
\q
\endif

\echo '## 1. loja-5: sessão antiga (aberta em 2026-05-28 15:46:59Z no A1) — só status e datas'
SELECT status, "abertaEm"::timestamptz(0) AS aberta_em, "fechadaEm"::timestamptz(0) AS fechada_em
  FROM sessoes_caixa
 WHERE "storeId" = 'loja-5' AND "abertaEm" >= '2026-05-28 15:46:59+00' AND "abertaEm" < '2026-05-28 15:47:00+00';

\echo '## 2. loja-5: sessões por status'
SELECT status, count(*) AS n FROM sessoes_caixa WHERE "storeId" = 'loja-5' GROUP BY 1 ORDER BY 1;

\echo '## 3. caixas ABERTA por loja (loja-1, loja-2, loja-5 sempre listadas)'
SELECT st.id AS "storeId", st.name AS loja, count(s.id) AS abertas, min(s."abertaEm")::timestamptz(0) AS mais_antiga
  FROM stores st LEFT JOIN sessoes_caixa s ON s."storeId" = st.id AND s.status = 'ABERTA'
 GROUP BY 1, 2
HAVING count(s.id) > 0 OR st.id IN ('loja-1', 'loja-2', 'loja-5')
 ORDER BY 1;
SELECT count(*) FILTER (WHERE "storeId" NOT IN ('loja-1', 'loja-2', 'loja-5')) AS outras_abertas, count(*) AS total_abertas
  FROM sessoes_caixa WHERE status = 'ABERTA';

\echo '## 4. cadastro de lojas (id e nome; classificação vem do proprietário)'
SELECT id, name FROM stores ORDER BY id;

ROLLBACK;
\echo A1_1_ROLLBACK_OK
