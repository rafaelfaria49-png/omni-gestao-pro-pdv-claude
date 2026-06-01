-- WhatsApp multi-loja: mapeia Meta phone_number_id -> store (roteamento inbound + credencial outbound).
-- ADITIVO: cria 1 tabela nova. NÃO altera/dropa nenhuma tabela existente.
-- Registro auditável (MULTI_LOJA-S-003 / ADR-0006). Apply de fato via `npm run db:push` (Opção A).

CREATE TABLE IF NOT EXISTS "whatsapp_phone_numbers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL DEFAULT '',
    "displayPhone" TEXT NOT NULL DEFAULT '',
    "tokenEnvKey" TEXT NOT NULL DEFAULT 'WHATSAPP_ACCESS_TOKEN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_phone_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_phone_numbers_phoneNumberId_key"
  ON "whatsapp_phone_numbers"("phoneNumberId");

CREATE INDEX IF NOT EXISTS "whatsapp_phone_numbers_storeId_idx"
  ON "whatsapp_phone_numbers"("storeId");

-- FK -> stores(id) ON DELETE CASCADE, guardada para idempotência (estilo migração 0009).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_phone_numbers_storeId_fkey'
  ) THEN
    ALTER TABLE "whatsapp_phone_numbers"
      ADD CONSTRAINT "whatsapp_phone_numbers_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
