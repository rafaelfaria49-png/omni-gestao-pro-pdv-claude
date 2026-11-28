-- OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001 · ADR-0025 (contrato de custos comerciais)
-- Migration ADITIVA: somente CREATE TABLE / INDEX / FK / CHECK / TRIGGER em tabelas NOVAS.
-- Nenhuma coluna de tabela existente é criada, alterada ou removida. Depende de
-- 20261110120000_aparelhos_fisicos_serializados (FKs para aparelhos_fisicos/aparelhos_vendas).
-- NÃO aplicar em Production sem autorização do proprietário (rollout controlado, backup/PITR antes).
-- Sem a migration, as rotas comerciais respondem 503 COMERCIAL_NAO_INSTALADO e nenhuma venda comum
-- consulta estas tabelas. Reversão (somente sem dados reais): down.sql.

-- CreateTable
CREATE TABLE "comercial_perfis_unidade" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'smartphone',
    "funcionamento" TEXT NOT NULL DEFAULT 'nao_avaliado',
    "finalidade" TEXT NOT NULL DEFAULT 'revenda',
    "etapaPreparacao" TEXT NOT NULL DEFAULT 'nenhuma',
    "custoAquisicaoStatus" TEXT NOT NULL DEFAULT 'conhecido',
    "custoAquisicaoJustificativa" TEXT NOT NULL DEFAULT '',
    "preexistente" BOOLEAN NOT NULL DEFAULT false,
    "defeitos" TEXT NOT NULL DEFAULT '',
    "classeEstetica" TEXT NOT NULL DEFAULT '',
    "conferencias" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comercial_perfis_unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comercial_custos_origens" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "valorTotalCentavos" INTEGER NOT NULL,
    "quantidadeTotal" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercial_custos_origens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comercial_custos_lancamentos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valorCentavos" INTEGER,
    "custoStatus" TEXT NOT NULL DEFAULT 'conhecido',
    "produtoId" TEXT,
    "estoqueIdempotencyKey" TEXT,
    "origemFinanceiraId" TEXT,
    "contaPagarTituloId" TEXT,
    "justificativa" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "estornadoEm" TIMESTAMP(3),
    "estornadoPor" TEXT,
    "motivoEstorno" TEXT,
    "operador" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercial_custos_lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comercial_vendas_custos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "aparelhoVendaId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "precoVendaCentavos" INTEGER NOT NULL,
    "custoAquisicaoCentavos" INTEGER,
    "custoAplicadoCentavos" INTEGER NOT NULL,
    "custoTotalCentavos" INTEGER,
    "completo" BOOLEAN NOT NULL,
    "estimado" BOOLEAN NOT NULL,
    "componentes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comercial_vendas_custos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comercial_perfis_unidade_storeId_etapaPreparacao_idx" ON "comercial_perfis_unidade"("storeId", "etapaPreparacao");

