-- BL-07 Fase 1 — Fundação multi-depósito (ADR-0007 · SPRINT_BL07_FASE1).
-- ADITIVO e NÃO-QUEBRANTE: cria 2 tabelas novas (depositos, produto_depositos).
-- NÃO altera/dropa nenhuma tabela/coluna existente. Produto.stock (estoque_produtos.stock)
-- segue intacto como cache agregado. Zero mudança de comportamento operacional.
--
-- Apply de fato via `npm run db:push` (Opção A — mesmo padrão das migrações 0009/0010).
-- Rollback seguro (nada existente foi tocado):
--   DROP TABLE IF EXISTS "produto_depositos";
--   DROP TABLE IF EXISTS "depositos";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Depósitos (localização lógica de estoque dentro de uma loja)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "depositos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "depositos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "depositos_storeId_codigo_key"
  ON "depositos"("storeId", "codigo");

CREATE INDEX IF NOT EXISTS "depositos_storeId_idx"
  ON "depositos"("storeId");

-- Invariante "no máx. 1 depósito principal por loja" — índice parcial único (reforço estrutural).
-- ATENÇÃO: índices parciais NÃO são declaráveis em schema.prisma, então `db:push` NÃO cria
-- (nem gerencia) este índice. A garantia primária é o GUARD DE SERVIÇO `ensureDepositoPrincipal`
-- (find-or-create idempotente). Aplique este bloco manualmente se quiser a trava no banco.
CREATE UNIQUE INDEX IF NOT EXISTS "depositos_um_principal_por_loja"
  ON "depositos"("storeId") WHERE "principal" = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Saldo FÍSICO por produto × depósito (sem reserva/comprometido/trânsito — Fase 1)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "produto_depositos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "produto_depositos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "produto_depositos_produtoId_depositoId_key"
  ON "produto_depositos"("produtoId", "depositoId");

CREATE INDEX IF NOT EXISTS "produto_depositos_storeId_idx"
  ON "produto_depositos"("storeId");

CREATE INDEX IF NOT EXISTS "produto_depositos_storeId_produtoId_idx"
  ON "produto_depositos"("storeId", "produtoId");

CREATE INDEX IF NOT EXISTS "produto_depositos_depositoId_idx"
  ON "produto_depositos"("depositoId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Foreign keys (guardadas para idempotência — estilo migrações 0009/0010)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'depositos_storeId_fkey') THEN
    ALTER TABLE "depositos"
      ADD CONSTRAINT "depositos_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produto_depositos_produtoId_fkey') THEN
    ALTER TABLE "produto_depositos"
      ADD CONSTRAINT "produto_depositos_produtoId_fkey"
      FOREIGN KEY ("produtoId") REFERENCES "estoque_produtos"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produto_depositos_depositoId_fkey') THEN
    ALTER TABLE "produto_depositos"
      ADD CONSTRAINT "produto_depositos_depositoId_fkey"
      FOREIGN KEY ("depositoId") REFERENCES "depositos"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
