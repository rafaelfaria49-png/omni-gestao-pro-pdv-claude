-- ESTOQUE-MANUAL-KG-001 · rollout B · 07 — OPCIONAL, exige revisão própria (não faz parte da migration aprovada na R4).
-- A aprovação técnica local do A6 NÃO autoriza aplicação em produção: exige autorização própria da janela.
-- Barreira escalar adicional ao corte obrigatório de CONNECT + encerramento de sessões antigas.
-- Preserva o domínio canônico: UN/G inteiros até MAX_STOCK_UNITS=999999999999999 e KG em milésimos
-- até MAX_STOCK_UNITS/1000. Sem coluna de unidade no depósito/livro, estes CHECKs NÃO distinguem UN/G
-- de KG nem impõem o teto menor específico de KG; o boundary canônico continua obrigatório.
-- O round apenas verifica o valor, nunca o modifica. Comparar de volta com o float8 ORIGINAL evita
-- que o cast float8::numeric (15 dígitos significativos) esconda valores como 0.30000000000000004.
-- Um cliente Prisma Int pode gravar os bits do inteiro em float8 (13 -> 6e-323, -1 -> NaN): rejeitados.
-- LIMITAÇÕES: zero antigo passa; increment/decrement antigo pode ser no-op e passar. Não protege
-- invariante saldo/depósito/livro nem valida venda por peso. Nenhum cliente Int pode continuar escrevendo.
-- CHECK não substitui NOT NULL (a precondição abaixo exige os cinco NOT NULL existentes).
-- Prisma não modela CHECK; migrate diff vazio NÃO comprova existência/validação destas constraints.
--
-- Quem: omni_migrator no database de produção, DEPOIS da migration e com a trava ligada.
-- Uso: psql -X -v ON_ERROR_STOP=1 -1 -d omnigestao_prod -f 07-guard-check-opcional.sql
-- -1 e ON_ERROR_STOP=1 são OBRIGATÓRIOS: sem a transação única pode haver instalação parcial.
-- Conferir identidade do banco na mesma sessão antes deste arquivo, conforme o runbook.
-- ADD CHECK obtém ACCESS EXCLUSIVE, retido até COMMIT inclusive nas validações; NOT VALID não encurta
-- essa retenção numa transação única. lock_timeout limita espera; statement_timeout limita CADA comando,
-- não a duração total da janela. Medir previamente; timeout/falha deve causar ROLLBACK integral.
-- Não é idempotente. Se já houver constraints com estes nomes, parar e diagnosticar, sem DROP automático.
-- VALIDATE falha com dados inválidos; não corrigi-los automaticamente. Desfazer estes CHECKs requer
-- autorização própria e ALTER TABLE ... DROP CONSTRAINT (cinco nomes); isso NÃO desfaz a migration KG,
-- não reabre CONNECT e nunca autoriza cliente Int sobre Float.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL ROLE omni_owner;
SET LOCAL search_path = pg_catalog, public;
DO $guard_precondition$
BEGIN
  IF (SELECT count(*) FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT a.attisdropped
        AND a.atttypid = 'pg_catalog.float8'::regtype AND a.attnotnull
        AND (c.relname, a.attname) IN (('estoque_produtos', 'stock'), ('produto_depositos', 'quantidade'),
          ('movimentacoes_estoque', 'quantidade'), ('movimentacoes_estoque', 'estoqueAntes'),
          ('movimentacoes_estoque', 'estoqueDepois'))) <> 5 THEN
    RAISE EXCEPTION 'KG_GUARD_REQUIRES_FIVE_FLOAT8_NOT_NULL_COLUMNS';
  END IF;
END $guard_precondition$;

ALTER TABLE public."estoque_produtos" ADD CONSTRAINT "estoque_produtos_stock_kg_milesimos" CHECK ("stock" <> 'NaN'::float8 AND abs("stock") <= 999999999999999 AND round("stock"::numeric, 3)::float8 = "stock") NOT VALID;
ALTER TABLE public."produto_depositos" ADD CONSTRAINT "produto_depositos_quantidade_kg_milesimos" CHECK ("quantidade" <> 'NaN'::float8 AND abs("quantidade") <= 999999999999999 AND round("quantidade"::numeric, 3)::float8 = "quantidade") NOT VALID;
ALTER TABLE public."movimentacoes_estoque"
  ADD CONSTRAINT "movimentacoes_estoque_quantidade_kg_milesimos" CHECK ("quantidade" <> 'NaN'::float8 AND abs("quantidade") <= 999999999999999 AND round("quantidade"::numeric, 3)::float8 = "quantidade") NOT VALID,
  ADD CONSTRAINT "movimentacoes_estoque_estoqueAntes_kg_milesimos" CHECK ("estoqueAntes" <> 'NaN'::float8 AND abs("estoqueAntes") <= 999999999999999 AND round("estoqueAntes"::numeric, 3)::float8 = "estoqueAntes") NOT VALID,
  ADD CONSTRAINT "movimentacoes_estoque_estoqueDepois_kg_milesimos" CHECK ("estoqueDepois" <> 'NaN'::float8 AND abs("estoqueDepois") <= 999999999999999 AND round("estoqueDepois"::numeric, 3)::float8 = "estoqueDepois") NOT VALID;

ALTER TABLE public."estoque_produtos" VALIDATE CONSTRAINT "estoque_produtos_stock_kg_milesimos";
ALTER TABLE public."produto_depositos" VALIDATE CONSTRAINT "produto_depositos_quantidade_kg_milesimos";
-- Três CHECKs no mesmo comando permitem uma varredura conjunta do livro.
ALTER TABLE public."movimentacoes_estoque"
  VALIDATE CONSTRAINT "movimentacoes_estoque_quantidade_kg_milesimos",
  VALIDATE CONSTRAINT "movimentacoes_estoque_estoqueAntes_kg_milesimos",
  VALIDATE CONSTRAINT "movimentacoes_estoque_estoqueDepois_kg_milesimos";
