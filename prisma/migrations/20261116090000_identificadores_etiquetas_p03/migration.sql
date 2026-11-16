-- CreateTable
CREATE TABLE "identificadores_produto" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "varianteId" TEXT,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "formato" TEXT,
    "origem" TEXT NOT NULL,
    "evidencia" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identificadores_produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identificador_chaves" (
    "storeId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "varianteId" TEXT,
    "identificadorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identificador_chaves_pkey" PRIMARY KEY ("storeId","chave")
);

-- CreateTable
CREATE TABLE "etiqueta_lotes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "originalId" TEXT,
    "motivo" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etiqueta_lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiqueta_tentativas" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'SOLICITADO',
    "createdBy" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etiqueta_tentativas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identificacao_solicitacoes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "operacao" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "identificadorId" TEXT,
    "loteId" TEXT,
    "tentativaId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identificacao_solicitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identificadores_produto_storeId_produtoId_varianteId_idx" ON "identificadores_produto"("storeId", "produtoId", "varianteId");

-- CreateIndex
CREATE UNIQUE INDEX "identificadores_produto_id_storeId_key" ON "identificadores_produto"("id", "storeId");

-- CreateIndex
CREATE INDEX "identificador_chaves_identificadorId_idx" ON "identificador_chaves"("identificadorId");

-- CreateIndex
CREATE INDEX "identificador_chaves_storeId_produtoId_varianteId_idx" ON "identificador_chaves"("storeId", "produtoId", "varianteId");

-- CreateIndex
CREATE INDEX "etiqueta_lotes_storeId_createdAt_idx" ON "etiqueta_lotes"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "etiqueta_lotes_id_storeId_key" ON "etiqueta_lotes"("id", "storeId");

-- CreateIndex
CREATE INDEX "etiqueta_tentativas_storeId_loteId_idx" ON "etiqueta_tentativas"("storeId", "loteId");

