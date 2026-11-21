-- OMNI-APARELHOS-CADASTRO-COMPRAS-VENDAS-GARANTIAS-ENDTOEND-001
-- Migration ADITIVA: somente CREATE TABLE / INDEX / FK / CHECK em tabelas NOVAS.
-- Nenhuma coluna de tabela existente é alterada. Isolada das migrations KG.
-- NÃO aplicar em Production sem autorização (rollout controlado). Reversão: down.sql.

-- CreateTable
CREATE TABLE "aparelhos_fisicos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "variante" TEXT NOT NULL DEFAULT '',
    "armazenamento" TEXT NOT NULL DEFAULT '',
    "memoriaRam" TEXT NOT NULL DEFAULT '',
    "cor" TEXT NOT NULL DEFAULT '',
    "condicao" TEXT NOT NULL,
    "imei1" TEXT,
    "imei2" TEXT,
    "serial" TEXT,
    "ean" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aguardando_conferencia',
    "propriedade" TEXT NOT NULL DEFAULT 'aguardando_aquisicao',
    "origem" TEXT NOT NULL,
    "aquisicaoId" TEXT,
    "custoAquisicao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "despesas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custoTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "precoSugerido" DOUBLE PRECISION,
    "precoVenda" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "garantiaContratualDias" INTEGER NOT NULL DEFAULT 0,
    "acessorios" JSONB NOT NULL DEFAULT '{}',
    "estadoFisico" TEXT NOT NULL DEFAULT '',
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "bateriaSaude" INTEGER,
    "bateriaFonte" TEXT,
    "restricaoStatus" TEXT NOT NULL DEFAULT 'nao_consultado',
    "restricaoFonte" TEXT,
    "restricaoConferidaEm" TIMESTAMP(3),
    "restricaoConferidaPor" TEXT,
    "observacoes" TEXT NOT NULL DEFAULT '',
    "entradaEstoqueEm" TIMESTAMP(3),
    "reservaToken" TEXT,
    "reservadoAte" TIMESTAMP(3),
    "reservadoPor" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aparelhos_fisicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparelhos_identificadores" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aparelhos_identificadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparelhos_eventos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "deStatus" TEXT,
    "paraStatus" TEXT,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "operador" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aparelhos_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparelhos_fotos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "legenda" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aparelhos_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparelhos_aquisicoes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aguardando_aprovacao',
    "clienteId" TEXT,
    "fornecedorId" TEXT,
    "vendedorNome" TEXT NOT NULL DEFAULT '',
    "vendedorDocMascarado" TEXT NOT NULL DEFAULT '',
    "vendedorDocHash" TEXT,
    "documentoOrigemTipo" TEXT NOT NULL DEFAULT '',
    "documentoOrigemNumero" TEXT NOT NULL DEFAULT '',
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "formaPagamento" TEXT NOT NULL DEFAULT '',
    "pagamentoStatus" TEXT NOT NULL DEFAULT 'pendente',
    "observacoes" TEXT NOT NULL DEFAULT '',
    "motivoRecusa" TEXT NOT NULL DEFAULT '',
    "aprovadaPor" TEXT,
    "aprovadaEm" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aparelhos_aquisicoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparelhos_vendas" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "aparelhoId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "clienteId" TEXT,
    "numeroGarantia" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "precoVenda" DOUBLE PRECISION NOT NULL,
    "dataVenda" TIMESTAMP(3) NOT NULL,
    "dataEntrega" TIMESTAMP(3) NOT NULL,
    "legalDias" INTEGER NOT NULL DEFAULT 90,
    "legalFim" TIMESTAMP(3) NOT NULL,
    "contratualDias" INTEGER NOT NULL DEFAULT 0,
    "contratualFim" TIMESTAMP(3),
    "coberturaFim" TIMESTAMP(3) NOT NULL,
    "fabricanteInfo" TEXT NOT NULL DEFAULT '',
    "fabricanteFim" TIMESTAMP(3),
    "politicaVersao" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" CHAR(64) NOT NULL,
    "operador" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aparelhos_vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparelhos_politicas_loja" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "presetsContratuaisDias" JSONB NOT NULL DEFAULT '[0,30,90,180,365]',
    "contratualPadraoDias" INTEGER NOT NULL DEFAULT 90,
    "contratualMaxDias" INTEGER NOT NULL DEFAULT 730,
    "condicoesTermo" TEXT NOT NULL DEFAULT '',
    "aquisicaoExigeAprovacao" BOOLEAN NOT NULL DEFAULT true,
    "liberacaoExigeConferencia" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aparelhos_politicas_loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparelhos_documentos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "aparelhoVendaId" TEXT,
    "aquisicaoId" TEXT,
    "tipo" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "conteudoHash" CHAR(64) NOT NULL,
    "emissoes" INTEGER NOT NULL DEFAULT 1,
    "primeiraEmissaoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaEmissaoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidoPor" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "aparelhos_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aparelhos_sequencias" (
    "storeId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aparelhos_sequencias_pkey" PRIMARY KEY ("storeId","chave","ano")
);

