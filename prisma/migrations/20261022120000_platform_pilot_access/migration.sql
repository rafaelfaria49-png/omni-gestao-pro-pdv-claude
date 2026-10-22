-- Aditiva. Não executar em produção sem autorização específica.
-- Sem UPDATE/backfill de contas. Defaults só passam a valer para novos registros.
ALTER TABLE "admin_users" ADD COLUMN "accessScope" TEXT;
ALTER TABLE "admin_users" ALTER COLUMN "accessScope" SET DEFAULT 'STORE';
ALTER TABLE "admin_users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin_users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_accessScope_check"
  CHECK ("accessScope" IS NULL OR "accessScope" IN ('STORE', 'PLATFORM'));
ALTER TABLE "stores" ADD COLUMN "moduleAccess" JSONB;
ALTER TABLE "stores" ALTER COLUMN "moduleAccess" SET DEFAULT
  '{"version":1,"modules":["home","pdv","sales","cash","catalog","stock","reports","settings"]}'::jsonb;
