-- COMPAT-CATALOGO-BRASIL-2023-2026-002
-- ADITIVA. Depende de 20261113120000_compat_profissional (compat_preferencias_loja) e de
-- 20261107120000_catalogo_aparelhos_loja. Colunas com DEFAULT constante (sem reescrita no PG >= 11).
-- Não altera nem lê estoque, vendas, financeiro ou fiscal. NÃO aplicar em produção sem autorização.
-- Idempotente: reexecutar (ex.: após aplicação parcial manual) não falha nem duplica nada.
-- Locks: ALTER TABLE pega ACCESS EXCLUSIVE e o mantém até o fim da transação do deploy — inclusive durante
-- a varredura do VALIDATE. As duas tabelas são pequenas (linhas por loja); a varredura é curta. O par
-- NOT VALID + VALIDATE só reduziria o bloqueio se rodasse em transações separadas, o que aqui não ocorre.
-- Reversão: docs/catalogo/rollout/rollback_20261114120000_compat_catalogo_marcas_lancamento.sql

-- AlterTable
ALTER TABLE "catalogo_aparelhos_loja_modelos" ADD COLUMN IF NOT EXISTS "lancamento" TEXT NOT NULL DEFAULT 'lancado';

-- AlterTable
ALTER TABLE "compat_preferencias_loja" ADD COLUMN IF NOT EXISTS "marcasConfig" JSONB NOT NULL DEFAULT '{}';

-- Integridade de domínio (fora do modelo Prisma).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'catalogo_aparelhos_loja_modelos_lancamento_check'
      AND conrelid = '"catalogo_aparelhos_loja_modelos"'::regclass
  ) THEN
    ALTER TABLE "catalogo_aparelhos_loja_modelos" ADD CONSTRAINT "catalogo_aparelhos_loja_modelos_lancamento_check"
      CHECK ("lancamento" IN ('lancado', 'aguardando_lancamento')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'compat_preferencias_loja_marcas_check'
      AND conrelid = '"compat_preferencias_loja"'::regclass
  ) THEN
    ALTER TABLE "compat_preferencias_loja" ADD CONSTRAINT "compat_preferencias_loja_marcas_check"
      CHECK (jsonb_typeof("marcasConfig") = 'object') NOT VALID;
  END IF;
END $$;

ALTER TABLE "catalogo_aparelhos_loja_modelos" VALIDATE CONSTRAINT "catalogo_aparelhos_loja_modelos_lancamento_check";
ALTER TABLE "compat_preferencias_loja" VALIDATE CONSTRAINT "compat_preferencias_loja_marcas_check";
