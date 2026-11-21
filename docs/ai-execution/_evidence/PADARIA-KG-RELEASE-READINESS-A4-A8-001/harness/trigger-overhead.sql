-- PADARIA-KG-RELEASE-READINESS-A4-A8-001 — custo dos gatilhos da migration aditiva (#335).
-- Somente no database descartável `sim_eq` (cópia do ensaio). Volume deliberadamente acima da
-- produção (banco inteiro ~41 MB no A1): 30.000 vendas de ~2 KB na loja sintética.
--   -v popular=1           → cria o volume (uma vez)
--   -v rotulo=antes|depois → mede 20 escritas de cada caso, com e sem gatilhos
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database() <> 'sim_eq' OR inet_server_port() < 55000 THEN RAISE EXCEPTION 'KG_PERF_WRONG_DATABASE'; END IF; END $$;
\if :{?popular}
INSERT INTO vendas (id, "storeId", "pedidoId", total, at, payload)
SELECT 'perf-v-' || g, 'loja-sim-1', 'PERF-' || g, 10, now(),
       jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('name', repeat('x', 1800), 'quantity', 1)), 'n', g)
  FROM generate_series(1, 30000) g;
INSERT INTO venda_itens (id, "vendaId", "inventoryId", nome, quantidade, "precoUnitario", "lineTotal")
SELECT 'perf-i-' || g, 'perf-v-' || g, 'prod-un-1', 'UN', 1, 10, 10 FROM generate_series(1, 30000) g;
INSERT INTO contas_receber_titulos (id, "storeId", "localKey", valor, "updatedAt", payload)
VALUES ('perf-titulo-base', 'loja-sim-1', 'pdv-aprazo-PERF-15000', 10, now(), '{"vendas":[{"saleId":"PERF-15000"}]}');
ANALYZE vendas; ANALYZE venda_itens; ANALYZE contas_receber_titulos; ANALYZE movimentacoes_financeiras;
SELECT 'KG_PERF vendas_na_loja=' || (SELECT count(*) FROM vendas WHERE "storeId" = 'loja-sim-1');
\else
CREATE TEMP TABLE kg_perf (caso text, ms numeric);
CREATE FUNCTION pg_temp.medir(caso text, comando text, n int) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE t0 timestamptz; i int;
BEGIN
  t0 := clock_timestamp();
  FOR i IN 1..n LOOP EXECUTE format(comando, caso || '-' || i); END LOOP;
  INSERT INTO kg_perf VALUES (caso, round(extract(epoch FROM clock_timestamp() - t0) * 1000 / n, 3));
END $f$;
SET kg.rotulo = :'rotulo';
-- Título a prazo (manual_kg_guard_title → manual_kg_title_protected).
SELECT pg_temp.medir(current_setting('kg.rotulo') || '_titulo_insert', $q$INSERT INTO contas_receber_titulos (id, "storeId", "localKey", valor, "updatedAt", payload) VALUES (%1$L, 'loja-sim-1', 'pdv-aprazo-' || %1$L, 10, now(), '{"vendas":[]}')$q$, 20);
-- Baixa/atualização do título existente.
SELECT pg_temp.medir(current_setting('kg.rotulo') || '_titulo_update', $q$UPDATE contas_receber_titulos SET valor = valor, descricao = %1$L WHERE id = 'perf-titulo-base'$q$, 20);
-- Movimento financeiro que referencia título (manual_kg_finance_reference_protected).
SELECT pg_temp.medir(current_setting('kg.rotulo') || '_fin_ref_titulo', $q$INSERT INTO movimentacoes_financeiras (id, "storeId", "referenciaId", valor) VALUES (%1$L, 'loja-sim-1', 'perf-titulo-base', 10)$q$, 20);
-- Movimento financeiro de venda comum (referência = pedidoId).
SELECT pg_temp.medir(current_setting('kg.rotulo') || '_fin_ref_venda', $q$INSERT INTO movimentacoes_financeiras (id, "storeId", "referenciaId", valor) VALUES (%1$L, 'loja-sim-1', 'PERF-15000', 10)$q$, 20);
SET session_replication_role = replica;  -- linha de base sem gatilhos, só nesta sessão descartável
SELECT pg_temp.medir(current_setting('kg.rotulo') || '_titulo_insert_SEM_GATILHO', $q$INSERT INTO contas_receber_titulos (id, "storeId", "localKey", valor, "updatedAt", payload) VALUES (%1$L, 'loja-sim-1', 'pdv-aprazo-' || %1$L, 10, now(), '{"vendas":[]}')$q$, 20);
SELECT pg_temp.medir(current_setting('kg.rotulo') || '_fin_ref_titulo_SEM_GATILHO', $q$INSERT INTO movimentacoes_financeiras (id, "storeId", "referenciaId", valor) VALUES (%1$L, 'loja-sim-1', 'perf-titulo-base', 10)$q$, 20);
SET session_replication_role = origin;
SELECT 'KG_PERF ' || caso || ' ms_por_escrita=' || ms FROM kg_perf ORDER BY caso;
\endif
