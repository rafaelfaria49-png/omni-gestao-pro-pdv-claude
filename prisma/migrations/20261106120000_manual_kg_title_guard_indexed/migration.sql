-- UNPUBLISHED migration, PADARIA-KG-RELEASE-READINESS-A4-A8-001.
-- Same decision as 20261029120000_manual_kg_sale_quantity, without the per-store scan.
-- The previous body evaluated manual_kg_venda_protected() for EVERY sale of the store on each
-- write to contas_receber_titulos and on each financial movement that references a title
-- (~0.6–1.2 s per write with 30k sales in a disposable PostgreSQL 17). This body only visits
-- candidate sales reachable through indexes (contaReceberTituloId, pedidoId @unique, id PK).
-- Exact equivalence with the previous body is proven by
-- docs/ai-execution/_evidence/PADARIA-KG-RELEASE-READINESS-A4-A8-001/harness/title-guard-equivalence.sql.
-- Apply with the same executor as 20261029120000 (session role = owner of the tables).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'manual_kg_title_protected'
        AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) THEN
    RAISE EXCEPTION 'KG_TITLE_GUARD_REQUIRES_ADDITIVE_V2_AND_OWNER: apply 20261029120000 first, as the owner role';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION "manual_kg_title_protected"(sid text, tid text, local_key text, doc jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  -- MATERIALIZED: the candidate ids are resolved through indexes first; the planner must not
  -- push manual_kg_venda_protected() into a scan of every sale of the store.
  WITH candidate AS MATERIALIZED (
    SELECT c.id FROM "vendas" c WHERE c."storeId" = sid AND c."contaReceberTituloId" = tid
    UNION ALL
    SELECT c.id FROM "vendas" c
     WHERE c."storeId" = sid AND left(local_key, 11) = 'pdv-aprazo-'
       AND c."pedidoId" IN (SELECT left(substr(local_key, 12), n) FROM generate_series(0, length(local_key) - 11) n)
    UNION ALL
    SELECT c.id FROM "vendas" c
      JOIN jsonb_array_elements(CASE WHEN jsonb_typeof(doc->'vendas') = 'array' THEN doc->'vendas' ELSE '[]'::jsonb END) entry
        ON c.id = entry->>'saleId' OR c."pedidoId" = entry->>'saleId'
     WHERE c."storeId" = sid)
  SELECT EXISTS (SELECT 1 FROM candidate WHERE "manual_kg_venda_protected"(candidate.id))
$$;
COMMIT;
