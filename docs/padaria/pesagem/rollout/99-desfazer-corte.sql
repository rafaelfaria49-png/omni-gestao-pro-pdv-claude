-- ESTOQUE-MANUAL-KG-001 · rollout B · 99 — desfazer o corte de CONEXÃO. SOMENTE ANTES da migration.
-- Depois da migration é PROIBIDO: deployment antigo (Int) voltaria a alcançar colunas double e corromper.
--
-- Quem: omni_migrator, conectado ao database de produção.
-- Uso: psql -X -v ON_ERROR_STOP=1 -1 -v old_role=neondb_owner -v prod_db=omnigestao_prod -d omnigestao_prod -f 99-desfazer-corte.sql
-- A posse fica com omni_owner (inofensivo): no Neon o papel antigo escreve por pg_write_all_data, e
-- DDL só por omni_migrator. Provado: cold start antigo volta a gravar logo após este script.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'estoque_produtos' AND column_name = 'stock' AND data_type <> 'integer') THEN
    RAISE EXCEPTION 'KG_DESFAZER_PROIBIDO_MIGRATION_JA_APLICADA';
  END IF;
END $$;
GRANT CONNECT, TEMPORARY ON DATABASE :"prod_db" TO PUBLIC;
GRANT CONNECT ON DATABASE :"prod_db" TO :"old_role";
