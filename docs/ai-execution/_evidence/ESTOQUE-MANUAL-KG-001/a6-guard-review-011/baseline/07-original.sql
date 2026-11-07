-- ESTOQUE-MANUAL-KG-001 · rollout B · 07 — OPCIONAL, exige revisão própria (não faz parte da migration aprovada na R4).
-- Barreira no próprio banco, independente de credencial: só aceita valor finito, |v| <= 999.999.999.999.999
-- (MAX_STOCK_UNITS: teto de UN/G; KG fica bem abaixo, R1 #5) e no máximo 3 casas. Um cliente Prisma Int sobre coluna double grava os bits do inteiro
-- (13 → 6e-323, −1 → NaN): ambos violam e a escrita FALHA (23514) em vez de corromper.
-- Limite medido: increment/decrement do cliente Int vira no-op silencioso (soma 1e-323) e passa —
-- só código morto da main usa isso (lib/os-itens-stock.ts, sem chamador nos 14 deployments vivos).
-- Invisível para `prisma migrate diff` (Prisma não modela CHECK): conferido, sem drift.
--
-- Quem: omni_migrator no database de produção, DEPOIS da migration e com a trava ligada.
-- Uso: psql -X -v ON_ERROR_STOP=1 -1 -d omnigestao_prod -f 07-guard-check-opcional.sql
-- Desfazer: ALTER TABLE … DROP CONSTRAINT "<nome>" (5 nomes abaixo).

SET LOCAL lock_timeout = '5s';
SET LOCAL ROLE omni_owner;
ALTER TABLE "estoque_produtos" ADD CONSTRAINT "estoque_produtos_stock_kg_milesimos" CHECK ("stock" <> 'NaN'::float8 AND abs("stock") <= 999999999999999 AND round("stock"::numeric, 3) = "stock"::numeric) NOT VALID;
ALTER TABLE "produto_depositos" ADD CONSTRAINT "produto_depositos_quantidade_kg_milesimos" CHECK ("quantidade" <> 'NaN'::float8 AND abs("quantidade") <= 999999999999999 AND round("quantidade"::numeric, 3) = "quantidade"::numeric) NOT VALID;
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_quantidade_kg_milesimos" CHECK ("quantidade" <> 'NaN'::float8 AND abs("quantidade") <= 999999999999999 AND round("quantidade"::numeric, 3) = "quantidade"::numeric) NOT VALID;
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_estoqueAntes_kg_milesimos" CHECK ("estoqueAntes" <> 'NaN'::float8 AND abs("estoqueAntes") <= 999999999999999 AND round("estoqueAntes"::numeric, 3) = "estoqueAntes"::numeric) NOT VALID;
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_estoqueDepois_kg_milesimos" CHECK ("estoqueDepois" <> 'NaN'::float8 AND abs("estoqueDepois") <= 999999999999999 AND round("estoqueDepois"::numeric, 3) = "estoqueDepois"::numeric) NOT VALID;
-- VALIDATE falha se já houver linha corrompida — nesse caso, corrigir pelo livro antes (runbook, "Corrupção detectada")
ALTER TABLE "estoque_produtos" VALIDATE CONSTRAINT "estoque_produtos_stock_kg_milesimos";
ALTER TABLE "produto_depositos" VALIDATE CONSTRAINT "produto_depositos_quantidade_kg_milesimos";
ALTER TABLE "movimentacoes_estoque" VALIDATE CONSTRAINT "movimentacoes_estoque_quantidade_kg_milesimos";
ALTER TABLE "movimentacoes_estoque" VALIDATE CONSTRAINT "movimentacoes_estoque_estoqueAntes_kg_milesimos";
ALTER TABLE "movimentacoes_estoque" VALIDATE CONSTRAINT "movimentacoes_estoque_estoqueDepois_kg_milesimos";
