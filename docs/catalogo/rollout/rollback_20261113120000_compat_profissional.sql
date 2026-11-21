-- ROLLBACK MANUAL — 20261113120000_compat_profissional (COMPAT-PROFISSIONAL-001)
-- Executar SOMENTE com autorização e backup. Remove a organização física, as cores e as
-- preferências por loja do Compat e as colunas novas das 2 tabelas do catálogo por loja.
-- Não toca estoque, vendas, financeiro ou fiscal. Modelos manuais e vínculos de película
-- anteriores continuam (apenas perdem fabricante/linha/origem/confirmação).
-- Vínculos de capinha (categoria = 'capinha') continuam na tabela e voltam a ser ignorados
-- pelo código anterior (que só aceitava película).

BEGIN;

DROP TABLE IF EXISTS "compat_localizacoes";
DROP TABLE IF EXISTS "compat_fileiras";
DROP TABLE IF EXISTS "compat_paineis";
DROP TABLE IF EXISTS "compat_cores_loja";
DROP TABLE IF EXISTS "compat_preferencias_loja";

ALTER TABLE "catalogo_aparelhos_loja_compat"
  DROP COLUMN IF EXISTS "origem",
  DROP COLUMN IF EXISTS "confirmedBy",
  DROP COLUMN IF EXISTS "confirmedAt";

ALTER TABLE "catalogo_aparelhos_loja_modelos"
  DROP COLUMN IF EXISTS "manufacturer",
  DROP COLUMN IF EXISTS "line";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261113120000_compat_profissional';

COMMIT;
