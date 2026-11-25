-- Reversão OPERACIONAL da migration 20261116090000_identificadores_etiquetas_p03.
-- Uso: somente com autorização expressa do proprietário, em janela própria e DEPOIS de manter/desligar
-- VESTUARIO_P03_ENABLED (ou recuar o código P03).
--
-- Fail-closed: se existir QUALQUER identificador permanente/GTIN/alias P03, lote de etiquetas,
-- tentativa de impressão, solicitação idempotente ou reserva permanente em `identificador_chaves`,
-- ABORTA sem tocar em nada. Com dados P03 existentes, o rollback operacional obrigatório é
-- desligar a flag/allowlist P03 preservando códigos emitidos, snapshots e auditoria.
--
-- Não toca em produtos, variantes, saldos, ledger ou vendas.
-- Executar em uma única transação: psql -1 -v ON_ERROR_STOP=1 -f <arquivo>
DO $$
BEGIN
  LOCK TABLE "identificadores_produto", "etiqueta_lotes", "etiqueta_tentativas", "identificacao_solicitacoes", "identificador_chaves" IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM "identificadores_produto")
     OR EXISTS (SELECT 1 FROM "etiqueta_lotes")
     OR EXISTS (SELECT 1 FROM "etiqueta_tentativas")
     OR EXISTS (SELECT 1 FROM "identificacao_solicitacoes")
     OR EXISTS (SELECT 1 FROM "identificador_chaves" WHERE "identificadorId" IS NOT NULL) THEN
    RAISE EXCEPTION 'ROLLBACK_RECUSADO: há identificadores, lotes, tentativas ou reservas permanentes P03. Desligue VESTUARIO_P03_ENABLED e preserve as tabelas.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS "p03_produto_keys_trg" ON "estoque_produtos";
DROP TRIGGER IF EXISTS "p03_variante_keys_trg" ON "vestuario_variantes";
DROP TRIGGER IF EXISTS "p03_projection_guard_trg" ON "vestuario_variantes";

DROP TABLE IF EXISTS "identificacao_solicitacoes";
DROP TABLE IF EXISTS "etiqueta_tentativas";
DROP TABLE IF EXISTS "etiqueta_lotes";
DROP TABLE IF EXISTS "identificador_chaves";
DROP TABLE IF EXISTS "identificadores_produto";

DROP INDEX IF EXISTS "p03_produto_chaves_gin";
DROP INDEX IF EXISTS "p03_variante_chaves_gin";
DROP INDEX IF EXISTS "vestuario_variantes_id_storeId_produtoId_key";

DROP FUNCTION IF EXISTS "p03_attempt_guard"();
DROP FUNCTION IF EXISTS "p03_job_guard"();
DROP FUNCTION IF EXISTS "p03_snapshot_valid"(jsonb);
DROP FUNCTION IF EXISTS "p03_immutable_row"();
DROP FUNCTION IF EXISTS "p03_projection_guard"();
DROP FUNCTION IF EXISTS "p03_identifier_project"();
DROP FUNCTION IF EXISTS "p03_identifier_guard"();
DROP FUNCTION IF EXISTS "p03_legacy_keys"();
DROP FUNCTION IF EXISTS "p03_key_guard"();
DROP FUNCTION IF EXISTS "p03_claim"(text, text, text, text, text);
DROP FUNCTION IF EXISTS "p03_identifier_keys"(text, text);
DROP FUNCTION IF EXISTS "p03_gtin_valid"(text);
DROP FUNCTION IF EXISTS "p03_owners"(text, text);
DROP FUNCTION IF EXISTS "p03_variant_keys"(text, text, text);
DROP FUNCTION IF EXISTS "p03_product_keys"(text, text, text, jsonb);
DROP FUNCTION IF EXISTS "p03_key"(text);

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261116090000_identificadores_etiquetas_p03';
