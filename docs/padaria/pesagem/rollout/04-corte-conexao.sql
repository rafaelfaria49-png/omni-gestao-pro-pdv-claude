-- ESTOQUE-MANUAL-KG-001 · rollout B · 04 — JANELA, corte 2/3: nenhuma conexão NOVA do papel antigo em produção.
-- NÃO executar em produção sem autorização específica.
--
-- Quem: omni_migrator (agora dono via omni_owner), conectado ao database de PRODUÇÃO.
-- Uso: psql -X -v ON_ERROR_STOP=1 -1 -v old_role=neondb_owner -v prod_db=omnigestao_prod -d omnigestao_prod -f 04-corte-conexao.sql
--
-- REVOKE feito por quem não é dono termina com WARNING e exit 0 sem revogar nada — por isso a
-- conferência abaixo lê o catálogo e LEVANTA erro. Sessões já abertas continuam vivas: ver 05.
-- Vale para cold start de deployment antigo, reconexão do Prisma e reconexão do pooler (PgBouncer
-- abre conexão nova no servidor, que passa pela checagem de CONNECT).

REVOKE CONNECT, TEMPORARY ON DATABASE :"prod_db" FROM PUBLIC;
REVOKE ALL ON DATABASE :"prod_db" FROM :"old_role";

SET LOCAL kg.old_role = :'old_role';
DO $$
DECLARE old text := current_setting('kg.old_role'); quem text;
BEGIN
  IF has_database_privilege(old, current_database(), 'CONNECT') THEN
    RAISE EXCEPTION 'KG_CORTE_CONEXAO_INEFICAZ: % ainda tem CONNECT', old;
  END IF;
  SELECT string_agg(rolname, ', ' ORDER BY rolname) INTO quem FROM pg_roles
   WHERE rolcanlogin AND NOT rolsuper AND has_database_privilege(oid, current_database(), 'CONNECT')
     AND rolname NOT IN ('omni_runtime_v2', 'omni_migrator');
  IF quem IS NOT NULL THEN
    RAISE EXCEPTION 'KG_CORTE_CONEXAO_OUTROS_PAPEIS: %', quem;
  END IF;
  RAISE NOTICE 'KG_CORTE_CONEXAO_OK';
END $$;
