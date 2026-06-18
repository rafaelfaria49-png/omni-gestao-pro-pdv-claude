-- GOAL_001B — FUNDACAO FISCAL (NFC-e/SAT/TEF). FASE 0 (dormente) do MASTER_FISCAL_EXECUTION_PLAN.
-- Desenho aprovado: docs/architecture/FISCAL_SCHEMA_DESIGN_v01.md
--
-- ADITIVO e NAO-QUEBRANTE: cria 12 ENUMs + 8 tabelas novas + 1 coluna nova em "vendas"
-- ("fiscalStatus", DEFAULT 'NAO_FISCAL'). NAO altera/dropa/renomeia nenhuma tabela/coluna
-- existente. NENHUMA tabela fiscal usa default "loja-1" (ADR-0003). Segredo (certificado/
-- senha/CSC/token de gateway) NUNCA em coluna em claro — apenas referencias (*Ref).
-- Tudo nasce DORMENTE: nada emite enquanto configuracoes_fiscais_loja.fiscalEnabled = false.
--
-- Apply de fato via `npm run db:push` (Opcao A — mesmo padrao das migracoes 0009..0012).
-- Operacoes desta migration: SOMENTE CREATE TYPE / CREATE TABLE / ADD COLUMN / CREATE INDEX /
-- ADD CONSTRAINT (FK). Zero DROP, RENAME, ALTER destrutivo, TRUNCATE ou DELETE.
--
-- Rollback seguro (nada existente foi tocado):
--   ALTER TABLE "vendas" DROP COLUMN IF EXISTS "fiscalStatus";
--   DROP TABLE IF EXISTS "fiscal_logs";
--   DROP TABLE IF EXISTS "fiscal_emissao_jobs";
--   DROP TABLE IF EXISTS "eventos_fiscais";
--   DROP TABLE IF EXISTS "notas_fiscais_itens";
--   DROP TABLE IF EXISTS "notas_fiscais";
--   DROP TABLE IF EXISTS "series_fiscais";
--   DROP TABLE IF EXISTS "certificados_digitais";
--   DROP TABLE IF EXISTS "configuracoes_fiscais_loja";
--   DROP TYPE IF EXISTS "FiscalJobStatus"; DROP TYPE IF EXISTS "FiscalJobTipo";
--   DROP TYPE IF EXISTS "StatusEventoFiscal"; DROP TYPE IF EXISTS "TipoEventoFiscal";
--   DROP TYPE IF EXISTS "CertificadoStatus"; DROP TYPE IF EXISTS "FiscalProviderTipo";
--   DROP TYPE IF EXISTS "RegimeTributario"; DROP TYPE IF EXISTS "TipoEmissao";
--   DROP TYPE IF EXISTS "AmbienteFiscal"; DROP TYPE IF EXISTS "ModeloFiscal";
--   DROP TYPE IF EXISTS "StatusNotaFiscal"; DROP TYPE IF EXISTS "FiscalStatusVenda";

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) ENUMs (CREATE TYPE nao suporta IF NOT EXISTS → guard via pg_type)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FiscalStatusVenda') THEN
  CREATE TYPE "FiscalStatusVenda" AS ENUM ('NAO_FISCAL','PENDENTE','EMITINDO','EM_CONTINGENCIA','AUTORIZADA','REJEITADA','CANCELADA_FISCAL','BLOQUEADA_FISCAL');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusNotaFiscal') THEN
  CREATE TYPE "StatusNotaFiscal" AS ENUM ('RASCUNHO','VALIDANDO','ASSINADA','TRANSMITINDO','AUTORIZADA','REJEITADA','DENEGADA','CONTINGENCIA','CANCELADA','INUTILIZADA','ERRO');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModeloFiscal') THEN
  CREATE TYPE "ModeloFiscal" AS ENUM ('NFCE','SAT','NFE');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AmbienteFiscal') THEN
  CREATE TYPE "AmbienteFiscal" AS ENUM ('HOMOLOGACAO','PRODUCAO');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoEmissao') THEN
  CREATE TYPE "TipoEmissao" AS ENUM ('NORMAL','CONTINGENCIA_OFFLINE');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegimeTributario') THEN
  CREATE TYPE "RegimeTributario" AS ENUM ('SIMPLES_NACIONAL','SIMPLES_NACIONAL_EXCESSO','REGIME_NORMAL','MEI');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FiscalProviderTipo') THEN
  CREATE TYPE "FiscalProviderTipo" AS ENUM ('STUB_HOMOLOGACAO','SEFAZ_DIRETO','GATEWAY_FOCUS','GATEWAY_PLUGNOTAS','GATEWAY_ENOTAS','GATEWAY_NFEIO','SAT_LOCAL');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CertificadoStatus') THEN
  CREATE TYPE "CertificadoStatus" AS ENUM ('PENDENTE_VALIDACAO','ATIVO','EXPIRADO','REVOGADO','INVALIDO');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoEventoFiscal') THEN
  CREATE TYPE "TipoEventoFiscal" AS ENUM ('CANCELAMENTO','CARTA_CORRECAO','INUTILIZACAO','CONTINGENCIA_ENVIO');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusEventoFiscal') THEN
  CREATE TYPE "StatusEventoFiscal" AS ENUM ('PENDENTE','AUTORIZADO','REJEITADO');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FiscalJobTipo') THEN
  CREATE TYPE "FiscalJobTipo" AS ENUM ('EMISSAO','CANCELAMENTO','INUTILIZACAO','CONTINGENCIA_TRANSMISSAO','CONSULTA');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FiscalJobStatus') THEN
  CREATE TYPE "FiscalJobStatus" AS ENUM ('PENDENTE','PROCESSANDO','AGUARDANDO_RETRY','CONCLUIDO','FALHA','CANCELADO');
