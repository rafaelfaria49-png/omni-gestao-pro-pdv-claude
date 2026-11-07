-- A3 · preflight SÓ LEITURA (sessão com default_transaction_read_only=on). Roda em neondb e em omnigestao_prod.
-- Substitui o "06 antes": o 06 oficial chama pg_has_role(..., 'omni_owner', ...) e falha enquanto o papel não existe.
\pset footer off
\pset null '-'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo '## 0. identidade (antes de qualquer consulta)'
SELECT current_setting('neon.project_id', true) AS project_id, current_setting('neon.branch_id', true) AS branch_id,
       current_setting('neon.endpoint_id', true) AS endpoint_id, current_setting('neon.timeline_id', true) AS timeline_id,
       (SELECT system_identifier FROM pg_control_system()) AS system_identifier,
       current_database() AS db, current_user AS usuario, pg_is_in_recovery() AS recovery,
       current_setting('transaction_read_only') AS tx_ro, current_setting('server_version') AS pg, now()::timestamptz(0) AS agora;
SELECT coalesce(current_setting('neon.project_id', true) = 'dry-mouse-36002471'
            AND current_setting('neon.branch_id', true) = 'br-muddy-meadow-ac7ah2wl'
            AND current_setting('neon.endpoint_id', true) = 'ep-summer-tooth-acltc6wi'
            AND current_database() = :'alvo_db'
            AND current_user = 'neondb_owner'
            AND current_setting('transaction_read_only') = 'on', false) AS identidade_ok,
       current_database() = 'omnigestao_prod' AS is_prod \gset
\if :identidade_ok
\echo IDENTIDADE_OK
\else
\echo IDENTIDADE_DIVERGENTE — nenhuma consulta executada
ROLLBACK;
\q
\endif

\echo '## 1. databases do cluster'
SELECT datname, pg_get_userbyid(datdba) AS dono, coalesce(datacl::text, 'NULL') AS acl FROM pg_database ORDER BY 1;

\echo '## 2. papéis a criar (esperado: nenhum)'
SELECT count(*) AS omni_existentes, coalesce(string_agg(rolname, ','), '-') AS nomes
  FROM pg_roles WHERE rolname IN ('omni_owner', 'omni_migrator', 'omni_runtime_v2');
SELECT count(*) = 0 AS papeis_ausentes FROM pg_roles WHERE rolname IN ('omni_owner', 'omni_migrator', 'omni_runtime_v2') \gset
\if :papeis_ausentes
\echo PRE_PAPEIS_AUSENTES_OK
\else
\echo PRE_PAPEIS_JA_EXISTEM — PARAR
\endif
SELECT coalesce(string_agg(rolname, ',' ORDER BY rolname), '-') AS outros_omni FROM pg_roles WHERE rolname LIKE 'omni%';

\echo '## 3. papel antigo (executor do 01/02)'
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolinherit, rolcanlogin,
       pg_has_role('neondb_owner', 'neon_superuser', 'USAGE') AS em_neon_superuser,
       pg_has_role('neondb_owner', 'pg_write_all_data', 'USAGE') AS pg_write_all_data,
       current_setting('createrole_self_grant', true) AS createrole_self_grant
  FROM pg_roles WHERE rolname = 'neondb_owner';
SELECT 'papeis_login_nao_super=' || string_agg(rolname, ',' ORDER BY rolname) FROM pg_roles WHERE rolcanlogin AND NOT rolsuper;

\if :is_prod
\echo '## 4. database de produção: ACL, schema, RLS, objetos que o 02 cobre'
SELECT 'datacl=' || coalesce(datacl::text, 'NULL') || ' dono=' || pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database();
SELECT 'schema_public dono=' || pg_get_userbyid(nspowner) || ' acl=' || coalesce(nspacl::text, 'NULL') FROM pg_namespace WHERE nspname = 'public';
SELECT 'tabelas(r,p)=' || count(*) FILTER (WHERE c.relkind IN ('r', 'p'))
       || ' rls_ativo=' || count(*) FILTER (WHERE c.relkind IN ('r', 'p') AND c.relrowsecurity)
       || ' sequencias=' || count(*) FILTER (WHERE c.relkind = 'S')
       || ' views=' || count(*) FILTER (WHERE c.relkind IN ('v', 'm'))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public';

\echo '## 5. cinco colunas de estoque'
SELECT table_name || '.' || column_name AS coluna, data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND (table_name, column_name) IN (('estoque_produtos','stock'), ('produto_depositos','quantidade'),
       ('movimentacoes_estoque','quantidade'), ('movimentacoes_estoque','estoqueAntes'), ('movimentacoes_estoque','estoqueDepois'))
 ORDER BY 1;

\echo '## 6. histórico Prisma'
SELECT count(*) AS total, count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finalizadas,
       count(*) FILTER (WHERE migration_name = '20261025120000_estoque_quantidade_fracionada') AS kg,
       max(migration_name) AS ultima
  FROM _prisma_migrations;

\echo '## 7. linha de base (agregados; loja-2 em operação pode mover estes números)'
SELECT 'estoque_produtos n=' || count(*) || ' soma=' || coalesce(sum(stock), 0) FROM estoque_produtos;
SELECT 'produto_depositos n=' || count(*) || ' soma=' || coalesce(sum(quantidade), 0) FROM produto_depositos;
SELECT 'movimentacoes_estoque n=' || count(*) || ' max_created=' || coalesce(max("createdAt")::timestamptz(0)::text, '-') FROM movimentacoes_estoque;
SELECT 'caixas_abertas ' || coalesce(string_agg("storeId" || '=' || n, ' ' ORDER BY "storeId"), 'nenhuma')
  FROM (SELECT "storeId", count(*) AS n FROM sessoes_caixa WHERE status = 'ABERTA' GROUP BY 1) s;
\endif

\echo '## 8. sessões no database'
SELECT coalesce(usename, '-') AS papel, coalesce(nullif(application_name, ''), '-') AS app, coalesce(state, '-') AS estado, count(*)
  FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

ROLLBACK;
