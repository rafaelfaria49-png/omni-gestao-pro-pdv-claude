-- Aditiva. Não executar em produção sem autorização específica.
-- Cria só a tabela de sessões; nenhuma conta, loja ou dado existente é alterado.
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_sessions_userId_idx" ON "admin_sessions"("userId");
CREATE INDEX "admin_sessions_expiresAt_idx" ON "admin_sessions"("expiresAt");
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
