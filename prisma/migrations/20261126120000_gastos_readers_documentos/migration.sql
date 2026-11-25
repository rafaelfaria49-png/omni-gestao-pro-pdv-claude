-- CreateEnum
CREATE TYPE "DocumentoGastoEstado" AS ENUM ('DISPONIVEL', 'QUARENTENA', 'RETIDO');

-- CreateTable
CREATE TABLE "documentos_gastos" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "ownerAdminUserId" TEXT,
    "criadoPorAdminUserId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "proveniencia" TEXT NOT NULL,
    "estado" "DocumentoGastoEstado" NOT NULL DEFAULT 'DISPONIVEL',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "historico" JSONB NOT NULL,
    "retencaoRevisarEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_vinculos" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "pagarTituloId" TEXT,
    "receberTituloId" TEXT,
    "carteiraId" TEXT,
    "movimentacaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_vinculos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documentos_gastos_storageRef_key" ON "documentos_gastos"("storageRef");

-- CreateIndex
CREATE INDEX "documentos_gastos_perfilId_estado_createdAt_idx" ON "documentos_gastos"("perfilId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "documentos_gastos_perfilId_retencaoRevisarEm_idx" ON "documentos_gastos"("perfilId", "retencaoRevisarEm");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_gastos_id_perfilId_key" ON "documentos_gastos"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_gastos_perfilId_sha256_key" ON "documentos_gastos"("perfilId", "sha256");

-- CreateIndex
CREATE INDEX "documentos_vinculos_perfilId_createdAt_idx" ON "documentos_vinculos"("perfilId", "createdAt");

-- CreateIndex
CREATE INDEX "documentos_vinculos_pagarTituloId_idx" ON "documentos_vinculos"("pagarTituloId");

-- CreateIndex
CREATE INDEX "documentos_vinculos_receberTituloId_idx" ON "documentos_vinculos"("receberTituloId");

-- CreateIndex
CREATE INDEX "documentos_vinculos_carteiraId_idx" ON "documentos_vinculos"("carteiraId");

-- CreateIndex
CREATE INDEX "documentos_vinculos_movimentacaoId_idx" ON "documentos_vinculos"("movimentacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_vinculos_documentoId_pagarTituloId_key" ON "documentos_vinculos"("documentoId", "pagarTituloId");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_vinculos_documentoId_receberTituloId_key" ON "documentos_vinculos"("documentoId", "receberTituloId");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_vinculos_documentoId_carteiraId_key" ON "documentos_vinculos"("documentoId", "carteiraId");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_vinculos_documentoId_movimentacaoId_key" ON "documentos_vinculos"("documentoId", "movimentacaoId");

-- AddForeignKey
ALTER TABLE "documentos_gastos" ADD CONSTRAINT "documentos_gastos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documentos_gastos" ADD CONSTRAINT "documentos_gastos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documentos_gastos" ADD CONSTRAINT "documentos_gastos_ownerAdminUserId_fkey" FOREIGN KEY ("ownerAdminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documentos_gastos" ADD CONSTRAINT "documentos_gastos_criadoPorAdminUserId_fkey" FOREIGN KEY ("criadoPorAdminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documentos_vinculos" ADD CONSTRAINT "documentos_vinculos_documentoId_perfilId_fkey" FOREIGN KEY ("documentoId", "perfilId") REFERENCES "documentos_gastos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documentos_vinculos" ADD CONSTRAINT "documentos_vinculos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documentos_vinculos" ADD CONSTRAINT "documentos_vinculos_pagarTituloId_fkey" FOREIGN KEY ("pagarTituloId") REFERENCES "contas_pagar_titulos"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documentos_vinculos" ADD CONSTRAINT "documentos_vinculos_receberTituloId_fkey" FOREIGN KEY ("receberTituloId") REFERENCES "contas_receber_titulos"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documentos_vinculos" ADD CONSTRAINT "documentos_vinculos_carteiraId_fkey" FOREIGN KEY ("carteiraId") REFERENCES "carteiras_financeiras"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documentos_vinculos" ADD CONSTRAINT "documentos_vinculos_movimentacaoId_fkey" FOREIGN KEY ("movimentacaoId") REFERENCES "movimentacoes_financeiras"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- G003: escopo privado explícito; nenhum backfill, DML ou nova política pública.
ALTER TABLE "documentos_gastos" ADD CONSTRAINT "documentos_gastos_metadados_check" CHECK (
  "bytes" > 0 AND "bytes" <= 10485760
  AND "sha256" ~ '^[0-9a-f]{64}$'
  AND "mime" IN ('application/pdf', 'image/png', 'image/jpeg', 'text/plain')
  AND "proveniencia" IN ('FIXTURE', 'UPLOAD_INTERNO')
  AND length("nomeArquivo") BETWEEN 1 AND 180
  AND position('/' in "nomeArquivo") = 0 AND position(chr(92) in "nomeArquivo") = 0
  AND "nomeArquivo" !~ '[[:cntrl:]]'
  AND "versao" > 0 AND jsonb_typeof("historico") = 'array'
  AND "perfilId" ~ '^[a-zA-Z0-9_-]{1,191}$' AND "id" ~ '^[a-zA-Z0-9_-]{1,191}$'
  AND "storageRef" = 'gastos/v1/' || "perfilId" || '/' || "id"
);

ALTER TABLE "documentos_gastos" ADD CONSTRAINT "documentos_gastos_composicao_check" CHECK (
  ("storeId" IS NOT NULL AND "ownerAdminUserId" IS NULL)
  OR ("storeId" IS NULL AND "ownerAdminUserId" IS NOT NULL)
);
ALTER TABLE "documentos_vinculos" ADD CONSTRAINT "documentos_vinculos_alvo_unico_check" CHECK (
  num_nonnulls("pagarTituloId", "receberTituloId", "carteiraId", "movimentacaoId") = 1
);

CREATE FUNCTION gastos_documento_validar() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE p record;
BEGIN
  SELECT * INTO p FROM "financeiro_perfis" WHERE "id" = NEW."perfilId";
  IF NOT FOUND OR p."storeId" IS DISTINCT FROM NEW."storeId"
    OR p."ownerAdminUserId" IS DISTINCT FROM NEW."ownerAdminUserId"
    OR (p."tipo" = 'PESSOAL' AND NEW."criadoPorAdminUserId" IS DISTINCT FROM p."ownerAdminUserId") THEN
    RAISE EXCEPTION 'Documento indisponivel' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NOT p."ativo" THEN
    RAISE EXCEPTION 'Documento indisponivel' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW."id", NEW."perfilId", NEW."storeId", NEW."ownerAdminUserId", NEW."criadoPorAdminUserId",
      NEW."sha256", NEW."bytes", NEW."mime", NEW."storageRef", NEW."proveniencia", NEW."createdAt", NEW."nomeArquivo")
      IS DISTINCT FROM ROW(OLD."id", OLD."perfilId", OLD."storeId", OLD."ownerAdminUserId", OLD."criadoPorAdminUserId",
      OLD."sha256", OLD."bytes", OLD."mime", OLD."storageRef", OLD."proveniencia", OLD."createdAt", OLD."nomeArquivo") THEN
      RAISE EXCEPTION 'Identidade de documento imutavel' USING ERRCODE = '23514';
    END IF;
    IF NEW."versao" <> OLD."versao" + 1 OR jsonb_array_length(NEW."historico") <= jsonb_array_length(OLD."historico")
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(OLD."historico") WITH ORDINALITY AS h(evento, ordem)
        WHERE NEW."historico" -> (h.ordem - 1)::int IS DISTINCT FROM h.evento) THEN
      RAISE EXCEPTION 'Historico de documento obrigatorio' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gastos_documento_escopo BEFORE INSERT OR UPDATE ON "documentos_gastos"
FOR EACH ROW EXECUTE FUNCTION gastos_documento_validar();

CREATE FUNCTION gastos_documento_vinculo_validar() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE d record; r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Vinculo documental imutavel' USING ERRCODE = '23514';
  END IF;
  SELECT doc.* INTO d FROM "documentos_gastos" doc
    JOIN "financeiro_perfis" p ON p."id" = doc."perfilId" AND p."ativo"
    WHERE doc."id" = NEW."documentoId" FOR UPDATE OF doc;
  IF NOT FOUND OR d."perfilId" IS DISTINCT FROM NEW."perfilId" OR d."storeId" IS DISTINCT FROM NEW."storeId"
    OR d."estado" = 'QUARENTENA' THEN
    RAISE EXCEPTION 'Documento indisponivel' USING ERRCODE = '23514';
  END IF;
  IF NEW."pagarTituloId" IS NOT NULL THEN
    SELECT "id", "storeId", "perfilId", "ativo" INTO r FROM "contas_pagar_titulos" WHERE "id" = NEW."pagarTituloId";
  ELSIF NEW."receberTituloId" IS NOT NULL THEN
    SELECT "id", "storeId", "perfilId", "ativo" INTO r FROM "contas_receber_titulos" WHERE "id" = NEW."receberTituloId";
  ELSIF NEW."carteiraId" IS NOT NULL THEN
    SELECT "id", "storeId", "perfilId", "ativo" INTO r FROM "carteiras_financeiras" WHERE "id" = NEW."carteiraId";
  ELSIF NEW."movimentacaoId" IS NOT NULL THEN
    SELECT "id", "storeId", "perfilId", true AS "ativo" INTO r FROM "movimentacoes_financeiras" WHERE "id" = NEW."movimentacaoId";
  ELSE
    RAISE EXCEPTION 'Vinculo documental invalido' USING ERRCODE = '23514';
  END IF;
  IF NOT FOUND OR NOT r."ativo" OR r."storeId" IS DISTINCT FROM NEW."storeId"
    OR NOT (r."perfilId" IS NOT DISTINCT FROM NEW."perfilId" OR (r."perfilId" IS NULL AND NEW."storeId" IS NOT NULL)) THEN
    RAISE EXCEPTION 'Vinculo documental invalido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gastos_documento_vinculo_escopo BEFORE INSERT OR UPDATE ON "documentos_vinculos"
FOR EACH ROW EXECUTE FUNCTION gastos_documento_vinculo_validar();

-- Padrão fechado G001/G002. Não owner sem política não lê/escreve; owner tem semântica distinta.
ALTER TABLE "documentos_gastos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documentos_vinculos" ENABLE ROW LEVEL SECURITY;
