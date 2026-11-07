-- ESTOQUE-MANUAL-KG-001 · rollout B · 02 — DML para o runtime novo (PRÉ-JANELA, sem efeito nos escritores atuais).
-- NÃO executar em produção sem autorização específica.
--
-- Quem: o papel antigo (dono atual), conectado ao database de PRODUÇÃO.
-- Uso: psql -X -v ON_ERROR_STOP=1 -1 -v prod_db=omnigestao_prod -d omnigestao_prod -f 02-grants-runtime.sql
-- Não usa TEMPORARY, TRUNCATE nem DDL: o app não usa (inventário em ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md).

GRANT CONNECT ON DATABASE :"prod_db" TO omni_runtime_v2, omni_migrator;
GRANT USAGE ON SCHEMA public TO omni_runtime_v2;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO omni_runtime_v2;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO omni_runtime_v2;

DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     -- um por vez: com a lista, has_table_privilege é verdadeiro se QUALQUER um existir (R1 #3)
     AND NOT (has_table_privilege('omni_runtime_v2', c.oid, 'SELECT') AND has_table_privilege('omni_runtime_v2', c.oid, 'INSERT')
          AND has_table_privilege('omni_runtime_v2', c.oid, 'UPDATE') AND has_table_privilege('omni_runtime_v2', c.oid, 'DELETE'));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'KG_RUNTIME_SEM_DML: %', faltando; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity) THEN
    -- runtime sem BYPASSRLS leria zero linhas onde houver RLS sem policy
    RAISE EXCEPTION 'KG_RLS_ATIVO_EXIGE_POLICY_PARA_RUNTIME';
  END IF;
  RAISE NOTICE 'KG_RUNTIME_GRANTS_OK';
END $$;
