-- INVENTARIO_ASSISTIDO_V1 — Fase 1 (Fundação). Gate #1 aprovado.
-- ADITIVO e NÃO-QUEBRANTE: cria 2 tabelas novas (inventario_sessoes, inventario_contagens).
-- NÃO altera/dropa nenhuma tabela/coluna existente. `Produto.stock` (estoque_produtos.stock)
-- segue intacto — a contagem é um registro PARALELO e INERTE; nenhum saldo é alterado aqui.
--
-- Apply de fato via `npm run db:push` (Opção A — mesmo padrão das migrações 0009/0010/0011).
-- Rollback seguro (nada existente foi tocado):
--   DROP TABLE IF EXISTS "inventario_contagens";
--   DROP TABLE IF EXISTS "inventario_sessoes";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Sessões de inventário (conferência física por loja)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "inventario_sessoes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "operador" TEXT,
    "depositoId" TEXT,
    "nome" TEXT,
    "observacao" TEXT,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventario_sessoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "inventario_sessoes_storeId_idx"
  ON "inventario_sessoes"("storeId");

CREATE INDEX IF NOT EXISTS "inventario_sessoes_storeId_status_idx"
  ON "inventario_sessoes"("storeId", "status");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Linhas de contagem (uma por código distinto bipado na sessão)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "inventario_contagens" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "produtoId" TEXT,
    "codigoBipado" TEXT NOT NULL,
    "produtoNomeSnapshot" TEXT,
    "produtoSkuSnapshot" TEXT,
    "estoqueSistemaSnapshot" INTEGER,
    "quantidadeContada" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'encontrado',
    "primeiroBipeEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoBipeEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventario_contagens_pkey" PRIMARY KEY ("id")
);

-- 2º bipe do mesmo código = incremento (não duplica a linha).
CREATE UNIQUE INDEX IF NOT EXISTS "inventario_contagens_sessaoId_codigoBipado_key"
  ON "inventario_contagens"("sessaoId", "codigoBipado");

CREATE INDEX IF NOT EXISTS "inventario_contagens_storeId_idx"
  ON "inventario_contagens"("storeId");

CREATE INDEX IF NOT EXISTS "inventario_contagens_sessaoId_idx"
  ON "inventario_contagens"("sessaoId");

CREATE INDEX IF NOT EXISTS "inventario_contagens_storeId_status_idx"
  ON "inventario_contagens"("storeId", "status");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Foreign keys (guardadas para idempotência — estilo migrações 0009/0010/0011)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventario_sessoes_storeId_fkey') THEN
    ALTER TABLE "inventario_sessoes"
      ADD CONSTRAINT "inventario_sessoes_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventario_contagens_sessaoId_fkey') THEN
    ALTER TABLE "inventario_contagens"
      ADD CONSTRAINT "inventario_contagens_sessaoId_fkey"
      FOREIGN KEY ("sessaoId") REFERENCES "inventario_sessoes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
