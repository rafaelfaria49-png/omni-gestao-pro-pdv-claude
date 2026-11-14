-- ROLLBACK MANUAL — 20261114120000_compat_catalogo_marcas_lancamento (COMPAT-CATALOGO-BRASIL-2023-2026-002)
-- Executar SOMENTE com autorização e backup. Remove a visibilidade de marcas por loja e o estado
-- "aguardando lançamento" dos modelos manuais (todos voltam a aparecer nas buscas).
BEGIN;
ALTER TABLE "compat_preferencias_loja" DROP CONSTRAINT IF EXISTS "compat_preferencias_loja_marcas_check", DROP COLUMN IF EXISTS "marcasConfig";
ALTER TABLE "catalogo_aparelhos_loja_modelos" DROP CONSTRAINT IF EXISTS "catalogo_aparelhos_loja_modelos_lancamento_check", DROP COLUMN IF EXISTS "lancamento";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261114120000_compat_catalogo_marcas_lancamento';
COMMIT;
