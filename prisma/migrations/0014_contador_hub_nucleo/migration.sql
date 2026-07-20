-- CONTADOR-HUB-SCHEMA-NUCLEO-009 (+ INTEGRIDADE-COMPOSTA-001) — nucleo persistente do Contador HUB.
-- Gate G2 aprovado por Rafael em 2026-07-19 (ADR-CONTADOR-001/003/004/005/006 Accepted).
-- Desenho aprovado: docs/contador/CONTADOR_HUB_ADRS_PROPOSTOS_001.md (comando 9/19).
--
-- ADITIVO e NAO-QUEBRANTE: cria 3 ENUMs + 6 tabelas novas. NAO altera/dropa/renomeia
-- nenhuma tabela, coluna, tipo ou constraint existente. A tabela "stores" aparece
-- SOMENTE como alvo de FOREIGN KEY — nenhum ALTER TABLE "stores" nesta migration
-- (as relacoes inversas adicionadas em `model Store` nao geram coluna fisica).
-- Nenhuma tabela usa default "loja-1" (ADR-0003): storeId sempre explicito.
--
-- INTEGRIDADE COMPOSTA MULTI-LOJA / MULTI-COMPETENCIA (o banco garante, nao o service):
--   * documento: FK composta (competenciaId, storeId) -> competencia(id, storeId) —
--     documento NUNCA cruza loja (storeId pino ao da competencia).
--   * documento.versao: FK composta (versaoDeId, competenciaId, storeId) ->
--     documento(id, competenciaId, storeId) — versao NUNCA cruza competencia nem loja.
--   * comentario: FK composta (documentoId, competenciaId) -> documento(id, competenciaId) —
--     comentario NUNCA aponta documento de outra competencia.
--   * evento: FK composta opcional (competenciaId, storeId) -> competencia(id, storeId) —
--     evento com competencia NUNCA cruza loja; sem competenciaId permanece permitido
--     (MATCH SIMPLE: coluna nula desliga a checagem) desde que storeId seja valido.
--   Alvos das FKs compostas = UNIQUE INDEX (id,storeId), (id,competenciaId),
--   (id,competenciaId,storeId) — aceitos como alvo de FK no Postgres (padrao do Prisma).
--
-- PII (ajuste G2-05): nenhum campo de dado pessoal de cliente (CPF, CNPJ de cliente,
-- nome, telefone, e-mail, endereco, IMEI, observacao operacional) e nenhum toggle de
-- PII entram neste nucleo. Apenas IDs tecnicos. "storageRef" e referencia privada
-- namespaced — NUNCA URL publica (ADR-003); o storage fisico so existe no GOAL 010.
--
-- Tudo nasce DORMENTE: nenhuma UI, rota ou reader escreve nestas tabelas neste GOAL.
-- O unico servico que grava e `lib/contador/db/competencia.ts` (competencia + evento).
--
-- Apply de fato via `npm run db:push` (Opcao A — mesmo padrao das migracoes 0009..0013).
-- Operacoes desta migration: SOMENTE CREATE TYPE / CREATE TABLE / CREATE INDEX /
-- ADD CONSTRAINT (FK). Zero DROP, RENAME, ALTER destrutivo, TRUNCATE, DELETE,
-- UPDATE, INSERT, backfill, seed ou trigger.
--
-- Rollback seguro (nada existente foi tocado) — somente em banco descartavel/dev;
-- em producao a correcao se faz por migration aditiva posterior:
--   DROP TABLE IF EXISTS "contador_eventos";
--   DROP TABLE IF EXISTS "contador_comentarios";
--   DROP TABLE IF EXISTS "contador_pacote_itens";
--   DROP TABLE IF EXISTS "contador_pacotes";
--   DROP TABLE IF EXISTS "contador_documentos";
--   DROP TABLE IF EXISTS "contador_competencias";
--   DROP TYPE  IF EXISTS "ContadorDocumentoCategoria";
--   DROP TYPE  IF EXISTS "ContadorItemStatus";
--   DROP TYPE  IF EXISTS "ContadorCompetenciaStatus";

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) ENUMs (CREATE TYPE nao suporta IF NOT EXISTS → guard via pg_type)
--    Valores fisicos em minusculo conforme ADR-005 (aberta|enviada|com_pendencia|
--    fechada) e ADR-004; mapeados no Prisma por @map.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContadorCompetenciaStatus') THEN
  CREATE TYPE "ContadorCompetenciaStatus" AS ENUM ('aberta','enviada','com_pendencia','fechada');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContadorItemStatus') THEN
  CREATE TYPE "ContadorItemStatus" AS ENUM ('pendente','enviado','conferido','resolvido');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContadorDocumentoCategoria') THEN
  CREATE TYPE "ContadorDocumentoCategoria" AS ENUM ('fiscal','financeiro','folha','juridico','outro');
