-- ESTOQUE-MANUAL-KG-001 · rollout B · 03 — JANELA, corte 1/3: posse do database de produção → omni_owner.
-- NÃO executar em produção sem autorização específica.
--
-- Quem: o papel antigo (dono atual), conectado ao database de PRODUÇÃO, numa transação (-1).
-- Uso: psql -X -v ON_ERROR_STOP=1 -1 -v old_role=neondb_owner -v prod_db=omnigestao_prod -d omnigestao_prod -f 03-corte-posse.sql
--
-- O que este passo NÃO faz: tirar a escrita do papel antigo. No Neon ele é membro de neon_superuser,
-- que herda pg_write_all_data — escreve em qualquer tabela sem ser dono (provado). O corte efetivo é
-- o 04 (CONNECT) + 05 (sessões). Este passo existe para que (a) o papel antigo deixe de ser dono do
-- database (e não possa reabrir CONNECT) e (b) omni_migrator consiga rodar DDL sem o papel antigo.
-- Pega ACCESS EXCLUSIVE em cada tabela: espera vendas em voo (ainda no regime integer, inofensivas).
-- Estourou o lock_timeout: nada muda; repetir.

SET LOCAL lock_timeout = '15s';
SET LOCAL kg.old_role = :'old_role';

GRANT omni_owner TO :"old_role" WITH INHERIT TRUE, SET TRUE;   -- temporário: só para transferir
-- PRIMEIRO o database: o schema public pertence a pg_database_owner, então o novo dono do database
-- ganha CREATE no schema — exigido por ALTER TABLE … OWNER (achado da 1ª rodada da prova).
ALTER DATABASE :"prod_db" OWNER TO omni_owner;

DO $$
DECLARE r record; old text := current_setting('kg.old_role');
BEGIN
  FOR r IN SELECT c.oid::regclass AS obj FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND pg_get_userbyid(c.relowner) = old LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO omni_owner', r.obj);
  END LOOP;
  FOR r IN SELECT c.oid::regclass AS obj FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'S' AND pg_get_userbyid(c.relowner) = old LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO omni_owner', r.obj);
  END LOOP;
  FOR r IN SELECT t.oid::regtype AS obj FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'c') AND t.typrelid = 0 AND pg_get_userbyid(t.typowner) = old LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO omni_owner', r.obj);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS obj FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) = old LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO omni_owner', r.obj);
  END LOOP;
END $$;

-- tabelas criadas depois por omni_owner (migrations futuras com SET ROLE omni_owner) já nascem com DML do runtime
ALTER DEFAULT PRIVILEGES FOR ROLE omni_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO omni_runtime_v2;
ALTER DEFAULT PRIVILEGES FOR ROLE omni_owner IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO omni_runtime_v2;

REVOKE omni_owner FROM :"old_role";

DO $$
DECLARE old text := current_setting('kg.old_role');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND pg_get_userbyid(c.relowner) = old)
     OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND pg_get_userbyid(t.typowner) = old AND t.typtype IN ('e', 'd', 'c') AND t.typrelid = 0)
     OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) <> 'omni_owner'
     OR pg_has_role(old, 'omni_owner', 'USAGE') THEN
    RAISE EXCEPTION 'KG_CORTE_POSSE_INCOMPLETO';
  END IF;
  RAISE NOTICE 'KG_CORTE_POSSE_OK (papel antigo ainda escreve se herdar pg_write_all_data: %)', pg_has_role(old, 'pg_write_all_data', 'USAGE');
END $$;
