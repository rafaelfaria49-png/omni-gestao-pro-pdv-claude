-- Reversão manual de 20261107120000_catalogo_aparelhos_loja (NÃO é aplicada pelo Prisma).
-- Remove só as 2 tabelas criadas pela migration. Perde os modelos manuais e decisões por loja;
-- vínculos em Produto.metadata e snapshots de venda (texto) permanecem intactos.
-- ATENÇÃO: a migration ESTÁ APLICADA EM PRODUCTION (2026-11-08). Este script é DESTRUTIVO e
-- irreversível: só com autorização própria do proprietário, preflight só leitura e trava de identidade
-- do banco na MESMA transação (psql -1). Procedimento: ROLLOUT_20261107120000_catalogo_aparelhos_loja.md.
DROP TABLE IF EXISTS "catalogo_aparelhos_loja_compat";
DROP TABLE IF EXISTS "catalogo_aparelhos_loja_modelos";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261107120000_catalogo_aparelhos_loja';
