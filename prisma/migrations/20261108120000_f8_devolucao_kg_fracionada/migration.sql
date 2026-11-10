-- F8 × KG — trocas por peso configuráveis (PADARIA-KG-F8-TROCAS-CONFIGURAVEIS-FINAL-001).
-- UNPUBLISHED migration: nunca aplicar em produção sem autorização específica (MIG-X).
--
-- Contrato aprovado pelo proprietário: devolução/troca de linha KG é permitida por
-- padrão, por loja (store_settings.printerConfig->>'pdvTrocasPeso'), com quantidade
-- fracionária de até 3 casas — espelhando o par (quantidade Int?, quantidadeKg NUMERIC)
-- de venda_itens (20261029120000_manual_kg_sale_quantity).
--
-- Aditiva e compatível com clientes Prisma antigos:
--  * UN continua gravando `quantidade` (coluna permanece integer com default 1);
--  * KG grava `quantidade = NULL` + `quantidadeKg` — cliente Int obrigatório antigo
--    falha fechado ao LER a linha KG (mesma decisão da venda, #335);
--  * os triggers continuam recusando escrita KG fora do caminho transacional do F8
--    (GUC omni.f8_kg_return_writer='f8-kg-v1'), agora com validação de política da
--    loja, teto por produto e unicidade de linha KG por devolução no PRÓPRIO banco.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
  IF current_schema() <> 'public' OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('vendas','venda_itens','devolucoes_venda','itens_devolucao_venda','store_settings') AND (c.relowner <> (SELECT oid FROM pg_roles WHERE rolname=current_user) OR c.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'F8_KG_MIGRATION_OWNER_PUBLIC_SCHEMA_REQUIRED: review RLS/ownership before rollout';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
      AND table_name = 'itens_devolucao_venda' AND column_name = 'quantidade' AND data_type = 'integer' AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'F8_KG_ADDITIVE_REQUIRES_LEGACY_INTEGER_NOT_NULL: reconcile any prior fractional pilot separately';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
      AND table_name = 'itens_devolucao_venda' AND column_name = 'quantidadeKg') THEN
    RAISE EXCEPTION 'F8_KG_ADDITIVE_ALREADY_APPLIED: quantidadeKg already exists on itens_devolucao_venda';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relname = 'devolucoes_venda' AND t.tgname = 'manual_kg_guard_return' AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'F8_KG_REQUIRES_MANUAL_KG_GUARDS: apply 20261029120000_manual_kg_sale_quantity first (MIG-X order)';
  END IF;
END $$;

ALTER TABLE "itens_devolucao_venda"
  ALTER COLUMN "quantidade" DROP NOT NULL,
  ADD COLUMN "quantidadeKg" NUMERIC(65, 30),
  ADD CONSTRAINT "itens_devolucao_venda_quantity_contract" CHECK (
    ("quantidade" IS NOT NULL AND "quantidadeKg" IS NULL AND "quantidade" >= 0) OR
    ("quantidade" IS NULL AND "quantidadeKg" IS NOT NULL AND "inventoryId" IS NOT NULL
      AND "quantidadeKg" > 0 AND "quantidadeKg" <= 2000000000
      AND "quantidadeKg" * 1000 = trunc("quantidadeKg" * 1000))
  );

-- Uma linha KG por produto em cada devolução (o app já recusa duplicado; o banco garante).
CREATE UNIQUE INDEX "itens_devolucao_venda_kg_produto_unique"
  ON "itens_devolucao_venda" ("devolucaoId", "inventoryId") WHERE "quantidadeKg" IS NOT NULL;

-- Escritor transacional do F8 × KG. Não é autenticação: é barreira de versão para
-- gravadores legados/SQL direto (mesmo modelo de omni.manual_kg_writer da venda).
CREATE FUNCTION "f8_kg_return_require_writer"() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('omni.f8_kg_return_writer', true) IS DISTINCT FROM 'f8-kg-v1' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'F8_KG_COMPATIBLE_WRITER_REQUIRED';
  END IF;
END $$;

-- Teto KG por produto na venda de origem (lido na transação do INSERT/UPDATE da linha).
CREATE FUNCTION "f8_kg_return_saldo_disp"(sid text, venda_local_id text, produto text, exclude_id text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT sum(vi."quantidadeKg") FROM "venda_itens" vi JOIN "vendas" v ON v.id = vi."vendaId"
      WHERE v."storeId" = sid AND v."pedidoId" = venda_local_id AND vi."inventoryId" = produto AND vi."quantidadeKg" IS NOT NULL), 0)
    - COALESCE((SELECT sum(ide."quantidadeKg") FROM "itens_devolucao_venda" ide JOIN "devolucoes_venda" dv ON dv.id = ide."devolucaoId"
      WHERE dv."storeId" = sid AND dv."vendaLocalId" = venda_local_id AND ide."inventoryId" = produto
        AND ide."quantidadeKg" IS NOT NULL AND ide.id <> exclude_id), 0)
