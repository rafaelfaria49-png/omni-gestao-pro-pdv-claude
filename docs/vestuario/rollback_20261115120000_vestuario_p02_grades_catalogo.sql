-- Reversão OPERACIONAL da migration 20261115120000_vestuario_p02_grades_catalogo.
-- Uso: somente com autorização, em janela própria e DEPOIS de recuar o código (ou com o catálogo desligado).
-- Fail-closed: se existir QUALQUER grade, cor, produto com grade ou variante, aborta sem tocar em nada.
-- Com dados, a saída segura é manter as tabelas e desligar VESTUARIO_CATALOG_ENABLED (nada é perdido).
-- Não toca em produtos, saldos, ledger ou vendas. Executar em uma transação: psql -1 -v ON_ERROR_STOP=1 -f <arquivo>
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "vestuario_grades") OR EXISTS (SELECT 1 FROM "vestuario_cores")
     OR EXISTS (SELECT 1 FROM "vestuario_produtos_grade") OR EXISTS (SELECT 1 FROM "vestuario_variantes") THEN
    RAISE EXCEPTION 'ROLLBACK_RECUSADO: há dados de vestuário. Desligue a flag e preserve as tabelas.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS "vestuario_produtos_colisao_trg" ON "estoque_produtos";
DROP FUNCTION IF EXISTS "vestuario_produtos_colisao"();
DROP TABLE IF EXISTS "vestuario_variantes";
DROP TABLE IF EXISTS "vestuario_produtos_grade";
DROP TABLE IF EXISTS "vestuario_grade_tamanhos";
DROP TABLE IF EXISTS "vestuario_cores";
DROP TABLE IF EXISTS "vestuario_grades";
DROP FUNCTION IF EXISTS "vestuario_variantes_colisao"();
DROP FUNCTION IF EXISTS "vestuario_tamanhos_identidade"();
DROP FUNCTION IF EXISTS "vestuario_identidade_imutavel"();
DROP FUNCTION IF EXISTS "vestuario_ident_lock"(TEXT);
DROP INDEX IF EXISTS "estoque_produtos_id_storeId_key";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261115120000_vestuario_p02_grades_catalogo';
