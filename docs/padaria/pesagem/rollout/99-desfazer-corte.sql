-- ESTOQUE-MANUAL-KG-001 · rollout B · 99 — desfazer o corte de CONEXÃO. SOMENTE ANTES da migration.
-- Depois da migration é PROIBIDO: deployment antigo (Int) voltaria a alcançar colunas double e corromper.
--
-- Quem: omni_migrator, conectado ao database de produção, numa transação (-1).
-- Uso: psql -X -v ON_ERROR_STOP=1 -1 -v old_role=neondb_owner -v prod_db=omnigestao_prod -d omnigestao_prod -f 99-desfazer-corte.sql
--
-- Devolve CONNECT só ao papel antigo (o suficiente: no Neon ele escreve por pg_write_all_data).
-- PUBLIC continua sem CONNECT (R1 #8). A posse fica com omni_owner; DDL só por omni_migrator.
-- R1 #2: confere o database conectado, exige as CINCO colunas em public como int4 e segura
-- ACCESS SHARE nas 3 tabelas até o COMMIT — a migration (ACCESS EXCLUSIVE) não se intercala.

SET LOCAL lock_timeout = '5s';
SET LOCAL kg.prod_db = :'prod_db';
DO $$
BEGIN
  IF current_database() <> current_setting('kg.prod_db') THEN
    RAISE EXCEPTION 'KG_DATABASE_ERRADO: conectado em %', current_database();
  END IF;
END $$;

LOCK TABLE public.estoque_produtos, public.produto_depositos, public.movimentacoes_estoque IN ACCESS SHARE MODE;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND NOT a.attisdropped AND a.atttypid = 'int4'::regtype
     AND (c.relname, a.attname) IN (('estoque_produtos', 'stock'), ('produto_depositos', 'quantidade'),
         ('movimentacoes_estoque', 'quantidade'), ('movimentacoes_estoque', 'estoqueAntes'), ('movimentacoes_estoque', 'estoqueDepois'));
  IF n <> 5 THEN
    RAISE EXCEPTION 'KG_DESFAZER_PROIBIDO_MIGRATION_JA_APLICADA (colunas int4 encontradas: % de 5)', n;
  END IF;
END $$;

GRANT CONNECT ON DATABASE :"prod_db" TO :"old_role";
