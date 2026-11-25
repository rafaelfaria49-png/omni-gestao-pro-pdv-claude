-- OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001
-- Auditoria SOMENTE LEITURA das vendas VDA-L01-2026-000760 e VDA-L01-2026-000767.
--
-- Executar apenas com autorização do proprietário, numa sessão read-only:
--   psql "<url de PRODUÇÃO>" -v ON_ERROR_STOP=1 -v loja="'<storeId da RAFACELL Loja 1>'" -f este-arquivo.sql
-- A primeira instrução trava a sessão em modo leitura; qualquer escrita aborta.
-- Não há UPDATE/INSERT/DELETE neste arquivo. Saída contém nome de cliente: não colar em canal público.

BEGIN TRANSACTION READ ONLY;

-- 0. Identidade do banco (precisa ser omnigestao_prod, NÃO omnigestao_prod_candidate)
SELECT current_database() AS banco, now() AS agora;
SELECT id, name, "codigoNumeracaoVenda" FROM stores WHERE id = :loja;

-- 1. Venda original e itens persistidos (snapshot de linhas, inventoryId, produtoId, códigos)
SELECT id, "pedidoId", status, total, at, "clienteNome", "clientSaleId", "terminalId",
       payload->>'sessaoId'            AS sessao,
       payload->'paymentBreakdown'     AS pagamento,
       jsonb_array_length(coalesce(payload->'lines','[]'::jsonb)) AS n_linhas
FROM vendas WHERE "storeId" = :loja AND "pedidoId" = 'VDA-L01-2026-000760';

SELECT l.ord - 1 AS line_index, l.v->>'inventoryId' AS inventory_id, l.v->>'produtoId' AS produto_id,
       l.v->>'name' AS nome, l.v->>'quantity' AS qtd, l.v->>'lineTotal' AS total_linha,
       l.v->>'itemType' AS item_type, l.v->>'isAvulso' AS avulso, l.v->>'qtyReturned' AS qty_returned_payload,
       l.v->>'sku' AS sku_snapshot, l.v->>'barcode' AS barcode_snapshot
FROM vendas v, jsonb_array_elements(coalesce(v.payload->'lines','[]'::jsonb)) WITH ORDINALITY AS l(v, ord)
WHERE v."storeId" = :loja AND v."pedidoId" = 'VDA-L01-2026-000760';

SELECT i."inventoryId", i.nome, i.quantidade, i."precoUnitario", i."lineTotal",
       p.id AS produto_cadastro, p.sku, p.barcode, p.active, p.status, p.stock
FROM venda_itens i
JOIN vendas v ON v.id = i."vendaId"
LEFT JOIN estoque_produtos p ON p."storeId" = v."storeId" AND (p.id = i."inventoryId" OR p.sku = i."inventoryId" OR p.barcode = i."inventoryId")
WHERE v."storeId" = :loja AND v."pedidoId" = 'VDA-L01-2026-000760';

-- 2. Documentos de devolução: pela venda E por janela/nome (pega localId colidido ou venda errada)
SELECT d.id, d."localId", d."vendaLocalId", d.tipo, d.at, d."valorTotal", d."creditoEmitido",
       (d."clienteDoc" <> '') AS tem_doc, d."sessaoId", d.operador, d.motivo, d.payload
FROM devolucoes_venda d
WHERE d."storeId" = :loja
  AND (d."vendaLocalId" = 'VDA-L01-2026-000760'
       OR d.at BETWEEN '2026-11-21 00:00-03' AND '2026-11-24 23:59-03')
ORDER BY d.at;

SELECT d."localId", d."vendaLocalId", d.at, i."inventoryId", i.nome, i.quantidade, i."valorTotal"
FROM itens_devolucao_venda i JOIN devolucoes_venda d ON d.id = i."devolucaoId"
WHERE d."storeId" = :loja AND (i.nome ILIKE '%PS4%' OR d."vendaLocalId" = 'VDA-L01-2026-000760');

-- Colisão de localId legado (DEV-AAAA-NNNN): mesmo número para vendas diferentes não é possível
-- (unique por loja), mas mostra quais números existem para comparar com o localStorage do terminal.
SELECT "localId", "vendaLocalId", at FROM devolucoes_venda
WHERE "storeId" = :loja AND "localId" LIKE 'DEV-2026-%' ORDER BY "localId";

