-- ROLLBACK MANUAL — 20261114120000_compat_catalogo_marcas_lancamento (COMPAT-CATALOGO-BRASIL-2023-2026-002)
-- Executar SOMENTE com autorização e backup. Remove a visibilidade de marcas por loja e o estado
-- "aguardando lançamento" dos modelos manuais (todos voltam a aparecer nas buscas).
-- Idempotente (IF EXISTS): reexecutar não falha. Não toca nenhuma outra coluna nem linha.
--
-- PLANO DE RECUPERAÇÃO (psql com -v ON_ERROR_STOP=1; cada comando abaixo é UMA linha — o \copy do psql não
-- aceita quebra de linha). Remova o prefixo "--@backup " / "--@restaurar " para executar.
-- 0. ANTES do rollback, exportar só o que difere do default (único dado que o rollback descarta) e conferir
--    que os dois arquivos foram gerados; sem eles, NÃO prosseguir:
--@backup \copy (SELECT id, "storeId", "modelKey", lancamento FROM catalogo_aparelhos_loja_modelos WHERE lancamento <> 'lancado') TO 'rb_lancamento.csv' CSV HEADER
--@backup \copy (SELECT "storeId", "marcasConfig"::text AS marcas FROM compat_preferencias_loja WHERE "marcasConfig" <> '{}'::jsonb) TO 'rb_marcas.csv' CSV HEADER
-- 1. Rodar o bloco BEGIN … COMMIT abaixo.
-- 2. Para voltar: reaplicar a migration (`prisma migrate deploy`; ela é idempotente) e restaurar os arquivos:
--@restaurar CREATE TEMP TABLE rb_l (id text, "storeId" text, "modelKey" text, lancamento text);
--@restaurar \copy rb_l FROM 'rb_lancamento.csv' CSV HEADER
--@restaurar UPDATE catalogo_aparelhos_loja_modelos m SET lancamento = r.lancamento FROM rb_l r WHERE m.id = r.id;
--@restaurar CREATE TEMP TABLE rb_m ("storeId" text, marcas text);
--@restaurar \copy rb_m FROM 'rb_marcas.csv' CSV HEADER
--@restaurar UPDATE compat_preferencias_loja p SET "marcasConfig" = r.marcas::jsonb FROM rb_m r WHERE p."storeId" = r."storeId";
-- Ensaio (executa estas linhas literalmente): docs/ai-execution/_evidence/COMPAT-CATALOGO-BRASIL-2023-2026-002/ENSAIO_MIGRATION_20261114.md
BEGIN;
ALTER TABLE "compat_preferencias_loja" DROP CONSTRAINT IF EXISTS "compat_preferencias_loja_marcas_check", DROP COLUMN IF EXISTS "marcasConfig";
ALTER TABLE "catalogo_aparelhos_loja_modelos" DROP CONSTRAINT IF EXISTS "catalogo_aparelhos_loja_modelos_lancamento_check", DROP COLUMN IF EXISTS "lancamento";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261114120000_compat_catalogo_marcas_lancamento';
COMMIT;
