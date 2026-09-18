-- CAD-R2-019 (constraint): unicidade forte de documento por loja.
--
-- GATE OBRIGATÓRIO ANTES DE APLICAR EM PRODUÇÃO:
--   1. scripts/cad-r2-019-document-preflight.ts precisa retornar
--      RESULT=PASS (zero duplicidade forte mesma-store).
--   2. scripts/cad-r2-019-document-backfill.ts --exec precisa ter
--      preenchido `documentKey` (idempotente, sem auto-merge).
-- Se o preflight retornar BLOCKED, NÃO aplicar esta migration: revisar os
-- pares pelo fluxo 018-B (merge humano) e retomar o GOAL depois.
--
-- Semântica PostgreSQL:
-- - Mesma store + mesma chave forte → impossível persistir duas linhas.
-- - Stores diferentes → permitido (a chave inclui storeId).
-- - Múltiplos NULL (vazio/inválido) → permitidos (NULL ≠ NULL na UNIQUE).

-- CreateIndex
CREATE UNIQUE INDEX "clientes_importados_storeId_documentKey_key" ON "clientes_importados"("storeId", "documentKey");
