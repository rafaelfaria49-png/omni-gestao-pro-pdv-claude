-- A1 do runbook KG — somente SELECT em catálogo, funções de leitura e agregados. Sessão já vem com
-- default_transaction_read_only=on (PGOPTIONS). Nenhuma função que aloque xid, sequência ou lock explícito.
\pset footer off
\pset null '-'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo '## 0. identidade (antes de qualquer diagnóstico)'
SELECT current_setting('neon.project_id', true) AS project_id, current_setting('neon.branch_id', true) AS branch_id,
       current_setting('neon.endpoint_id', true) AS endpoint_id, current_database() AS db, current_user AS usuario,
       current_setting('transaction_read_only') AS tx_read_only, current_setting('default_transaction_read_only') AS default_ro,
       current_setting('transaction_isolation') AS isolamento, current_setting('statement_timeout') AS stmt_timeout,
       current_setting('lock_timeout') AS lock_timeout, current_setting('server_version') AS pg, now()::timestamptz(0) AS agora;
SELECT coalesce(current_setting('neon.project_id', true) = 'dry-mouse-36002471'
            AND current_setting('neon.branch_id', true) = 'br-muddy-meadow-ac7ah2wl'
            AND current_database() = 'omnigestao_prod'
            AND current_setting('transaction_read_only') = 'on'
            AND current_setting('default_transaction_read_only') = 'on', false) AS identidade_ok \gset
\if :identidade_ok
\echo IDENTIDADE_OK
\else
\echo IDENTIDADE_DIVERGENTE — nenhuma consulta de diagnóstico executada
ROLLBACK;
\q
\endif

\echo '## 1. cinco colunas de estoque'
SELECT table_name || '.' || column_name AS coluna, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (table_name, column_name) IN (('estoque_produtos','stock'), ('produto_depositos','quantidade'),
       ('movimentacoes_estoque','quantidade'), ('movimentacoes_estoque','estoqueAntes'), ('movimentacoes_estoque','estoqueDepois'))
 ORDER BY 1;

\echo '## 2. histórico Prisma'
SELECT count(*) AS total,
       count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finalizadas,
       count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS revertidas,
       count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS incompletas,
       count(*) FILTER (WHERE migration_name = '20261025120000_estoque_quantidade_fracionada') AS kg,
       count(*) FILTER (WHERE migration_name = '0019_movimentacao_estoque_idempotency') AS m0019
  FROM _prisma_migrations;
SELECT string_agg(migration_name, ',' ORDER BY migration_name) AS nomes FROM _prisma_migrations
 WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SELECT migration_name, finished_at::timestamptz(0) AS finalizada, left(checksum, 12) AS checksum
  FROM _prisma_migrations ORDER BY started_at DESC LIMIT 3;

\echo '## 3. índice/constraint da 0019'
SELECT conname, contype, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE conrelid = 'movimentacoes_estoque'::regclass AND contype IN ('p','u') ORDER BY 1;
SELECT tablename, indexname, regexp_replace(indexdef, '^.* USING ', 'USING ') AS def
  FROM pg_indexes WHERE schemaname = 'public'
   AND tablename IN ('estoque_produtos','produto_depositos','movimentacoes_estoque') ORDER BY 1, 2;

\echo '## 4. dependências que o ALTER TYPE teria de tratar (views/regras, gatilhos)'
SELECT DISTINCT c.relname AS dependente FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid JOIN pg_class c ON c.oid = r.ev_class
 WHERE d.refobjid IN ('estoque_produtos'::regclass, 'produto_depositos'::regclass, 'movimentacoes_estoque'::regclass)
   AND c.oid NOT IN ('estoque_produtos'::regclass, 'produto_depositos'::regclass, 'movimentacoes_estoque'::regclass);
SELECT tgrelid::regclass AS tabela, tgname FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN ('estoque_produtos'::regclass, 'produto_depositos'::regclass, 'movimentacoes_estoque'::regclass);

\echo '## 5. tamanho e linha de base do lock'
SELECT c.relname, c.reltuples::bigint AS linhas_estimadas, pg_size_pretty(pg_relation_size(c.oid)) AS heap,
       pg_size_pretty(pg_indexes_size(c.oid)) AS indices, pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
       pg_total_relation_size(c.oid) AS bytes, pg_get_userbyid(c.relowner) AS dono
  FROM pg_class c
 WHERE c.oid IN ('estoque_produtos'::regclass, 'produto_depositos'::regclass, 'movimentacoes_estoque'::regclass,
                 'vendas'::regclass, 'sessoes_caixa'::regclass)
 ORDER BY bytes DESC;
