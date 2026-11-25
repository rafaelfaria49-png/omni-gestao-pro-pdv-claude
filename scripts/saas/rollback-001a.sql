-- OMNI-SAAS-001A — REVERSÃO do schema da migration 20261124120000_saas_fundacao_comercial.
-- NÃO É MIGRATION. Só com autorização textual do proprietário, e só DEPOIS de reverter o código
-- (o código do 001A lê estas tabelas; o código anterior não lê nenhuma).
-- Falha fechada: se QUALQUER dado comercial existir (organização, assinatura, loja vinculada,
-- notificação, auditoria), aborta sem apagar nada — nesse caso exportar antes e decidir à parte.
-- Rodar numa transação única: psql -X -1 -v ON_ERROR_STOP=1 -f scripts/saas/rollback-001a.sql
-- O registro em _prisma_migrations é removido NESTA transação (`prisma migrate resolve --rolled-back`
-- só vale para migration com falha — P3012 —, não para uma aplicada com sucesso).

SET lock_timeout = '3s';
SET statement_timeout = '60s';

DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM organizations) + (SELECT count(*) FROM organization_members)
       + (SELECT count(*) FROM subscriptions) + (SELECT count(*) FROM subscription_history)
       + (SELECT count(*) FROM trial_grants) + (SELECT count(*) FROM notification_outbox)
       + (SELECT count(*) FROM platform_audit_logs)
       + (SELECT count(*) FROM stores WHERE "organizationId" IS NOT NULL)
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_SAAS_RECUSADO: existem % registros comerciais; exportar e decidir antes', n;
  END IF;
END $$;

DROP TRIGGER "platform_audit_logs_sem_truncate" ON "platform_audit_logs";
DROP TRIGGER "platform_audit_logs_somente_insercao" ON "platform_audit_logs";
DROP TRIGGER "subscription_history_sem_truncate" ON "subscription_history";
DROP TRIGGER "subscription_history_somente_insercao" ON "subscription_history";
DROP FUNCTION "saas_registro_somente_insercao"();

ALTER TABLE "stores" DROP CONSTRAINT "stores_organizationId_fkey";
DROP INDEX "stores_organizationId_idx";

DROP TABLE "platform_audit_logs";
DROP TABLE "notification_outbox";
DROP TABLE "trial_grants";
DROP TABLE "subscription_history";
DROP TABLE "subscriptions";
DROP TABLE "organization_members";
DROP TABLE "organizations";

-- A coluna é removida por último; todas as linhas são NULL (verificado acima).
ALTER TABLE "stores" DROP COLUMN "organizationId";

-- Remove o registro da migration: o próximo `migrate status` volta a listá-la como pendente.
DELETE FROM _prisma_migrations WHERE migration_name = '20261124120000_saas_fundacao_comercial';
