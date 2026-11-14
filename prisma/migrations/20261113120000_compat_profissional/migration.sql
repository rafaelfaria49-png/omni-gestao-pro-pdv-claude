-- COMPAT-PROFISSIONAL-001
-- ADITIVA. 2 tabelas existentes do Compat ganham colunas com DEFAULT (sem reescrita de linha no PG >= 11);
-- 5 tabelas novas por loja (painéis, fileiras, localizações, cores, preferências). Sem backfill.
-- Nenhuma tabela de estoque, venda, financeiro ou fiscal é alterada ou lida.
-- Depende de 20261107120000_catalogo_aparelhos_loja.
-- NÃO aplicar em produção sem autorização específica (merge na main = rollout).
-- Reversão: docs/catalogo/rollout/rollback_20261113120000_compat_profissional.sql

-- AlterTable
ALTER TABLE "catalogo_aparelhos_loja_modelos" ADD COLUMN     "line" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "manufacturer" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "catalogo_aparelhos_loja_compat" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "origem" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "compat_paineis" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeKey" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compat_paineis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compat_fileiras" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "painelId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeKey" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compat_fileiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compat_localizacoes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL DEFAULT '',
    "produtoId" TEXT,
    "painelId" TEXT NOT NULL,
    "fileiraId" TEXT,
    "posicao" TEXT NOT NULL DEFAULT '',
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compat_localizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compat_cores_loja" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "baseKey" TEXT,
    "label" TEXT NOT NULL,
    "labelKey" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compat_cores_loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compat_preferencias_loja" (
    "storeId" TEXT NOT NULL,
    "posicoesHabilitadas" BOOLEAN NOT NULL DEFAULT false,
    "modoModeloPadrao" TEXT NOT NULL DEFAULT 'opcional',
    "modoCorPadrao" TEXT NOT NULL DEFAULT 'opcional',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compat_preferencias_loja_pkey" PRIMARY KEY ("storeId")
);

-- CreateIndex
CREATE INDEX "compat_paineis_storeId_ordem_idx" ON "compat_paineis"("storeId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "compat_paineis_storeId_nomeKey_key" ON "compat_paineis"("storeId", "nomeKey");

-- CreateIndex
CREATE INDEX "compat_fileiras_storeId_painelId_ordem_idx" ON "compat_fileiras"("storeId", "painelId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "compat_fileiras_painelId_nomeKey_key" ON "compat_fileiras"("painelId", "nomeKey");

-- CreateIndex
CREATE INDEX "compat_localizacoes_storeId_modelKey_idx" ON "compat_localizacoes"("storeId", "modelKey");

-- CreateIndex
CREATE INDEX "compat_localizacoes_storeId_produtoId_idx" ON "compat_localizacoes"("storeId", "produtoId");

-- CreateIndex
CREATE INDEX "compat_localizacoes_painelId_idx" ON "compat_localizacoes"("painelId");

-- CreateIndex
CREATE INDEX "compat_localizacoes_fileiraId_idx" ON "compat_localizacoes"("fileiraId");

-- CreateIndex
CREATE UNIQUE INDEX "compat_cores_loja_storeId_labelKey_key" ON "compat_cores_loja"("storeId", "labelKey");

-- CreateIndex
CREATE UNIQUE INDEX "compat_cores_loja_storeId_baseKey_key" ON "compat_cores_loja"("storeId", "baseKey");

-- AddForeignKey
ALTER TABLE "compat_paineis" ADD CONSTRAINT "compat_paineis_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compat_fileiras" ADD CONSTRAINT "compat_fileiras_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compat_fileiras" ADD CONSTRAINT "compat_fileiras_painelId_fkey" FOREIGN KEY ("painelId") REFERENCES "compat_paineis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compat_localizacoes" ADD CONSTRAINT "compat_localizacoes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compat_localizacoes" ADD CONSTRAINT "compat_localizacoes_painelId_fkey" FOREIGN KEY ("painelId") REFERENCES "compat_paineis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compat_localizacoes" ADD CONSTRAINT "compat_localizacoes_fileiraId_fkey" FOREIGN KEY ("fileiraId") REFERENCES "compat_fileiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compat_cores_loja" ADD CONSTRAINT "compat_cores_loja_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compat_preferencias_loja" ADD CONSTRAINT "compat_preferencias_loja_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Integridade de domínio (fora do modelo Prisma).
ALTER TABLE "compat_localizacoes" ADD CONSTRAINT "compat_localizacoes_alvo_check"
  CHECK ("modelKey" <> '' OR "produtoId" IS NOT NULL);
ALTER TABLE "compat_preferencias_loja" ADD CONSTRAINT "compat_preferencias_loja_modos_check"
  CHECK ("modoModeloPadrao" IN ('obrigatorio', 'opcional', 'desativado') AND "modoCorPadrao" IN ('obrigatorio', 'opcional', 'desativado'));
ALTER TABLE "compat_cores_loja" ADD CONSTRAINT "compat_cores_loja_label_check"
  CHECK (length(btrim("label")) > 0 AND length("labelKey") > 0);