-- CreateIndex
CREATE INDEX "aparelhos_fisicos_storeId_status_idx" ON "aparelhos_fisicos"("storeId", "status");

-- CreateIndex
CREATE INDEX "aparelhos_fisicos_storeId_produtoId_idx" ON "aparelhos_fisicos"("storeId", "produtoId");

-- CreateIndex
CREATE INDEX "aparelhos_fisicos_storeId_createdAt_idx" ON "aparelhos_fisicos"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_fisicos_storeId_codigoInterno_key" ON "aparelhos_fisicos"("storeId", "codigoInterno");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_fisicos_id_storeId_key" ON "aparelhos_fisicos"("id", "storeId");

-- CreateIndex
CREATE INDEX "aparelhos_identificadores_aparelhoId_idx" ON "aparelhos_identificadores"("aparelhoId");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_identificadores_storeId_tipo_valor_key" ON "aparelhos_identificadores"("storeId", "tipo", "valor");

-- CreateIndex
CREATE INDEX "aparelhos_eventos_storeId_aparelhoId_createdAt_idx" ON "aparelhos_eventos"("storeId", "aparelhoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_eventos_storeId_idempotencyKey_key" ON "aparelhos_eventos"("storeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "aparelhos_fotos_storeId_aparelhoId_idx" ON "aparelhos_fotos"("storeId", "aparelhoId");

-- CreateIndex
CREATE INDEX "aparelhos_aquisicoes_storeId_status_idx" ON "aparelhos_aquisicoes"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_aquisicoes_storeId_protocolo_key" ON "aparelhos_aquisicoes"("storeId", "protocolo");

-- CreateIndex
CREATE INDEX "aparelhos_vendas_storeId_aparelhoId_idx" ON "aparelhos_vendas"("storeId", "aparelhoId");

-- CreateIndex
CREATE INDEX "aparelhos_vendas_storeId_clienteId_idx" ON "aparelhos_vendas"("storeId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_vendas_storeId_numeroGarantia_key" ON "aparelhos_vendas"("storeId", "numeroGarantia");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_vendas_vendaId_aparelhoId_key" ON "aparelhos_vendas"("vendaId", "aparelhoId");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_politicas_loja_storeId_key" ON "aparelhos_politicas_loja"("storeId");

-- CreateIndex
CREATE INDEX "aparelhos_documentos_storeId_idx" ON "aparelhos_documentos"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_documentos_storeId_tipo_formato_aparelhoVendaId_key" ON "aparelhos_documentos"("storeId", "tipo", "formato", "aparelhoVendaId");

-- CreateIndex
CREATE UNIQUE INDEX "aparelhos_documentos_storeId_tipo_formato_aquisicaoId_key" ON "aparelhos_documentos"("storeId", "tipo", "formato", "aquisicaoId");

-- AddForeignKey
ALTER TABLE "aparelhos_fisicos" ADD CONSTRAINT "aparelhos_fisicos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_fisicos" ADD CONSTRAINT "aparelhos_fisicos_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "estoque_produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_fisicos" ADD CONSTRAINT "aparelhos_fisicos_aquisicaoId_fkey" FOREIGN KEY ("aquisicaoId") REFERENCES "aparelhos_aquisicoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_identificadores" ADD CONSTRAINT "aparelhos_identificadores_aparelhoId_storeId_fkey" FOREIGN KEY ("aparelhoId", "storeId") REFERENCES "aparelhos_fisicos"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_eventos" ADD CONSTRAINT "aparelhos_eventos_aparelhoId_storeId_fkey" FOREIGN KEY ("aparelhoId", "storeId") REFERENCES "aparelhos_fisicos"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_fotos" ADD CONSTRAINT "aparelhos_fotos_aparelhoId_storeId_fkey" FOREIGN KEY ("aparelhoId", "storeId") REFERENCES "aparelhos_fisicos"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_aquisicoes" ADD CONSTRAINT "aparelhos_aquisicoes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_aquisicoes" ADD CONSTRAINT "aparelhos_aquisicoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes_importados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_aquisicoes" ADD CONSTRAINT "aparelhos_aquisicoes_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_vendas" ADD CONSTRAINT "aparelhos_vendas_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_vendas" ADD CONSTRAINT "aparelhos_vendas_aparelhoId_storeId_fkey" FOREIGN KEY ("aparelhoId", "storeId") REFERENCES "aparelhos_fisicos"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_vendas" ADD CONSTRAINT "aparelhos_vendas_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_vendas" ADD CONSTRAINT "aparelhos_vendas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes_importados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparelhos_documentos" ADD CONSTRAINT "aparelhos_documentos_aparelhoVendaId_fkey" FOREIGN KEY ("aparelhoVendaId") REFERENCES "aparelhos_vendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Invariantes que o Prisma não expressa ──────────────────────────────────
-- Uma ÚNICA venda ativa por unidade física (duas vendas confirmadas do mesmo aparelho = impossível).
CREATE UNIQUE INDEX "aparelhos_vendas_uma_ativa_por_aparelho"
  ON "aparelhos_vendas" ("storeId", "aparelhoId") WHERE "status" = 'ativa';

-- Garantia legal nunca inferior a 90 dias (CDC art. 26, II); contratual nunca negativa.
ALTER TABLE "aparelhos_vendas" ADD CONSTRAINT "aparelhos_vendas_legal_minimo_ck" CHECK ("legalDias" >= 90);
ALTER TABLE "aparelhos_vendas" ADD CONSTRAINT "aparelhos_vendas_contratual_ck" CHECK ("contratualDias" >= 0);
ALTER TABLE "aparelhos_vendas" ADD CONSTRAINT "aparelhos_vendas_status_ck" CHECK ("status" IN ('ativa','devolvida','cancelada','recomprada'));

ALTER TABLE "aparelhos_fisicos" ADD CONSTRAINT "aparelhos_fisicos_status_ck" CHECK ("status" IN (
  'aguardando_conferencia','em_avaliacao','disponivel','reservado','em_revisao','vendido','devolvido','bloqueado','baixado'));
ALTER TABLE "aparelhos_fisicos" ADD CONSTRAINT "aparelhos_fisicos_condicao_ck" CHECK ("condicao" IN (
  'novo_lacrado','novo_aberto','seminovo','usado','recondicionado'));
ALTER TABLE "aparelhos_fisicos" ADD CONSTRAINT "aparelhos_fisicos_propriedade_ck" CHECK ("propriedade" IN (
  'loja','negociacao','aguardando_aquisicao'));
ALTER TABLE "aparelhos_fisicos" ADD CONSTRAINT "aparelhos_fisicos_valores_ck" CHECK (
  "custoAquisicao" >= 0 AND "despesas" >= 0 AND "custoTotal" >= 0 AND "precoVenda" >= 0 AND "garantiaContratualDias" >= 0);
-- Unidade vendável/vendida precisa ser da loja: aparelho de terceiro nunca vira estoque comercial.
ALTER TABLE "aparelhos_fisicos" ADD CONSTRAINT "aparelhos_fisicos_estoque_proprio_ck" CHECK (
  "status" NOT IN ('disponivel','reservado','vendido') OR "propriedade" = 'loja');

ALTER TABLE "aparelhos_aquisicoes" ADD CONSTRAINT "aparelhos_aquisicoes_status_ck" CHECK ("status" IN (
  'aguardando_aprovacao','confirmada','recusada','cancelada'));
ALTER TABLE "aparelhos_aquisicoes" ADD CONSTRAINT "aparelhos_aquisicoes_valor_ck" CHECK ("valorTotal" >= 0);
ALTER TABLE "aparelhos_identificadores" ADD CONSTRAINT "aparelhos_identificadores_tipo_ck" CHECK ("tipo" IN ('imei','serial'));
