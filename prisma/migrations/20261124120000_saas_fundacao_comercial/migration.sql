-- OMNI-SAAS-001A — fundação comercial do SaaS. ADITIVA.
-- Cria Organization, OrganizationMember, Subscription, SubscriptionHistory, TrialGrant,
-- NotificationOutbox, PlatformAuditLog e a coluna opcional stores."organizationId".
-- Nenhuma linha existente é lida, reescrita ou apagada: toda loja atual fica com
-- "organizationId" = NULL (legado/pleno). Sem DROP, sem TRUNCATE, sem backfill.
-- Não executar em Production sem autorização específica do proprietário
-- (procedimento: docs/comercial/SAAS_001A_FUNDACAO_COMERCIAL.md §Migration em Production).

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "contatoEmail" TEXT NOT NULL,
    "contatoWhatsapp" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "planoVersao" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "trialStartedAt" TIMESTAMPTZ(3),
    "trialEndsAt" TIMESTAMPTZ(3),
    "currentPeriodStart" TIMESTAMPTZ(3),
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "graceEndsAt" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMPTZ(3),
    "suspendedAt" TIMESTAMPTZ(3),
    "suspendedReason" TEXT,
    "suspendedMode" TEXT,
    "limitedSince" TIMESTAMPTZ(3),
    "precoContratadoCentavos" INTEGER NOT NULL,
    "limiteUsuariosPorLoja" INTEGER NOT NULL,
    "cortesiaAte" TIMESTAMPTZ(3),
    "provedor" TEXT,
    "provedorCustomerId" TEXT,
    "provedorSubscriptionId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_history" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "ator" TEXT NOT NULL,
    "eventoId" TEXT,
    "versao" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_grants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "emailNormalizado" TEXT NOT NULL,
    "whatsappNormalizado" TEXT,
    "documento" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "canal" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,
    "agendadoPara" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "maxTentativas" INTEGER NOT NULL DEFAULT 5,
    "proximaTentativaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMPTZ(3),
    "primeiraTentativaEm" TIMESTAMPTZ(3),
    "ultimaTentativaEm" TIMESTAMPTZ(3),
    "ultimoErro" TEXT,
    "ultimoErroTipo" TEXT,
    "provedor" TEXT,
    "provedorMensagemId" TEXT,
    "enviadoEm" TIMESTAMPTZ(3),
    "historico" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "atorId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "organizationId" TEXT,
    "storeId" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "motivo" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_documento_key" ON "organizations"("documento");

-- CreateIndex
CREATE INDEX "organization_members_adminUserId_idx" ON "organization_members"("adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_adminUserId_key" ON "organization_members"("organizationId", "adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provedorSubscriptionId_key" ON "subscriptions"("provedorSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscription_history_subscriptionId_createdAt_idx" ON "subscription_history"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "trial_grants_organizationId_key" ON "trial_grants"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "trial_grants_emailNormalizado_key" ON "trial_grants"("emailNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "trial_grants_documento_key" ON "trial_grants"("documento");

-- CreateIndex
CREATE INDEX "trial_grants_whatsappNormalizado_idx" ON "trial_grants"("whatsappNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_dedupeKey_key" ON "notification_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_outbox_status_proximaTentativaEm_idx" ON "notification_outbox"("status", "proximaTentativaEm");

-- CreateIndex
CREATE INDEX "notification_outbox_status_lockedUntil_idx" ON "notification_outbox"("status", "lockedUntil");

-- CreateIndex
CREATE INDEX "notification_outbox_organizationId_idx" ON "notification_outbox"("organizationId");

-- CreateIndex
CREATE INDEX "platform_audit_logs_organizationId_createdAt_idx" ON "platform_audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "platform_audit_logs_atorId_createdAt_idx" ON "platform_audit_logs"("atorId", "createdAt");

-- CreateIndex
CREATE INDEX "platform_audit_logs_acao_createdAt_idx" ON "platform_audit_logs"("acao", "createdAt");

-- CreateIndex
CREATE INDEX "stores_organizationId_idx" ON "stores"("organizationId");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_grants" ADD CONSTRAINT "trial_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Integridade além do datamodel (CHECKs + gatilhos de só-inserção) ──────────────────────

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_origem_check"
  CHECK ("origem" IN ('self_service', 'assistido', 'legado_migrado'));
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_nome_check" CHECK (length(btrim("nome")) > 0);

ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_papel_check"
  CHECK ("papel" IN ('OWNER', 'BILLING', 'MEMBER'));

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_status_check"
  CHECK ("status" IN ('trialing', 'trial_expired', 'pending_payment', 'active', 'past_due', 'canceled', 'suspended'));
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_suspended_mode_check"
  CHECK ("suspendedMode" IS NULL OR "suspendedMode" IN ('limitado', 'bloqueado'));
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_suspensao_motivo_check"
  CHECK ("status" <> 'suspended' OR ("suspendedAt" IS NOT NULL AND length(btrim(coalesce("suspendedReason", ''))) > 0));
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_trialing_fim_check"
  CHECK ("status" <> 'trialing' OR "trialEndsAt" IS NOT NULL);
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_trial_janela_check"
  CHECK ("trialStartedAt" IS NULL OR "trialEndsAt" IS NULL OR "trialEndsAt" > "trialStartedAt");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_valores_check"
  CHECK ("precoContratadoCentavos" >= 0 AND "limiteUsuariosPorLoja" >= 1 AND "planoVersao" >= 1 AND "version" >= 0);

ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_status_check"
  CHECK ("status" IN ('pendente', 'enviando', 'enviado', 'registrado', 'falhou', 'cancelado'));
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_canal_check"
  CHECK ("canal" IN ('email', 'interno', 'whatsapp'));
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_erro_tipo_check"
  CHECK ("ultimoErroTipo" IS NULL OR "ultimoErroTipo" IN ('transitorio', 'permanente', 'desconhecido'));
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_tentativas_check"
  CHECK ("tentativas" >= 0 AND "maxTentativas" BETWEEN 1 AND 10);
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_lease_check"
  CHECK ("status" <> 'enviando' OR ("lockedBy" IS NOT NULL AND "lockedUntil" IS NOT NULL));

ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_motivo_check" CHECK (length(btrim("motivo")) >= 5);
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_ator_check" CHECK (length(btrim("atorId")) > 0);

-- Histórico e auditoria são só-inserção: alterar ou apagar um registro exige ato deliberado de DBA
-- (desligar o gatilho), nunca um UPDATE/DELETE acidental do aplicativo.
CREATE FUNCTION "saas_registro_somente_insercao"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SAAS_REGISTRO_IMUTAVEL: % em % não é permitido', TG_OP, TG_TABLE_NAME USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER "subscription_history_somente_insercao" BEFORE UPDATE OR DELETE ON "subscription_history"
  FOR EACH ROW EXECUTE FUNCTION "saas_registro_somente_insercao"();
CREATE TRIGGER "subscription_history_sem_truncate" BEFORE TRUNCATE ON "subscription_history"
  FOR EACH STATEMENT EXECUTE FUNCTION "saas_registro_somente_insercao"();
CREATE TRIGGER "platform_audit_logs_somente_insercao" BEFORE UPDATE OR DELETE ON "platform_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "saas_registro_somente_insercao"();
CREATE TRIGGER "platform_audit_logs_sem_truncate" BEFORE TRUNCATE ON "platform_audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "saas_registro_somente_insercao"();
