-- OMNI-PRINT-004C — D02, ROLLBACK do schema candidato (layout futuro: 00 + 01-futura + 02). LABORATORIO.
-- Uso: psql -v ON_ERROR_STOP=1 -X -f rollback_print_candidate.sql (SEM -1: os DROP INDEX CONCURRENTLY nao rodam em transacao).
-- IF EXISTS: o rollback precisa funcionar a partir de qualquer estado parcial (ex.: 01 aplicada e 02 nao).
-- So remove objetos print_*/p004_*: nenhuma tabela, linha ou indice comercial pre-existente e tocado.
-- ATENCAO: apaga o ledger de impressao (jobs, tentativas, eventos). Em ambiente com dados reais, exportar antes
-- (ver DECISOES_PROPRIETARIO_OMNI_PRINT.md, D02) — o ledger e a prova de "nao imprimir duas vezes".
-- TRAVA: remover as FKs exige ACCESS EXCLUSIVE em vendas/stores/pdv_terminais/admin_users (PostgreSQL 17, medido no
-- ensaio): enquanto espera, ate leituras dessas tabelas esperam (ate 2 s por tentativa). Rodar SOMENTE com a loja
-- fechada. O rollback preferido e desligar o recurso (gate); remover tabelas e opcional.
SET lock_timeout = '2s';
BEGIN;
-- Locks pais pegos no inicio, vendas primeiro: enquanto espera uma venda aberta nao segura nenhuma outra tabela
-- (sem isso, o DROP pegava admin_users — logins — e ficava esperando stores).
LOCK TABLE "public"."vendas" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "public"."stores", "public"."pdv_terminais", "public"."admin_users" IN ACCESS EXCLUSIVE MODE;
-- Um unico DROP para as 11 tabelas: as FKs entre elas (inclusive circulares) caem juntas; triggers caem com as tabelas.
DROP TABLE IF EXISTS "public"."print_agent_links", "public"."print_events", "public"."print_attempts", "public"."print_copies",
  "public"."print_requests", "public"."print_jobs", "public"."print_documents", "public"."print_bindings",
  "public"."print_destinations", "public"."print_delegations", "public"."print_installations";
DROP FUNCTION IF EXISTS "public".p004_agent_link_guard(), "public".p004_bump_risk(), "public".p004_commit_guard(),
  "public".p004_delete_guard(), "public".p004_immutable(), "public".p004_insert_guard(), "public".p004_lifecycle();
COMMIT;
-- Indices pais por ultimo e sem bloquear vendas.
DROP INDEX CONCURRENTLY IF EXISTS "public"."p004_vendas_id_store_uq";
DROP INDEX CONCURRENTLY IF EXISTS "public"."p004_term_id_store_uq";
