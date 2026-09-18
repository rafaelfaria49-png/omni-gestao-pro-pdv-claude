-- CAD-R2-019 (expand): chave canônica de documento forte de Cliente.
--
-- - `documentKey` NULL por padrão: nenhuma linha existente muda de
--   identidade na aplicação desta migration (expand seguro).
-- - `document` (legado/display) permanece intocado.
-- - Índice não-unique para o lookup canônico; a UNIQUE (storeId,
--   documentKey) vem na 0021, APÓS audit + backfill + revisão 018-B.
-- - Backfill idempotente: scripts/cad-r2-019-document-backfill.ts
--   (reusa lib/cadastros/client-identity/document.ts, sem outro validador).

-- AlterTable
ALTER TABLE "clientes_importados" ADD COLUMN "documentKey" TEXT;

-- CreateIndex
CREATE INDEX "clientes_importados_storeId_documentKey_idx" ON "clientes_importados"("storeId", "documentKey");
