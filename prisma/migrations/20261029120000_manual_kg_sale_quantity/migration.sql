-- UNPUBLISHED migration, revised by PDV-PADARIA-KG-RELEASE-HARDENING-002.
-- Supersedes the unsafe pilot Int -> Float design. Never cast pilot KG back to Int.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ BEGIN
  IF current_schema() <> 'public' OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('vendas','venda_itens','estoque_produtos','devolucoes_venda','contas_receber_titulos') AND (c.relowner <> (SELECT oid FROM pg_roles WHERE rolname=current_user) OR c.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'KG_MIGRATION_OWNER_PUBLIC_SCHEMA_REQUIRED: review RLS/ownership before rollout';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
      AND table_name = 'venda_itens' AND column_name = 'quantidade' AND data_type = 'integer') THEN
    RAISE EXCEPTION 'KG_ADDITIVE_REQUIRES_LEGACY_INTEGER: discard/reconcile any Float pilot separately; do not truncate quantities';
  END IF;
END $$;
ALTER TABLE "venda_itens"
  ALTER COLUMN "quantidade" DROP NOT NULL,
  ADD COLUMN "quantidadeKg" NUMERIC(65,30),
  ADD CONSTRAINT "venda_itens_quantity_contract" CHECK (
    ("quantidade" IS NOT NULL AND "quantidadeKg" IS NULL) OR
    ("quantidade" IS NULL AND "quantidadeKg" IS NOT NULL AND "quantidadeKg" > 0 AND "quantidadeKg" <= 2000000000
      AND "quantidadeKg" * 1000 = trunc("quantidadeKg" * 1000))
  );

CREATE FUNCTION "manual_kg_venda_protected"(sale_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM "vendas" v WHERE v.id = sale_id AND
    (v.payload->>'manualKgSale' = 'classic-manual-kg-v1' OR EXISTS
      (SELECT 1 FROM "venda_itens" i WHERE i."vendaId" = v.id AND i."quantidadeKg" IS NOT NULL)))
$$;
CREATE FUNCTION "manual_kg_reference_protected"(sid text, reference text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM "vendas" v WHERE v."storeId" = sid
    AND (v."pedidoId" = reference OR v.id = reference) AND "manual_kg_venda_protected"(v.id))
$$;
CREATE FUNCTION "manual_kg_require_writer"() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('omni.manual_kg_writer', true) IS DISTINCT FROM 'additive-v2' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MANUAL_KG_COMPATIBLE_WRITER_REQUIRED';
  END IF;
END $$;
CREATE FUNCTION "manual_kg_guard_venda"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND (OLD.payload->>'manualKgSale' = 'classic-manual-kg-v1' OR "manual_kg_venda_protected"(OLD.id)))
    OR (TG_OP <> 'DELETE' AND NEW.payload->>'manualKgSale' = 'classic-manual-kg-v1') THEN
    PERFORM "manual_kg_require_writer"();
    IF TG_OP = 'UPDATE' AND NEW.payload->>'manualKgSale' IS DISTINCT FROM 'classic-manual-kg-v1' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MANUAL_KG_CONTRACT_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER "manual_kg_guard_venda" BEFORE INSERT OR UPDATE OR DELETE ON "vendas"
FOR EACH ROW EXECUTE FUNCTION "manual_kg_guard_venda"();
CREATE FUNCTION "manual_kg_guard_item"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND (OLD."quantidadeKg" IS NOT NULL OR "manual_kg_venda_protected"(OLD."vendaId")))
    OR (TG_OP <> 'DELETE' AND (NEW."quantidadeKg" IS NOT NULL OR "manual_kg_venda_protected"(NEW."vendaId"))) THEN
    PERFORM "manual_kg_require_writer"();
    IF TG_OP <> 'DELETE' AND NEW."quantidadeKg" IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM "vendas" WHERE id = NEW."vendaId" AND payload->>'manualKgSale' = 'classic-manual-kg-v1') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MANUAL_KG_PARENT_CONTRACT_REQUIRED';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER "manual_kg_guard_item" BEFORE INSERT OR UPDATE OR DELETE ON "venda_itens"