END IF; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Coluna fiscal aditiva em "vendas" (DEFAULT constante → metadata-only em PG >= 11)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "vendas"
  ADD COLUMN IF NOT EXISTS "fiscalStatus" "FiscalStatusVenda" NOT NULL DEFAULT 'NAO_FISCAL';

CREATE INDEX IF NOT EXISTS "vendas_storeId_fiscalStatus_idx"
  ON "vendas"("storeId", "fiscalStatus");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ConfiguracaoFiscalLoja (1:1 com stores) — identidade fiscal por loja
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "configuracoes_fiscais_loja" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fiscalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
    "modeloFiscal" "ModeloFiscal" NOT NULL DEFAULT 'NFCE',
    "razaoSocial" TEXT NOT NULL DEFAULT '',
    "nomeFantasia" TEXT NOT NULL DEFAULT '',
    "cnpj" TEXT NOT NULL DEFAULT '',
    "inscricaoEstadual" TEXT NOT NULL DEFAULT '',
    "inscricaoMunicipal" TEXT NOT NULL DEFAULT '',
    "regimeTributario" "RegimeTributario" NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "crt" INTEGER NOT NULL DEFAULT 1,
    "logradouro" TEXT NOT NULL DEFAULT '',
    "numero" TEXT NOT NULL DEFAULT '',
    "complemento" TEXT NOT NULL DEFAULT '',
    "bairro" TEXT NOT NULL DEFAULT '',
    "codigoMunicipioIbge" TEXT NOT NULL DEFAULT '',
    "municipio" TEXT NOT NULL DEFAULT '',
    "uf" TEXT NOT NULL DEFAULT '',
    "cep" TEXT NOT NULL DEFAULT '',
    "codigoPais" TEXT NOT NULL DEFAULT '1058',
    "fone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "cscId" TEXT NOT NULL DEFAULT '',
    "cscTokenRef" TEXT,
    "provider" "FiscalProviderTipo" NOT NULL DEFAULT 'STUB_HOMOLOGACAO',
    "providerConfig" JSONB,
    "providerTokenRef" TEXT,
    "certificadoAtivoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "configuracoes_fiscais_loja_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "configuracoes_fiscais_loja_storeId_key"
  ON "configuracoes_fiscais_loja"("storeId");
CREATE INDEX IF NOT EXISTS "configuracoes_fiscais_loja_fiscalEnabled_idx"
  ON "configuracoes_fiscais_loja"("fiscalEnabled");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) CertificadoDigital — SO referencias ao segredo (blobRef/senhaRef), nunca .pfx/senha
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "certificados_digitais" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "apelido" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'A1',
    "titularCn" TEXT NOT NULL DEFAULT '',
    "cnpjTitular" TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "validoDe" TIMESTAMP(3),
    "validoAte" TIMESTAMP(3),
    "status" "CertificadoStatus" NOT NULL DEFAULT 'PENDENTE_VALIDACAO',
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "blobRef" TEXT,
    "senhaRef" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "certificados_digitais_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "certificados_digitais_storeId_idx"
  ON "certificados_digitais"("storeId");
CREATE INDEX IF NOT EXISTS "certificados_digitais_storeId_ativo_idx"
  ON "certificados_digitais"("storeId", "ativo");