$$;

-- manual_kg_guard_return (devolucoes_venda): venda KG sai do bloqueio ABSOLUTO para o
-- caminho auditável do F8. Sem o writer, o comportamento anterior é mantido
-- (MANUAL_KG_PARTIAL_RETURN_BLOCKED) — clientes antigos continuam protegidos.
CREATE OR REPLACE FUNCTION "manual_kg_guard_return"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND "manual_kg_reference_protected"(OLD."storeId", OLD."vendaLocalId"))
    OR (TG_OP <> 'DELETE' AND "manual_kg_reference_protected"(NEW."storeId", NEW."vendaLocalId")) THEN
    IF current_setting('omni.f8_kg_return_writer', true) IS DISTINCT FROM 'f8-kg-v1' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MANUAL_KG_PARTIAL_RETURN_BLOCKED';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- manual_kg_guard_return_item (itens_devolucao_venda): identidade HISTÓRICA da linha.
-- Linha KG (quantidadeKg) exige: escritor F8 + política da loja habilitada + produto
-- realmente vendido por peso na venda de origem + teto vendido−devolvido. Linha UN é
-- legítima quando a venda de origem TEM linha UN deste produto (venda mista inclusive);
-- SEM essa âncora histórica, produto declarado por peso no cadastro atual segue
-- bloqueado para gravadores legados (mesma proteção do contrato #335 — endpoints
-- antigos que devolvem por SKU sem venda comprovada não voltam a passar).
CREATE OR REPLACE FUNCTION "manual_kg_guard_return_item"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE sid text; venda_local_id text; policia text;
BEGIN
  SELECT "storeId", "vendaLocalId" INTO sid, venda_local_id FROM "devolucoes_venda"
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."devolucaoId" ELSE NEW."devolucaoId" END;
  IF TG_OP <> 'DELETE' AND NEW."quantidadeKg" IS NOT NULL THEN
    PERFORM "f8_kg_return_require_writer"();
    SELECT "printerConfig"->>'pdvTrocasPeso' INTO policia FROM "store_settings" WHERE "storeId" = sid;
    IF policia IS NOT NULL AND policia <> 'enabled' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'F8_KG_RETURN_POLICY_DISABLED';
    END IF;
    IF "f8_kg_return_saldo_disp"(sid, venda_local_id, NEW."inventoryId", NEW.id) < NEW."quantidadeKg" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'F8_KG_RETURN_EXCEEDS_SOLD';
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD."quantidadeKg" IS NOT NULL THEN
    PERFORM "f8_kg_return_require_writer"();
  ELSIF TG_OP <> 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM "vendas" v JOIN "venda_itens" vi ON vi."vendaId" = v.id
        WHERE v."storeId" = sid AND v."pedidoId" = venda_local_id
          AND vi."inventoryId" = NEW."inventoryId" AND vi."quantidade" IS NOT NULL)
      AND EXISTS (SELECT 1 FROM "estoque_produtos" p WHERE p."storeId" = sid
        AND (p.id = NEW."inventoryId" OR p.sku = NEW."inventoryId" OR p.barcode = NEW."inventoryId")
        AND (p.metadata->'vendaPorPeso' = 'true'::jsonb OR p.metadata->'atributos'->'vendaPorPeso' = 'true'::jsonb
          OR p.metadata->'comercial'->>'modoVenda' = 'peso' OR p.metadata->'comercial'->>'unidade' IN ('KG', 'G'))) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MANUAL_KG_PARTIAL_RETURN_BLOCKED';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- O trigger original da 20261029120000 é BEFORE INSERT OR UPDATE (sem DELETE): a linha
-- KG de devolução precisava da defesa no DELETE direto também (sem apagar o documento,
-- um DELETE liberaria saldo no teto). Mesmo nome/ função — manualKgAvailable segue contando 1.
DROP TRIGGER IF EXISTS "manual_kg_guard_return_item" ON "itens_devolucao_venda";
CREATE TRIGGER "manual_kg_guard_return_item" BEFORE INSERT OR UPDATE OR DELETE ON "itens_devolucao_venda"
FOR EACH ROW EXECUTE FUNCTION "manual_kg_guard_return_item"();
DO $$ DECLARE definition text; BEGIN
  SELECT 'f8-kg-return-v1:' || md5(pg_get_constraintdef(oid)) INTO definition FROM pg_constraint WHERE conname='itens_devolucao_venda_quantity_contract' AND conrelid='public.itens_devolucao_venda'::regclass;
  EXECUTE format('COMMENT ON CONSTRAINT itens_devolucao_venda_quantity_contract ON public.itens_devolucao_venda IS %L', definition);
END $$;

COMMIT;
