\set ON_ERROR_STOP on
\pset pager off
BEGIN READ ONLY;
SELECT 1/CASE WHEN current_setting('neon.project_id',true)='dry-mouse-36002471' AND current_setting('neon.endpoint_id',true)='ep-summer-tooth-acltc6wi' AND current_database()='omnigestao_prod' AND current_setting('transaction_read_only')='on' THEN 1 ELSE 0 END AS identidade_ok, now();
\set S 'cliente-bc1c8ad5-5c08-4aaa-b125-7c1076a72f2e'
\echo == loja
SELECT id, name, cnpj<>'' tem_cnpj, "codigoNumeracaoVenda", "createdAt", "updatedAt", "moduleAccess" FROM stores WHERE id=:'S';
\echo == settings (chaves de printerConfig e trocas por peso)
SELECT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(coalesce("printerConfig",'{}'::jsonb)) k) chaves, "printerConfig"->'pdvTrocasPeso' trocas_peso, "printerConfig"->'pdvLayout' layout FROM store_settings WHERE "storeId"=:'S';
\echo == usuarios com acesso
SELECT u.role, u."accessScope", u.active, u."mustChangePassword", (u."lojaId"=:'S') loja_principal FROM admin_users u WHERE u."lojaId"=:'S' OR u.id IN (SELECT "adminUserId" FROM admin_user_stores WHERE "storeId"=:'S');
\echo == produtos
SELECT count(*) total, count(*) FILTER (WHERE metadata->'comercial'->>'unidade'='KG') kg, count(*) FILTER (WHERE (metadata->>'vendaPorPeso')::text='true') peso_legado, sum(stock) soma_stock FROM estoque_produtos WHERE "storeId"=:'S';
SELECT name, sku, stock, metadata->'comercial' comercial FROM estoque_produtos WHERE "storeId"=:'S' ORDER BY "createdAt" LIMIT 15;
\echo == movimentos, vendas, caixas, devolucoes
SELECT (SELECT count(*) FROM movimentacoes_estoque WHERE "storeId"=:'S') movs, (SELECT count(*) FROM vendas WHERE "storeId"=:'S') vendas, (SELECT max(at) FROM vendas WHERE "storeId"=:'S') ultima_venda, (SELECT count(*) FROM sessoes_caixa WHERE "storeId"=:'S') caixas, (SELECT count(*) FROM sessoes_caixa WHERE "storeId"=:'S' AND status='ABERTA') abertos, (SELECT count(*) FROM devolucoes_venda WHERE "storeId"=:'S') devolucoes;
\echo == caixas abertos (todas as lojas) agora
SELECT "storeId", count(*), min("abertaEm") FROM sessoes_caixa WHERE status='ABERTA' GROUP BY 1;
ROLLBACK;
