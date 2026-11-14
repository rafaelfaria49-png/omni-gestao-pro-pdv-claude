-- ROLLBACK MANUAL — 20261114120000_compat_catalogo_marcas_lancamento (COMPAT-CATALOGO-BRASIL-2023-2026-002)
-- Executar SOMENTE com autorização e backup. Remove a visibilidade de marcas por loja e o estado
-- "aguardando lançamento" dos modelos manuais (todos voltam a aparecer nas buscas).
-- Idempotente (IF EXISTS): reexecutar não falha. Não toca nenhuma outra coluna nem linha.
--
-- PLANO DE RECUPERAÇÃO
-- 0. ANTES do rollback, guardar só o que difere do default (é o único dado que o rollback descarta):
--      \copy (SELECT id, "storeId", "modelKey", lancamento FROM catalogo_aparelhos_loja_modelos
--             WHERE lancamento <> 'lancado') TO 'rb_lancamento.csv' CSV HEADER
--      \copy (SELECT "storeId", "marcasConfig"::text FROM compat_preferencias_loja
--             WHERE "marcasConfig" <> '{}'::jsonb) TO 'rb_marcas.csv' CSV HEADER
-- 1. Rodar este arquivo (bloco abaixo).
-- 2. Para voltar: reaplicar a migration (`prisma migrate deploy`; é idempotente) e restaurar os CSVs:
--      CREATE TEMP TABLE rb_l (id text, "storeId" text, "modelKey" text, lancamento text);
--      \copy rb_l FROM 'rb_lancamento.csv' CSV HEADER
--      UPDATE catalogo_aparelhos_loja_modelos m SET lancamento = r.lancamento FROM rb_l r WHERE m.id = r.id;
--      CREATE TEMP TABLE rb_m ("storeId" text, marcas text);
--      \copy rb_m FROM 'rb_marcas.csv' CSV HEADER
--      UPDATE compat_preferencias_loja p SET "marcasConfig" = r.marcas::jsonb FROM rb_m r WHERE p."storeId" = r."storeId";
-- Ensaio completo em PG descartável: docs/ai-execution/_evidence/COMPAT-CATALOGO-BRASIL-2023-2026-002/ENSAIO_MIGRATION_20261114.md
BEGIN;
ALTER TABLE "compat_preferencias_loja" DROP CONSTRAINT IF EXISTS "compat_preferencias_loja_marcas_check", DROP COLUMN IF EXISTS "marcasConfig";
ALTER TABLE "catalogo_aparelhos_loja_modelos" DROP CONSTRAINT IF EXISTS "catalogo_aparelhos_loja_modelos_lancamento_check", DROP COLUMN IF EXISTS "lancamento";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261114120000_compat_catalogo_marcas_lancamento';
COMMIT;
