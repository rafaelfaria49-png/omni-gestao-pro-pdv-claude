-- ESTOQUE-MANUAL-KG-001 — aplicação verificada da migration 20261025120000_estoque_quantidade_fracionada.
-- Uso: psql -v ON_ERROR_STOP=1 -1 -f estoque-kg-migration-apply.sql  (conexão direta, porta 5432).
-- NÃO executar em produção sem autorização específica (ver ESTOQUE_MANUAL_KG_RUNBOOK.md).
--
-- Tudo numa transação: as 3 tabelas ficam travadas do retrato "antes" até o COMMIT, então
-- nenhum escritor se intercala. O retrato é um md5 POR LINHA (id + valores como texto): no
-- PostgreSQL 12+ o texto de um double é o decimal mais curto, idêntico ao do inteiro original.
-- Qualquer diferença levanta exceção e desfaz o DDL.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
-- texto do double estável para o retrato (R1 #6): com extra_float_digits < 1 um inteiro grande sairia arredondado
SET LOCAL extra_float_digits = 1;

LOCK TABLE estoque_produtos, produto_depositos, movimentacoes_estoque IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE kg_retrato ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM estoque_produtos) AS produtos,
  (SELECT md5(coalesce(string_agg(id || ':' || stock::text, ',' ORDER BY id), '')) FROM estoque_produtos) AS produtos_md5,
  (SELECT count(*) FROM produto_depositos) AS depositos,
  (SELECT md5(coalesce(string_agg(id || ':' || quantidade::text, ',' ORDER BY id), '')) FROM produto_depositos) AS depositos_md5,
  (SELECT count(*) FROM movimentacoes_estoque) AS livro,
  (SELECT md5(coalesce(string_agg(id || ':' || quantidade::text || ':' || "estoqueAntes"::text || ':' || "estoqueDepois"::text, ',' ORDER BY id), '')) FROM movimentacoes_estoque) AS livro_md5;

-- ── conteúdo exato de migration.sql (sha256 f07242c4…a06a47e) ──────────────────
ALTER TABLE "estoque_produtos" ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "movimentacoes_estoque" ALTER COLUMN "quantidade" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "estoqueAntes" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "estoqueDepois" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "produto_depositos" ALTER COLUMN "quantidade" SET DEFAULT 0,
ALTER COLUMN "quantidade" SET DATA TYPE DOUBLE PRECISION;
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE r kg_retrato%ROWTYPE;
BEGIN
  SELECT * INTO r FROM kg_retrato;
  IF r.produtos <> (SELECT count(*) FROM estoque_produtos)
     OR r.produtos_md5 <> (SELECT md5(coalesce(string_agg(id || ':' || stock::text, ',' ORDER BY id), '')) FROM estoque_produtos)
     OR r.depositos <> (SELECT count(*) FROM produto_depositos)
     OR r.depositos_md5 <> (SELECT md5(coalesce(string_agg(id || ':' || quantidade::text, ',' ORDER BY id), '')) FROM produto_depositos)
     OR r.livro <> (SELECT count(*) FROM movimentacoes_estoque)
     OR r.livro_md5 <> (SELECT md5(coalesce(string_agg(id || ':' || quantidade::text || ':' || "estoqueAntes"::text || ':' || "estoqueDepois"::text, ',' ORDER BY id), '')) FROM movimentacoes_estoque)
  THEN
    RAISE EXCEPTION 'KG_MIGRATION_RETRATO_DIVERGENTE: valores mudaram durante a conversão; DDL desfeito';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE (table_name, column_name) IN (('estoque_produtos','stock'),('produto_depositos','quantidade'),
                   ('movimentacoes_estoque','quantidade'),('movimentacoes_estoque','estoqueAntes'),('movimentacoes_estoque','estoqueDepois'))
               AND data_type <> 'double precision') THEN
    RAISE EXCEPTION 'KG_MIGRATION_TIPO_INESPERADO';
  END IF;
  RAISE NOTICE 'KG_MIGRATION_OK produtos=% depositos=% livro=% produtos_md5=%', r.produtos, r.depositos, r.livro, r.produtos_md5;
END $$;