CREATE INDEX IF NOT EXISTS "certificados_digitais_validoAte_idx"
  ON "certificados_digitais"("validoAte");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) SerieFiscal — contador atomico por (loja, modelo, serie, ambiente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "series_fiscais" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "modelo" "ModeloFiscal" NOT NULL DEFAULT 'NFCE',
    "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
    "serie" INTEGER NOT NULL DEFAULT 1,
    "proximoNumero" INTEGER NOT NULL DEFAULT 1,
    "descricao" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "series_fiscais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "series_fiscais_storeId_modelo_serie_ambiente_key"
  ON "series_fiscais"("storeId", "modelo", "serie", "ambiente");
CREATE INDEX IF NOT EXISTS "series_fiscais_storeId_idx"
  ON "series_fiscais"("storeId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) NotaFiscal — documento + snapshots congelados (emitente/destinatario/pagamento)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notas_fiscais" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "modelo" "ModeloFiscal" NOT NULL DEFAULT 'NFCE',
    "ambiente" "AmbienteFiscal" NOT NULL,
    "tipoEmissao" "TipoEmissao" NOT NULL DEFAULT 'NORMAL',
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'RASCUNHO',
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "serieFiscalId" TEXT,
    "serie" INTEGER,
    "numero" INTEGER,
    "chaveAcesso" TEXT,
    "protocolo" TEXT,
    "cStat" TEXT,
    "xMotivo" TEXT,
    "dataAutorizacao" TIMESTAMP(3),
    "digestValue" TEXT,
    "qrCodeData" TEXT,
    "urlConsulta" TEXT,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorFrete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotalTributos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "snapshotEmitente" JSONB,
    "snapshotDestinatario" JSONB,
    "snapshotPagamento" JSONB,
    "xmlAssinado" TEXT,
    "xmlAutorizado" TEXT,
    "xmlStorageRef" TEXT,
    "certificadoId" TEXT,
    "localKey" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimoErro" TEXT,
    "emitidaPor" TEXT,
    "dataContingencia" TIMESTAMP(3),
    "justContingencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notas_fiscais_chaveAcesso_key"
  ON "notas_fiscais"("chaveAcesso");
CREATE UNIQUE INDEX IF NOT EXISTS "notas_fiscais_storeId_modelo_serie_numero_ambiente_key"
  ON "notas_fiscais"("storeId", "modelo", "serie", "numero", "ambiente");
CREATE UNIQUE INDEX IF NOT EXISTS "notas_fiscais_storeId_localKey_key"
  ON "notas_fiscais"("storeId", "localKey");
CREATE INDEX IF NOT EXISTS "notas_fiscais_storeId_idx"
  ON "notas_fiscais"("storeId");
CREATE INDEX IF NOT EXISTS "notas_fiscais_storeId_status_idx"
  ON "notas_fiscais"("storeId", "status");
CREATE INDEX IF NOT EXISTS "notas_fiscais_vendaId_idx"
  ON "notas_fiscais"("vendaId");

-- Invariante "no max. 1 nota VIGENTE por venda" — indice parcial unico (nao declaravel no
-- schema.prisma; mesmo padrao do "depositos_um_principal_por_loja" da migration 0011).
CREATE UNIQUE INDEX IF NOT EXISTS "notas_fiscais_um_vigente_por_venda"
  ON "notas_fiscais"("storeId", "vendaId") WHERE "vigente" = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) NotaFiscalItem — snapshot fiscal CONGELADO por item
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notas_fiscais_itens" (
    "id" TEXT NOT NULL,
    "notaFiscalId" TEXT NOT NULL,
    "itemVendaId" TEXT,
    "produtoId" TEXT,
    "numeroItem" INTEGER NOT NULL DEFAULT 1,
    "codigoProduto" TEXT NOT NULL DEFAULT '',
    "descricao" TEXT NOT NULL DEFAULT '',
    "gtin" TEXT,
    "ncm" TEXT NOT NULL DEFAULT '',
    "cest" TEXT,
    "cfop" TEXT NOT NULL DEFAULT '',
    "cst" TEXT,
    "csosn" TEXT,
    "origemMercadoria" INTEGER NOT NULL DEFAULT 0,
    "unidadeComercial" TEXT NOT NULL DEFAULT 'UN',
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "valorUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseCalculoIcms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aliquotaIcms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorIcms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorTributos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notas_fiscais_itens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notas_fiscais_itens_notaFiscalId_idx"
  ON "notas_fiscais_itens"("notaFiscalId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) EventoFiscal — cancelamento/CC-e/inutilizacao/contingencia (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "eventos_fiscais" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "notaFiscalId" TEXT NOT NULL,
    "tipo" "TipoEventoFiscal" NOT NULL,
    "sequencia" INTEGER NOT NULL DEFAULT 1,
    "status" "StatusEventoFiscal" NOT NULL DEFAULT 'PENDENTE',
    "protocolo" TEXT,
    "cStat" TEXT,
    "xMotivo" TEXT,
    "justificativa" TEXT,
    "xmlEvento" TEXT,
    "xmlRetorno" TEXT,
    "dataEvento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operador" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eventos_fiscais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "eventos_fiscais_notaFiscalId_tipo_sequencia_key"
  ON "eventos_fiscais"("notaFiscalId", "tipo", "sequencia");
CREATE INDEX IF NOT EXISTS "eventos_fiscais_storeId_idx"
  ON "eventos_fiscais"("storeId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) FiscalEmissaoJob — fila idempotente pos-commit (retry/backoff/lock)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fiscal_emissao_jobs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "notaFiscalId" TEXT,
    "tipo" "FiscalJobTipo" NOT NULL DEFAULT 'EMISSAO',
    "status" "FiscalJobStatus" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "maxTentativas" INTEGER NOT NULL DEFAULT 5,
    "proximaTentativaEm" TIMESTAMP(3),
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "lockOwner" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "payload" JSONB,
    "ultimoErro" TEXT,
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fiscal_emissao_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_emissao_jobs_storeId_dedupeKey_key"
  ON "fiscal_emissao_jobs"("storeId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "fiscal_emissao_jobs_status_proximaTentativaEm_idx"
  ON "fiscal_emissao_jobs"("status", "proximaTentativaEm");
CREATE INDEX IF NOT EXISTS "fiscal_emissao_jobs_storeId_idx"
  ON "fiscal_emissao_jobs"("storeId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) FiscalLog — trilha append-only
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fiscal_logs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "vendaId" TEXT,
    "notaFiscalId" TEXT,
    "eventoFiscalId" TEXT,
    "jobId" TEXT,
    "nivel" TEXT NOT NULL DEFAULT 'INFO',
    "acao" TEXT NOT NULL DEFAULT '',
    "cStat" TEXT,
    "xMotivo" TEXT,
    "mensagem" TEXT NOT NULL DEFAULT '',
    "detalhe" JSONB,
    "operador" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fiscal_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fiscal_logs_storeId_createdAt_idx"
  ON "fiscal_logs"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "fiscal_logs_notaFiscalId_idx"
  ON "fiscal_logs"("notaFiscalId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Foreign keys (guardadas para idempotencia — estilo migracoes 0011/0012)
--     CASCADE: filhos operacionais sob a loja (config/cert/serie/job/log).
--     RESTRICT: documento/evento fiscal NAO pode ser apagado por delecao de venda/loja.
--     SET NULL: trocar/expirar certificado ou serie NAO apaga a nota (preserva historico).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'configuracoes_fiscais_loja_storeId_fkey') THEN
  ALTER TABLE "configuracoes_fiscais_loja" ADD CONSTRAINT "configuracoes_fiscais_loja_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certificados_digitais_storeId_fkey') THEN
  ALTER TABLE "certificados_digitais" ADD CONSTRAINT "certificados_digitais_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'series_fiscais_storeId_fkey') THEN
  ALTER TABLE "series_fiscais" ADD CONSTRAINT "series_fiscais_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notas_fiscais_storeId_fkey') THEN
  ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notas_fiscais_vendaId_fkey') THEN
  ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_vendaId_fkey"
    FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notas_fiscais_serieFiscalId_fkey') THEN
  ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_serieFiscalId_fkey"
    FOREIGN KEY ("serieFiscalId") REFERENCES "series_fiscais"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notas_fiscais_certificadoId_fkey') THEN
  ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_certificadoId_fkey"
    FOREIGN KEY ("certificadoId") REFERENCES "certificados_digitais"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notas_fiscais_itens_notaFiscalId_fkey') THEN
  ALTER TABLE "notas_fiscais_itens" ADD CONSTRAINT "notas_fiscais_itens_notaFiscalId_fkey"
    FOREIGN KEY ("notaFiscalId") REFERENCES "notas_fiscais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_fiscais_storeId_fkey') THEN
  ALTER TABLE "eventos_fiscais" ADD CONSTRAINT "eventos_fiscais_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_fiscais_notaFiscalId_fkey') THEN
  ALTER TABLE "eventos_fiscais" ADD CONSTRAINT "eventos_fiscais_notaFiscalId_fkey"
    FOREIGN KEY ("notaFiscalId") REFERENCES "notas_fiscais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_emissao_jobs_storeId_fkey') THEN
  ALTER TABLE "fiscal_emissao_jobs" ADD CONSTRAINT "fiscal_emissao_jobs_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_logs_storeId_fkey') THEN
  ALTER TABLE "fiscal_logs" ADD CONSTRAINT "fiscal_logs_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END IF; END $$;
