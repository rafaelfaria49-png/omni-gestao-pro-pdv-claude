-- Uso exclusivo com psql -X --single-transaction. O diretório atual deve conter
-- apenas a migration.sql P03 aprovada e validada pelos dois checksums.
\set ON_ERROR_STOP on
\if :P03_RELEASE_APPROVED
\else
DO $$ BEGIN RAISE EXCEPTION 'Autorização da migration P03 ausente'; END $$;
\endif
\if :P03_GRANTS_APPROVED
\else
DO $$ BEGIN RAISE EXCEPTION 'Autorização dos grants P03 ausente'; END $$;
\endif

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
SET LOCAL transaction_timeout = '120s';
SET LOCAL search_path = public, pg_catalog;

SELECT set_config('omni.p03_db', :'P03_EXPECTED_DB', true) AS expected_db,
       set_config('omni.p03_role', :'P03_EXPECTED_ROLE', true) AS expected_role,
       set_config('omni.p03_history', :'P03_EXPECTED_HISTORY_MD5', true) AS expected_history
\gset

DO $$
BEGIN
  IF current_database() <> current_setting('omni.p03_db')
     OR session_user <> current_setting('omni.p03_role')
     OR current_user <> session_user
     OR current_schema() <> 'public'
     OR pg_is_in_recovery()
     OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'Identidade, versão ou modo de conexão diverge do alvo P03';
  END IF;
END $$;

LOCK TABLE public._prisma_migrations IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  history_md5 text;
BEGIN
  SELECT md5(coalesce(string_agg(
    concat_ws(':', migration_name, checksum, finished_at IS NOT NULL, rolled_back_at IS NOT NULL),
    E'\n' ORDER BY migration_name COLLATE "C", id COLLATE "C"
  ), '')) INTO history_md5
  FROM public._prisma_migrations;

  IF history_md5 IS DISTINCT FROM current_setting('omni.p03_history')
     OR EXISTS (SELECT FROM public._prisma_migrations
                WHERE migration_name = '20261116090000_identificadores_etiquetas_p03')
     OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'omni_runtime_v2')
     OR to_regprocedure('public.vestuario_ident_lock(text)') IS NULL
     OR to_regprocedure('public.vestuario_ident_lock_shared(text)') IS NULL
     OR NOT EXISTS (
       SELECT FROM pg_index
       WHERE indexrelid = to_regclass('public."estoque_produtos_id_storeId_key"')
         AND indisvalid AND indisunique
     )
     OR to_regclass('public."vestuario_variantes_id_storeId_produtoId_key"') IS NOT NULL
     OR to_regclass('public.p03_produto_chaves_gin') IS NOT NULL
     OR to_regclass('public.p03_variante_chaves_gin') IS NOT NULL
     OR EXISTS (
       SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname IN (
         'identificadores_produto', 'identificador_chaves', 'etiqueta_lotes',
         'etiqueta_tentativas', 'identificacao_solicitacoes'
       )
     )
     OR EXISTS (
       SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname ~ '^p03_'
     ) THEN
    RAISE EXCEPTION 'Histórico ou dependências divergentes. Interrompa para reconciliar.';
  END IF;
END $$;

\i migration.sql

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.identificadores_produto,
  public.identificador_chaves,
  public.etiqueta_lotes,
  public.etiqueta_tentativas,
  public.identificacao_solicitacoes
TO omni_runtime_v2;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM unnest(ARRAY[
      'identificadores_produto', 'identificador_chaves', 'etiqueta_lotes',
      'etiqueta_tentativas', 'identificacao_solicitacoes'
    ]) AS tbl(name)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege(name)
    WHERE NOT has_table_privilege(current_user, 'public.' || tbl.name, privilege.name)
       OR NOT has_table_privilege('omni_runtime_v2', 'public.' || tbl.name, privilege.name)
  )
  OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname ~ '^p03_') <> 16
  OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname ~ '^p03_'
        AND has_function_privilege('omni_runtime_v2', p.oid, 'EXECUTE')) <> 16
  OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND t.tgname ~ '^p03_') <> 11
  OR (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND i.indisvalid AND i.indisready
        AND c.relname IN ('p03_produto_chaves_gin', 'p03_variante_chaves_gin',
                          'vestuario_variantes_id_storeId_produtoId_key')) <> 3 THEN
    RAISE EXCEPTION 'Objetos ou ACL P03 incompletos';
  END IF;
END $$;

-- O histórico Prisma só é registrado pelo migrate resolve oficial depois da validação.
