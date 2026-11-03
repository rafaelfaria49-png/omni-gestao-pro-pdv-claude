-- OMNI-PRINT-004C — variante futura, passo 00. LABORATORIO; NAO APLICAR EM PRODUCAO sem aprovacao D02/D04.
-- Executar FORA de transacao (psql sem -1/--single-transaction). CREATE INDEX CONCURRENTLY usa SHARE UPDATE EXCLUSIVE:
-- INSERT/UPDATE/DELETE em vendas e pdv_terminais continuam durante a construcao. Sem IF NOT EXISTS: um indice
-- homonimo pre-existente deve ser investigado, nunca aceito silenciosamente.
SET lock_timeout = '5s';
SET statement_timeout = '0';
CREATE UNIQUE INDEX CONCURRENTLY "p004_vendas_id_store_uq" ON "public"."vendas" ("id", "storeId");
CREATE UNIQUE INDEX CONCURRENTLY "p004_term_id_store_uq" ON "public"."pdv_terminais" ("id", "storeId");
DO $p004$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname IN ('p004_vendas_id_store_uq','p004_term_id_store_uq') AND NOT i.indisvalid) THEN
  RAISE EXCEPTION 'p004 parent index INVALID: DROP INDEX CONCURRENTLY and rebuild';
 END IF;
END $p004$;
