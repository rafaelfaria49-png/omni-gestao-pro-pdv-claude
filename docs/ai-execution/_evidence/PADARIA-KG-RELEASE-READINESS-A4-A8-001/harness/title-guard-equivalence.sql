-- PADARIA-KG-RELEASE-READINESS-A4-A8-001 — equivalência exata do novo manual_kg_title_protected.
-- Executar como superusuário SINTÉTICO no database descartável `sim_eq` DEPOIS de:
--   (1) a migration 20261029120000 (corpo original) e
--   (2) a cópia do corpo original como manual_kg_title_protected_v1 (feita abaixo, antes da 20261106).
-- Uso pelo orquestrador: fase "antes" cria fixture + v1; aplica 20261106; fase "depois" compara.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database() <> 'sim_eq' OR inet_server_port() < 55000 THEN RAISE EXCEPTION 'KG_EQ_WRONG_DATABASE'; END IF; END $$;
\if :{?fase_antes}
CREATE FUNCTION public.manual_kg_title_protected_v1(sid text, tid text, local_key text, doc jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
  SELECT EXISTS (SELECT 1 FROM "vendas" v WHERE v."storeId" = sid AND "manual_kg_venda_protected"(v.id)
    AND (v."contaReceberTituloId" = tid OR left(local_key, length('pdv-aprazo-' || v."pedidoId")) = 'pdv-aprazo-' || v."pedidoId"
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(doc->'vendas') = 'array' THEN doc->'vendas' ELSE '[]'::jsonb END) entry WHERE entry->>'saleId' IN (v.id, v."pedidoId"))))
$f$;
-- O corpo copiado precisa ser o instalado pela 20261029 (fingerprint do texto).
DO $$ BEGIN
  IF regexp_replace(pg_get_functiondef('public.manual_kg_title_protected(text,text,text,jsonb)'::regprocedure), '\s+', '', 'g')
     <> regexp_replace(replace(pg_get_functiondef('public.manual_kg_title_protected_v1(text,text,text,jsonb)'::regprocedure), '_v1(', '('), '\s+', '', 'g') THEN
    RAISE EXCEPTION 'KG_EQ_V1_COPY_DIVERGES_FROM_INSTALLED';
  END IF;
END $$;
SET session_replication_role = replica;  -- fixture direta, só neste banco descartável
INSERT INTO stores (id, name, "updatedAt") VALUES ('eq-store', 'EQ', now()), ('eq-other', 'EQ2', now());
INSERT INTO contas_receber_titulos (id, "storeId", "updatedAt") VALUES ('t1', 'eq-store', now()), ('t2', 'eq-store', now());
INSERT INTO vendas (id, "storeId", "pedidoId", total, at, payload, "contaReceberTituloId") VALUES
  ('eq-v1', 'eq-store', 'A1', 1, now(), '{"manualKgSale":"classic-manual-kg-v1"}', 't1'),
  ('eq-v2', 'eq-store', 'A10', 1, now(), '{}', 't2'),
  ('eq-v3', 'eq-store', 'A100', 1, now(), '{}', NULL),
  ('eq-v4', 'eq-store', '', 1, now(), '{"manualKgSale":"classic-manual-kg-v1"}', NULL),
  ('X-ID', 'eq-store', 'X-PED', 1, now(), '{"manualKgSale":"classic-manual-kg-v1"}', NULL),
  ('eq-v6', 'eq-store', 'Á1', 1, now(), '{"manualKgSale":"classic-manual-kg-v1"}', NULL),
  ('eq-b1', 'eq-other', 'B1', 1, now(), '{"manualKgSale":"classic-manual-kg-v1"}', NULL);
INSERT INTO venda_itens (id, "vendaId", nome, quantidade, "quantidadeKg", "precoUnitario", "lineTotal") VALUES
  ('eq-i3', 'eq-v3', 'KG', NULL, 0.5, 1, 1);
SET session_replication_role = origin;
\else
CREATE TEMP TABLE eq_sid(v text); INSERT INTO eq_sid VALUES ('eq-store'), ('eq-other'), ('nao-existe');
CREATE TEMP TABLE eq_tid(v text); INSERT INTO eq_tid VALUES ('t1'), ('t2'), ('zz'), (NULL);
CREATE TEMP TABLE eq_key(v text); INSERT INTO eq_key VALUES (NULL), (''), ('pdv-aprazo'), ('pdv-aprazo-'), ('pdv-aprazo-A1'), ('pdv-aprazo-A1-2'),
  ('pdv-aprazo-A10'), ('pdv-aprazo-A100-3'), ('pdv-aprazo-A2'), ('pdv-aprazo-B1'), ('pdv-aprazo-X-PED'), ('pdv-aprazo-X-ID'), ('PDV-APRAZO-A1'),
  ('xpdv-aprazo-A1'), ('pdv-aprazo-Á1-1'), ('pdv-aprazo-A');
CREATE TEMP TABLE eq_doc(v jsonb); INSERT INTO eq_doc VALUES (NULL), ('{}'), ('{"vendas":{}}'), ('{"vendas":"A1"}'), ('{"vendas":[]}'),
  ('{"vendas":[{"saleId":"A1"}]}'), ('{"vendas":[{"saleId":"X-ID"}]}'), ('{"vendas":[{"saleId":"X-PED"}]}'), ('{"vendas":[{"saleId":"B1"}]}'),
  ('{"vendas":["A1", 3, null, {"pedidoId":"A1"}, {"saleId":null}]}'), ('{"vendas":[{"saleId":"A10"},{"saleId":"A100"}]}'), ('{"vendas":[{"saleId":""}]}');
CREATE TEMP TABLE eq_res AS
SELECT s.v AS sid, t.v AS tid, k.v AS lk, d.v AS doc,
       public.manual_kg_title_protected_v1(s.v, t.v, k.v, d.v) AS antes,
       public.manual_kg_title_protected(s.v, t.v, k.v, d.v) AS depois
  FROM eq_sid s, eq_tid t, eq_key k, eq_doc d;
SELECT 'KG_EQ casos=' || count(*) || ' divergentes=' || count(*) FILTER (WHERE antes IS DISTINCT FROM depois)
    || ' verdadeiros=' || count(*) FILTER (WHERE antes) || ' falsos=' || count(*) FILTER (WHERE NOT antes) FROM eq_res;
SELECT 'KG_EQ_DIVERGENTE ' || coalesce(sid,'∅') || ' ' || coalesce(tid,'∅') || ' ' || coalesce(lk,'∅') || ' ' || coalesce(doc::text,'∅') || ' antes=' || antes || ' depois=' || depois
  FROM eq_res WHERE antes IS DISTINCT FROM depois LIMIT 20;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM eq_res WHERE antes IS DISTINCT FROM depois) THEN RAISE EXCEPTION 'KG_EQ_FAIL'; END IF; RAISE NOTICE 'KG_EQ_OK'; END $$;
\endif
