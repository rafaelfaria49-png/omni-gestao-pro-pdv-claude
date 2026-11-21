-- A3 · verificação SÓ LEITURA depois do 01/02 (sessão com default_transaction_read_only=on). Roda em neondb e em
-- omnigestao_prod; o 06 oficial roda depois, à parte. Nenhum login com os papéis novos (isso é o A4).
\pset footer off
\pset null '-'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo '## 0. identidade (antes de qualquer consulta)'
SELECT current_setting('neon.project_id', true) AS project_id, current_setting('neon.branch_id', true) AS branch_id,
       current_setting('neon.endpoint_id', true) AS endpoint_id, (SELECT system_identifier FROM pg_control_system()) AS system_identifier,
       current_database() AS db, current_user AS usuario, current_setting('transaction_read_only') AS tx_ro, now()::timestamptz(0) AS agora;
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

\echo '## 1. atributos dos papéis novos'
SELECT rolname, rolcanlogin AS login, rolsuper AS super, rolbypassrls AS bypassrls, rolcreaterole AS createrole,
       rolcreatedb AS createdb, rolreplication AS replication, rolinherit AS inherit, rolconnlimit AS connlimit,
       coalesce(rolvaliduntil::text, '-') AS valid_until
  FROM pg_roles WHERE rolname IN ('omni_owner', 'omni_migrator', 'omni_runtime_v2') ORDER BY 1;

\echo '## 2. memberships que envolvem os papéis novos'
SELECT pg_get_userbyid(m.member) AS membro, pg_get_userbyid(m.roleid) AS papel, m.admin_option, m.inherit_option, m.set_option,
       pg_get_userbyid(m.grantor) AS grantor
  FROM pg_auth_members m
 WHERE pg_get_userbyid(m.member) LIKE 'omni%' OR pg_get_userbyid(m.roleid) LIKE 'omni%' ORDER BY 1, 2;

\echo '## 3. isolamento: alcance (USAGE ou SET) de cada papel novo a papéis privilegiados'
SELECT novo.nome AS papel_novo,
       coalesce(string_agg(alvo.rolname, ',' ORDER BY alvo.rolname)
         FILTER (WHERE pg_has_role(novo.nome, alvo.oid, 'USAGE') OR pg_has_role(novo.nome, alvo.oid, 'SET')), '-') AS alcanca_privilegiado
  FROM (VALUES ('omni_owner'), ('omni_migrator'), ('omni_runtime_v2')) novo(nome)
  CROSS JOIN pg_roles alvo
 WHERE (alvo.rolname IN ('pg_write_all_data', 'pg_read_all_data', 'pg_signal_backend', 'pg_maintain', 'pg_create_subscription',
                         'pg_execute_server_program', 'pg_write_server_files', 'pg_read_server_files', 'neon_superuser', 'neondb_owner')
        OR alvo.rolsuper OR alvo.rolbypassrls OR alvo.rolcreaterole)
   AND alvo.rolname <> novo.nome
 GROUP BY 1 ORDER BY 1;
SELECT pg_has_role('omni_runtime_v2', 'omni_owner', 'USAGE') AS runtime_herda_owner,
       pg_has_role('omni_runtime_v2', 'omni_owner', 'SET') AS runtime_set_owner,
       pg_has_role('omni_runtime_v2', 'omni_migrator', 'USAGE') AS runtime_herda_migrator,
       pg_has_role('omni_migrator', 'omni_owner', 'USAGE') AS migrator_herda_owner,
       pg_has_role('omni_runtime_v2', 'neon_superuser', 'USAGE') AS runtime_neon_superuser,
       pg_has_role('omni_runtime_v2', 'pg_write_all_data', 'USAGE') AS runtime_pg_write_all_data,
       pg_has_role('omni_migrator', 'neon_superuser', 'USAGE') AS migrator_neon_superuser,
       pg_has_role('omni_migrator', 'pg_write_all_data', 'USAGE') AS migrator_pg_write_all_data;

\if :is_prod
\echo '## 4. CONNECT no database de produção'
SELECT 'datacl=' || coalesce(datacl::text, 'NULL') || ' dono=' || pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database();
SELECT r.rolname, has_database_privilege(r.oid, current_database(), 'CONNECT') AS connect,
       has_database_privilege(r.oid, current_database(), 'CREATE') AS create_db, has_database_privilege(r.oid, current_database(), 'TEMP') AS temp
  FROM pg_roles r WHERE r.rolname IN ('neondb_owner', 'omni_runtime_v2', 'omni_migrator', 'omni_owner') ORDER BY 1;

