-- CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001
-- Aditiva: cria 2 tabelas novas (modelos manuais por loja + decisões de compatibilidade por loja).
-- Não altera nem lê nenhuma tabela existente (só FK para "stores"). Sem backfill.
-- NÃO aplicar em produção sem autorização específica e rollout separado.
-- Reversão: docs/catalogo/rollout/rollback_20261107120000_catalogo_aparelhos_loja.sql (DROP das 2 tabelas; sem perda em outras tabelas).

-- CreateTable
CREATE TABLE "catalogo_aparelhos_loja_modelos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogo_aparelhos_loja_modelos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo_aparelhos_loja_compat" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "modelKeyA" TEXT NOT NULL,
    "modelKeyB" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'precisa_testar',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogo_aparelhos_loja_compat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalogo_aparelhos_loja_modelos_modelKey_key" ON "catalogo_aparelhos_loja_modelos"("modelKey");

-- CreateIndex
CREATE INDEX "catalogo_aparelhos_loja_modelos_storeId_active_idx" ON "catalogo_aparelhos_loja_modelos"("storeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "catalogo_aparelhos_loja_modelos_storeId_brandKey_nameKey_key" ON "catalogo_aparelhos_loja_modelos"("storeId", "brandKey", "nameKey");

-- CreateIndex
CREATE INDEX "catalogo_aparelhos_loja_compat_storeId_categoria_modelKeyA_idx" ON "catalogo_aparelhos_loja_compat"("storeId", "categoria", "modelKeyA");

-- CreateIndex
CREATE INDEX "catalogo_aparelhos_loja_compat_storeId_categoria_modelKeyB_idx" ON "catalogo_aparelhos_loja_compat"("storeId", "categoria", "modelKeyB");

-- CreateIndex
CREATE UNIQUE INDEX "catalogo_aparelhos_loja_compat_storeId_categoria_modelKeyA__key" ON "catalogo_aparelhos_loja_compat"("storeId", "categoria", "modelKeyA", "modelKeyB");

-- AddForeignKey
ALTER TABLE "catalogo_aparelhos_loja_modelos" ADD CONSTRAINT "catalogo_aparelhos_loja_modelos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_aparelhos_loja_compat" ADD CONSTRAINT "catalogo_aparelhos_loja_compat_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integridade de domínio (fora do modelo Prisma).
ALTER TABLE "catalogo_aparelhos_loja_compat" ADD CONSTRAINT "catalogo_aparelhos_loja_compat_acao_check"
  CHECK ("acao" IN ('adicionar', 'suprimir'));
ALTER TABLE "catalogo_aparelhos_loja_compat" ADD CONSTRAINT "catalogo_aparelhos_loja_compat_categoria_check"
  CHECK ("categoria" IN ('pelicula_tela', 'capinha'));
ALTER TABLE "catalogo_aparelhos_loja_compat" ADD CONSTRAINT "catalogo_aparelhos_loja_compat_par_ordenado_check"
  CHECK (("modelKeyA" COLLATE "C") < ("modelKeyB" COLLATE "C"));
-- COLLATE "C": a ordem do par é a do código (orderedPair compara unidades UTF-16; chaves são ASCII).
-- Sem isso, um banco pt_BR/en_US/ICU ignora "_" e recusa pares válidos (ex.: _16_plus × _16e).
ALTER TABLE "catalogo_aparelhos_loja_modelos" ADD CONSTRAINT "catalogo_aparelhos_loja_modelos_modelKey_check"
  CHECK ("modelKey" LIKE 'manual\_%');