-- CreateIndex
CREATE UNIQUE INDEX "comercial_perfis_unidade_aparelhoId_storeId_key" ON "comercial_perfis_unidade"("aparelhoId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "comercial_custos_origens_storeId_tipo_referenciaId_key" ON "comercial_custos_origens"("storeId", "tipo", "referenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "comercial_custos_origens_id_storeId_key" ON "comercial_custos_origens"("id", "storeId");

-- CreateIndex
CREATE INDEX "comercial_custos_lancamentos_storeId_aparelhoId_status_idx" ON "comercial_custos_lancamentos"("storeId", "aparelhoId", "status");

-- CreateIndex
CREATE INDEX "comercial_custos_lancamentos_storeId_origemFinanceiraId_idx" ON "comercial_custos_lancamentos"("storeId", "origemFinanceiraId");

-- CreateIndex
CREATE UNIQUE INDEX "comercial_custos_lancamentos_storeId_idempotencyKey_key" ON "comercial_custos_lancamentos"("storeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "comercial_vendas_custos_aparelhoVendaId_key" ON "comercial_vendas_custos"("aparelhoVendaId");

-- CreateIndex
CREATE INDEX "comercial_vendas_custos_storeId_createdAt_idx" ON "comercial_vendas_custos"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "comercial_vendas_custos_storeId_vendaId_idx" ON "comercial_vendas_custos"("storeId", "vendaId");

-- AddForeignKey
ALTER TABLE "comercial_perfis_unidade" ADD CONSTRAINT "comercial_perfis_unidade_aparelhoId_storeId_fkey" FOREIGN KEY ("aparelhoId", "storeId") REFERENCES "aparelhos_fisicos"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lancamentos_aparelhoId_storeId_fkey" FOREIGN KEY ("aparelhoId", "storeId") REFERENCES "aparelhos_fisicos"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lancamentos_origemFinanceiraId_storeId_fkey" FOREIGN KEY ("origemFinanceiraId", "storeId") REFERENCES "comercial_custos_origens"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comercial_vendas_custos" ADD CONSTRAINT "comercial_vendas_custos_aparelhoVendaId_fkey" FOREIGN KEY ("aparelhoVendaId") REFERENCES "aparelhos_vendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ─── Invariantes que o Prisma não expressa ──────────────────────────────────
ALTER TABLE "comercial_perfis_unidade" ADD CONSTRAINT "comercial_perfis_categoria_ck" CHECK ("categoria" IN (
  'smartphone','tablet','notebook','computador','televisor','audio','eletrodomestico','outro'));
ALTER TABLE "comercial_perfis_unidade" ADD CONSTRAINT "comercial_perfis_funcionamento_ck" CHECK ("funcionamento" IN (
  'normal','com_avarias','danificado','nao_liga','nao_avaliado'));
ALTER TABLE "comercial_perfis_unidade" ADD CONSTRAINT "comercial_perfis_finalidade_ck" CHECK ("finalidade" IN (
  'revenda','preparacao','pecas','devolucao_fornecedor','baixa'));
ALTER TABLE "comercial_perfis_unidade" ADD CONSTRAINT "comercial_perfis_etapa_ck" CHECK ("etapaPreparacao" IN (
  'nenhuma','em_preparacao','em_testes','concluida'));
ALTER TABLE "comercial_perfis_unidade" ADD CONSTRAINT "comercial_perfis_custo_status_ck" CHECK ("custoAquisicaoStatus" IN (
  'conhecido','estimado','desconhecido'));

ALTER TABLE "comercial_custos_origens" ADD CONSTRAINT "comercial_custos_origens_tipo_ck" CHECK ("tipo" IN ('conta_pagar','gestor_money_gasto'));
ALTER TABLE "comercial_custos_origens" ADD CONSTRAINT "comercial_custos_origens_valores_ck" CHECK (
  "valorTotalCentavos" > 0 AND "quantidadeTotal" > 0);

ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lanc_categoria_ck" CHECK ("categoria" IN (
  'peca','mao_obra_interna','servico_terceirizado','frete','outro'));
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lanc_origem_ck" CHECK ("origem" IN (
  'estoque','preexistente','vinculo_financeiro','nova_compra','gerencial'));
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lanc_status_ck" CHECK ("status" IN ('ativo','estornado'));
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lanc_custo_status_ck" CHECK ("custoStatus" IN (
  'conhecido','estimado','desconhecido'));
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lanc_quantidade_ck" CHECK ("quantidade" > 0);
-- Custo desconhecido NÃO é zero: valor ausente se e somente se desconhecido.
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lanc_valor_ck" CHECK (
  ("custoStatus" = 'desconhecido' AND "valorCentavos" IS NULL) OR
  ("custoStatus" <> 'desconhecido' AND "valorCentavos" IS NOT NULL AND "valorCentavos" >= 0));
-- Cada origem carrega exatamente a referência que a prova (nenhuma saída financeira implícita).
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lanc_ref_ck" CHECK (
  ("origem" = 'estoque' AND "produtoId" IS NOT NULL AND "estoqueIdempotencyKey" IS NOT NULL AND "origemFinanceiraId" IS NULL AND "contaPagarTituloId" IS NULL) OR
  ("origem" = 'vinculo_financeiro' AND "origemFinanceiraId" IS NOT NULL AND "contaPagarTituloId" IS NULL AND "estoqueIdempotencyKey" IS NULL) OR
  ("origem" = 'nova_compra' AND "contaPagarTituloId" IS NOT NULL AND "origemFinanceiraId" IS NULL AND "estoqueIdempotencyKey" IS NULL) OR
  ("origem" IN ('preexistente','gerencial') AND "origemFinanceiraId" IS NULL AND "contaPagarTituloId" IS NULL AND "estoqueIdempotencyKey" IS NULL));