-- 3. Créditos emitidos e consumidos
SELECT c.id, (c."clienteDoc" <> '') AS tem_doc, c."clienteNome", c."valorOriginal", c."saldoAtual", c.status,
       c."devolucaoId", c."vendaOrigemId", c."createdAt"
FROM clientes_creditos c
WHERE c."storeId" = :loja
  AND (c."vendaOrigemId" = 'VDA-L01-2026-000760' OR c."createdAt" BETWEEN '2026-11-21 00:00-03' AND '2026-11-24 23:59-03');

SELECT u."creditoId", u."vendaId", u.valor, u."saldoAntes", u."saldoDepois", u.at
FROM usos_credito_cliente u WHERE u."storeId" = :loja AND u.at BETWEEN '2026-11-21 00:00-03' AND '2026-11-24 23:59-03';

-- 4. Eventual nova venda do X-360 (venda substituta) e vendas com creditoVale no período
SELECT v."pedidoId", v.at, v.total, v.status, v."clienteNome", v.payload->'paymentBreakdown' AS pagamento,
       v.payload->>'sessaoId' AS sessao
FROM vendas v
WHERE v."storeId" = :loja
  AND v.at BETWEEN '2026-11-21 15:00-03' AND '2026-11-24 23:59-03'
  AND (EXISTS (SELECT 1 FROM venda_itens i WHERE i."vendaId" = v.id AND i.nome ILIKE '%X-360%')
       OR coalesce((v.payload->'paymentBreakdown'->>'creditoVale')::numeric, 0) > 0)
ORDER BY v.at;

-- 5. Estoque dos dois produtos desde a venda original
SELECT m."createdAt", p.name, m.tipo, m.origem, m.quantidade, m."estoqueAntes", m."estoqueDepois", m.documento, m.motivo
FROM movimentacoes_estoque m JOIN estoque_produtos p ON p.id = m."produtoId"
WHERE m."storeId" = :loja AND m."createdAt" >= '2026-11-21 00:00-03'
  AND (p.name ILIKE '%PS4 WIRELESS%' OR p.name ILIKE '%X-360%')
ORDER BY m."createdAt";
SELECT id, name, sku, barcode, stock, active, status FROM estoque_produtos
WHERE "storeId" = :loja AND (name ILIKE '%PS4 WIRELESS%' OR name ILIKE '%X-360%');

-- 6. Financeiro e caixa do período
SELECT "createdAt", tipo, valor, origem, "referenciaId", descricao
FROM movimentacoes_financeiras
WHERE "storeId" = :loja AND "createdAt" BETWEEN '2026-11-21 00:00-03' AND '2026-11-24 23:59-03'
  AND (origem LIKE 'devolucao%' OR descricao ILIKE '%000760%' OR descricao ILIKE '%X-360%')
ORDER BY "createdAt";

SELECT id, status, operador, "abertaEm", "fechadaEm", "saldoInicial", "saldoFinal", "saldoContado"
FROM sessoes_caixa WHERE "storeId" = :loja AND "abertaEm" BETWEEN '2026-11-21 00:00-03' AND '2026-11-22 23:59-03'
ORDER BY "abertaEm";

SELECT o."sessaoId", o.tipo, o.valor, o.motivo, o.at
FROM caixa_operacoes o JOIN sessoes_caixa s ON s.id = o."sessaoId"
WHERE s."storeId" = :loja AND o.at BETWEEN '2026-11-21 00:00-03' AND '2026-11-22 23:59-03';

-- 7. VDA-L01-2026-000767: os códigos estão no snapshot da venda ou só no cadastro atual?
SELECT l.v->>'name' AS nome, l.v->>'inventoryId' AS inventory_id, l.v->>'produtoId' AS produto_id,
       l.v->>'sku' AS sku_snapshot, l.v->>'barcode' AS barcode_snapshot, l.v->>'itemType' AS item_type
FROM vendas v, jsonb_array_elements(coalesce(v.payload->'lines','[]'::jsonb)) AS l(v)
WHERE v."storeId" = :loja AND v."pedidoId" = 'VDA-L01-2026-000767';
SELECT i.nome, i."inventoryId", p.id, p.sku, p.barcode
FROM venda_itens i JOIN vendas v ON v.id = i."vendaId"
LEFT JOIN estoque_produtos p ON p."storeId" = v."storeId" AND (p.id = i."inventoryId" OR p.sku = i."inventoryId" OR p.barcode = i."inventoryId")
WHERE v."storeId" = :loja AND v."pedidoId" = 'VDA-L01-2026-000767';

ROLLBACK;