FOR EACH ROW EXECUTE FUNCTION "manual_kg_guard_item"();
CREATE FUNCTION "manual_kg_guard_stock_sale"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND "manual_kg_reference_protected"(OLD."storeId", OLD.documento))
    OR (TG_OP <> 'DELETE' AND "manual_kg_reference_protected"(NEW."storeId", NEW.documento)) THEN
    PERFORM "manual_kg_require_writer"();
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER "manual_kg_guard_stock_sale" BEFORE INSERT OR UPDATE OR DELETE ON "movimentacoes_estoque"
FOR EACH ROW EXECUTE FUNCTION "manual_kg_guard_stock_sale"();
CREATE FUNCTION "manual_kg_title_protected"(sid text, tid text, local_key text, doc jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM "vendas" v WHERE v."storeId" = sid AND "manual_kg_venda_protected"(v.id)
    AND (v."contaReceberTituloId" = tid OR left(local_key, length('pdv-aprazo-' || v."pedidoId")) = 'pdv-aprazo-' || v."pedidoId"
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(doc->'vendas') = 'array' THEN doc->'vendas' ELSE '[]'::jsonb END) entry WHERE entry->>'saleId' IN (v.id, v."pedidoId"))))
$$;
CREATE FUNCTION "manual_kg_finance_reference_protected"(sid text, reference text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT "manual_kg_reference_protected"(sid, reference) OR EXISTS (SELECT 1 FROM "contas_receber_titulos" t
    WHERE t."storeId" = sid AND t.id = reference AND "manual_kg_title_protected"(sid, t.id, t."localKey", t.payload))
$$;
CREATE FUNCTION "manual_kg_guard_title"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND "manual_kg_title_protected"(OLD."storeId", OLD.id, OLD."localKey", OLD.payload))
    OR (TG_OP <> 'DELETE' AND "manual_kg_title_protected"(NEW."storeId", NEW.id, NEW."localKey", NEW.payload)) THEN
    PERFORM "manual_kg_require_writer"();
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER "manual_kg_guard_title" BEFORE INSERT OR UPDATE OR DELETE ON "contas_receber_titulos"
FOR EACH ROW EXECUTE FUNCTION "manual_kg_guard_title"();
CREATE FUNCTION "manual_kg_guard_credit_use"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND "manual_kg_reference_protected"(OLD."storeId", OLD."vendaId"))
    OR (TG_OP <> 'DELETE' AND "manual_kg_reference_protected"(NEW."storeId", NEW."vendaId")) THEN
    PERFORM "manual_kg_require_writer"();
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER "manual_kg_guard_credit_use" BEFORE INSERT OR UPDATE OR DELETE ON "usos_credito_cliente"
FOR EACH ROW EXECUTE FUNCTION "manual_kg_guard_credit_use"();
CREATE FUNCTION "manual_kg_guard_finance_sale"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND "manual_kg_finance_reference_protected"(OLD."storeId", OLD."referenciaId"))
    OR (TG_OP <> 'DELETE' AND "manual_kg_finance_reference_protected"(NEW."storeId", NEW."referenciaId")) THEN
    PERFORM "manual_kg_require_writer"();
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER "manual_kg_guard_finance_sale" BEFORE INSERT OR UPDATE OR DELETE ON "movimentacoes_financeiras"
FOR EACH ROW EXECUTE FUNCTION "manual_kg_guard_finance_sale"();
CREATE FUNCTION "manual_kg_guard_return"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND "manual_kg_reference_protected"(OLD."storeId", OLD."vendaLocalId"))
    OR (TG_OP <> 'DELETE' AND "manual_kg_reference_protected"(NEW."storeId", NEW."vendaLocalId")) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MANUAL_KG_PARTIAL_RETURN_BLOCKED';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER "manual_kg_guard_return" BEFORE INSERT OR UPDATE OR DELETE ON "devolucoes_venda"
FOR EACH ROW EXECUTE FUNCTION "manual_kg_guard_return"();

-- Older return endpoints can omit the sale reference. Guard the product on each line too.
CREATE FUNCTION "manual_kg_guard_return_item"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE sid text;
BEGIN
  SELECT "storeId" INTO sid FROM "devolucoes_venda" WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."devolucaoId" ELSE NEW."devolucaoId" END;
  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM "estoque_produtos" p WHERE p."storeId" = sid
    AND (p.id = NEW."inventoryId" OR p.sku = NEW."inventoryId" OR p.barcode = NEW."inventoryId")
    AND (p.metadata->'vendaPorPeso' = 'true'::jsonb OR p.metadata->'atributos'->'vendaPorPeso' = 'true'::jsonb OR p.metadata->'comercial'->>'modoVenda' = 'peso' OR p.metadata->'comercial'->>'unidade' IN ('KG', 'G'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MANUAL_KG_PARTIAL_RETURN_BLOCKED';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER "manual_kg_guard_return_item" BEFORE INSERT OR UPDATE ON "itens_devolucao_venda"
FOR EACH ROW EXECUTE FUNCTION "manual_kg_guard_return_item"();

-- Retain the installed constraint fingerprint; readiness rejects invalidated/drifted CHECKs.
DO $$ DECLARE definition text; BEGIN
  SELECT 'manual-kg-additive-v2:' || md5(pg_get_constraintdef(oid)) INTO definition FROM pg_constraint WHERE conname='venda_itens_quantity_contract' AND conrelid='public.venda_itens'::regclass;
  EXECUTE format('COMMENT ON CONSTRAINT venda_itens_quantity_contract ON public.venda_itens IS %L', definition);
END $$;

COMMIT;
