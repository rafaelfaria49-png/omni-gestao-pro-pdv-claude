-- Aditiva. Não executar em produção sem autorização específica do proprietário.
-- Cria só a tabela de solicitações da página comercial; nenhuma loja, conta,
-- assinatura ou dado existente é lido ou alterado.
CREATE TABLE "solicitacoes_teste_comercial" (
    "id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeLoja" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailAberto" TEXT,
    "whatsapp" TEXT NOT NULL,
    "ramo" TEXT NOT NULL,
    "planoInteresse" TEXT,
    "mensagem" TEXT,
    "consentimentoEm" TIMESTAMP(3) NOT NULL,
    "consentimentoVersao" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'gestao-lojas',
    "status" TEXT NOT NULL DEFAULT 'recebida',
    "ipHash" TEXT NOT NULL,
    "historico" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "solicitacoes_teste_comercial_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "solicitacoes_teste_comercial_protocolo_key" ON "solicitacoes_teste_comercial"("protocolo");
CREATE UNIQUE INDEX "solicitacoes_teste_comercial_emailAberto_key" ON "solicitacoes_teste_comercial"("emailAberto");
CREATE INDEX "solicitacoes_teste_comercial_ipHash_createdAt_idx" ON "solicitacoes_teste_comercial"("ipHash", "createdAt");
CREATE INDEX "solicitacoes_teste_comercial_status_createdAt_idx" ON "solicitacoes_teste_comercial"("status", "createdAt");
