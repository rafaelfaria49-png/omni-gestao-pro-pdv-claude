-- Estoque fracionado (KG) — ESTOQUE-MANUAL-KG-001.
-- Não executar em produção sem autorização específica (ver docs/padaria/pesagem/ESTOQUE_MANUAL_KG.md).
--
-- Alargamento sem perda: todo int4 é representável exatamente em double precision,
-- então nenhum saldo existente muda de valor. Sem UPDATE/backfill.
-- A precisão de KG (3 casas) é garantida pelo boundary canônico, que calcula em
-- milésimos inteiros e só grava `milesimos / 1000`.
-- ALTER COLUMN TYPE reescreve as tabelas sob ACCESS EXCLUSIVE lock.

-- AlterTable
ALTER TABLE "estoque_produtos" ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "movimentacoes_estoque" ALTER COLUMN "quantidade" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "estoqueAntes" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "estoqueDepois" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "produto_depositos" ALTER COLUMN "quantidade" SET DEFAULT 0,
ALTER COLUMN "quantidade" SET DATA TYPE DOUBLE PRECISION;
