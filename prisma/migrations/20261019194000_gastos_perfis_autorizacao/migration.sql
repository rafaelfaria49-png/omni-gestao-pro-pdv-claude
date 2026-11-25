-- CreateEnum
CREATE TYPE "FinanceiroPerfilTipo" AS ENUM ('EMPRESA', 'PESSOAL');

-- CreateTable
CREATE TABLE "financeiro_perfis" (
    "id" TEXT NOT NULL,
    "tipo" "FinanceiroPerfilTipo" NOT NULL,
    "storeId" TEXT,
    "ownerAdminUserId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_perfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financeiro_perfil_membros" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_perfil_membros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_perfis_storeId_key" ON "financeiro_perfis"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_perfis_ownerAdminUserId_key" ON "financeiro_perfis"("ownerAdminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_perfis_id_storeId_key" ON "financeiro_perfis"("id", "storeId");

-- CreateIndex
CREATE INDEX "financeiro_perfil_membros_adminUserId_storeId_idx" ON "financeiro_perfil_membros"("adminUserId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_perfil_membros_perfilId_adminUserId_key" ON "financeiro_perfil_membros"("perfilId", "adminUserId");

-- AddForeignKey
ALTER TABLE "financeiro_perfis" ADD CONSTRAINT "financeiro_perfis_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_perfis" ADD CONSTRAINT "financeiro_perfis_ownerAdminUserId_fkey" FOREIGN KEY ("ownerAdminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_perfil_membros" ADD CONSTRAINT "financeiro_perfil_membros_perfilId_storeId_fkey" FOREIGN KEY ("perfilId", "storeId") REFERENCES "financeiro_perfis"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_perfil_membros" ADD CONSTRAINT "financeiro_perfil_membros_adminUserId_storeId_fkey" FOREIGN KEY ("adminUserId", "storeId") REFERENCES "admin_user_stores"("adminUserId", "storeId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- Prisma não representa CHECK. Os escopos são mutuamente exclusivos no banco.
ALTER TABLE "financeiro_perfis" ADD CONSTRAINT "financeiro_perfis_escopo_check" CHECK (
    ("tipo" = 'EMPRESA' AND "storeId" IS NOT NULL AND "ownerAdminUserId" IS NULL)
 OR ("tipo" = 'PESSOAL' AND "storeId" IS NULL AND "ownerAdminUserId" IS NOT NULL)
);

-- Não transferir ownership/loja/tipo de um perfil já existente.
CREATE FUNCTION financeiro_perfis_preservar_escopo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."tipo" IS DISTINCT FROM OLD."tipo"
       OR NEW."storeId" IS DISTINCT FROM OLD."storeId"
       OR NEW."ownerAdminUserId" IS DISTINCT FROM OLD."ownerAdminUserId" THEN
        RAISE EXCEPTION 'Escopo do perfil financeiro e imutavel' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER financeiro_perfis_escopo_imutavel
BEFORE UPDATE ON "financeiro_perfis"
FOR EACH ROW EXECUTE FUNCTION financeiro_perfis_preservar_escopo();

-- Sem acesso direto via papéis públicos/API. O servidor usa seu papel interno.
ALTER TABLE "financeiro_perfis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financeiro_perfil_membros" ENABLE ROW LEVEL SECURITY;
