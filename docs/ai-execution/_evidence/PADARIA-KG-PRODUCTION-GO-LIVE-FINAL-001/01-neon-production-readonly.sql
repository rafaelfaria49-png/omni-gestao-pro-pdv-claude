\set ON_ERROR_STOP on
\pset pager off
BEGIN READ ONLY;
SELECT current_database() db, current_user usr, current_setting('transaction_read_only') ro, current_setting('neon.project_id',true) proj, current_setting('neon.branch_id',true) branch, current_setting('neon.endpoint_id',true) ep, now();
SELECT 1/CASE WHEN current_setting('neon.project_id',true)='dry-mouse-36002471' AND current_setting('neon.endpoint_id',true)='ep-summer-tooth-acltc6wi' AND current_database()='omnigestao_prod' AND current_setting('transaction_read_only')='on' THEN 1 ELSE 0 END AS identidade_ok;
\echo == migrations
SELECT count(*) total, count(*) FILTER (WHERE finished_at IS NULL) nao_finalizadas, count(*) FILTER (WHERE rolled_back_at IS NOT NULL) rolled FROM _prisma_migrations;
SELECT migration_name, checksum, finished_at FROM _prisma_migrations ORDER BY migration_name;
\echo == colunas KG
SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name,column_name) IN (('estoque_produtos','stock'),('produto_depositos','quantidade'),('movimentacoes_estoque','quantidade'),('movimentacoes_estoque','estoqueAntes'),('movimentacoes_estoque','estoqueDepois'),('venda_itens','quantidade'),('itens_devolucao_venda','quantidade'))) ORDER BY 1,2;
\echo == objetos manual_kg
SELECT (SELECT count(*) FROM pg_proc WHERE proname LIKE 'manual_kg%') funcs, (SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'manual_kg%') trig, (SELECT count(*) FROM pg_constraint WHERE conname LIKE '%_kg_milesimos') checks07;
\echo == caixas abertos
SELECT "storeId", count(*), min("abertaEm") FROM sessoes_caixa WHERE status='ABERTA' GROUP BY 1;
\echo == lojas
SELECT id, name FROM stores ORDER BY id;
\echo == sessoes no db
SELECT usename, application_name, state, count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1,2,3 ORDER BY 1;
\echo == acl db e extensoes
SELECT datacl FROM pg_database WHERE datname=current_database();
SELECT extname FROM pg_extension ORDER BY 1;
\echo == donos tabelas estoque
SELECT relname, pg_get_userbyid(relowner) FROM pg_class WHERE relname IN ('estoque_produtos','produto_depositos','movimentacoes_estoque','venda_itens') ORDER BY 1;
ROLLBACK;