SELECT relname, n_live_tup, n_tup_ins, n_tup_upd, n_tup_del, last_autovacuum::timestamptz(0), last_autoanalyze::timestamptz(0)
  FROM pg_stat_user_tables WHERE relname IN ('estoque_produtos','produto_depositos','movimentacoes_estoque') ORDER BY 1;
SELECT pg_size_pretty(pg_database_size(current_database())) AS banco;
SELECT count(*) AS produtos, sum(stock)::text AS soma_stock, min(stock) AS min, max(stock) AS max FROM estoque_produtos;
SELECT count(*) AS depositos, sum(quantidade)::text AS soma_quantidade FROM produto_depositos;
SELECT count(*) AS movimentacoes, sum(quantidade)::text AS soma_quantidade, sum("estoqueDepois")::text AS soma_depois
  FROM movimentacoes_estoque;

\echo '## 6. CONNECT, donos e papéis'
SELECT datname, pg_get_userbyid(datdba) AS dono, coalesce(datacl::text, 'NULL (PUBLIC com CONNECT)') AS acl
  FROM pg_database WHERE datname = current_database();
SELECT nspname, pg_get_userbyid(nspowner) AS dono_schema FROM pg_namespace WHERE nspname = 'public';
SELECT r.rolname, r.rolcanlogin AS login, r.rolsuper AS super, r.rolcreaterole AS createrole, r.rolbypassrls AS bypassrls,
       has_database_privilege(r.oid, current_database(), 'CONNECT') AS connect_prod,
       pg_has_role(r.oid, 'pg_write_all_data', 'USAGE') AS write_all,
       pg_has_role(r.oid, (SELECT oid FROM pg_roles WHERE rolname = 'neon_superuser'), 'MEMBER') AS neon_superuser
  FROM pg_roles r WHERE r.rolname !~ '^pg_' ORDER BY 1;
SELECT count(*) FILTER (WHERE rolname IN ('omni_owner','omni_migrator','omni_runtime_v2')) AS papeis_kg_existentes FROM pg_roles;

\echo '## 7. sessões e conexões (todas as databases do endpoint; sem texto de consulta)'
SELECT coalesce(datname, '-') AS db, coalesce(usename, '-') AS papel, coalesce(nullif(application_name, ''), '-') AS app,
       backend_type, coalesce(state, '-') AS estado, count(*) AS n,
       max(now() - backend_start)::interval(0) AS conexao_mais_velha, max(now() - xact_start)::interval(0) AS maior_xact
  FROM pg_stat_activity WHERE pid <> pg_backend_pid()
 GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, 2, 3, 4, 5;
SELECT l.relation::regclass AS tabela, l.mode, l.granted, count(*) AS n
  FROM pg_locks l
 WHERE l.relation IN ('estoque_produtos'::regclass, 'produto_depositos'::regclass, 'movimentacoes_estoque'::regclass)
   AND l.pid <> pg_backend_pid()
 GROUP BY 1, 2, 3 ORDER BY 1, 2;

\echo '## 8. caixas ABERTA por loja'
SELECT s."storeId", st.name AS loja, count(*) AS abertas, count(DISTINCT s."terminalId") AS terminais,
       min(s."abertaEm")::timestamptz(0) AS mais_antiga, max(s."abertaEm")::timestamptz(0) AS mais_recente
  FROM sessoes_caixa s JOIN stores st ON st.id = s."storeId"
 WHERE s.status = 'ABERTA' GROUP BY 1, 2 ORDER BY 1;
SELECT count(*) AS sessoes_total, count(*) FILTER (WHERE status = 'ABERTA') AS abertas_total FROM sessoes_caixa;

\echo '## 9. indicadores persistidos de atividade (sem conteúdo de venda)'
SELECT t."storeId", count(*) AS terminais, count(*) FILTER (WHERE t.status = 'ACTIVE') AS ativos,
       count(*) FILTER (WHERE t."lockedByDeviceId" IS NOT NULL) AS com_lock,
       count(*) FILTER (WHERE t."heartbeatAt" > now() - interval '15 minutes') AS heartbeat_15min,
       max(t."heartbeatAt")::timestamptz(0) AS ultimo_heartbeat
  FROM pdv_terminais t GROUP BY 1 ORDER BY 1;
SELECT m."storeId", count(*) FILTER (WHERE m."createdAt" > now() - interval '24 hours') AS movs_24h,
       max(m."createdAt")::timestamptz(0) AS ultima_mov
  FROM movimentacoes_estoque m GROUP BY 1 ORDER BY 1;
SELECT v."storeId", count(*) FILTER (WHERE v.at > now() - interval '24 hours') AS vendas_24h,
       max(v.at)::timestamptz(0) AS ultima_venda_relogio_pdv
  FROM vendas v GROUP BY 1 ORDER BY 1;

ROLLBACK;
\echo A1_ROLLBACK_OK
