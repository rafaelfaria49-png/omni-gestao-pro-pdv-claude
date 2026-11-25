-- G004: aditivo. Nenhum dado/migration G001-G003 removido ou reescrito.
BEGIN;
-- AlterTable
ALTER TABLE "contas_pagar_titulos" ADD COLUMN     "cartaoCicloId" TEXT,
ADD COLUMN     "gastoId" TEXT,
ADD COLUMN     "versaoFinanceira" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "movimentacoes_financeiras" ADD COLUMN     "compensaMovimentacaoId" TEXT,
ADD COLUMN     "compensadoGastosCentavos" DECIMAL(20,0) NOT NULL DEFAULT 0,
ADD COLUMN     "operacaoFinanceiraId" TEXT;

-- CreateTable
CREATE TABLE "gastos_revisoes" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "criadoPorAdminUserId" TEXT NOT NULL,
    "grupoChave" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PRONTA',
    "proposta" JSONB NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "correcaoDeId" TEXT,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "decididaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, clock_timestamp()),

    CONSTRAINT "gastos_revisoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financeiro_operacoes" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "autorAdminUserId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "grupoChave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "revisaoId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'RESERVADA',
    "resultado" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, clock_timestamp()),
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "financeiro_operacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "operacaoId" TEXT NOT NULL,
    "revisaoId" TEXT NOT NULL,
    "grupoChave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" DECIMAL(20,0) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "dataGasto" DATE NOT NULL,
    "competencia" TEXT,
    "categoriaId" TEXT,
    "fornecedorId" TEXT,
    "contraparteTexto" TEXT,
    "documentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos_financeiros" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "operacaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valorCentavos" DECIMAL(20,0) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "carteiraId" TEXT NOT NULL,
    "formaPagamento" TEXT NOT NULL,
    "pagoEm" TIMESTAMP(3) NOT NULL,
    "movimentoId" TEXT NOT NULL,
    "compensaPagamentoId" TEXT,
    "compensaMovimentoLegadoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamentos_financeiros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alocacoes_pagamento" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "pagamentoId" TEXT NOT NULL,
    "pagarTituloId" TEXT,
    "gastoId" TEXT,
    "valorCentavos" DECIMAL(20,0) NOT NULL,
    "compensaAlocacaoId" TEXT,
    "estornadoCentavos" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alocacoes_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cartoes_instrumentos" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "nome" TEXT NOT NULL,
    "ultimos4" VARCHAR(4),
    "bandeira" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cartoes_instrumentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cartoes_ciclos" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "cartaoId" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "vencimento" DATE NOT NULL,
    "fechamentoEm" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cartoes_ciclos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financeiro_operacao_eventos" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "operacaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financeiro_operacao_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_outbox" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "operacaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDENTE',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, clock_timestamp()),

    CONSTRAINT "gastos_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gastos_revisoes_correcaoDeId_key" ON "gastos_revisoes"("correcaoDeId");

