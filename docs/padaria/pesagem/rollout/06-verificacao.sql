-- ESTOQUE-MANUAL-KG-001 · rollout B · 06 — conferência READ ONLY (antes e depois de cada passo).
-- Quem: omni_migrator no database de produção (ou o papel antigo ANTES do corte).
-- Uso: psql -X -At -v ON_ERROR_STOP=1 -v old_role=neondb_owner -d omnigestao_prod -f 06-verificacao.sql

BEGIN READ ONLY;
SELECT 'database=' || current_database() || ' dono=' || pg_get_userbyid(datdba) || ' acl=' || coalesce(datacl::text, 'NULL')
  FROM pg_database WHERE datname = current_database();
SELECT 'papel ' || rolname || ' connect=' || has_database_privilege(oid, current_database(), 'CONNECT')
       || ' escreve_estoque=' || has_table_privilege(oid, 'estoque_produtos', 'UPDATE')
       || ' pg_write_all_data=' || pg_has_role(oid, 'pg_write_all_data', 'USAGE')
       || ' dono_por_heranca=' || pg_has_role(oid, 'omni_owner', 'USAGE')
  FROM pg_roles WHERE rolcanlogin AND NOT rolsuper ORDER BY rolname;
SELECT 'sessoes papel=' || coalesce(usename, '-') || ' app=' || coalesce(nullif(application_name, ''), '-') || ' n=' || count(*)
  FROM pg_stat_activity WHERE datname = current_database() GROUP BY usename, application_name ORDER BY 1;
SELECT 'objetos do papel antigo=' || (
         (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND pg_get_userbyid(c.relowner) = :'old_role')
       + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'c') AND t.typrelid = 0 AND pg_get_userbyid(t.typowner) = :'old_role'));
SELECT 'colunas ' || string_agg(table_name || '.' || column_name || ':' || data_type, ' ' ORDER BY table_name, column_name)
  FROM information_schema.columns
 WHERE (table_name, column_name) IN (('estoque_produtos', 'stock'), ('produto_depositos', 'quantidade'),
       ('movimentacoes_estoque', 'quantidade'), ('movimentacoes_estoque', 'estoqueAntes'), ('movimentacoes_estoque', 'estoqueDepois'));
ROLLBACK;
