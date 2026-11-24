-- OMNI-SAAS-001A — checagens SOMENTE LEITURA para a migration 20261124120000_saas_fundacao_comercial.
-- Rodar ANTES e DEPOIS da aplicação, com a sessão forçada em leitura:
--   PGOPTIONS="-c default_transaction_read_only=on" psql -X -v ON_ERROR_STOP=1 -f scripts/saas/production-migration-checks.sql
-- Credenciais só por variáveis libpq do processo (PGHOST/PGUSER/PGPASSWORD/PGDATABASE), nunca na linha de comando.
-- Não imprime dados de clientes: só contagens, nomes de objetos e hashes.

\echo '== 0. sessão e banco (deve ser o banco de Production e a sessão somente leitura)'
SELECT current_database() AS banco, current_user AS papel, current_setting('transaction_read_only') AS somente_leitura,
       inet_server_port() AS porta, version() AS servidor;

\echo '== 1. histórico de migrations'
SELECT count(*) AS total,
       count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) AS falhas_ou_rollback
FROM _prisma_migrations;
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 8;
SELECT count(*) AS saas_registrada FROM _prisma_migrations WHERE migration_name = '20261124120000_saas_fundacao_comercial';

\echo '== 2. objetos do SaaS (ANTES: tudo AUSENTE / 0; DEPOIS: presentes)'
SELECT t AS tabela, coalesce(to_regclass('public.' || t)::text, 'AUSENTE') AS estado
FROM unnest(ARRAY['organizations','organization_members','subscriptions','subscription_history',
                  'trial_grants','notification_outbox','platform_audit_logs']) AS t;
SELECT count(*) AS coluna_stores_organizationId
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'organizationId';
SELECT count(*) AS funcao_somente_insercao FROM pg_proc WHERE proname = 'saas_registro_somente_insercao';

\echo '== 3. retrato do legado (os hashes devem ser IGUAIS antes e depois; a coluna nova é ignorada)'
SELECT 'stores' AS tabela, count(*) AS linhas, md5(coalesce(string_agg((to_jsonb(t) - 'organizationId')::text, '|' ORDER BY t.id), '')) AS hash FROM stores t
UNION ALL SELECT 'admin_users', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id), '')) FROM admin_users t
UNION ALL SELECT 'admin_user_stores', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id), '')) FROM admin_user_stores t
UNION ALL SELECT 'admin_sessions', count(*), NULL FROM admin_sessions;

\echo '== 4. concorrência no momento (antes de aplicar: nenhuma transação longa segurando stores)'
SELECT count(*) AS transacoes_abertas_mais_de_30s
FROM pg_stat_activity WHERE datname = current_database() AND xact_start < now() - interval '30 seconds' AND pid <> pg_backend_pid();
SELECT count(*) AS locks_em_stores FROM pg_locks l JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'stores' AND l.pid <> pg_backend_pid();

\echo '== 5. pós-migration (só faz sentido DEPOIS; antes estas consultas falham por tabela ausente — esperado)'
SELECT count(*) AS lojas_com_organizacao FROM stores WHERE "organizationId" IS NOT NULL;
SELECT (SELECT count(*) FROM organizations) AS organizations, (SELECT count(*) FROM organization_members) AS members,
       (SELECT count(*) FROM subscriptions) AS subscriptions, (SELECT count(*) FROM subscription_history) AS history,
       (SELECT count(*) FROM trial_grants) AS trial_grants, (SELECT count(*) FROM notification_outbox) AS outbox,
       (SELECT count(*) FROM platform_audit_logs) AS audit;
SELECT count(*) AS checks FROM pg_constraint WHERE contype = 'c' AND conrelid::regclass::text = ANY (ARRAY['organizations','organization_members','subscriptions','subscription_history','trial_grants','notification_outbox','platform_audit_logs']);
SELECT count(*) AS gatilhos FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('subscription_history', 'platform_audit_logs');