-- Mão de obra interna é custo gerencial: nunca vira obrigação ou pagamento.
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lanc_mao_obra_ck" CHECK (
  ("categoria" = 'mao_obra_interna') = ("origem" = 'gerencial'));
ALTER TABLE "comercial_custos_lancamentos" ADD CONSTRAINT "comercial_custos_lanc_estorno_ck" CHECK (
  ("status" = 'ativo' AND "estornadoEm" IS NULL) OR ("status" = 'estornado' AND "estornadoEm" IS NOT NULL));

ALTER TABLE "comercial_vendas_custos" ADD CONSTRAINT "comercial_vendas_custos_valores_ck" CHECK (
  "precoVendaCentavos" >= 0 AND "custoAplicadoCentavos" >= 0 AND
  ("custoAquisicaoCentavos" IS NULL OR "custoAquisicaoCentavos" >= 0) AND
  ("custoTotalCentavos" IS NULL OR "custoTotalCentavos" >= 0) AND
  ("completo" = ("custoTotalCentavos" IS NOT NULL)));

-- Lançamento: identidade e valores imutáveis; a única mudança permitida é ativo → estornado.
CREATE OR REPLACE FUNCTION "comercial_custo_lancamento_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'COMERCIAL_CUSTO_IMUTAVEL: lancamento de custo nao pode ser apagado' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."id" <> OLD."id" OR NEW."storeId" <> OLD."storeId" OR NEW."aparelhoId" <> OLD."aparelhoId"
     OR NEW."categoria" <> OLD."categoria" OR NEW."origem" <> OLD."origem" OR NEW."quantidade" <> OLD."quantidade"
     OR NEW."valorCentavos" IS DISTINCT FROM OLD."valorCentavos" OR NEW."custoStatus" <> OLD."custoStatus"
     OR NEW."produtoId" IS DISTINCT FROM OLD."produtoId" OR NEW."origemFinanceiraId" IS DISTINCT FROM OLD."origemFinanceiraId"
     OR NEW."contaPagarTituloId" IS DISTINCT FROM OLD."contaPagarTituloId" OR NEW."idempotencyKey" <> OLD."idempotencyKey"
     OR NEW."payloadHash" <> OLD."payloadHash" OR NEW."createdAt" <> OLD."createdAt"
     OR NEW."descricao" <> OLD."descricao" OR NEW."justificativa" <> OLD."justificativa" OR NEW."operador" <> OLD."operador"
     OR NEW."estoqueIdempotencyKey" IS DISTINCT FROM OLD."estoqueIdempotencyKey"
     OR NOT (OLD."status" = 'ativo' AND NEW."status" = 'estornado') THEN
    RAISE EXCEPTION 'COMERCIAL_CUSTO_IMUTAVEL: so a transicao ativo -> estornado e permitida' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE OR REPLACE TRIGGER "comercial_custo_lancamento_imutavel_trg" BEFORE UPDATE OR DELETE ON "comercial_custos_lancamentos"
  FOR EACH ROW EXECUTE FUNCTION "comercial_custo_lancamento_imutavel"();

-- Origem financeira e custo histórico da venda: append-only.
CREATE OR REPLACE FUNCTION "comercial_append_only"() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'COMERCIAL_APPEND_ONLY: % nao aceita %', TG_TABLE_NAME, TG_OP USING ERRCODE = 'check_violation';
END
$fn$;
CREATE OR REPLACE TRIGGER "comercial_custos_origens_append_only_trg" BEFORE UPDATE OR DELETE ON "comercial_custos_origens"
  FOR EACH ROW EXECUTE FUNCTION "comercial_append_only"();
CREATE OR REPLACE TRIGGER "comercial_vendas_custos_append_only_trg" BEFORE UPDATE OR DELETE ON "comercial_vendas_custos"
  FOR EACH ROW EXECUTE FUNCTION "comercial_append_only"();
