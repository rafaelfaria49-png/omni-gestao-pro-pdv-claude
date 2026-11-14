-- COMPAT-CATALOGO-BRASIL-2023-2026-002
-- ADITIVA. Depende de 20261113120000_compat_profissional (compat_preferencias_loja) e de
-- 20261107120000_catalogo_aparelhos_loja. Colunas com DEFAULT constante (sem reescrita no PG >= 11).
-- Não altera nem lê estoque, vendas, financeiro ou fiscal. NÃO aplicar em produção sem autorização.
-- Reversão: docs/catalogo/rollout/rollback_20261114120000_compat_catalogo_marcas_lancamento.sql

-- AlterTable
ALTER TABLE "catalogo_aparelhos_loja_modelos" ADD COLUMN "lancamento" TEXT NOT NULL DEFAULT 'lancado';

-- AlterTable
ALTER TABLE "compat_preferencias_loja" ADD COLUMN "marcasConfig" JSONB NOT NULL DEFAULT '{}';

-- Integridade de domínio (fora do modelo Prisma).
ALTER TABLE "catalogo_aparelhos_loja_modelos" ADD CONSTRAINT "catalogo_aparelhos_loja_modelos_lancamento_check"
  CHECK ("lancamento" IN ('lancado', 'aguardando_lancamento'));
ALTER TABLE "compat_preferencias_loja" ADD CONSTRAINT "compat_preferencias_loja_marcas_check"
  CHECK (jsonb_typeof("marcasConfig") = 'object');