-- CreateIndex
CREATE UNIQUE INDEX "etiqueta_tentativas_id_storeId_key" ON "etiqueta_tentativas"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "identificacao_solicitacoes_storeId_operacao_chave_key" ON "identificacao_solicitacoes"("storeId", "operacao", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_variantes_id_storeId_produtoId_key" ON "vestuario_variantes"("id", "storeId", "produtoId");

-- AddForeignKey
ALTER TABLE "identificadores_produto" ADD CONSTRAINT "identificadores_produto_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificadores_produto" ADD CONSTRAINT "identificadores_produto_produtoId_storeId_fkey" FOREIGN KEY ("produtoId", "storeId") REFERENCES "estoque_produtos"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificadores_produto" ADD CONSTRAINT "identificadores_produto_varianteId_storeId_produtoId_fkey" FOREIGN KEY ("varianteId", "storeId", "produtoId") REFERENCES "vestuario_variantes"("id", "storeId", "produtoId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificador_chaves" ADD CONSTRAINT "identificador_chaves_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificador_chaves" ADD CONSTRAINT "identificador_chaves_produtoId_storeId_fkey" FOREIGN KEY ("produtoId", "storeId") REFERENCES "estoque_produtos"("id", "storeId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificador_chaves" ADD CONSTRAINT "identificador_chaves_varianteId_storeId_produtoId_fkey" FOREIGN KEY ("varianteId", "storeId", "produtoId") REFERENCES "vestuario_variantes"("id", "storeId", "produtoId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificador_chaves" ADD CONSTRAINT "identificador_chaves_identificadorId_storeId_fkey" FOREIGN KEY ("identificadorId", "storeId") REFERENCES "identificadores_produto"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "etiqueta_lotes" ADD CONSTRAINT "etiqueta_lotes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "etiqueta_lotes" ADD CONSTRAINT "etiqueta_lotes_originalId_storeId_fkey" FOREIGN KEY ("originalId", "storeId") REFERENCES "etiqueta_lotes"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "etiqueta_tentativas" ADD CONSTRAINT "etiqueta_tentativas_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "etiqueta_tentativas" ADD CONSTRAINT "etiqueta_tentativas_loteId_storeId_fkey" FOREIGN KEY ("loteId", "storeId") REFERENCES "etiqueta_lotes"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificacao_solicitacoes" ADD CONSTRAINT "identificacao_solicitacoes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificacao_solicitacoes" ADD CONSTRAINT "identificacao_solicitacoes_identificadorId_storeId_fkey" FOREIGN KEY ("identificadorId", "storeId") REFERENCES "identificadores_produto"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificacao_solicitacoes" ADD CONSTRAINT "identificacao_solicitacoes_loteId_storeId_fkey" FOREIGN KEY ("loteId", "storeId") REFERENCES "etiqueta_lotes"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identificacao_solicitacoes" ADD CONSTRAINT "identificacao_solicitacoes_tentativaId_storeId_fkey" FOREIGN KEY ("tentativaId", "storeId") REFERENCES "etiqueta_tentativas"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- P03: extensão aditiva. Sem backfill, conversão de legado, saldo ou mudança em migrations anteriores.
-- Corpo SQL analisado na criação: dependências ligadas, inline de normalização pura e sem SET por linha.
CREATE FUNCTION p03_key(v text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN pg_catalog.translate(pg_catalog.btrim(coalesce(v,''), E' \t\n\r\f' || pg_catalog.chr(11)||pg_catalog.chr(160)||pg_catalog.chr(5760)||pg_catalog.chr(8192)||pg_catalog.chr(8193)||pg_catalog.chr(8194)||pg_catalog.chr(8195)||pg_catalog.chr(8196)||pg_catalog.chr(8197)||pg_catalog.chr(8198)||pg_catalog.chr(8199)||pg_catalog.chr(8200)||pg_catalog.chr(8201)||pg_catalog.chr(8202)||pg_catalog.chr(8232)||pg_catalog.chr(8233)||pg_catalog.chr(8239)||pg_catalog.chr(8287)||pg_catalog.chr(12288)||pg_catalog.chr(65279)), 'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ');
CREATE FUNCTION p03_product_keys(pid text, sku text, barcode text, meta jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public AS $fn$
 SELECT coalesce(array_agg(DISTINCT p03_key(v) ORDER BY p03_key(v)), ARRAY[]::text[]) FROM (
   SELECT unnest(ARRAY[pid,sku,barcode]) AS v UNION ALL
   SELECT t.value #>> '{}' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(meta->'codigosAlias')='array' THEN meta->'codigosAlias' ELSE '[]'::jsonb END) AS t(value) WHERE jsonb_typeof(t.value)='string'
 ) c WHERE p03_key(v)<>'';
$fn$;
CREATE FUNCTION p03_variant_keys(vid text, sku text, barcode text) RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public AS $fn$
 SELECT coalesce(array_agg(DISTINCT p03_key(v) ORDER BY p03_key(v)), ARRAY[]::text[]) FROM unnest(ARRAY[vid,sku,barcode]) c(v) WHERE p03_key(v)<>'';
$fn$;
CREATE INDEX "p03_produto_chaves_gin" ON "estoque_produtos" USING gin (p03_product_keys("id","sku","barcode","metadata"));
CREATE INDEX "p03_variante_chaves_gin" ON "vestuario_variantes" USING gin (p03_variant_keys("id","sku","barcodeInterno"));

CREATE FUNCTION p03_owners(sid text, k text) RETURNS TABLE(pid text, vid text) LANGUAGE sql VOLATILE SET search_path = pg_catalog, public AS $fn$
 SELECT p."id",NULL::text FROM "estoque_produtos" p WHERE p."storeId"=sid AND p03_product_keys(p."id",p."sku",p."barcode",p."metadata") @> ARRAY[k]
 UNION ALL
 SELECT v."produtoId",v."id" FROM "vestuario_variantes" v WHERE v."storeId"=sid AND p03_variant_keys(v."id",v."sku",v."barcodeInterno") @> ARRAY[k];
$fn$;
CREATE FUNCTION p03_gtin_valid(v text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, public AS $fn$
DECLARE n int; s int:=0; i int; mult int:=3;
BEGIN
 n:=length(v);
 IF n NOT IN (8,12,13,14) OR v !~ '^[0-9]+$' OR v ~ '^0+$' THEN RETURN false; END IF;
 IF (n=13 AND left(v,2) BETWEEN '20' AND '29') OR (n=14 AND left(v,1)='0' AND substr(v,2,2) BETWEEN '20' AND '29') THEN RETURN false; END IF;
 FOR i IN REVERSE n-1..1 LOOP s:=s+substr(v,i,1)::int*mult; mult:=4-mult; END LOOP;
 RETURN (10-s%10)%10=right(v,1)::int;
END $fn$;
CREATE FUNCTION p03_identifier_keys(tipo text, valor text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $fn$
 SELECT array_agg(DISTINCT k ORDER BY k) FROM unnest(CASE WHEN tipo='GTIN' THEN ARRAY[
   lpad(valor,14,'0'), CASE WHEN left(lpad(valor,14,'0'),1)='0' THEN right(lpad(valor,14,'0'),13) END,
   CASE WHEN left(lpad(valor,14,'0'),2)='00' THEN right(lpad(valor,14,'0'),12) END,
   CASE WHEN left(lpad(valor,14,'0'),6)='000000' THEN right(lpad(valor,14,'0'),8) END
 ] ELSE ARRAY[p03_key(valor)] END) t(k) WHERE k IS NOT NULL AND k<>'';
$fn$;

ALTER TABLE "identificadores_produto" ADD CONSTRAINT "p03_identificador_check" CHECK (
 "tipo" IN ('INTERNO','GTIN','ALIAS') AND "version">0 AND length("createdBy")>0 AND length("evidencia") BETWEEN 3 AND 500
 AND length("valor") BETWEEN 1 AND 100 AND "valor"=btrim("valor") AND "valor" ~ '^[ -~]+$'
 AND ("tipo"<>'INTERNO' OR ("valor" ~ '^OGV-[0-9]{12}$' AND "formato" IS NOT DISTINCT FROM 'CODE128' AND "origem"='SISTEMA'))
 AND ("tipo"<>'GTIN' OR (p03_gtin_valid("valor") AND "origem" IN ('FABRICANTE','FORNECEDOR','MARCA') AND "formato" IS NOT NULL AND (length("valor"),"formato") IN ((8,'EAN-8'),(12,'UPC-A'),(13,'EAN-13'),(14,'GTIN-14'))))
);
CREATE UNIQUE INDEX "p03_interno_global_unique" ON "identificadores_produto"("valor") WHERE "tipo"='INTERNO';
CREATE UNIQUE INDEX "p03_interno_alvo_unique" ON "identificadores_produto"("storeId","produtoId",coalesce("varianteId",'')) WHERE "tipo"='INTERNO';
ALTER TABLE "etiqueta_lotes" ADD CONSTRAINT "p03_lote_check" CHECK ("total" BETWEEN 1 AND 500 AND length("createdBy")>0 AND ("originalId" IS NULL OR length(btrim("motivo")) BETWEEN 3 AND 300));
ALTER TABLE "etiqueta_tentativas" ADD CONSTRAINT "p03_tentativa_check" CHECK ("estado" IN ('SOLICITADO','RESULTADO_DESCONHECIDO','FALHA_ANTES_ENVIO','CONFIRMADO_MANUAL') AND length("createdBy")>0 AND (("estado"='CONFIRMADO_MANUAL' AND coalesce(length("confirmedBy"),0)>0) OR ("estado"<>'CONFIRMADO_MANUAL' AND "confirmedBy" IS NULL)));
CREATE UNIQUE INDEX "p03_envio_unico_por_lote" ON "etiqueta_tentativas"("storeId","loteId") WHERE "estado"<>'FALHA_ANTES_ENVIO';
ALTER TABLE "identificacao_solicitacoes" ADD CONSTRAINT "p03_solicitacao_check" CHECK (
 "hash" ~ '^[0-9a-f]{64}$' AND length("chave") BETWEEN 8 AND 100 AND length("createdBy")>0 AND num_nonnulls("identificadorId","loteId","tentativaId")=1
 AND (("operacao" IN ('INTERNO','CADASTRAR','ATIVO') AND "identificadorId" IS NOT NULL) OR ("operacao" IN ('LOTE','REIMPRIMIR') AND "loteId" IS NOT NULL) OR ("operacao" IN ('TENTATIVA','EVENTO') AND "tentativaId" IS NOT NULL))
);

-- Reserva atômica comum a P03, SKU/barcode e aliases legados. Não classifica o legado como GTIN.
CREATE FUNCTION p03_claim(s_store text, s_key text, s_product text, s_variant text, s_identifier text) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE got text;
BEGIN
 IF s_key='' THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM p03_owners(s_store,s_key) o WHERE o.pid<>s_product OR o.vid IS DISTINCT FROM s_variant) THEN
  RAISE EXCEPTION 'VESTUARIO_IDENTIFICADOR_DUPLICADO: código em outro alvo da loja.' USING ERRCODE='23505';
 END IF;
 INSERT INTO "identificador_chaves" AS c ("storeId","chave","produtoId","varianteId","identificadorId") VALUES(s_store,s_key,s_product,s_variant,s_identifier)
 ON CONFLICT ("storeId","chave") DO UPDATE SET "identificadorId"=coalesce(c."identificadorId",EXCLUDED."identificadorId")
 WHERE c."produtoId"=EXCLUDED."produtoId" AND c."varianteId" IS NOT DISTINCT FROM EXCLUDED."varianteId"
 AND (c."identificadorId" IS NULL OR EXCLUDED."identificadorId" IS NULL OR c."identificadorId"=EXCLUDED."identificadorId")
 RETURNING "chave" INTO got;
 IF got IS NULL THEN RAISE EXCEPTION 'VESTUARIO_IDENTIFICADOR_DUPLICADO: código reservado na loja.' USING ERRCODE='23505'; END IF;
END $fn$;

CREATE FUNCTION p03_key_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE r "identificadores_produto"%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."identificadorId" IS NOT NULL OR EXISTS(SELECT 1 FROM p03_owners(OLD."storeId",OLD."chave") o WHERE o.pid=OLD."produtoId" AND o.vid IS NOT DISTINCT FROM OLD."varianteId") THEN
   RAISE EXCEPTION 'P03_RESERVA_PERMANENTE: a chave ainda está reservada.' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 IF NEW."chave"='' OR NEW."chave"<>p03_key(NEW."chave") THEN RAISE EXCEPTION 'P03_CHAVE_INVALIDA' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW."storeId"<>OLD."storeId" OR NEW."chave"<>OLD."chave" OR NEW."produtoId"<>OLD."produtoId" OR NEW."varianteId" IS DISTINCT FROM OLD."varianteId" OR (OLD."identificadorId" IS NOT NULL AND NEW."identificadorId" IS DISTINCT FROM OLD."identificadorId")) THEN
  RAISE EXCEPTION 'P03_RESERVA_PERMANENTE: alvo/chave imutáveis.' USING ERRCODE='23514';
 END IF;
 IF NEW."identificadorId" IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM p03_owners(NEW."storeId",NEW."chave") o WHERE o.pid=NEW."produtoId" AND o.vid IS NOT DISTINCT FROM NEW."varianteId") THEN RAISE EXCEPTION 'P03_FONTE_CORRENTE_AUSENTE' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO r FROM "identificadores_produto" WHERE "id"=NEW."identificadorId" AND "storeId"=NEW."storeId";
  IF NOT FOUND OR r."produtoId"<>NEW."produtoId" OR r."varianteId" IS DISTINCT FROM NEW."varianteId" OR NOT(NEW."chave"=ANY(p03_identifier_keys(r."tipo",r."valor"))) THEN RAISE EXCEPTION 'P03_CHAVE_ALVO_INVALIDO' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER "p03_key_guard_trg" BEFORE INSERT OR UPDATE OR DELETE ON "identificador_chaves" FOR EACH ROW EXECUTE FUNCTION p03_key_guard();

CREATE FUNCTION p03_legacy_keys() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE oldkeys text[]:=ARRAY[]::text[]; newkeys text[]; k text; pid text; vid text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW."id"<>OLD."id" OR NEW."storeId"<>OLD."storeId") THEN RAISE EXCEPTION 'P03_IDENTIDADE_LOJA_IMUTAVEL' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='estoque_produtos' THEN
  newkeys:=p03_product_keys(NEW."id",NEW."sku",NEW."barcode",NEW."metadata"); pid:=NEW."id"; vid:=NULL;
  IF TG_OP='UPDATE' THEN oldkeys:=p03_product_keys(OLD."id",OLD."sku",OLD."barcode",OLD."metadata"); END IF;
 ELSE
  newkeys:=p03_variant_keys(NEW."id",NEW."sku",NEW."barcodeInterno"); pid:=NEW."produtoId"; vid:=NEW."id";
  IF TG_OP='UPDATE' THEN oldkeys:=p03_variant_keys(OLD."id",OLD."sku",OLD."barcodeInterno"); END IF;
 END IF;
 IF newkeys IS NOT DISTINCT FROM oldkeys THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='estoque_produtos' THEN PERFORM "vestuario_ident_lock_shared"(NEW."storeId"); ELSE PERFORM "vestuario_ident_lock"(NEW."storeId"); END IF;
 FOREACH k IN ARRAY newkeys LOOP
  IF NOT(k=ANY(oldkeys)) THEN PERFORM p03_claim(NEW."storeId",k,pid,vid,NULL); END IF;
 END LOOP;
 FOREACH k IN ARRAY oldkeys LOOP
  IF NOT(k=ANY(newkeys)) THEN DELETE FROM "identificador_chaves" WHERE "storeId"=NEW."storeId" AND "chave"=k AND "produtoId"=pid AND "varianteId" IS NOT DISTINCT FROM vid AND "identificadorId" IS NULL; END IF;
 END LOOP;
 RETURN NEW;
END $fn$;
CREATE TRIGGER "p03_produto_keys_trg" AFTER INSERT OR UPDATE ON "estoque_produtos" FOR EACH ROW EXECUTE FUNCTION p03_legacy_keys();
CREATE TRIGGER "p03_variante_keys_trg" AFTER INSERT OR UPDATE ON "vestuario_variantes" FOR EACH ROW EXECUTE FUNCTION p03_legacy_keys();

CREATE FUNCTION p03_identifier_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE p "estoque_produtos"%ROWTYPE; v "vestuario_variantes"%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'P03_IDENTIDADE_PERMANENTE' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."tipo"='ALIAS' AND NEW."tipo"='GTIN' AND OLD."ativo" AND NEW."ativo" THEN
   IF (to_jsonb(NEW)-ARRAY['tipo','formato','origem','evidencia','version','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['tipo','formato','origem','evidencia','version','updatedAt']) THEN RAISE EXCEPTION 'P03_IDENTIDADE_PERMANENTE' USING ERRCODE='23514'; END IF;
   PERFORM "vestuario_ident_lock"(NEW."storeId");
  ELSIF (to_jsonb(NEW)-ARRAY['ativo','version','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['ativo','version','updatedAt']) THEN RAISE EXCEPTION 'P03_IDENTIDADE_PERMANENTE' USING ERRCODE='23514'; END IF;
  IF NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'P03_VERSAO_INVALIDA' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 PERFORM "vestuario_ident_lock"(NEW."storeId");
 SELECT * INTO p FROM "estoque_produtos" WHERE "id"=NEW."produtoId" AND "storeId"=NEW."storeId" FOR SHARE;
 IF NOT FOUND OR NOT p."active" THEN RAISE EXCEPTION 'P03_ALVO_INATIVO_OU_AUSENTE' USING ERRCODE='23514'; END IF;
 IF NEW."varianteId" IS NULL THEN
  IF EXISTS(SELECT 1 FROM "vestuario_produtos_grade" WHERE "produtoId"=p."id" AND "storeId"=p."storeId") OR (p."metadata"->'vestuario'->>'contract'='omni.vestuario.catalog' AND (p."metadata"->'vestuario'->>'version' IS DISTINCT FROM '1' OR p."metadata"->'vestuario'->>'mode' IS DISTINCT FROM 'SIMPLES')) THEN RAISE EXCEPTION 'VARIANTE_OBRIGATORIA' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO v FROM "vestuario_variantes" WHERE "id"=NEW."varianteId" AND "storeId"=NEW."storeId" AND "produtoId"=NEW."produtoId" FOR SHARE;
  IF NOT FOUND OR NOT v."ativo" THEN RAISE EXCEPTION 'P03_ALVO_INATIVO_OU_AUSENTE' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER "p03_identifier_guard_trg" BEFORE INSERT OR UPDATE OR DELETE ON "identificadores_produto" FOR EACH ROW EXECUTE FUNCTION p03_identifier_guard();

CREATE FUNCTION p03_identifier_project() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE k text; oldcode text;
BEGIN
 FOREACH k IN ARRAY p03_identifier_keys(NEW."tipo",NEW."valor") LOOP PERFORM p03_claim(NEW."storeId",k,NEW."produtoId",NEW."varianteId",NEW."id"); END LOOP;
 IF NEW."tipo"='INTERNO' AND NEW."varianteId" IS NOT NULL THEN
  SELECT "barcodeInterno" INTO oldcode FROM "vestuario_variantes" WHERE "id"=NEW."varianteId" AND "storeId"=NEW."storeId";
  IF oldcode IS NOT NULL AND oldcode<>NEW."valor" AND NOT EXISTS(SELECT 1 FROM "identificador_chaves" c WHERE c."storeId"=NEW."storeId" AND c."chave"=p03_key(oldcode) AND c."produtoId"=NEW."produtoId" AND c."varianteId"=NEW."varianteId" AND c."identificadorId" IS NOT NULL) THEN RAISE EXCEPTION 'P03_CODIGO_EXISTENTE_NAO_PRESERVADO' USING ERRCODE='23514'; END IF;
  UPDATE "vestuario_variantes" SET "barcodeInterno"=NEW."valor", "version"="version"+1,"updatedAt"=now() WHERE "id"=NEW."varianteId" AND "storeId"=NEW."storeId";
  UPDATE "vestuario_produtos_grade" SET "catalogVersion"="catalogVersion"+1,"updatedAt"=now() WHERE "produtoId"=NEW."produtoId" AND "storeId"=NEW."storeId";
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER "p03_identifier_project_trg" AFTER INSERT ON "identificadores_produto" FOR EACH ROW EXECUTE FUNCTION p03_identifier_project();
CREATE TRIGGER "p03_identifier_promote_trg" AFTER UPDATE OF "tipo" ON "identificadores_produto" FOR EACH ROW WHEN (OLD."tipo" IS DISTINCT FROM NEW."tipo") EXECUTE FUNCTION p03_identifier_project();
CREATE FUNCTION p03_projection_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN
 IF NEW."barcodeInterno" IS DISTINCT FROM OLD."barcodeInterno" AND EXISTS(SELECT 1 FROM "identificadores_produto" i WHERE i."storeId"=OLD."storeId" AND i."varianteId"=OLD."id" AND i."tipo"='INTERNO' AND i."valor" IS DISTINCT FROM NEW."barcodeInterno") THEN
  RAISE EXCEPTION 'VESTUARIO_IDENTIDADE_IMUTAVEL: código P03 é projeção permanente.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER "p03_projection_guard_trg" BEFORE UPDATE ON "vestuario_variantes" FOR EACH ROW EXECUTE FUNCTION p03_projection_guard();

CREATE FUNCTION p03_immutable_row() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN RAISE EXCEPTION 'P03_REGISTRO_IMUTAVEL' USING ERRCODE='23514'; END $fn$;
CREATE TRIGGER "p03_request_immutable_trg" BEFORE UPDATE OR DELETE ON "identificacao_solicitacoes" FOR EACH ROW EXECUTE FUNCTION p03_immutable_row();
CREATE TRIGGER "p03_job_immutable_trg" BEFORE UPDATE OR DELETE ON "etiqueta_lotes" FOR EACH ROW EXECUTE FUNCTION p03_immutable_row();

-- A forma/limites também são verificados no banco para writers SQL, antes de renderizar.
CREATE FUNCTION p03_snapshot_valid(s jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $fn$
DECLARE m jsonb; i jsonb; q int; total int:=0; owners text[]:=ARRAY[]::text[]; ownerkey text;
BEGIN
 IF jsonb_typeof(s)<>'object' OR s->>'version' IS DISTINCT FROM '1' OR pg_column_size(s)>500000 OR jsonb_typeof(s->'items') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(s->'items') NOT BETWEEN 1 AND 50 OR coalesce(s->>'createdAt','') !~ '^\d{4}-\d\d-\d\dT' THEN RETURN false; END IF;
 m:=s->'media';
 IF jsonb_typeof(m) IS DISTINCT FROM 'object' OR jsonb_typeof(m->'showPrice') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
 IF coalesce((m->>'widthMm')::numeric,-1) NOT BETWEEN 50 AND 110 OR coalesce((m->>'heightMm')::numeric,-1) NOT BETWEEN 30 AND 80 OR coalesce((m->>'marginMm')::numeric,-1) NOT BETWEEN 2 AND 6 OR coalesce((m->>'barcodeHeightMm')::numeric,-1) NOT BETWEEN 7 AND 20 THEN RETURN false; END IF;
 IF (m->>'barcodeHeightMm')::numeric+2*(m->>'marginMm')::numeric+(CASE WHEN (m->>'showPrice')::boolean THEN 18 ELSE 15 END)>(m->>'heightMm')::numeric THEN RETURN false; END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(s->'items') LOOP
  IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR coalesce(length(i->>'nome'),0) NOT BETWEEN 1 AND 2000 OR coalesce(length(i->>'produtoId'),0) NOT BETWEEN 1 AND 160 OR coalesce(length(i->>'identificadorId'),0) NOT BETWEEN 1 AND 160 THEN RETURN false; END IF;
  IF coalesce(i->>'codigo','') !~ '^OGV-[0-9]{12}$' OR i->>'codigoInterno' IS DISTINCT FROM i->>'codigo' OR i->'codigoInternoAtivo' IS DISTINCT FROM 'true'::jsonb THEN RETURN false; END IF;
  IF coalesce(i->>'updatedAt','') !~ '^\d{4}-\d\d-\d\dT' OR (i->>'variantVersion' IS NOT NULL AND (i->>'variantVersion')::int<=0) THEN RETURN false; END IF;
  IF (m->>'showPrice')::boolean AND (i->>'precoCentavos' IS NULL OR (i->>'precoCentavos')::numeric NOT BETWEEN 0 AND 9007199254740991) THEN RETURN false; END IF;
  ownerkey:=jsonb_build_array(i->>'produtoId',i->>'varianteId')::text;
  IF ownerkey=ANY(owners) THEN RETURN false; END IF; owners:=array_append(owners,ownerkey);
  q:=(i->>'quantidade')::int;
  IF q IS NULL OR q NOT BETWEEN 1 AND 100 OR (i->>'quantidade')::numeric<>q THEN RETURN false; END IF;
  total:=total+q;
 END LOOP;
 RETURN total BETWEEN 1 AND 500 AND total IS NOT DISTINCT FROM (s->>'total')::int;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $fn$;
ALTER TABLE "etiqueta_lotes" ADD CONSTRAINT "p03_snapshot_check" CHECK (p03_snapshot_valid("snapshot"));
CREATE FUNCTION p03_job_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE item jsonb; r "identificadores_produto"%ROWTYPE; original jsonb; n int:=0; q int;
BEGIN
 PERFORM "vestuario_ident_lock"(NEW."storeId");
 IF NEW."snapshot"->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(NEW."snapshot"->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW."snapshot"->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'P03_SNAPSHOT_INVALIDO' USING ERRCODE='23514'; END IF;
 IF NEW."originalId" IS NOT NULL THEN
  SELECT "snapshot" INTO original FROM "etiqueta_lotes" WHERE "id"=NEW."originalId" AND "storeId"=NEW."storeId";
  IF NOT FOUND OR original IS DISTINCT FROM NEW."snapshot" THEN RAISE EXCEPTION 'P03_REIMPRESSAO_INVALIDA' USING ERRCODE='23514'; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW."snapshot"->'items') LOOP
  SELECT * INTO r FROM "identificadores_produto" WHERE "id"=item->>'identificadorId' AND "storeId"=NEW."storeId" FOR SHARE;
  IF NOT FOUND OR NOT r."ativo" OR r."tipo"<>'INTERNO' OR r."produtoId" IS DISTINCT FROM item->>'produtoId' OR r."varianteId" IS DISTINCT FROM item->>'varianteId' OR r."valor" IS DISTINCT FROM item->>'codigo' THEN RAISE EXCEPTION 'P03_SNAPSHOT_ALVO_INVALIDO' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM "estoque_produtos" WHERE "id"=r."produtoId" AND "storeId"=NEW."storeId" AND "active" FOR SHARE;
  IF NOT FOUND OR (r."varianteId" IS NULL AND EXISTS(SELECT 1 FROM "vestuario_produtos_grade" WHERE "produtoId"=r."produtoId" AND "storeId"=NEW."storeId")) THEN RAISE EXCEPTION 'P03_SNAPSHOT_ALVO_INVALIDO' USING ERRCODE='23514'; END IF;
  IF r."varianteId" IS NOT NULL THEN
   PERFORM 1 FROM "vestuario_variantes" WHERE "id"=r."varianteId" AND "storeId"=NEW."storeId" AND "produtoId"=r."produtoId" AND "ativo" FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'P03_SNAPSHOT_ALVO_INVALIDO' USING ERRCODE='23514'; END IF;
  END IF;
  q:=(item->>'quantidade')::int;
  IF q IS NULL OR q NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'P03_QUANTIDADE_INVALIDA' USING ERRCODE='23514'; END IF;
  n:=n+q;
 END LOOP;
 IF n<>NEW."total" OR (NEW."snapshot"->>'total')::int IS DISTINCT FROM n THEN RAISE EXCEPTION 'P03_TOTAL_INVALIDO' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER "p03_job_guard_trg" BEFORE INSERT ON "etiqueta_lotes" FOR EACH ROW EXECUTE FUNCTION p03_job_guard();

CREATE FUNCTION p03_attempt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'P03_TENTATIVA_IMUTAVEL' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."estado"<>'SOLICITADO' OR NEW."confirmedBy" IS NOT NULL THEN RAISE EXCEPTION 'P03_TRANSICAO_INVALIDA' USING ERRCODE='23514'; END IF;
  PERFORM "vestuario_ident_lock"(NEW."storeId");
  IF EXISTS(SELECT 1 FROM "etiqueta_tentativas" WHERE "storeId"=NEW."storeId" AND "loteId"=NEW."loteId" AND "estado"<>'FALHA_ANTES_ENVIO') THEN RAISE EXCEPTION 'P03_REIMPRESSAO_OBRIGATORIA' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['estado','confirmedBy','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['estado','confirmedBy','updatedAt']) THEN RAISE EXCEPTION 'P03_TENTATIVA_IMUTAVEL' USING ERRCODE='23514'; END IF;
 IF (OLD."estado" IN ('CONFIRMADO_MANUAL','FALHA_ANTES_ENVIO') AND NEW."estado"<>OLD."estado") OR (OLD."estado"='RESULTADO_DESCONHECIDO' AND NEW."estado" NOT IN ('RESULTADO_DESCONHECIDO','CONFIRMADO_MANUAL')) OR (OLD."estado"='CONFIRMADO_MANUAL' AND NEW."confirmedBy" IS DISTINCT FROM OLD."confirmedBy") THEN RAISE EXCEPTION 'P03_TRANSICAO_INVALIDA' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER "p03_attempt_guard_trg" BEFORE INSERT OR UPDATE OR DELETE ON "etiqueta_tentativas" FOR EACH ROW EXECUTE FUNCTION p03_attempt_guard();
