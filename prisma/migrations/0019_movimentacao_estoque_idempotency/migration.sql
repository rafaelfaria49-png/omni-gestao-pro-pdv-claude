-- CAD-R2-009 — STOCK / LEDGER INVARIANT.
-- Migration ADITIVA e NAO-QUEBRANTE: uma coluna NULLABLE em "movimentacoes_estoque"
-- + constraint UNIQUE por loja (NULLs nao conflitam no Postgres).
--
-- NAO toca nenhuma coluna existente. Sem DROP, RENAME, UPDATE, INSERT, backfill,
-- seed ou conversao in-place. Historico existente permanece com idempotencyKey NULL
-- (multiplos NULLs sao permitidos na unique do Postgres — nenhum conflito retroativo).
-- Rollback seguro: DROP CONSTRAINT + DROP COLUMN (apenas se nenhum writer novo depender).
--
-- Aplicacao de fato via `npm run db:push` (padrao das migracoes 0009/0011) ou
-- `prisma migrate deploy`. Esta entrega NAO aplica a migration em Production.
--
-- Nome da constraint = "storeId_idempotencyKey", idêntico ao @@unique(name:) do schema,
-- para `prisma validate` / `migrate diff` não reportarem drift.

ALTER TABLE "movimentacoes_estoque" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'storeId_idempotencyKey'
  ) THEN
    ALTER TABLE "movimentacoes_estoque"
      ADD CONSTRAINT "storeId_idempotencyKey" UNIQUE ("storeId", "idempotencyKey");
  END IF;
END
$$;
