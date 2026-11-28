-- Reversão manual da migration 20261129120000_comercial_custos_preparacao.
-- Só executar se NENHUM dado real comercial existir (remove apenas tabelas/funções novas; tabelas existentes intactas).
DROP TABLE IF EXISTS "comercial_vendas_custos";
DROP TABLE IF EXISTS "comercial_custos_lancamentos";
DROP TABLE IF EXISTS "comercial_custos_origens";
DROP TABLE IF EXISTS "comercial_perfis_unidade";
DROP FUNCTION IF EXISTS "comercial_custo_lancamento_imutavel"();
DROP FUNCTION IF EXISTS "comercial_append_only"();
