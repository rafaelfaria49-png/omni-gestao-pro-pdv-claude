-- Reversão manual da migration 20261110120000_aparelhos_fisicos_serializados.
-- Só executar se NENHUM dado real de aparelho existir (remove tabelas novas; tabelas existentes intactas).
DROP TABLE IF EXISTS "aparelhos_documentos";
DROP TABLE IF EXISTS "aparelhos_vendas";
DROP TABLE IF EXISTS "aparelhos_fotos";
DROP TABLE IF EXISTS "aparelhos_eventos";
DROP TABLE IF EXISTS "aparelhos_identificadores";
DROP TABLE IF EXISTS "aparelhos_fisicos";
DROP TABLE IF EXISTS "aparelhos_aquisicoes";
DROP TABLE IF EXISTS "aparelhos_politicas_loja";
DROP TABLE IF EXISTS "aparelhos_sequencias";
