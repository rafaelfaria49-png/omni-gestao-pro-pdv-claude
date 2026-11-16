-- OMNI-VESTUARIO-P02-PERSISTENCIA-GRADES-CATALOGO-001
-- ADITIVA. Cria 5 tabelas novas (grades, tamanhos, cores, produto com grade, variantes), um índice único
-- novo em "estoque_produtos" ("id","storeId") e triggers de integridade. Sem DROP, sem TRUNCATE, sem
-- ALTER de coluna existente, sem backfill: nenhum produto legado vira produto com grade e nenhum saldo muda.
-- NÃO aplicar em Production sem autorização específica. Ordem futura: docs/vestuario/P02_DEPLOY_E_ROLLBACK.md
--
-- Locks: o CREATE UNIQUE INDEX em "estoque_produtos" toma SHARE (bloqueia escritas, não leituras) pelo tempo
-- do build do índice; "id" já é PK, então não há duplicata possível e o índice tem ~o tamanho da PK.
-- O trigger em "estoque_produtos" só age quando sku/barcode é informado/alterado (custo: 1 advisory lock
-- COMPARTILHADO por loja — não serializa cadastros legados entre si — + 1 lookup indexado em "vestuario_variantes").
-- Reversão operacional: docs/vestuario/rollback_20261115120000_vestuario_p02_grades_catalogo.sql

-- CreateTable
CREATE TABLE "vestuario_grades" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeKey" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vestuario_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vestuario_grade_tamanhos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "rotuloKey" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vestuario_grade_tamanhos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vestuario_cores" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeKey" TEXT NOT NULL,
    "hex" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vestuario_cores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vestuario_produtos_grade" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "catalogVersion" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vestuario_produtos_grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vestuario_variantes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "corId" TEXT NOT NULL,
    "tamanhoId" TEXT NOT NULL,
    "sku" TEXT,
    "barcodeInterno" TEXT,
    "precoCentavos" INTEGER,
    "custoMicros" BIGINT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vestuario_variantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_grades_storeId_id_key" ON "vestuario_grades"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_grades_storeId_nomeKey_key" ON "vestuario_grades"("storeId", "nomeKey");

