-- ESTOQUE-MANUAL-KG-001 · rollout B · 01 — papéis novos (PRÉ-JANELA, sem efeito nos escritores atuais).
-- NÃO executar em produção sem autorização específica (ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md).
--
-- Quem: o papel antigo (neondb_owner), conectado a um database que NÃO é o de produção (ex.: neondb).
-- Papéis são objetos do cluster: valem para todos os databases.
-- Criar por SQL, nunca pelo Console/API do Neon: por lá o papel nasce membro de neon_superuser
-- (pg_write_all_data), o que anula o isolamento.
-- Senhas só por variável de ambiente (nunca em arquivo nem em linha de comando):
--   KG_MIGRATOR_PASSWORD, KG_RUNTIME_V2_PASSWORD
-- Uso: psql -X -v ON_ERROR_STOP=1 -1 -d neondb -f 01-papeis.sql

\getenv kg_migrator_pw KG_MIGRATOR_PASSWORD
\getenv kg_runtime_pw KG_RUNTIME_V2_PASSWORD
\if :{?kg_migrator_pw}
\else
  \warn 'KG_MIGRATOR_PASSWORD ausente'
  SELECT 'KG_SENHA_AUSENTE'::int;
\endif
\if :{?kg_runtime_pw}
\else
  \warn 'KG_RUNTIME_V2_PASSWORD ausente'
  SELECT 'KG_SENHA_AUSENTE'::int;
\endif

-- Dono dos objetos de produção depois do corte. Sem login.
CREATE ROLE omni_owner NOLOGIN;
-- Administração e janelas de migration. Herda a posse de omni_owner. Fora da janela: NOLOGIN.
CREATE ROLE omni_migrator LOGIN PASSWORD :'kg_migrator_pw';
GRANT omni_owner TO omni_migrator WITH INHERIT TRUE, SET TRUE;
-- Runtime de Production (só DML; nunca dono, nunca membro de neon_superuser).
CREATE ROLE omni_runtime_v2 LOGIN PASSWORD :'kg_runtime_pw';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('omni_owner', 'omni_migrator', 'omni_runtime_v2')
               AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb))
     OR pg_has_role('omni_runtime_v2', 'pg_write_all_data', 'USAGE')
     OR pg_has_role('omni_migrator', 'pg_write_all_data', 'USAGE')
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser'
                  AND (pg_has_role('omni_runtime_v2', oid, 'USAGE') OR pg_has_role('omni_migrator', oid, 'USAGE'))) THEN
    RAISE EXCEPTION 'KG_PAPEIS_COM_PRIVILEGIO_INDEVIDO';
  END IF;
  RAISE NOTICE 'KG_PAPEIS_OK';
END $$;
