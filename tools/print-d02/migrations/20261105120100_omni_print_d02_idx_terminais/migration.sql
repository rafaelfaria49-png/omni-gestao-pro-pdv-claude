-- OMNI-PRINT D02-A (i) — índice único pai em pdv_terminais, usado pelas FKs compostas das tabelas print_*.
-- NÃO APLICAR sem aprovação do proprietário (janela, executor). Aplicação manual: tools/print-d02/d02.mjs apply-indexes,
-- que fixa lock_timeout = 5s e confere pg_index.indisvalid. Depois: prisma migrate resolve --applied (RUNBOOK_D02.md).
-- CONCURRENTLY não bloqueia INSERT/UPDATE/DELETE. ÚNICO comando do arquivo: o Prisma só o executa fora de transação assim.
-- Sem IF NOT EXISTS: índice homônimo pré-existente deve ser investigado. Se ficar INVÁLIDO: DROP INDEX CONCURRENTLY e repetir.
CREATE UNIQUE INDEX CONCURRENTLY "p004_term_id_store_uq" ON "public"."pdv_terminais" ("id", "storeId");
