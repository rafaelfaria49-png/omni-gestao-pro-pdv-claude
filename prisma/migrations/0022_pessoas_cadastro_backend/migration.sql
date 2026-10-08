-- CreateTable
CREATE TABLE "dp_empregadores" (
    "id" TEXT NOT NULL,
    "storeGestoraId" TEXT NOT NULL,
    "tipoInscricao" VARCHAR(12) NOT NULL,
    "inscricao" VARCHAR(32) NOT NULL,
    "nome" VARCHAR(240) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
    "versaoAtual" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dp_empregadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_empregador_versoes" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "tipoInscricao" VARCHAR(12) NOT NULL,
    "inscricao" VARCHAR(32) NOT NULL,
    "nome" VARCHAR(240) NOT NULL,
    "endereco" JSONB,
    "regime" VARCHAR(80),
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "autorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "dp_empregador_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_estabelecimentos" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "tipoInscricao" VARCHAR(12) NOT NULL,
    "inscricao" VARCHAR(32) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
    "versaoAtual" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dp_estabelecimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_estabelecimento_versoes" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "nome" VARCHAR(240) NOT NULL,
    "endereco" JSONB,
    "lotacaoRef" VARCHAR(80),
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "autorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "dp_estabelecimento_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_unidades_vinculo" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "aprovadoPorId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "dp_unidades_vinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_acessos" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "capacidades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "concedidoPorId" TEXT NOT NULL,
    "concedidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogadoPorId" TEXT,
    "revogadoEm" TIMESTAMP(3),
    "motivo" TEXT NOT NULL,

    CONSTRAINT "dp_acessos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_pessoas" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "cpfCipher" TEXT,
    "cpfHash" VARCHAR(64),
    "versaoAtual" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dp_pessoas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_pessoa_versoes" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "nome" VARCHAR(240),
    "nascimento" DATE,
    "endereco" JSONB,
    "cpfCipher" TEXT,
    "cpfHash" VARCHAR(64),
    "validFrom" DATE,
    "validTo" DATE,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,
    "autorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "dp_pessoa_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_pessoa_usuarios" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "autorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dp_pessoa_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_pessoa_tecnicos" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "tecnicoId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "autorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dp_pessoa_tecnicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_vinculos" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "matricula" VARCHAR(64),
    "admissao" DATE,
    "termino" DATE,
    "regime" VARCHAR(80),
    "categoria" VARCHAR(80),
    "status" VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
    "versaoAtual" INTEGER NOT NULL DEFAULT 0,
    "arquivadoEm" TIMESTAMP(3),
    "arquivadoPorId" TEXT,
    "motivoArquivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dp_vinculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_contrato_versoes" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "estabelecimentoId" TEXT,
    "versao" INTEGER NOT NULL,
    "cargo" VARCHAR(160),
    "cbo" VARCHAR(12),
    "tipoContrato" VARCHAR(80),
    "salarioBase" DECIMAL(18,2),
    "unidadeSalario" VARCHAR(24),
    "jornadaSemanal" DECIMAL(8,2),
    "divisor" INTEGER,
    "cctRef" VARCHAR(160),
    "validFrom" DATE,
    "validTo" DATE,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "autorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "dp_contrato_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_documentos" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "vinculoId" TEXT,
    "storeId" TEXT NOT NULL,
    "categoria" VARCHAR(64) NOT NULL,
    "classificacao" VARCHAR(32) NOT NULL,
    "origem" VARCHAR(32) NOT NULL,
    "nomeArquivo" VARCHAR(180) NOT NULL,
    "storageRef" TEXT NOT NULL,
    "mime" VARCHAR(80) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "versaoDeId" TEXT,
    "enviadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dp_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dp_auditorias" (
    "id" TEXT NOT NULL,
    "empregadorId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "atorId" TEXT NOT NULL,
    "comandoId" VARCHAR(100) NOT NULL,
    "acao" VARCHAR(80) NOT NULL,
    "entidade" VARCHAR(80) NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "justificativa" TEXT,
    "diffSaneado" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dp_auditorias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dp_empregadores_storeGestoraId_tipoInscricao_inscricao_key" ON "dp_empregadores"("storeGestoraId", "tipoInscricao", "inscricao");

-- CreateIndex
CREATE UNIQUE INDEX "dp_empregadores_id_storeGestoraId_key" ON "dp_empregadores"("id", "storeGestoraId");

-- CreateIndex
CREATE INDEX "dp_empregador_versoes_empregadorId_validFrom_idx" ON "dp_empregador_versoes"("empregadorId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "dp_empregador_versoes_empregadorId_versao_key" ON "dp_empregador_versoes"("empregadorId", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "dp_empregador_versoes_id_empregadorId_key" ON "dp_empregador_versoes"("id", "empregadorId");

-- CreateIndex
CREATE UNIQUE INDEX "dp_estabelecimentos_empregadorId_tipoInscricao_inscricao_key" ON "dp_estabelecimentos"("empregadorId", "tipoInscricao", "inscricao");

-- CreateIndex
CREATE UNIQUE INDEX "dp_estabelecimentos_id_empregadorId_key" ON "dp_estabelecimentos"("id", "empregadorId");

-- CreateIndex
CREATE UNIQUE INDEX "dp_estabelecimento_versoes_estabelecimentoId_versao_key" ON "dp_estabelecimento_versoes"("estabelecimentoId", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "dp_estabelecimento_versoes_id_empregadorId_key" ON "dp_estabelecimento_versoes"("id", "empregadorId");

-- CreateIndex
CREATE INDEX "dp_unidades_vinculo_storeId_validTo_idx" ON "dp_unidades_vinculo"("storeId", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "dp_unidades_vinculo_empregadorId_storeId_validFrom_key" ON "dp_unidades_vinculo"("empregadorId", "storeId", "validFrom");

-- CreateIndex
CREATE INDEX "dp_acessos_empregadorId_storeId_adminUserId_idx" ON "dp_acessos"("empregadorId", "storeId", "adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "dp_pessoas_empregadorId_cpfHash_key" ON "dp_pessoas"("empregadorId", "cpfHash");

-- CreateIndex
CREATE UNIQUE INDEX "dp_pessoas_id_empregadorId_key" ON "dp_pessoas"("id", "empregadorId");

-- CreateIndex
CREATE UNIQUE INDEX "dp_pessoa_versoes_pessoaId_versao_key" ON "dp_pessoa_versoes"("pessoaId", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "dp_pessoa_versoes_id_empregadorId_key" ON "dp_pessoa_versoes"("id", "empregadorId");

-- CreateIndex
CREATE INDEX "dp_pessoa_usuarios_empregadorId_adminUserId_idx" ON "dp_pessoa_usuarios"("empregadorId", "adminUserId");

-- CreateIndex
CREATE INDEX "dp_pessoa_tecnicos_empregadorId_tecnicoId_idx" ON "dp_pessoa_tecnicos"("empregadorId", "tecnicoId");

-- CreateIndex
CREATE INDEX "dp_vinculos_empregadorId_storeId_status_idx" ON "dp_vinculos"("empregadorId", "storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dp_vinculos_empregadorId_matricula_key" ON "dp_vinculos"("empregadorId", "matricula");

-- CreateIndex
CREATE UNIQUE INDEX "dp_vinculos_id_empregadorId_key" ON "dp_vinculos"("id", "empregadorId");

-- CreateIndex
CREATE UNIQUE INDEX "dp_vinculos_id_empregadorId_pessoaId_key" ON "dp_vinculos"("id", "empregadorId", "pessoaId");

-- CreateIndex
CREATE INDEX "dp_contrato_versoes_empregadorId_vinculoId_validFrom_idx" ON "dp_contrato_versoes"("empregadorId", "vinculoId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "dp_contrato_versoes_vinculoId_versao_key" ON "dp_contrato_versoes"("vinculoId", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "dp_contrato_versoes_id_empregadorId_key" ON "dp_contrato_versoes"("id", "empregadorId");

-- CreateIndex
CREATE UNIQUE INDEX "dp_documentos_storageRef_key" ON "dp_documentos"("storageRef");

-- CreateIndex
CREATE INDEX "dp_documentos_empregadorId_storeId_vinculoId_idx" ON "dp_documentos"("empregadorId", "storeId", "vinculoId");

-- CreateIndex
CREATE UNIQUE INDEX "dp_documentos_id_empregadorId_key" ON "dp_documentos"("id", "empregadorId");

-- CreateIndex
CREATE INDEX "dp_auditorias_empregadorId_createdAt_idx" ON "dp_auditorias"("empregadorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "dp_auditorias_storeId_atorId_comandoId_key" ON "dp_auditorias"("storeId", "atorId", "comandoId");

-- CreateIndex
CREATE UNIQUE INDEX "tecnicos_id_storeId_key" ON "tecnicos"("id", "storeId");

-- AddForeignKey
ALTER TABLE "dp_empregadores" ADD CONSTRAINT "dp_empregadores_storeGestoraId_fkey" FOREIGN KEY ("storeGestoraId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_empregador_versoes" ADD CONSTRAINT "dp_empregador_versoes_empregadorId_fkey" FOREIGN KEY ("empregadorId") REFERENCES "dp_empregadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_empregador_versoes" ADD CONSTRAINT "dp_empregador_versoes_supersedesId_empregadorId_fkey" FOREIGN KEY ("supersedesId", "empregadorId") REFERENCES "dp_empregador_versoes"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_estabelecimentos" ADD CONSTRAINT "dp_estabelecimentos_empregadorId_fkey" FOREIGN KEY ("empregadorId") REFERENCES "dp_empregadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_estabelecimento_versoes" ADD CONSTRAINT "dp_estabelecimento_versoes_estabelecimentoId_empregadorId_fkey" FOREIGN KEY ("estabelecimentoId", "empregadorId") REFERENCES "dp_estabelecimentos"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_estabelecimento_versoes" ADD CONSTRAINT "dp_estabelecimento_versoes_supersedesId_empregadorId_fkey" FOREIGN KEY ("supersedesId", "empregadorId") REFERENCES "dp_estabelecimento_versoes"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_unidades_vinculo" ADD CONSTRAINT "dp_unidades_vinculo_empregadorId_fkey" FOREIGN KEY ("empregadorId") REFERENCES "dp_empregadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_unidades_vinculo" ADD CONSTRAINT "dp_unidades_vinculo_estabelecimentoId_empregadorId_fkey" FOREIGN KEY ("estabelecimentoId", "empregadorId") REFERENCES "dp_estabelecimentos"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_unidades_vinculo" ADD CONSTRAINT "dp_unidades_vinculo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_acessos" ADD CONSTRAINT "dp_acessos_empregadorId_fkey" FOREIGN KEY ("empregadorId") REFERENCES "dp_empregadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_acessos" ADD CONSTRAINT "dp_acessos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_acessos" ADD CONSTRAINT "dp_acessos_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_pessoas" ADD CONSTRAINT "dp_pessoas_empregadorId_fkey" FOREIGN KEY ("empregadorId") REFERENCES "dp_empregadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_pessoa_versoes" ADD CONSTRAINT "dp_pessoa_versoes_pessoaId_empregadorId_fkey" FOREIGN KEY ("pessoaId", "empregadorId") REFERENCES "dp_pessoas"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_pessoa_versoes" ADD CONSTRAINT "dp_pessoa_versoes_supersedesId_empregadorId_fkey" FOREIGN KEY ("supersedesId", "empregadorId") REFERENCES "dp_pessoa_versoes"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_pessoa_usuarios" ADD CONSTRAINT "dp_pessoa_usuarios_pessoaId_empregadorId_fkey" FOREIGN KEY ("pessoaId", "empregadorId") REFERENCES "dp_pessoas"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_pessoa_usuarios" ADD CONSTRAINT "dp_pessoa_usuarios_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_pessoa_tecnicos" ADD CONSTRAINT "dp_pessoa_tecnicos_pessoaId_empregadorId_fkey" FOREIGN KEY ("pessoaId", "empregadorId") REFERENCES "dp_pessoas"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_pessoa_tecnicos" ADD CONSTRAINT "dp_pessoa_tecnicos_tecnicoId_storeId_fkey" FOREIGN KEY ("tecnicoId", "storeId") REFERENCES "tecnicos"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_vinculos" ADD CONSTRAINT "dp_vinculos_empregadorId_fkey" FOREIGN KEY ("empregadorId") REFERENCES "dp_empregadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_vinculos" ADD CONSTRAINT "dp_vinculos_pessoaId_empregadorId_fkey" FOREIGN KEY ("pessoaId", "empregadorId") REFERENCES "dp_pessoas"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_vinculos" ADD CONSTRAINT "dp_vinculos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_contrato_versoes" ADD CONSTRAINT "dp_contrato_versoes_empregadorId_fkey" FOREIGN KEY ("empregadorId") REFERENCES "dp_empregadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_contrato_versoes" ADD CONSTRAINT "dp_contrato_versoes_vinculoId_empregadorId_fkey" FOREIGN KEY ("vinculoId", "empregadorId") REFERENCES "dp_vinculos"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_contrato_versoes" ADD CONSTRAINT "dp_contrato_versoes_estabelecimentoId_empregadorId_fkey" FOREIGN KEY ("estabelecimentoId", "empregadorId") REFERENCES "dp_estabelecimentos"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_contrato_versoes" ADD CONSTRAINT "dp_contrato_versoes_supersedesId_empregadorId_fkey" FOREIGN KEY ("supersedesId", "empregadorId") REFERENCES "dp_contrato_versoes"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_documentos" ADD CONSTRAINT "dp_documentos_empregadorId_fkey" FOREIGN KEY ("empregadorId") REFERENCES "dp_empregadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_documentos" ADD CONSTRAINT "dp_documentos_pessoaId_empregadorId_fkey" FOREIGN KEY ("pessoaId", "empregadorId") REFERENCES "dp_pessoas"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_documentos" ADD CONSTRAINT "dp_documentos_vinculoId_empregadorId_pessoaId_fkey" FOREIGN KEY ("vinculoId", "empregadorId", "pessoaId") REFERENCES "dp_vinculos"("id", "empregadorId", "pessoaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_documentos" ADD CONSTRAINT "dp_documentos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_documentos" ADD CONSTRAINT "dp_documentos_versaoDeId_empregadorId_fkey" FOREIGN KEY ("versaoDeId", "empregadorId") REFERENCES "dp_documentos"("id", "empregadorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_auditorias" ADD CONSTRAINT "dp_auditorias_empregadorId_fkey" FOREIGN KEY ("empregadorId") REFERENCES "dp_empregadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_auditorias" ADD CONSTRAINT "dp_auditorias_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dp_auditorias" ADD CONSTRAINT "dp_auditorias_atorId_fkey" FOREIGN KEY ("atorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrições de domínio que o datamodel Prisma não expressa.
ALTER TABLE "dp_empregador_versoes" ADD CONSTRAINT "dp_empregador_vigencia_ck" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "dp_estabelecimento_versoes" ADD CONSTRAINT "dp_estabelecimento_vigencia_ck" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "dp_unidades_vinculo" ADD CONSTRAINT "dp_unidade_vigencia_ck" CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "dp_pessoa_versoes" ADD CONSTRAINT "dp_pessoa_vigencia_ck" CHECK ("validFrom" IS NULL OR "validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "dp_contrato_versoes" ADD CONSTRAINT "dp_contrato_vigencia_ck" CHECK ("validFrom" IS NULL OR "validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "dp_contrato_versoes" ADD CONSTRAINT "dp_contrato_salario_ck" CHECK ("salarioBase" IS NULL OR "salarioBase" >= 0);
ALTER TABLE "dp_contrato_versoes" ADD CONSTRAINT "dp_contrato_jornada_ck" CHECK ("jornadaSemanal" IS NULL OR ("jornadaSemanal" >= 0 AND "jornadaSemanal" <= 168));
ALTER TABLE "dp_vinculos" ADD CONSTRAINT "dp_vinculo_datas_ck" CHECK ("admissao" IS NULL OR "termino" IS NULL OR "termino" >= "admissao");
ALTER TABLE "dp_documentos" ADD CONSTRAINT "dp_documento_bytes_ck" CHECK ("bytes" > 0);
ALTER TABLE "dp_acessos" ADD CONSTRAINT "dp_acesso_capacidades_ck" CHECK (
  "capacidades" <@ ARRAY['viewCadastro','editCadastro','viewRemuneracao','editContrato','viewDocumento','manageAccess']::text[]
);

CREATE UNIQUE INDEX "dp_unidade_ativa_key" ON "dp_unidades_vinculo" ("empregadorId", "storeId") WHERE "validTo" IS NULL;
CREATE UNIQUE INDEX "dp_acesso_ativo_key" ON "dp_acessos" ("empregadorId", "storeId", "adminUserId") WHERE "revogadoEm" IS NULL;
CREATE UNIQUE INDEX "dp_pessoa_usuario_ativo_key" ON "dp_pessoa_usuarios" ("empregadorId", "pessoaId", "adminUserId") WHERE "validTo" IS NULL;
CREATE UNIQUE INDEX "dp_pessoa_tecnico_ativo_key" ON "dp_pessoa_tecnicos" ("empregadorId", "pessoaId", "tecnicoId") WHERE "validTo" IS NULL;
CREATE UNIQUE INDEX "dp_contrato_atual_key" ON "dp_contrato_versoes" ("vinculoId") WHERE "supersededAt" IS NULL;
CREATE UNIQUE INDEX "dp_empregador_versao_atual_key" ON "dp_empregador_versoes" ("empregadorId") WHERE "supersededAt" IS NULL;
CREATE UNIQUE INDEX "dp_estabelecimento_versao_atual_key" ON "dp_estabelecimento_versoes" ("estabelecimentoId") WHERE "supersededAt" IS NULL;

-- Auditoria e versões registradas não podem ser apagadas. A única mutação de
-- contrato/identificação histórica admitida é marcar a supersessão.
CREATE FUNCTION dp_no_history_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DP_HISTORY_IMMUTABLE';
END $$;
CREATE TRIGGER dp_auditoria_immutable BEFORE UPDATE OR DELETE ON "dp_auditorias" FOR EACH ROW EXECUTE FUNCTION dp_no_history_delete();
CREATE TRIGGER dp_pessoa_versao_immutable BEFORE UPDATE OR DELETE ON "dp_pessoa_versoes" FOR EACH ROW EXECUTE FUNCTION dp_no_history_delete();
CREATE TRIGGER dp_documento_immutable BEFORE UPDATE OR DELETE ON "dp_documentos" FOR EACH ROW EXECUTE FUNCTION dp_no_history_delete();
CREATE FUNCTION dp_only_supersession() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'DP_HISTORY_IMMUTABLE'; END IF;
  IF (to_jsonb(OLD) - 'supersededAt') IS DISTINCT FROM (to_jsonb(NEW) - 'supersededAt')
     OR OLD."supersededAt" IS NOT NULL OR NEW."supersededAt" IS NULL THEN
    RAISE EXCEPTION 'DP_HISTORY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dp_empregador_versao_immutable BEFORE UPDATE OR DELETE ON "dp_empregador_versoes" FOR EACH ROW EXECUTE FUNCTION dp_only_supersession();
CREATE TRIGGER dp_estabelecimento_versao_immutable BEFORE UPDATE OR DELETE ON "dp_estabelecimento_versoes" FOR EACH ROW EXECUTE FUNCTION dp_only_supersession();
CREATE TRIGGER dp_contrato_versao_immutable BEFORE UPDATE OR DELETE ON "dp_contrato_versoes" FOR EACH ROW EXECUTE FUNCTION dp_only_supersession();
CREATE FUNCTION dp_preserve_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."admissao" IS NOT NULL AND NEW."admissao" IS DISTINCT FROM OLD."admissao" THEN
    RAISE EXCEPTION 'DP_ADMISSION_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dp_vinculo_admissao_immutable BEFORE UPDATE ON "dp_vinculos" FOR EACH ROW EXECUTE FUNCTION dp_preserve_admission();

-- Mesmo que alguém contorne o serviço, linhas operacionais novas exigem uma
-- unidade autorizada do mesmo empregador. O histórico continua legível após
-- uma revogação futura do mapeamento; o gatilho vale somente em INSERT.
CREATE FUNCTION dp_require_mapped_store() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "dp_unidades_vinculo" u
    WHERE u."empregadorId" = NEW."empregadorId"
      AND u."storeId" = NEW."storeId"
      AND u."validFrom" <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND (u."validTo" IS NULL OR u."validTo" > (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  ) THEN RAISE EXCEPTION 'DP_STORE_SCOPE_INVALID'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dp_vinculo_store_scope BEFORE INSERT ON "dp_vinculos" FOR EACH ROW EXECUTE FUNCTION dp_require_mapped_store();
CREATE TRIGGER dp_acesso_store_scope BEFORE INSERT ON "dp_acessos" FOR EACH ROW EXECUTE FUNCTION dp_require_mapped_store();
CREATE TRIGGER dp_documento_store_scope BEFORE INSERT ON "dp_documentos" FOR EACH ROW EXECUTE FUNCTION dp_require_mapped_store();