END IF; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Competencia mensal (uma por loja/ano/mes). Viva enquanto aberta/enviada;
--    snapshot so congela no fechamento (GOAL 012), sem linhas operacionais.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contador_competencias" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "status" "ContadorCompetenciaStatus" NOT NULL DEFAULT 'aberta',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB,
    "snapshotHash" TEXT,
    "fechadaEm" TIMESTAMP(3),
    "fechadaPorId" TEXT,
    "reabertaEm" TIMESTAMP(3),
    "reabertaPorId" TEXT,
    "reabertaMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contador_competencias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contador_competencias_storeId_status_idx"
  ON "contador_competencias"("storeId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "contador_competencias_storeId_ano_mes_key"
  ON "contador_competencias"("storeId", "ano", "mes");
-- Alvo das FKs compostas escopadas (documento/evento).
CREATE UNIQUE INDEX IF NOT EXISTS "contador_competencias_id_storeId_key"
  ON "contador_competencias"("id", "storeId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Documento contabil (metadados). Binario so no GOAL 010; "storageRef" e
--    referencia privada. Substituicao = nova linha via "versaoDeId" (nada e
--    sobrescrito). Exclusao e SOFT (motivo) e nao remove o blob.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contador_documentos" (
    "id" TEXT NOT NULL,
    "competenciaId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoria" "ContadorDocumentoCategoria" NOT NULL,
    "titulo" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "status" "ContadorItemStatus" NOT NULL DEFAULT 'pendente',
    "vencimento" TIMESTAMP(3),
    "enviadoPorTipo" TEXT NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "versaoDeId" TEXT,
    "excluidoEm" TIMESTAMP(3),
    "excluidoPorId" TEXT,
    "excluidoMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contador_documentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contador_documentos_competenciaId_categoria_idx"
  ON "contador_documentos"("competenciaId", "categoria");
CREATE INDEX IF NOT EXISTS "contador_documentos_storeId_status_idx"
  ON "contador_documentos"("storeId", "status");
CREATE INDEX IF NOT EXISTS "contador_documentos_sha256_idx"
  ON "contador_documentos"("sha256");
-- Alvo da FK composta do comentario (documento da MESMA competencia).
CREATE UNIQUE INDEX IF NOT EXISTS "contador_documentos_id_competenciaId_key"
  ON "contador_documentos"("id", "competenciaId");
-- Alvo da FK composta de versao (predecessor da MESMA competencia e loja).
CREATE UNIQUE INDEX IF NOT EXISTS "contador_documentos_id_competenciaId_storeId_key"
  ON "contador_documentos"("id", "competenciaId", "storeId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Pacote OFICIAL versionado (materializado so no GOAL 012). Versoes anteriores
--    nunca sao sobrescritas: supersessao = nova versao auditada.
--    O pacote MVP sob demanda (GOAL 008) NAO grava aqui.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contador_pacotes" (
    "id" TEXT NOT NULL,
    "competenciaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "manifestoHash" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "geradoPorTipo" TEXT NOT NULL,
    "geradoPorId" TEXT NOT NULL,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contador_pacotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contador_pacotes_competenciaId_geradoEm_idx"
  ON "contador_pacotes"("competenciaId", "geradoEm");
CREATE UNIQUE INDEX IF NOT EXISTS "contador_pacotes_competenciaId_versao_key"
  ON "contador_pacotes"("competenciaId", "versao");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Itens do pacote — indice consultavel do manifest.json (so metadados).
--    "caminho" e unico por pacote: entradas de ZIP nao se repetem e o manifesto
--    e a raiz de integridade (GOAL 008B/008D).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contador_pacote_itens" (
    "id" TEXT NOT NULL,
    "pacoteId" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,

    CONSTRAINT "contador_pacote_itens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contador_pacote_itens_pacoteId_idx"
  ON "contador_pacote_itens"("pacoteId");
CREATE UNIQUE INDEX IF NOT EXISTS "contador_pacote_itens_pacoteId_caminho_key"
  ON "contador_pacote_itens"("pacoteId", "caminho");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Comentario do dominio (competencia e, opcionalmente, documento).
--    Append-only no servico: sem update/delete de rotina. "autorId" e ID tecnico.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contador_comentarios" (
    "id" TEXT NOT NULL,
    "competenciaId" TEXT NOT NULL,
    "documentoId" TEXT,
    "autorTipo" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "visibilidade" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contador_comentarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contador_comentarios_competenciaId_createdAt_idx"
  ON "contador_comentarios"("competenciaId", "createdAt");
CREATE INDEX IF NOT EXISTS "contador_comentarios_documentoId_createdAt_idx"
  ON "contador_comentarios"("documentoId", "createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Trilha APPEND-ONLY do dominio. NUNCA editar nem deletar linhas desta tabela —
--    correcao se faz por NOVO evento. "metadata" (nome fixado pela emenda Accepted
--    do Gate G2; nao usar "payload") carrega apenas dados saneados: sem payload
--    bruto de venda/OS, cookie, token, senha, stack, conteudo de documento,
--    URL assinada ou qualquer PII.
--    Append-only e garantido por servico + teste — sem trigger nesta fase.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contador_eventos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "competenciaId" TEXT,
    "tipo" TEXT NOT NULL,
    "atorTipo" TEXT NOT NULL,
    "atorId" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "origem" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contador_eventos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contador_eventos_storeId_createdAt_idx"
  ON "contador_eventos"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "contador_eventos_competenciaId_createdAt_idx"
  ON "contador_eventos"("competenciaId", "createdAt");
CREATE INDEX IF NOT EXISTS "contador_eventos_tipo_idx"
  ON "contador_eventos"("tipo");

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) FOREIGN KEYS (guard via pg_constraint). Todos os ALTER TABLE abaixo tem como
--    alvo SOMENTE tabelas novas do Contador. "stores" aparece apenas como tabela
--    REFERENCIADA — nunca alterada.
--
--    Politica de onDelete:
--      RESTRICT: trilha contabil/auditavel nao pode ser apagada em cascata por
--                delecao de loja, competencia ou documento (espelha
--                AuditoriaFinanceira/FechamentoFinanceiro, ADR-006).
--      CASCADE:  apenas itens do pacote — indice estruturalmente pertencente ao
--                pacote e sem significado isolado (espelha FinancialAttachment).
--    onUpdate CASCADE = padrao do Prisma (id nunca muda; inofensivo).
-- ─────────────────────────────────────────────────────────────────────────────

-- Competencia -> Store (simples).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_competencias_storeId_fkey') THEN
  ALTER TABLE "contador_competencias" ADD CONSTRAINT "contador_competencias_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- Documento -> Competencia (COMPOSTA: mesma competencia + mesma loja).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_documentos_competenciaId_storeId_fkey') THEN
  ALTER TABLE "contador_documentos" ADD CONSTRAINT "contador_documentos_competenciaId_storeId_fkey"
    FOREIGN KEY ("competenciaId", "storeId") REFERENCES "contador_competencias"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- Documento -> Store (simples; storeId sempre valido).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_documentos_storeId_fkey') THEN
  ALTER TABLE "contador_documentos" ADD CONSTRAINT "contador_documentos_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- Documento -> Documento (versao, COMPOSTA: predecessor da mesma competencia + loja).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_documentos_versaoDeId_competenciaId_storeId_fkey') THEN
  ALTER TABLE "contador_documentos" ADD CONSTRAINT "contador_documentos_versaoDeId_competenciaId_storeId_fkey"
    FOREIGN KEY ("versaoDeId", "competenciaId", "storeId") REFERENCES "contador_documentos"("id", "competenciaId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- Pacote -> Competencia (simples).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_pacotes_competenciaId_fkey') THEN
  ALTER TABLE "contador_pacotes" ADD CONSTRAINT "contador_pacotes_competenciaId_fkey"
    FOREIGN KEY ("competenciaId") REFERENCES "contador_competencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- PacoteItem -> Pacote (CASCADE: indice sem significado isolado).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_pacote_itens_pacoteId_fkey') THEN
  ALTER TABLE "contador_pacote_itens" ADD CONSTRAINT "contador_pacote_itens_pacoteId_fkey"
    FOREIGN KEY ("pacoteId") REFERENCES "contador_pacotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END IF; END $$;

-- Comentario -> Competencia (simples).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_comentarios_competenciaId_fkey') THEN
  ALTER TABLE "contador_comentarios" ADD CONSTRAINT "contador_comentarios_competenciaId_fkey"
    FOREIGN KEY ("competenciaId") REFERENCES "contador_competencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- Comentario -> Documento (COMPOSTA: documento da mesma competencia do comentario).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_comentarios_documentoId_competenciaId_fkey') THEN
  ALTER TABLE "contador_comentarios" ADD CONSTRAINT "contador_comentarios_documentoId_competenciaId_fkey"
    FOREIGN KEY ("documentoId", "competenciaId") REFERENCES "contador_documentos"("id", "competenciaId") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- Evento -> Store (simples; evento sem competencia so exige storeId valido).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_eventos_storeId_fkey') THEN
  ALTER TABLE "contador_eventos" ADD CONSTRAINT "contador_eventos_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- Evento -> Competencia (COMPOSTA opcional: com competencia, mesma loja; MATCH SIMPLE p/ competenciaId nulo).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contador_eventos_competenciaId_storeId_fkey') THEN
  ALTER TABLE "contador_eventos" ADD CONSTRAINT "contador_eventos_competenciaId_storeId_fkey"
    FOREIGN KEY ("competenciaId", "storeId") REFERENCES "contador_competencias"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;