-- CreateIndex
CREATE INDEX "gastos_revisoes_perfilId_estado_expiraEm_idx" ON "gastos_revisoes"("perfilId", "estado", "expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_revisoes_id_perfilId_key" ON "gastos_revisoes"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_revisoes_perfilId_grupoChave_versao_key" ON "gastos_revisoes"("perfilId", "grupoChave", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_revisoes_correcaoDeId_perfilId_key" ON "gastos_revisoes"("correcaoDeId", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_operacoes_revisaoId_key" ON "financeiro_operacoes"("revisaoId");

-- CreateIndex
CREATE INDEX "financeiro_operacoes_perfilId_createdAt_idx" ON "financeiro_operacoes"("perfilId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_operacoes_id_perfilId_key" ON "financeiro_operacoes"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_operacoes_perfilId_chave_key" ON "financeiro_operacoes"("perfilId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_operacoes_perfilId_grupoChave_key" ON "financeiro_operacoes"("perfilId", "grupoChave");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_operacoes_revisaoId_perfilId_key" ON "financeiro_operacoes"("revisaoId", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_operacaoId_key" ON "gastos"("operacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_revisaoId_key" ON "gastos"("revisaoId");

-- CreateIndex
CREATE INDEX "gastos_perfilId_dataGasto_idx" ON "gastos"("perfilId", "dataGasto");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_id_perfilId_key" ON "gastos"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_operacaoId_perfilId_key" ON "gastos"("operacaoId", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_revisaoId_perfilId_key" ON "gastos"("revisaoId", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_perfilId_grupoChave_key" ON "gastos"("perfilId", "grupoChave");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_financeiros_operacaoId_key" ON "pagamentos_financeiros"("operacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_financeiros_movimentoId_key" ON "pagamentos_financeiros"("movimentoId");

-- CreateIndex
CREATE INDEX "pagamentos_financeiros_compensaPagamentoId_idx" ON "pagamentos_financeiros"("compensaPagamentoId");

-- CreateIndex
CREATE INDEX "pagamentos_financeiros_compensaMovimentoLegadoId_idx" ON "pagamentos_financeiros"("compensaMovimentoLegadoId");

-- CreateIndex
CREATE INDEX "pagamentos_financeiros_perfilId_pagoEm_idx" ON "pagamentos_financeiros"("perfilId", "pagoEm");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_financeiros_id_perfilId_key" ON "pagamentos_financeiros"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_financeiros_operacaoId_perfilId_key" ON "pagamentos_financeiros"("operacaoId", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_financeiros_movimentoId_perfilId_key" ON "pagamentos_financeiros"("movimentoId", "perfilId");

-- CreateIndex
CREATE INDEX "alocacoes_pagamento_pagarTituloId_idx" ON "alocacoes_pagamento"("pagarTituloId");

-- CreateIndex
CREATE INDEX "alocacoes_pagamento_gastoId_idx" ON "alocacoes_pagamento"("gastoId");

-- CreateIndex
CREATE INDEX "alocacoes_pagamento_compensaAlocacaoId_idx" ON "alocacoes_pagamento"("compensaAlocacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "alocacoes_pagamento_id_perfilId_key" ON "alocacoes_pagamento"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "alocacoes_pagamento_pagamentoId_pagarTituloId_key" ON "alocacoes_pagamento"("pagamentoId", "pagarTituloId");

-- CreateIndex
CREATE UNIQUE INDEX "alocacoes_pagamento_pagamentoId_gastoId_key" ON "alocacoes_pagamento"("pagamentoId", "gastoId");

-- CreateIndex
CREATE INDEX "cartoes_instrumentos_perfilId_ativo_idx" ON "cartoes_instrumentos"("perfilId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "cartoes_instrumentos_id_perfilId_key" ON "cartoes_instrumentos"("id", "perfilId");

-- CreateIndex
CREATE INDEX "cartoes_ciclos_perfilId_competencia_idx" ON "cartoes_ciclos"("perfilId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "cartoes_ciclos_id_perfilId_key" ON "cartoes_ciclos"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "cartoes_ciclos_cartaoId_identificador_key" ON "cartoes_ciclos"("cartaoId", "identificador");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_operacao_eventos_operacaoId_key" ON "financeiro_operacao_eventos"("operacaoId");

-- CreateIndex
CREATE INDEX "financeiro_operacao_eventos_perfilId_createdAt_idx" ON "financeiro_operacao_eventos"("perfilId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_operacao_eventos_id_perfilId_key" ON "financeiro_operacao_eventos"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_operacao_eventos_operacaoId_perfilId_key" ON "financeiro_operacao_eventos"("operacaoId", "perfilId");

-- CreateIndex
CREATE INDEX "gastos_outbox_perfilId_estado_createdAt_idx" ON "gastos_outbox"("perfilId", "estado", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_outbox_id_perfilId_key" ON "gastos_outbox"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_outbox_operacaoId_tipo_key" ON "gastos_outbox"("operacaoId", "tipo");

-- AddForeignKey
ALTER TABLE "contas_pagar_titulos" ADD CONSTRAINT "contas_pagar_titulos_gastoId_perfilId_fkey" FOREIGN KEY ("gastoId", "perfilId") REFERENCES "gastos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contas_pagar_titulos" ADD CONSTRAINT "contas_pagar_titulos_cartaoCicloId_perfilId_fkey" FOREIGN KEY ("cartaoCicloId", "perfilId") REFERENCES "cartoes_ciclos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_operacaoFinanceiraId_perfilId_fkey" FOREIGN KEY ("operacaoFinanceiraId", "perfilId") REFERENCES "financeiro_operacoes"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_compensaMovimentacaoId_perfilId_fkey" FOREIGN KEY ("compensaMovimentacaoId", "perfilId") REFERENCES "movimentacoes_financeiras"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_revisoes" ADD CONSTRAINT "gastos_revisoes_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_revisoes" ADD CONSTRAINT "gastos_revisoes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_revisoes" ADD CONSTRAINT "gastos_revisoes_criadoPorAdminUserId_fkey" FOREIGN KEY ("criadoPorAdminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_revisoes" ADD CONSTRAINT "gastos_revisoes_correcaoDeId_perfilId_fkey" FOREIGN KEY ("correcaoDeId", "perfilId") REFERENCES "gastos_revisoes"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_operacoes" ADD CONSTRAINT "financeiro_operacoes_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_operacoes" ADD CONSTRAINT "financeiro_operacoes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_operacoes" ADD CONSTRAINT "financeiro_operacoes_autorAdminUserId_fkey" FOREIGN KEY ("autorAdminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_operacoes" ADD CONSTRAINT "financeiro_operacoes_revisaoId_perfilId_fkey" FOREIGN KEY ("revisaoId", "perfilId") REFERENCES "gastos_revisoes"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_operacaoId_perfilId_fkey" FOREIGN KEY ("operacaoId", "perfilId") REFERENCES "financeiro_operacoes"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_revisaoId_perfilId_fkey" FOREIGN KEY ("revisaoId", "perfilId") REFERENCES "gastos_revisoes"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_categoriaId_perfilId_fkey" FOREIGN KEY ("categoriaId", "perfilId") REFERENCES "categorias_gastos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_documentoId_perfilId_fkey" FOREIGN KEY ("documentoId", "perfilId") REFERENCES "documentos_gastos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pagamentos_financeiros" ADD CONSTRAINT "pagamentos_financeiros_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pagamentos_financeiros" ADD CONSTRAINT "pagamentos_financeiros_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pagamentos_financeiros" ADD CONSTRAINT "pagamentos_financeiros_operacaoId_perfilId_fkey" FOREIGN KEY ("operacaoId", "perfilId") REFERENCES "financeiro_operacoes"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pagamentos_financeiros" ADD CONSTRAINT "pagamentos_financeiros_carteiraId_perfilId_fkey" FOREIGN KEY ("carteiraId", "perfilId") REFERENCES "carteiras_financeiras"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pagamentos_financeiros" ADD CONSTRAINT "pagamentos_financeiros_movimentoId_perfilId_fkey" FOREIGN KEY ("movimentoId", "perfilId") REFERENCES "movimentacoes_financeiras"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "pagamentos_financeiros" ADD CONSTRAINT "pagamentos_financeiros_compensaPagamentoId_perfilId_fkey" FOREIGN KEY ("compensaPagamentoId", "perfilId") REFERENCES "pagamentos_financeiros"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pagamentos_financeiros" ADD CONSTRAINT "pagamentos_financeiros_compensaMovimentoLegadoId_perfilId_fkey" FOREIGN KEY ("compensaMovimentoLegadoId", "perfilId") REFERENCES "movimentacoes_financeiras"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alocacoes_pagamento" ADD CONSTRAINT "alocacoes_pagamento_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alocacoes_pagamento" ADD CONSTRAINT "alocacoes_pagamento_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alocacoes_pagamento" ADD CONSTRAINT "alocacoes_pagamento_pagamentoId_perfilId_fkey" FOREIGN KEY ("pagamentoId", "perfilId") REFERENCES "pagamentos_financeiros"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alocacoes_pagamento" ADD CONSTRAINT "alocacoes_pagamento_pagarTituloId_perfilId_fkey" FOREIGN KEY ("pagarTituloId", "perfilId") REFERENCES "contas_pagar_titulos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alocacoes_pagamento" ADD CONSTRAINT "alocacoes_pagamento_gastoId_perfilId_fkey" FOREIGN KEY ("gastoId", "perfilId") REFERENCES "gastos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alocacoes_pagamento" ADD CONSTRAINT "alocacoes_pagamento_compensaAlocacaoId_perfilId_fkey" FOREIGN KEY ("compensaAlocacaoId", "perfilId") REFERENCES "alocacoes_pagamento"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cartoes_instrumentos" ADD CONSTRAINT "cartoes_instrumentos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cartoes_instrumentos" ADD CONSTRAINT "cartoes_instrumentos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cartoes_ciclos" ADD CONSTRAINT "cartoes_ciclos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cartoes_ciclos" ADD CONSTRAINT "cartoes_ciclos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cartoes_ciclos" ADD CONSTRAINT "cartoes_ciclos_cartaoId_perfilId_fkey" FOREIGN KEY ("cartaoId", "perfilId") REFERENCES "cartoes_instrumentos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_operacao_eventos" ADD CONSTRAINT "financeiro_operacao_eventos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_operacao_eventos" ADD CONSTRAINT "financeiro_operacao_eventos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "financeiro_operacao_eventos" ADD CONSTRAINT "financeiro_operacao_eventos_operacaoId_perfilId_fkey" FOREIGN KEY ("operacaoId", "perfilId") REFERENCES "financeiro_operacoes"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_outbox" ADD CONSTRAINT "gastos_outbox_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_outbox" ADD CONSTRAINT "gastos_outbox_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gastos_outbox" ADD CONSTRAINT "gastos_outbox_operacaoId_perfilId_fkey" FOREIGN KEY ("operacaoId", "perfilId") REFERENCES "financeiro_operacoes"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CHECKs complementam FKs MATCH SIMPLE: NULL pessoal nunca dispensa o perfil.
ALTER TABLE gastos_revisoes ADD CONSTRAINT g004_revisao_check CHECK (
  versao > 0 AND length("grupoChave") BETWEEN 1 AND 191 AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND estado IN ('PRONTA','APLICADA','SUBSTITUIDA','CANCELADA','EXPIRADA')
  AND tipo IN ('GASTO_PAGO','CONTA_PAGAR','PAGAR_TITULO','COMPRA_CREDITO','PAGAR_FATURA','ESTORNAR_PAGAMENTO','ESTORNAR_LEGADO')
  AND jsonb_typeof(proposta)='object' AND proposta->>'tipo'=tipo
  AND "expiraEm">"createdAt" AND ((estado='PRONTA')=("decididaEm" IS NULL)));
ALTER TABLE financeiro_operacoes ADD CONSTRAINT g004_operacao_check CHECK (
  length(chave) BETWEEN 1 AND 160 AND length("grupoChave") BETWEEN 1 AND 191 AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND estado IN ('RESERVADA','APLICADA') AND ((estado='RESERVADA' AND resultado IS NULL AND "concluidaEm" IS NULL)
    OR (estado='APLICADA' AND jsonb_typeof(resultado)='object' AND "concluidaEm" IS NOT NULL)));
ALTER TABLE gastos ADD CONSTRAINT g004_gasto_check CHECK (
  "valorCentavos">0 AND "valorCentavos"<=9000000000000 AND moeda='BRL'
  AND tipo IN ('GASTO_PAGO','CONTA_PAGAR','COMPRA_CREDITO') AND length(descricao) BETWEEN 1 AND 500
  AND (competencia IS NULL OR competencia ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$'));
ALTER TABLE pagamentos_financeiros ADD CONSTRAINT g004_pagamento_check CHECK (
  "valorCentavos">0 AND "valorCentavos"<=9000000000000 AND moeda='BRL'
  AND ("formaPagamento" IN ('pix','dinheiro','debito','transferencia','boleto') OR (tipo='ESTORNO' AND "formaPagamento"='nao_informado'))
  AND ((tipo='PAGAMENTO' AND "compensaPagamentoId" IS NULL AND "compensaMovimentoLegadoId" IS NULL)
    OR (tipo='ESTORNO' AND num_nonnulls("compensaPagamentoId","compensaMovimentoLegadoId")=1)));
ALTER TABLE alocacoes_pagamento ADD CONSTRAINT g004_alocacao_check CHECK (
  "valorCentavos">0 AND "valorCentavos"<=9000000000000 AND num_nonnulls("pagarTituloId","gastoId")=1
  AND "estornadoCentavos">=0 AND "estornadoCentavos"<="valorCentavos" AND "compensaAlocacaoId" IS DISTINCT FROM id);
ALTER TABLE cartoes_instrumentos ADD CONSTRAINT g004_cartao_check CHECK (
  length(nome) BETWEEN 1 AND 120 AND ("ultimos4" IS NULL OR "ultimos4" ~ '^[0-9]{4}$'));
ALTER TABLE cartoes_ciclos ADD CONSTRAINT g004_ciclo_check CHECK (
  length(identificador) BETWEEN 1 AND 191 AND competencia ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$');
ALTER TABLE financeiro_operacao_eventos ADD CONSTRAINT g004_evento_check CHECK (tipo='APLICADA' AND jsonb_typeof(dados)='object');
ALTER TABLE gastos_outbox ADD CONSTRAINT g004_outbox_check CHECK (tipo='OPERACAO_APLICADA' AND estado='PENDENTE' AND jsonb_typeof(payload)='object');
ALTER TABLE movimentacoes_financeiras ADD CONSTRAINT g004_mov_check CHECK (
  "compensadoGastosCentavos">=0 AND "compensadoGastosCentavos"<=9000000000000
  AND ("compensaMovimentacaoId" IS NULL OR ("operacaoFinanceiraId" IS NOT NULL AND "perfilId" IS NOT NULL))
  AND ("operacaoFinanceiraId" IS NULL OR ("perfilId" IS NOT NULL AND "carteiraId" IS NOT NULL AND "ocorridoEm" IS NOT NULL
    AND "valorCentavos">0 AND "valorCentavos"<=9000000000000 AND "precisaoStatus"='CENTAVOS')));
ALTER TABLE contas_pagar_titulos ADD CONSTRAINT g004_titulo_check CHECK (
  "versaoFinanceira">=0 AND (("gastoId" IS NULL AND "cartaoCicloId" IS NULL) OR "perfilId" IS NOT NULL));

CREATE FUNCTION g004_validar_escopo() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE p record; r jsonb; j jsonb:=to_jsonb(NEW); ref text; tabela text;
BEGIN
  SELECT * INTO p FROM financeiro_perfis WHERE id=NEW."perfilId" FOR SHARE;
  IF NOT FOUND OR NOT p.ativo OR p."storeId" IS DISTINCT FROM NEW."storeId" THEN
    RAISE EXCEPTION 'G004 escopo invalido' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (OLD."perfilId" IS DISTINCT FROM NEW."perfilId" OR OLD."storeId" IS DISTINCT FROM NEW."storeId") THEN
    RAISE EXCEPTION 'G004 escopo imutavel' USING ERRCODE='23514';
  END IF;
  IF j->>'criadoPorAdminUserId' IS NOT NULL OR j->>'autorAdminUserId' IS NOT NULL THEN
    ref:=coalesce(j->>'criadoPorAdminUserId',j->>'autorAdminUserId');
    IF (p.tipo='PESSOAL' AND p."ownerAdminUserId" IS DISTINCT FROM ref)
      OR NOT EXISTS(SELECT 1 FROM admin_users WHERE id=ref AND active)
      OR (p.tipo='EMPRESA' AND NOT EXISTS(SELECT 1 FROM financeiro_perfil_membros m
        JOIN admin_user_stores s ON s."storeId"=m."storeId" AND s."adminUserId"=m."adminUserId"
        WHERE m."perfilId"=p.id AND m."adminUserId"=ref AND m."revogadoEm" IS NULL)) THEN
      RAISE EXCEPTION 'G004 autor invalido' USING ERRCODE='23514';
    END IF;
  END IF;
  FOR ref,tabela IN SELECT * FROM (VALUES
    ('revisaoId','gastos_revisoes'),('correcaoDeId','gastos_revisoes'),('operacaoId','financeiro_operacoes'),
    ('pagamentoId','pagamentos_financeiros'),('compensaPagamentoId','pagamentos_financeiros'),
    ('gastoId','gastos'),('cartaoId','cartoes_instrumentos'),('compensaAlocacaoId','alocacoes_pagamento'),
    ('pagarTituloId','contas_pagar_titulos'),('carteiraId','carteiras_financeiras'),
    ('documentoId','documentos_gastos'),('compensaMovimentoLegadoId','movimentacoes_financeiras')) x(c,t)
  LOOP
    IF j->>ref IS NOT NULL THEN
      EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE id=$1',tabela) INTO r USING j->>ref;
      IF r IS NULL OR r->>'perfilId' IS DISTINCT FROM NEW."perfilId" OR r->>'storeId' IS DISTINCT FROM NEW."storeId" THEN
        RAISE EXCEPTION 'G004 vinculo invalido' USING ERRCODE='23514';
      END IF;
    END IF;
  END LOOP;
  IF TG_TABLE_NAME='gastos' THEN
    IF NEW."fornecedorId" IS NOT NULL AND (NEW."storeId" IS NULL OR NOT EXISTS(SELECT 1 FROM fornecedores
      WHERE id=NEW."fornecedorId" AND "storeId"=NEW."storeId" AND active)) THEN
      RAISE EXCEPTION 'G004 fornecedor invalido' USING ERRCODE='23514';
    END IF;
    IF NEW."categoriaId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM categorias_gastos
      WHERE id=NEW."categoriaId" AND "perfilId"=NEW."perfilId" AND "storeId" IS NOT DISTINCT FROM NEW."storeId" AND natureza='DESPESA' AND ativo) THEN
      RAISE EXCEPTION 'G004 categoria invalida' USING ERRCODE='23514';
    END IF;
    IF NEW."documentoId" IS NOT NULL AND EXISTS(SELECT 1 FROM documentos_gastos WHERE id=NEW."documentoId" AND estado='QUARENTENA') THEN
      RAISE EXCEPTION 'G004 documento indisponivel' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['gastos_revisoes','financeiro_operacoes','gastos','pagamentos_financeiros','alocacoes_pagamento',
    'cartoes_instrumentos','cartoes_ciclos','financeiro_operacao_eventos','gastos_outbox'] LOOP
    EXECUTE format('CREATE TRIGGER g004_escopo BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION g004_validar_escopo()',t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
  END LOOP;
END $$;

-- Imutabilidade dos fatos, com uma única transição de revisão/reserva.
CREATE FUNCTION g004_imutabilidade() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE a jsonb; b jsonb;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'G004 fato imutavel' USING ERRCODE='23514'; END IF;
  a:=to_jsonb(OLD); b:=to_jsonb(NEW);
  IF TG_TABLE_NAME='gastos_revisoes' THEN
    IF a-ARRAY['estado','decididaEm'] = b-ARRAY['estado','decididaEm'] AND OLD.estado='PRONTA'
      AND NEW.estado IN ('APLICADA','SUBSTITUIDA','CANCELADA','EXPIRADA') THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='financeiro_operacoes' THEN
    IF a-ARRAY['estado','resultado','concluidaEm'] = b-ARRAY['estado','resultado','concluidaEm']
      AND OLD.estado='RESERVADA' AND NEW.estado='APLICADA' THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='alocacoes_pagamento' THEN
    IF pg_trigger_depth()>1 AND a-'estornadoCentavos'=b-'estornadoCentavos'
      AND NEW."estornadoCentavos">OLD."estornadoCentavos" THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'G004 fato imutavel' USING ERRCODE='23514';
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['gastos_revisoes','financeiro_operacoes','gastos','pagamentos_financeiros',
    'alocacoes_pagamento','financeiro_operacao_eventos','gastos_outbox'] LOOP
    EXECUTE format('CREATE TRIGGER g004_imutavel BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION g004_imutabilidade()',t);
  END LOOP;
END $$;

CREATE FUNCTION g004_revisao_encadeada() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.estado<>'PRONTA' THEN RAISE EXCEPTION 'G004 revisao inicial invalida' USING ERRCODE='23514'; END IF;
  IF (NEW.versao=1 AND NEW."correcaoDeId" IS NOT NULL) OR (NEW.versao>1 AND NOT EXISTS(
    SELECT 1 FROM gastos_revisoes r WHERE r.id=NEW."correcaoDeId" AND r."perfilId"=NEW."perfilId"
      AND r."grupoChave"=NEW."grupoChave" AND r.versao=NEW.versao-1 AND r.estado='SUBSTITUIDA')) THEN
    RAISE EXCEPTION 'G004 cadeia invalida' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER g004_cadeia BEFORE INSERT ON gastos_revisoes FOR EACH ROW EXECUTE FUNCTION g004_revisao_encadeada();

-- O contador do movimento original é uma projeção derivada, nunca editável pelo caller.
CREATE FUNCTION g004_compensacao_individual_valida(j jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM movimentacoes_financeiras m
    WHERE m.id=j->>'compensaMovimentacaoId' AND m."perfilId"=j->>'perfilId'
      AND m."storeId" IS NOT DISTINCT FROM j->>'storeId' AND m."carteiraId"=j->>'carteiraId'
      AND m.tipo='saida' AND j->>'tipo'='entrada' AND j->>'origem'='estorno_pagar'
      AND m."compensaMovimentacaoId" IS NULL AND (j->>'valorCentavos')::numeric>0
      AND (j->>'valorCentavos')::numeric<=coalesce(m."valorCentavos",m.valor::numeric*100)
      AND j->>'operacaoFinanceiraId' IS NOT NULL)
$$;
CREATE FUNCTION g004_movimento_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD."operacaoFinanceiraId" IS NOT NULL OR OLD."compensadoGastosCentavos">0 THEN
      RAISE EXCEPTION 'G004 movimento imutavel' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW."compensadoGastosCentavos" IS DISTINCT FROM OLD."compensadoGastosCentavos" THEN
      IF pg_trigger_depth()>1 AND to_jsonb(NEW)-'compensadoGastosCentavos'=to_jsonb(OLD)-'compensadoGastosCentavos'
        AND NEW."compensadoGastosCentavos">OLD."compensadoGastosCentavos" THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'G004 contador derivado' USING ERRCODE='23514';
    END IF;
    IF OLD."operacaoFinanceiraId" IS NOT NULL OR OLD."compensadoGastosCentavos">0 THEN
      RAISE EXCEPTION 'G004 movimento imutavel' USING ERRCODE='23514';
    END IF;
    IF NEW."compensaMovimentacaoId" IS NOT NULL OR NEW."operacaoFinanceiraId" IS NOT NULL THEN
      RAISE EXCEPTION 'G004 nao adota movimento historico' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."compensadoGastosCentavos"<>0 THEN RAISE EXCEPTION 'G004 contador inicial' USING ERRCODE='23514'; END IF;
  IF NEW."compensaMovimentacaoId" IS NOT NULL THEN
    IF NOT g004_compensacao_individual_valida(to_jsonb(NEW)) THEN RAISE EXCEPTION 'G004 compensacao invalida' USING ERRCODE='23514'; END IF;
    UPDATE movimentacoes_financeiras SET "compensadoGastosCentavos"="compensadoGastosCentavos"+NEW."valorCentavos"
      WHERE id=NEW."compensaMovimentacaoId" AND "compensadoGastosCentavos"+NEW."valorCentavos"<=coalesce("valorCentavos",valor::numeric*100);
    IF NOT FOUND THEN RAISE EXCEPTION 'G004 compensacao excedida' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER g004_movimento BEFORE INSERT OR UPDATE OR DELETE ON movimentacoes_financeiras FOR EACH ROW EXECUTE FUNCTION g004_movimento_guard();

CREATE FUNCTION g004_alocacao_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE p record; a record; original record;
BEGIN
  IF NEW."estornadoCentavos"<>0 THEN RAISE EXCEPTION 'G004 contador inicial' USING ERRCODE='23514'; END IF;
  SELECT * INTO p FROM pagamentos_financeiros WHERE id=NEW."pagamentoId";
  IF NEW."compensaAlocacaoId" IS NOT NULL THEN
    SELECT * INTO a FROM alocacoes_pagamento WHERE id=NEW."compensaAlocacaoId" FOR UPDATE;
    SELECT * INTO original FROM pagamentos_financeiros WHERE id=a."pagamentoId";
    IF p.tipo<>'ESTORNO' OR original.tipo<>'PAGAMENTO' OR p."compensaPagamentoId" IS DISTINCT FROM original.id
      OR a."pagarTituloId" IS DISTINCT FROM NEW."pagarTituloId" OR a."gastoId" IS DISTINCT FROM NEW."gastoId" THEN
      RAISE EXCEPTION 'G004 alocacao compensatoria invalida' USING ERRCODE='23514';
    END IF;
    UPDATE alocacoes_pagamento SET "estornadoCentavos"="estornadoCentavos"+NEW."valorCentavos"
      WHERE id=a.id AND "estornadoCentavos"+NEW."valorCentavos"<="valorCentavos";
    IF NOT FOUND THEN RAISE EXCEPTION 'G004 alocacao excedida' USING ERRCODE='23514'; END IF;
  ELSIF p.tipo='ESTORNO' AND (p."compensaPagamentoId" IS NOT NULL OR NOT EXISTS(
    SELECT 1 FROM movimentacoes_financeiras m WHERE m.id=p."compensaMovimentoLegadoId"
      AND m."pagarTituloId"=NEW."pagarTituloId" AND m."perfilId"=NEW."perfilId" AND m."operacaoFinanceiraId" IS NULL)) THEN
    RAISE EXCEPTION 'G004 compensacao sem alvo individual' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER g004_alocacao BEFORE INSERT ON alocacoes_pagamento FOR EACH ROW EXECUTE FUNCTION g004_alocacao_guard();

-- Verificação do estado FINAL no COMMIT, não apenas de um INSERT intermediário.
CREATE FUNCTION g004_consistencia_final() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE op record; rev record; p record; m record; soma numeric; qtd integer; esperado integer; ident text;
BEGIN
  IF TG_TABLE_NAME='financeiro_operacoes' THEN ident:=NEW.id;
  ELSIF TG_TABLE_NAME='alocacoes_pagamento' THEN SELECT "operacaoId" INTO ident FROM pagamentos_financeiros WHERE id=NEW."pagamentoId";
  ELSIF TG_TABLE_NAME='movimentacoes_financeiras' THEN ident:=NEW."operacaoFinanceiraId";
  ELSIF TG_TABLE_NAME='contas_pagar_titulos' THEN SELECT "operacaoId" INTO ident FROM gastos WHERE id=NEW."gastoId";
  ELSE ident:=NEW."operacaoId"; END IF;
  SELECT * INTO op FROM financeiro_operacoes WHERE id=ident;
  SELECT * INTO rev FROM gastos_revisoes WHERE id=op."revisaoId";
  IF op.estado<>'APLICADA' OR rev.estado<>'APLICADA' OR op."grupoChave" IS DISTINCT FROM rev."grupoChave"
    OR op."payloadHash" IS DISTINCT FROM rev."payloadHash" OR op.tipo IS DISTINCT FROM rev.tipo
    OR op.resultado->>'operacaoId' IS DISTINCT FROM op.id OR op.resultado->>'revisaoId' IS DISTINCT FROM rev.id
    OR op.resultado->>'estado' IS DISTINCT FROM 'APLICADA'
    OR NOT EXISTS(SELECT 1 FROM financeiro_operacao_eventos WHERE "operacaoId"=op.id AND dados=op.resultado)
    OR NOT EXISTS(SELECT 1 FROM gastos_outbox WHERE "operacaoId"=op.id AND payload=op.resultado) THEN
    RAISE EXCEPTION 'G004 operacao incompleta' USING ERRCODE='23514';
  END IF;
  esperado:=CASE WHEN op.tipo IN ('GASTO_PAGO','CONTA_PAGAR','COMPRA_CREDITO') THEN 1 ELSE 0 END;
  SELECT count(*) INTO qtd FROM gastos WHERE "operacaoId"=op.id AND "revisaoId"=rev.id AND "grupoChave"=op."grupoChave" AND tipo=op.tipo;
  IF qtd<>esperado THEN RAISE EXCEPTION 'G004 fato inconsistente' USING ERRCODE='23514'; END IF;
  IF esperado=1 AND NOT EXISTS(SELECT 1 FROM gastos WHERE "operacaoId"=op.id
    AND "valorCentavos"=(rev.proposta->>'valorCentavos')::numeric
    AND "valorCentavos"=(op.resultado->>'valorCentavos')::numeric AND id=op.resultado->>'gastoId') THEN
    RAISE EXCEPTION 'G004 valor do fato inconsistente' USING ERRCODE='23514';
  END IF;
  esperado:=CASE WHEN op.tipo IN ('CONTA_PAGAR','COMPRA_CREDITO') THEN 0 ELSE 1 END;
  SELECT count(*) INTO qtd FROM pagamentos_financeiros WHERE "operacaoId"=op.id;
  IF qtd<>esperado THEN RAISE EXCEPTION 'G004 pagamento inconsistente' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO qtd FROM movimentacoes_financeiras WHERE "operacaoFinanceiraId"=op.id;
  IF qtd<>esperado THEN RAISE EXCEPTION 'G004 movimento inconsistente' USING ERRCODE='23514'; END IF;
  IF esperado=1 THEN
    SELECT * INTO p FROM pagamentos_financeiros WHERE "operacaoId"=op.id;
    SELECT * INTO m FROM movimentacoes_financeiras WHERE id=p."movimentoId";
    SELECT coalesce(sum("valorCentavos"),0),count(*) INTO soma,qtd FROM alocacoes_pagamento WHERE "pagamentoId"=p.id;
    IF soma<>p."valorCentavos" OR qtd=0 OR m."operacaoFinanceiraId" IS DISTINCT FROM op.id
      OR m."perfilId" IS DISTINCT FROM p."perfilId" OR m."storeId" IS DISTINCT FROM p."storeId"
      OR m."valorCentavos" IS DISTINCT FROM p."valorCentavos" OR m."carteiraId" IS DISTINCT FROM p."carteiraId"
      OR m."ocorridoEm" IS DISTINCT FROM p."pagoEm" OR m."formaPagamento" IS DISTINCT FROM p."formaPagamento"
      OR m.tipo IS DISTINCT FROM (CASE WHEN p.tipo='ESTORNO' THEN 'entrada' ELSE 'saida' END)
      OR (p.tipo='PAGAMENTO' AND m."compensaMovimentacaoId" IS NOT NULL)
      OR (p.tipo='ESTORNO' AND m."compensaMovimentacaoId" IS DISTINCT FROM coalesce(p."compensaMovimentoLegadoId",
        (SELECT "movimentoId" FROM pagamentos_financeiros WHERE id=p."compensaPagamentoId")))
      OR op.resultado->>'pagamentoId' IS DISTINCT FROM p.id
      OR op.resultado->>'valorCentavos' IS DISTINCT FROM p."valorCentavos"::text
      OR op.resultado->'movimentoIds' IS DISTINCT FROM jsonb_build_array(m.id) THEN
      RAISE EXCEPTION 'G004 pagamento movimento alocacao divergente' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT sum(t."valorCentavos") INTO soma FROM contas_pagar_titulos t JOIN gastos g ON g.id=t."gastoId" WHERE g."operacaoId"=op.id;
    IF soma IS DISTINCT FROM (op.resultado->>'valorCentavos')::numeric THEN RAISE EXCEPTION 'G004 obrigacao inconsistente' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER g004_operacao_final AFTER INSERT OR UPDATE ON financeiro_operacoes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION g004_consistencia_final();
CREATE CONSTRAINT TRIGGER g004_pagamento_final AFTER INSERT ON pagamentos_financeiros DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION g004_consistencia_final();
CREATE CONSTRAINT TRIGGER g004_alocacao_final AFTER INSERT ON alocacoes_pagamento DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION g004_consistencia_final();
CREATE CONSTRAINT TRIGGER g004_movimento_final AFTER INSERT ON movimentacoes_financeiras DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."operacaoFinanceiraId" IS NOT NULL) EXECUTE FUNCTION g004_consistencia_final();
CREATE CONSTRAINT TRIGGER g004_titulo_final AFTER INSERT OR UPDATE ON contas_pagar_titulos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."gastoId" IS NOT NULL) EXECUTE FUNCTION g004_consistencia_final();

-- Novas relações adicionadas aos títulos/movimentos também conferem storeId NULL.
CREATE FUNCTION g004_vinculos_canonicos() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j jsonb:=to_jsonb(NEW); r jsonb; campo text; tabela text;
BEGIN
  FOR campo,tabela IN SELECT * FROM (VALUES ('gastoId','gastos'),('cartaoCicloId','cartoes_ciclos'),('operacaoFinanceiraId','financeiro_operacoes')) x(c,t) LOOP
    IF j->>campo IS NOT NULL THEN
      EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE id=$1',tabela) INTO r USING j->>campo;
      IF r IS NULL OR NEW."perfilId" IS NULL OR r->>'perfilId' IS DISTINCT FROM NEW."perfilId" OR r->>'storeId' IS DISTINCT FROM NEW."storeId" THEN
        RAISE EXCEPTION 'G004 vinculo canonico invalido' USING ERRCODE='23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER g004_pagar_vinculos BEFORE INSERT OR UPDATE ON contas_pagar_titulos FOR EACH ROW EXECUTE FUNCTION g004_vinculos_canonicos();
CREATE TRIGGER g004_mov_vinculos BEFORE INSERT OR UPDATE ON movimentacoes_financeiras FOR EACH ROW EXECUTE FUNCTION g004_vinculos_canonicos();

CREATE OR REPLACE FUNCTION gastos_validar_escopo() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE p record; r record; j jsonb; anterior jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    anterior := to_jsonb(OLD);
    IF OLD."storeId" IS DISTINCT FROM NEW."storeId"
      OR (OLD."perfilId" IS NOT NULL AND OLD."perfilId" IS DISTINCT FROM NEW."perfilId") THEN
      RAISE EXCEPTION 'Escopo financeiro imutavel' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."perfilId" IS NOT NULL THEN
    SELECT * INTO p FROM "financeiro_perfis" WHERE "id" = NEW."perfilId";
    IF NOT FOUND OR NOT p."ativo" OR p."storeId" IS DISTINCT FROM NEW."storeId" THEN
      RAISE EXCEPTION 'Escopo financeiro invalido' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."storeId" IS NULL THEN
    RAISE EXCEPTION 'Escopo financeiro obrigatorio' USING ERRCODE = '23514';
  END IF;
  j := to_jsonb(NEW);
  IF TG_TABLE_NAME IN ('contas_pagar_titulos', 'contas_receber_titulos') THEN
    IF NEW."storeId" IS NULL THEN
      IF NEW."localKey" IS NOT NULL OR NEW."identidadePessoal" IS NULL
        OR NOT starts_with(NEW."identidadePessoal", 'gastos:pessoal:' || NEW."perfilId" || ':') THEN
        RAISE EXCEPTION 'Namespace pessoal invalido' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW."identidadePessoal" IS NOT NULL THEN
      RAISE EXCEPTION 'Namespace empresarial invalido' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD."localKey" IS DISTINCT FROM NEW."localKey"
      OR OLD."identidadePessoal" IS DISTINCT FROM NEW."identidadePessoal") THEN
      RAISE EXCEPTION 'Identidade financeira imutavel' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF j->>'carteiraId' IS NOT NULL THEN
    SELECT * INTO r FROM "carteiras_financeiras" WHERE "id" = j->>'carteiraId';
    IF NOT FOUND OR r."storeId" IS DISTINCT FROM NEW."storeId"
      OR (NEW."perfilId" IS NOT NULL AND r."perfilId" IS DISTINCT FROM NEW."perfilId") THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."ativo" AND (TG_OP = 'INSERT' OR anterior->>'carteiraId' IS DISTINCT FROM j->>'carteiraId')
      AND NOT (TG_TABLE_NAME = 'movimentacoes_financeiras' AND g004_compensacao_individual_valida(j)) THEN
      -- Um estorno conserva a conta do fato original, mesmo desativada depois.
      -- O prefixo sozinho não autoriza: exigir referência, direção, escopo e
      -- soma dos fatos realmente existentes nessa mesma conta. A tolerância é
      -- apenas a representação Float legada (as entradas novas usam centavos).
      IF TG_TABLE_NAME <> 'movimentacoes_financeiras'
        OR coalesce(j->>'origem', '') NOT IN ('estorno_receber', 'estorno_pagar')
        OR coalesce((j->>'valor')::numeric, 0) <= 0
        OR j->>'tipo' IS DISTINCT FROM (CASE WHEN j->>'origem' = 'estorno_receber' THEN 'saida' ELSE 'entrada' END)
        -- Reconciliação #397: o estorno é POR PAGAMENTO (parcial) — não exige a soma exata;
        -- exige que não ultrapasse o líquido ainda movimentado nesta conta (originais −
        -- estornos anteriores, excluída a própria linha em UPDATE). Tolerância = Float legado.
        OR (j->>'valor')::numeric > (
          coalesce((
            SELECT SUM(m."valor"::numeric) FROM "movimentacoes_financeiras" m
            WHERE m."storeId" IS NOT DISTINCT FROM NEW."storeId"
              AND m."referenciaId" = j->>'referenciaId'
              AND m."carteiraId" = j->>'carteiraId'
              AND m."tipo" = CASE WHEN j->>'origem' = 'estorno_receber' THEN 'entrada' ELSE 'saida' END
              AND (
                m."origem" = CASE WHEN j->>'origem' = 'estorno_receber' THEN 'receber' ELSE 'pagar' END
                OR m."origem" = CASE WHEN j->>'origem' = 'estorno_receber' THEN 'receber_parcial' ELSE 'pagar_parcial' END
                OR starts_with(m."origem", CASE WHEN j->>'origem' = 'estorno_receber' THEN 'receber_parcial_' ELSE 'pagar_parcial_' END)
              )
              AND (m."perfilId" IS NOT DISTINCT FROM NEW."perfilId" OR (m."perfilId" IS NULL AND NEW."storeId" IS NOT NULL))
          ), 0)
          - coalesce((
            SELECT SUM(e."valor"::numeric) FROM "movimentacoes_financeiras" e
            WHERE e."storeId" IS NOT DISTINCT FROM NEW."storeId"
              AND e."referenciaId" = j->>'referenciaId'
              AND e."carteiraId" = j->>'carteiraId'
              AND e."tipo" = j->>'tipo'
              AND e."origem" = j->>'origem'
              AND e."id" <> j->>'id'
          ), 0)
          + 0.000001::numeric
        ) THEN
        RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF j->>'categoriaId' IS NOT NULL THEN
    SELECT * INTO r FROM "categorias_gastos" WHERE "id" = j->>'categoriaId';
    IF NOT FOUND OR NEW."perfilId" IS NULL OR r."perfilId" IS DISTINCT FROM NEW."perfilId"
      OR r."storeId" IS DISTINCT FROM NEW."storeId"
      OR (TG_TABLE_NAME = 'contas_pagar_titulos' AND r."natureza" <> 'DESPESA')
      OR (TG_TABLE_NAME = 'contas_receber_titulos' AND r."natureza" <> 'RECEITA')
      OR (TG_TABLE_NAME = 'movimentacoes_financeiras' AND r."natureza" <> CASE WHEN j->>'tipo' = 'saida' THEN 'DESPESA' ELSE 'RECEITA' END) THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."ativo" AND (TG_OP = 'INSERT' OR anterior->>'categoriaId' IS DISTINCT FROM j->>'categoriaId') THEN
      RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF j->>'fornecedorId' IS NOT NULL THEN
    SELECT * INTO r FROM "fornecedores" WHERE "id" = j->>'fornecedorId';
    IF NOT FOUND OR NEW."storeId" IS NULL OR r."storeId" IS DISTINCT FROM NEW."storeId" THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."active" AND (TG_OP = 'INSERT' OR OLD."fornecedorId" IS DISTINCT FROM NEW."fornecedorId") THEN
      RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF j->>'pagarTituloId' IS NOT NULL THEN
    SELECT * INTO r FROM "contas_pagar_titulos" WHERE "id" = j->>'pagarTituloId';
    IF NOT FOUND OR r."perfilId" IS DISTINCT FROM NEW."perfilId"
      OR r."storeId" IS DISTINCT FROM NEW."storeId" OR j->>'tipo' <> 'saida' THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."ativo" AND (TG_OP = 'INSERT' OR anterior->>'pagarTituloId' IS DISTINCT FROM j->>'pagarTituloId') THEN
      RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF j->>'receberTituloId' IS NOT NULL THEN
    SELECT * INTO r FROM "contas_receber_titulos" WHERE "id" = j->>'receberTituloId';
    IF NOT FOUND OR r."perfilId" IS DISTINCT FROM NEW."perfilId"
      OR r."storeId" IS DISTINCT FROM NEW."storeId" OR j->>'tipo' <> 'entrada' THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."ativo" AND (TG_OP = 'INSERT' OR anterior->>'receberTituloId' IS DISTINCT FROM j->>'receberTituloId') THEN
      RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