\echo '## 5. cobertura dos GRANTs do runtime'
SELECT 'schema_public usage=' || has_schema_privilege('omni_runtime_v2', 'public', 'USAGE')
       || ' create=' || has_schema_privilege('omni_runtime_v2', 'public', 'CREATE');
SELECT 'tabelas=' || count(*)
       || ' sem_dml_completo=' || count(*) FILTER (WHERE NOT (has_table_privilege('omni_runtime_v2', c.oid, 'SELECT') AND has_table_privilege('omni_runtime_v2', c.oid, 'INSERT')
                                                       AND has_table_privilege('omni_runtime_v2', c.oid, 'UPDATE') AND has_table_privilege('omni_runtime_v2', c.oid, 'DELETE')))
       || ' com_truncate=' || count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'TRUNCATE'))
       || ' com_references=' || count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'REFERENCES'))
       || ' com_trigger=' || count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'TRIGGER'))
       || ' rls_ativo=' || count(*) FILTER (WHERE c.relrowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
SELECT 'sequencias=' || count(*)
       || ' sem_usage_select_update=' || count(*) FILTER (WHERE NOT (has_sequence_privilege('omni_runtime_v2', c.oid, 'USAGE')
                                                          AND has_sequence_privilege('omni_runtime_v2', c.oid, 'SELECT') AND has_sequence_privilege('omni_runtime_v2', c.oid, 'UPDATE')))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S';
SELECT 'migrator escreve_estoque=' || has_table_privilege('omni_migrator', 'estoque_produtos', 'UPDATE')
       || ' owner escreve_estoque=' || has_table_privilege('omni_owner', 'estoque_produtos', 'UPDATE')
       || ' objetos_de_omni_owner=' || (SELECT count(*) FROM pg_class WHERE relowner = 'omni_owner'::regrole)
       || ' objetos_de_neondb_owner_public=' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relowner = 'neondb_owner'::regrole);

\echo '## 6. papel antigo segue operacional'
SELECT 'neondb_owner connect=' || has_database_privilege('neondb_owner', current_database(), 'CONNECT')
       || ' escreve_estoque=' || has_table_privilege('neondb_owner', 'estoque_produtos', 'UPDATE')
       || ' login=' || (SELECT rolcanlogin FROM pg_roles WHERE rolname = 'neondb_owner');

\echo '## 7. cinco colunas de estoque'
SELECT table_name || '.' || column_name AS coluna, data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND (table_name, column_name) IN (('estoque_produtos','stock'), ('produto_depositos','quantidade'),
       ('movimentacoes_estoque','quantidade'), ('movimentacoes_estoque','estoqueAntes'), ('movimentacoes_estoque','estoqueDepois'))
 ORDER BY 1;

\echo '## 8. histórico Prisma'
SELECT count(*) AS total, count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finalizadas,
       count(*) FILTER (WHERE migration_name = '20261025120000_estoque_quantidade_fracionada') AS kg,
       max(migration_name) AS ultima
  FROM _prisma_migrations;

\echo '## 9. agregados (loja-2 em operação pode mover estes números)'
SELECT 'estoque_produtos n=' || count(*) || ' soma=' || coalesce(sum(stock), 0) FROM estoque_produtos;
SELECT 'produto_depositos n=' || count(*) || ' soma=' || coalesce(sum(quantidade), 0) FROM produto_depositos;
SELECT 'movimentacoes_estoque n=' || count(*) || ' max_created=' || coalesce(max("createdAt")::timestamptz(0)::text, '-') FROM movimentacoes_estoque;
SELECT 'caixas_abertas ' || coalesce(string_agg("storeId" || '=' || n, ' ' ORDER BY "storeId"), 'nenhuma')
  FROM (SELECT "storeId", count(*) AS n FROM sessoes_caixa WHERE status = 'ABERTA' GROUP BY 1) s;
\endif

\echo '## 10. sessões no database'
SELECT coalesce(usename, '-') AS papel, coalesce(nullif(application_name, ''), '-') AS app, coalesce(state, '-') AS estado, count(*)
  FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

ROLLBACK;