-- CreateIndex
CREATE INDEX "vestuario_grade_tamanhos_storeId_gradeId_ordem_idx" ON "vestuario_grade_tamanhos"("storeId", "gradeId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_grade_tamanhos_storeId_gradeId_id_key" ON "vestuario_grade_tamanhos"("storeId", "gradeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_grade_tamanhos_storeId_gradeId_rotuloKey_key" ON "vestuario_grade_tamanhos"("storeId", "gradeId", "rotuloKey");

-- CreateIndex
CREATE INDEX "vestuario_cores_storeId_ativo_ordem_idx" ON "vestuario_cores"("storeId", "ativo", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_cores_storeId_id_key" ON "vestuario_cores"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_cores_storeId_nomeKey_key" ON "vestuario_cores"("storeId", "nomeKey");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_produtos_grade_produtoId_key" ON "vestuario_produtos_grade"("produtoId");

-- CreateIndex
CREATE INDEX "vestuario_produtos_grade_storeId_gradeId_idx" ON "vestuario_produtos_grade"("storeId", "gradeId");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_produtos_grade_produtoId_storeId_key" ON "vestuario_produtos_grade"("produtoId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_produtos_grade_storeId_produtoId_gradeId_key" ON "vestuario_produtos_grade"("storeId", "produtoId", "gradeId");

-- CreateIndex
CREATE INDEX "vestuario_variantes_storeId_produtoId_ativo_idx" ON "vestuario_variantes"("storeId", "produtoId", "ativo");

-- CreateIndex
CREATE INDEX "vestuario_variantes_storeId_corId_idx" ON "vestuario_variantes"("storeId", "corId");

-- CreateIndex
CREATE INDEX "vestuario_variantes_storeId_gradeId_tamanhoId_idx" ON "vestuario_variantes"("storeId", "gradeId", "tamanhoId");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_variantes_storeId_produtoId_corId_tamanhoId_key" ON "vestuario_variantes"("storeId", "produtoId", "corId", "tamanhoId");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_variantes_storeId_sku_key" ON "vestuario_variantes"("storeId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "vestuario_variantes_storeId_barcodeInterno_key" ON "vestuario_variantes"("storeId", "barcodeInterno");

-- CreateIndex
CREATE UNIQUE INDEX "estoque_produtos_id_storeId_key" ON "estoque_produtos"("id", "storeId");

-- AddForeignKey
ALTER TABLE "vestuario_grades" ADD CONSTRAINT "vestuario_grades_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vestuario_grade_tamanhos" ADD CONSTRAINT "vestuario_grade_tamanhos_storeId_gradeId_fkey" FOREIGN KEY ("storeId", "gradeId") REFERENCES "vestuario_grades"("storeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vestuario_cores" ADD CONSTRAINT "vestuario_cores_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vestuario_produtos_grade" ADD CONSTRAINT "vestuario_produtos_grade_produtoId_storeId_fkey" FOREIGN KEY ("produtoId", "storeId") REFERENCES "estoque_produtos"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vestuario_produtos_grade" ADD CONSTRAINT "vestuario_produtos_grade_storeId_gradeId_fkey" FOREIGN KEY ("storeId", "gradeId") REFERENCES "vestuario_grades"("storeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vestuario_variantes" ADD CONSTRAINT "vestuario_variantes_storeId_produtoId_gradeId_fkey" FOREIGN KEY ("storeId", "produtoId", "gradeId") REFERENCES "vestuario_produtos_grade"("storeId", "produtoId", "gradeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vestuario_variantes" ADD CONSTRAINT "vestuario_variantes_storeId_corId_fkey" FOREIGN KEY ("storeId", "corId") REFERENCES "vestuario_cores"("storeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vestuario_variantes" ADD CONSTRAINT "vestuario_variantes_storeId_gradeId_tamanhoId_fkey" FOREIGN KEY ("storeId", "gradeId", "tamanhoId") REFERENCES "vestuario_grade_tamanhos"("storeId", "gradeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Integridade de domínio (fora do modelo Prisma). Idempotente (DO/IF NOT EXISTS, CREATE OR REPLACE).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vestuario_grades_nome_check') THEN
    ALTER TABLE "vestuario_grades" ADD CONSTRAINT "vestuario_grades_nome_check"
      CHECK (char_length("nome") BETWEEN 1 AND 60 AND "nome" = btrim("nome") AND char_length("nomeKey") BETWEEN 1 AND 60 AND "version" >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vestuario_grade_tamanhos_rotulo_check') THEN
    ALTER TABLE "vestuario_grade_tamanhos" ADD CONSTRAINT "vestuario_grade_tamanhos_rotulo_check"
      CHECK (char_length("rotulo") BETWEEN 1 AND 20 AND "rotulo" = btrim("rotulo") AND char_length("rotuloKey") BETWEEN 1 AND 20 AND "ordem" BETWEEN 0 AND 10000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vestuario_cores_nome_check') THEN
    ALTER TABLE "vestuario_cores" ADD CONSTRAINT "vestuario_cores_nome_check"
      CHECK (char_length("nome") BETWEEN 1 AND 60 AND "nome" = btrim("nome") AND char_length("nomeKey") BETWEEN 1 AND 60
        AND ("hex" IS NULL OR "hex" ~ '^#[0-9A-F]{6}$') AND "ordem" BETWEEN 0 AND 10000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vestuario_produtos_grade_version_check') THEN
    ALTER TABLE "vestuario_produtos_grade" ADD CONSTRAINT "vestuario_produtos_grade_version_check" CHECK ("catalogVersion" >= 1);
  END IF;
  -- SKU e código interno gravados normalizados: maiúsculas, sem espaço, ASCII imprimível (Code 128).
  -- Código interno NUNCA é GTIN; geração/impressão é da P03 e nada aqui o fabrica.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vestuario_variantes_identificadores_check') THEN
    ALTER TABLE "vestuario_variantes" ADD CONSTRAINT "vestuario_variantes_identificadores_check"
      CHECK (("sku" IS NULL OR "sku" ~ '^[A-Z0-9][A-Z0-9._/-]{0,59}$')
        AND ("barcodeInterno" IS NULL OR ("barcodeInterno" ~ '^[!-~]{1,48}$' AND "barcodeInterno" = upper("barcodeInterno"))));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vestuario_variantes_valores_check') THEN
    ALTER TABLE "vestuario_variantes" ADD CONSTRAINT "vestuario_variantes_valores_check"
      CHECK (("precoCentavos" IS NULL OR "precoCentavos" >= 0)
        AND ("custoMicros" IS NULL OR "custoMicros" BETWEEN 0 AND 9007199254740991) AND "version" >= 1);
  END IF;
END $$;

-- Lock de identificadores por loja (mesma chave nos dois lados, liberado no fim da transação):
-- EXCLUSIVO para quem grava código de variação; COMPARTILHADO para produtos (legado × legado não se bloqueia).
-- Assim variação × produto nunca passam juntos sem que um enxergue o outro já commitado.
CREATE OR REPLACE FUNCTION "vestuario_ident_lock"(p_store TEXT) RETURNS void LANGUAGE sql AS $fn$
  SELECT pg_advisory_xact_lock(hashtextextended('omni.vestuario.ident:' || p_store, 0));
$fn$;
CREATE OR REPLACE FUNCTION "vestuario_ident_lock_shared"(p_store TEXT) RETURNS void LANGUAGE sql AS $fn$
  SELECT pg_advisory_xact_lock_shared(hashtextextended('omni.vestuario.ident:' || p_store, 0));
$fn$;

-- Identidade: loja/produto/grade (e cor/tamanho na variante) imutáveis; variante e vínculo produto-grade
-- nunca são apagados (desativar é a única saída — histórico futuro de venda/estoque depende deles).
CREATE OR REPLACE FUNCTION "vestuario_identidade_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VESTUARIO_EXCLUSAO_PROIBIDA: % não pode ser excluído; desative o registro.', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  IF to_jsonb(NEW)->>'id' IS DISTINCT FROM to_jsonb(OLD)->>'id'
     OR NEW."storeId" IS DISTINCT FROM OLD."storeId" OR NEW."produtoId" IS DISTINCT FROM OLD."produtoId"
     OR NEW."gradeId" IS DISTINCT FROM OLD."gradeId"
     OR to_jsonb(NEW)->>'corId' IS DISTINCT FROM to_jsonb(OLD)->>'corId'
     OR to_jsonb(NEW)->>'tamanhoId' IS DISTINCT FROM to_jsonb(OLD)->>'tamanhoId' THEN
    RAISE EXCEPTION 'VESTUARIO_IDENTIDADE_IMUTAVEL: id, loja, produto, grade, cor e tamanho não mudam após a criação.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE OR REPLACE TRIGGER "vestuario_variantes_identidade_trg" BEFORE UPDATE OR DELETE ON "vestuario_variantes"
  FOR EACH ROW EXECUTE FUNCTION "vestuario_identidade_imutavel"();
CREATE OR REPLACE TRIGGER "vestuario_produtos_grade_identidade_trg" BEFORE UPDATE OR DELETE ON "vestuario_produtos_grade"
  FOR EACH ROW EXECUTE FUNCTION "vestuario_identidade_imutavel"();

-- Tamanho: grade/loja imutáveis; rótulo já vinculado a variante não é reescrito para representar outro tamanho.
CREATE OR REPLACE FUNCTION "vestuario_tamanhos_identidade"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."storeId" IS DISTINCT FROM OLD."storeId" OR NEW."gradeId" IS DISTINCT FROM OLD."gradeId" THEN
    RAISE EXCEPTION 'VESTUARIO_IDENTIDADE_IMUTAVEL: o tamanho não muda de grade ou loja.' USING ERRCODE = '23514';
  END IF;
  IF NEW."rotuloKey" IS DISTINCT FROM OLD."rotuloKey" AND EXISTS (
       SELECT 1 FROM "vestuario_variantes" v
       WHERE v."storeId" = OLD."storeId" AND v."gradeId" = OLD."gradeId" AND v."tamanhoId" = OLD."id") THEN
    RAISE EXCEPTION 'VESTUARIO_TAMANHO_EM_USO: tamanho vinculado a variações não pode ser renomeado; crie outro e desative este.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE OR REPLACE TRIGGER "vestuario_tamanhos_identidade_trg" BEFORE UPDATE ON "vestuario_grade_tamanhos"
  FOR EACH ROW EXECUTE FUNCTION "vestuario_tamanhos_identidade"();

-- Colisão de identificadores na mesma loja, autoritativa no banco (todos os writers, inclusive legados):
-- variante.sku/barcodeInterno × produto.sku/barcode (comparados por upper(btrim())) e sku × barcodeInterno
-- entre variantes diferentes. Valores iguais na MESMA coluna da variante já são barrados pelos uniques.
-- Lado da variação: trigger POR INSTRUÇÃO com transition table — um único hash join por comando (incluir centenas
-- de variações não varre os produtos da loja uma vez por linha). Lock EXCLUSIVO das lojas tocadas, em ordem,
-- antes de conferir; as linhas novas já estão visíveis para a própria transação.
CREATE OR REPLACE FUNCTION "vestuario_variantes_colisao_check"(p_ids TEXT[], p_stores TEXT[], p_codes TEXT[])
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE s TEXT; codes TEXT[];
BEGIN
  FOR s IN SELECT DISTINCT x FROM unnest(p_stores) x ORDER BY 1 LOOP
    PERFORM "vestuario_ident_lock"(s);
  END LOOP;
  FOR s IN SELECT DISTINCT x FROM unnest(p_stores) x ORDER BY 1 LOOP
    SELECT array_agg(DISTINCT t.code) INTO codes FROM unnest(p_stores, p_codes) AS t(store, code) WHERE t.store = s;
    -- Uma única varredura dos produtos da loja (índice storeId), comparando contra o array de códigos.
    IF EXISTS (SELECT 1 FROM "estoque_produtos" p WHERE p."storeId" = s
               AND (upper(btrim(p."sku")) = ANY(codes) OR upper(btrim(p."barcode")) = ANY(codes))) THEN
      RAISE EXCEPTION 'VESTUARIO_IDENTIFICADOR_DUPLICADO: código já usado por um produto desta loja.' USING ERRCODE = '23505';
    END IF;
    -- Outras variações (uniques (storeId, sku) e (storeId, barcodeInterno)); a própria linha pode repetir o código.
    IF EXISTS (SELECT 1 FROM unnest(p_ids, p_stores, p_codes) AS k(id, store, code)
               JOIN "vestuario_variantes" v ON v."storeId" = s AND (v."sku" = k.code OR v."barcodeInterno" = k.code)
               WHERE k.store = s AND v."id" <> k.id) THEN
      RAISE EXCEPTION 'VESTUARIO_IDENTIFICADOR_DUPLICADO: código já usado por outra variação desta loja.' USING ERRCODE = '23505';
    END IF;
  END LOOP;
END $fn$;

CREATE OR REPLACE FUNCTION "vestuario_variantes_colisao_ins"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE ids TEXT[]; stores TEXT[]; codes TEXT[];
BEGIN
  SELECT array_agg(n."id"), array_agg(n."storeId"), array_agg(x) INTO ids, stores, codes
    FROM novas n CROSS JOIN LATERAL unnest(ARRAY[n."sku", n."barcodeInterno"]) x WHERE x IS NOT NULL;
  IF codes IS NOT NULL THEN PERFORM "vestuario_variantes_colisao_check"(ids, stores, codes); END IF;
  RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION "vestuario_variantes_colisao_upd"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE ids TEXT[]; stores TEXT[]; codes TEXT[];
BEGIN
  -- Só os códigos que mudaram: atualizar preço/ativo não confere nem trava nada.
  SELECT array_agg(n."id"), array_agg(n."storeId"), array_agg(x) INTO ids, stores, codes
    FROM novas n JOIN antigas o ON o."id" = n."id"
    CROSS JOIN LATERAL unnest(ARRAY[
      CASE WHEN n."sku" IS DISTINCT FROM o."sku" THEN n."sku" END,
      CASE WHEN n."barcodeInterno" IS DISTINCT FROM o."barcodeInterno" THEN n."barcodeInterno" END]) x
    WHERE x IS NOT NULL;
  IF codes IS NOT NULL THEN PERFORM "vestuario_variantes_colisao_check"(ids, stores, codes); END IF;
  RETURN NULL;
END $fn$;

CREATE OR REPLACE TRIGGER "vestuario_variantes_colisao_ins_trg" AFTER INSERT ON "vestuario_variantes"
  REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION "vestuario_variantes_colisao_ins"();
CREATE OR REPLACE TRIGGER "vestuario_variantes_colisao_upd_trg" AFTER UPDATE ON "vestuario_variantes"
  REFERENCING OLD TABLE AS antigas NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION "vestuario_variantes_colisao_upd"();

CREATE OR REPLACE FUNCTION "vestuario_produtos_colisao"() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE keys TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."sku" IS NOT DISTINCT FROM OLD."sku" AND NEW."barcode" IS NOT DISTINCT FROM OLD."barcode"
     AND NEW."storeId" IS NOT DISTINCT FROM OLD."storeId" THEN
    RETURN NEW;
  END IF;
  keys := array_remove(ARRAY[NULLIF(upper(btrim(NEW."sku")), ''), NULLIF(upper(btrim(NEW."barcode")), '')], NULL);
  IF cardinality(keys) = 0 THEN RETURN NEW; END IF;
  PERFORM "vestuario_ident_lock_shared"(NEW."storeId");
  IF EXISTS (SELECT 1 FROM "vestuario_variantes" v WHERE v."storeId" = NEW."storeId"
             AND (v."sku" = ANY(keys) OR v."barcodeInterno" = ANY(keys))) THEN
    RAISE EXCEPTION 'VESTUARIO_IDENTIFICADOR_DUPLICADO: código já usado por uma variação (cor/tamanho) desta loja.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $fn$;
CREATE OR REPLACE TRIGGER "vestuario_produtos_colisao_trg" BEFORE INSERT OR UPDATE OF "sku", "barcode", "storeId" ON "estoque_produtos"
  FOR EACH ROW EXECUTE FUNCTION "vestuario_produtos_colisao"();
