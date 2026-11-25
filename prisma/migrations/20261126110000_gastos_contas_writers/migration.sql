BEGIN;
-- Implantação com PDV/Financeiro ativos: nunca esperar trava por mais de 500 ms (abaixo do
-- deadlock_timeout de 1 s). Se uma transação do runtime segurar a tabela, a MIGRATION desiste
-- inteira e atômica (nunca a venda) e é reaplicada depois (prisma migrate resolve --rolled-back).
SET LOCAL lock_timeout = '500ms';

-- AlterTable
ALTER TABLE "contas_pagar_titulos" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "carteiraId" TEXT,
ADD COLUMN     "categoriaId" TEXT,
ADD COLUMN     "identidadePessoal" TEXT,
ADD COLUMN     "perfilId" TEXT,
ADD COLUMN     "precisaoStatus" TEXT,
ADD COLUMN     "valorCentavos" DECIMAL(20,0),
ADD COLUMN     "valorOriginalLegado" DOUBLE PRECISION,
ADD COLUMN     "vencimentoEm" DATE,
ALTER COLUMN "storeId" DROP NOT NULL,
ALTER COLUMN "storeId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "contas_receber_titulos" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "carteiraId" TEXT,
ADD COLUMN     "categoriaId" TEXT,
ADD COLUMN     "identidadePessoal" TEXT,
ADD COLUMN     "perfilId" TEXT,
ADD COLUMN     "precisaoStatus" TEXT,
ADD COLUMN     "valorCentavos" DECIMAL(20,0),
ADD COLUMN     "valorOriginalLegado" DOUBLE PRECISION,
ADD COLUMN     "vencimentoEm" DATE,
ALTER COLUMN "storeId" DROP NOT NULL,
ALTER COLUMN "storeId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "carteiras_financeiras" ADD COLUMN     "identificadorInstrumento" TEXT,
ADD COLUMN     "instituicao" TEXT,
ADD COLUMN     "perfilId" TEXT,
ADD COLUMN     "precisaoStatus" TEXT,
ADD COLUMN     "saldoAtualCentavos" DECIMAL(20,0),
ADD COLUMN     "saldoInicialCentavos" DECIMAL(20,0),
ALTER COLUMN "storeId" DROP NOT NULL,
ALTER COLUMN "storeId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "movimentacoes_financeiras" ADD COLUMN     "categoriaId" TEXT,
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "ocorridoEm" TIMESTAMP(3),
ADD COLUMN     "pagarTituloId" TEXT,
ADD COLUMN     "perfilId" TEXT,
ADD COLUMN     "precisaoStatus" TEXT,
ADD COLUMN     "receberTituloId" TEXT,
ADD COLUMN     "valorCentavos" DECIMAL(20,0),
ADD COLUMN     "valorOriginalLegado" DOUBLE PRECISION,
ALTER COLUMN "storeId" DROP NOT NULL,
ALTER COLUMN "storeId" DROP DEFAULT;

-- CreateTable
CREATE TABLE "categorias_gastos" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "natureza" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_gastos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gastos_id_perfilId_key" ON "categorias_gastos"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gastos_perfilId_nomeNormalizado_natureza_key" ON "categorias_gastos"("perfilId", "nomeNormalizado", "natureza");

-- CreateIndex
CREATE UNIQUE INDEX "contas_pagar_titulos_id_perfilId_key" ON "contas_pagar_titulos"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "contas_pagar_titulos_perfilId_identidadePessoal_key" ON "contas_pagar_titulos"("perfilId", "identidadePessoal");

-- CreateIndex
CREATE UNIQUE INDEX "contas_receber_titulos_id_perfilId_key" ON "contas_receber_titulos"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "contas_receber_titulos_perfilId_identidadePessoal_key" ON "contas_receber_titulos"("perfilId", "identidadePessoal");

-- CreateIndex
CREATE UNIQUE INDEX "carteiras_financeiras_id_perfilId_key" ON "carteiras_financeiras"("id", "perfilId");

-- CreateIndex
CREATE UNIQUE INDEX "movimentacoes_financeiras_id_perfilId_key" ON "movimentacoes_financeiras"("id", "perfilId");

-- AddForeignKey
ALTER TABLE "contas_pagar_titulos" ADD CONSTRAINT "contas_pagar_titulos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contas_pagar_titulos" ADD CONSTRAINT "contas_pagar_titulos_carteiraId_perfilId_fkey" FOREIGN KEY ("carteiraId", "perfilId") REFERENCES "carteiras_financeiras"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contas_pagar_titulos" ADD CONSTRAINT "contas_pagar_titulos_categoriaId_perfilId_fkey" FOREIGN KEY ("categoriaId", "perfilId") REFERENCES "categorias_gastos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contas_receber_titulos" ADD CONSTRAINT "contas_receber_titulos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contas_receber_titulos" ADD CONSTRAINT "contas_receber_titulos_carteiraId_perfilId_fkey" FOREIGN KEY ("carteiraId", "perfilId") REFERENCES "carteiras_financeiras"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contas_receber_titulos" ADD CONSTRAINT "contas_receber_titulos_categoriaId_perfilId_fkey" FOREIGN KEY ("categoriaId", "perfilId") REFERENCES "categorias_gastos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "carteiras_financeiras" ADD CONSTRAINT "carteiras_financeiras_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_categoriaId_perfilId_fkey" FOREIGN KEY ("categoriaId", "perfilId") REFERENCES "categorias_gastos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_pagarTituloId_perfilId_fkey" FOREIGN KEY ("pagarTituloId", "perfilId") REFERENCES "contas_pagar_titulos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_receberTituloId_perfilId_fkey" FOREIGN KEY ("receberTituloId", "perfilId") REFERENCES "contas_receber_titulos"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "movimentacoes_financeiras_carteiraId_perfilId_fkey" FOREIGN KEY ("carteiraId", "perfilId") REFERENCES "carteiras_financeiras"("id", "perfilId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "categorias_gastos" ADD CONSTRAINT "categorias_gastos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "categorias_gastos" ADD CONSTRAINT "categorias_gastos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Expansão sem DML/backfill. Histórico sem perfil exige loja real; pessoal exige perfil.
ALTER TABLE "carteiras_financeiras" ADD CONSTRAINT "gastos_carteira_presenca_escopo" CHECK ("storeId" IS NOT NULL OR "perfilId" IS NOT NULL);
ALTER TABLE "contas_pagar_titulos" ADD CONSTRAINT "gastos_pagar_presenca_escopo" CHECK ("storeId" IS NOT NULL OR "perfilId" IS NOT NULL);
ALTER TABLE "contas_receber_titulos" ADD CONSTRAINT "gastos_receber_presenca_escopo" CHECK ("storeId" IS NOT NULL OR "perfilId" IS NOT NULL);
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "gastos_mov_presenca_escopo" CHECK ("storeId" IS NOT NULL OR "perfilId" IS NOT NULL);
ALTER TABLE "categorias_gastos" ADD CONSTRAINT "gastos_categoria_natureza" CHECK ("natureza" IN ('DESPESA', 'RECEITA') AND length(trim("nome")) > 0 AND length(trim("nomeNormalizado")) > 0);

ALTER TABLE "contas_pagar_titulos" ADD CONSTRAINT "gastos_pagar_centavos" CHECK (
  ("precisaoStatus" IS NULL OR "precisaoStatus" IN ('CENTAVOS', 'ANOMALIA_LEGADO'))
  AND ("valorCentavos" IS NULL OR (abs("valorCentavos") <= 9000000000000 AND abs("valor"::numeric * 100 - "valorCentavos") <= 0.000001))
  AND ("precisaoStatus" IS DISTINCT FROM 'CENTAVOS' OR ("valorCentavos" IS NOT NULL AND "valorOriginalLegado" IS NULL))
  AND ("precisaoStatus" IS DISTINCT FROM 'ANOMALIA_LEGADO' OR ("valorCentavos" IS NULL AND "valorOriginalLegado" IS NOT NULL))
);
ALTER TABLE "contas_receber_titulos" ADD CONSTRAINT "gastos_receber_centavos" CHECK (
  ("precisaoStatus" IS NULL OR "precisaoStatus" IN ('CENTAVOS', 'ANOMALIA_LEGADO'))
  AND ("valorCentavos" IS NULL OR (abs("valorCentavos") <= 9000000000000 AND abs("valor"::numeric * 100 - "valorCentavos") <= 0.000001))
  AND ("precisaoStatus" IS DISTINCT FROM 'CENTAVOS' OR ("valorCentavos" IS NOT NULL AND "valorOriginalLegado" IS NULL))
  AND ("precisaoStatus" IS DISTINCT FROM 'ANOMALIA_LEGADO' OR ("valorCentavos" IS NULL AND "valorOriginalLegado" IS NOT NULL))
);
ALTER TABLE "movimentacoes_financeiras" ADD CONSTRAINT "gastos_mov_centavos" CHECK (
  ("precisaoStatus" IS NULL OR "precisaoStatus" IN ('CENTAVOS', 'ANOMALIA_LEGADO'))
  AND ("valorCentavos" IS NULL OR (abs("valorCentavos") <= 9000000000000 AND abs("valor"::numeric * 100 - "valorCentavos") <= 0.000001))
  AND ("precisaoStatus" IS DISTINCT FROM 'CENTAVOS' OR ("valorCentavos" IS NOT NULL AND "valorOriginalLegado" IS NULL))
  AND ("precisaoStatus" IS DISTINCT FROM 'ANOMALIA_LEGADO' OR ("valorCentavos" IS NULL AND "valorOriginalLegado" IS NOT NULL))
  AND NOT ("pagarTituloId" IS NOT NULL AND "receberTituloId" IS NOT NULL)
);
ALTER TABLE "carteiras_financeiras" ADD CONSTRAINT "gastos_carteira_centavos" CHECK (
  ("precisaoStatus" IS NULL OR "precisaoStatus" IN ('CENTAVOS', 'ANOMALIA_LEGADO'))
  AND ("saldoInicialCentavos" IS NULL OR (abs("saldoInicialCentavos") <= 9000000000000 AND abs("saldoInicial"::numeric * 100 - "saldoInicialCentavos") <= 0.000001))
  AND ("saldoAtualCentavos" IS NULL OR (abs("saldoAtualCentavos") <= 9000000000000 AND abs("saldoAtual"::numeric * 100 - "saldoAtualCentavos") <= 0.000001))
  AND ("precisaoStatus" IS DISTINCT FROM 'CENTAVOS' OR ("saldoInicialCentavos" IS NOT NULL AND "saldoAtualCentavos" IS NOT NULL))
);

-- MATCH SIMPLE ignora tuplas com NULL. Este trigger verifica NULL explicitamente;
-- as FKs (id, perfilId) protegem também relações pessoais sem storeId.
CREATE FUNCTION gastos_validar_escopo() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE p record; r record; j jsonb; anterior jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    anterior := to_jsonb(OLD);
    IF OLD."storeId" IS DISTINCT FROM NEW."storeId"
      OR (OLD."perfilId" IS NOT NULL AND OLD."perfilId" IS DISTINCT FROM NEW."perfilId") THEN
      RAISE EXCEPTION 'Escopo financeiro imutavel' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."perfilId" IS NOT NULL THEN
    SELECT * INTO p FROM "financeiro_perfis" WHERE "id" = NEW."perfilId";
    -- Perfil EMPRESA desativado NÃO congela o legado no banco (loja continua obrigatória e igual);
    -- quem recusa EMPRESA inativo é a aplicação com o Gestor Money ligado. PESSOAL inativo: recusado.
    IF NOT FOUND OR (NOT p."ativo" AND p."tipo" = 'PESSOAL') OR p."storeId" IS DISTINCT FROM NEW."storeId" THEN
      RAISE EXCEPTION 'Escopo financeiro invalido' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."storeId" IS NULL THEN
    RAISE EXCEPTION 'Escopo financeiro obrigatorio' USING ERRCODE = '23514';
  END IF;
  j := to_jsonb(NEW);
  IF TG_TABLE_NAME IN ('contas_pagar_titulos', 'contas_receber_titulos') THEN
    IF NEW."storeId" IS NULL THEN
      IF NEW."localKey" IS NOT NULL OR NEW."identidadePessoal" IS NULL
        OR NOT starts_with(NEW."identidadePessoal", 'gastos:pessoal:' || NEW."perfilId" || ':') THEN
        RAISE EXCEPTION 'Namespace pessoal invalido' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW."identidadePessoal" IS NOT NULL THEN
      RAISE EXCEPTION 'Namespace empresarial invalido' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD."localKey" IS DISTINCT FROM NEW."localKey"
      OR OLD."identidadePessoal" IS DISTINCT FROM NEW."identidadePessoal") THEN
      RAISE EXCEPTION 'Identidade financeira imutavel' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF j->>'carteiraId' IS NOT NULL THEN
    SELECT * INTO r FROM "carteiras_financeiras" WHERE "id" = j->>'carteiraId';
    IF NOT FOUND OR r."storeId" IS DISTINCT FROM NEW."storeId"
      OR (NEW."perfilId" IS NOT NULL AND r."perfilId" IS DISTINCT FROM NEW."perfilId") THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."ativo" AND (TG_OP = 'INSERT' OR anterior->>'carteiraId' IS DISTINCT FROM j->>'carteiraId') THEN
      -- Um estorno conserva a conta do fato original, mesmo desativada depois.
      -- O prefixo sozinho não autoriza: exigir referência, direção, escopo e
      -- soma dos fatos realmente existentes nessa mesma conta. A tolerância é
      -- apenas a representação Float legada (as entradas novas usam centavos).
      IF TG_TABLE_NAME <> 'movimentacoes_financeiras'
        OR coalesce(j->>'origem', '') NOT IN ('estorno_receber', 'estorno_pagar')
        OR coalesce((j->>'valor')::numeric, 0) <= 0
        OR j->>'tipo' IS DISTINCT FROM (CASE WHEN j->>'origem' = 'estorno_receber' THEN 'saida' ELSE 'entrada' END)
        -- Reconciliação #397: o estorno é POR PAGAMENTO (parcial) — não exige a soma exata;
        -- exige que não ultrapasse o líquido ainda movimentado nesta conta (originais −
        -- estornos anteriores, excluída a própria linha em UPDATE). Tolerância = Float legado.
        OR (j->>'valor')::numeric > (
          coalesce((
            SELECT SUM(m."valor"::numeric) FROM "movimentacoes_financeiras" m
            WHERE m."storeId" IS NOT DISTINCT FROM NEW."storeId"
              AND m."referenciaId" = j->>'referenciaId'
              AND m."carteiraId" = j->>'carteiraId'
              AND m."tipo" = CASE WHEN j->>'origem' = 'estorno_receber' THEN 'entrada' ELSE 'saida' END
              AND (
                m."origem" = CASE WHEN j->>'origem' = 'estorno_receber' THEN 'receber' ELSE 'pagar' END
                OR m."origem" = CASE WHEN j->>'origem' = 'estorno_receber' THEN 'receber_parcial' ELSE 'pagar_parcial' END
                OR starts_with(m."origem", CASE WHEN j->>'origem' = 'estorno_receber' THEN 'receber_parcial_' ELSE 'pagar_parcial_' END)
              )
              AND (m."perfilId" IS NOT DISTINCT FROM NEW."perfilId" OR (m."perfilId" IS NULL AND NEW."storeId" IS NOT NULL))
          ), 0)
          - coalesce((
            SELECT SUM(e."valor"::numeric) FROM "movimentacoes_financeiras" e
            WHERE e."storeId" IS NOT DISTINCT FROM NEW."storeId"
              AND e."referenciaId" = j->>'referenciaId'
              AND e."carteiraId" = j->>'carteiraId'
              AND e."tipo" = j->>'tipo'
              AND e."origem" = j->>'origem'
              AND e."id" <> j->>'id'
          ), 0)
          + 0.000001::numeric
        ) THEN
        RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF j->>'categoriaId' IS NOT NULL THEN
    SELECT * INTO r FROM "categorias_gastos" WHERE "id" = j->>'categoriaId';
    IF NOT FOUND OR NEW."perfilId" IS NULL OR r."perfilId" IS DISTINCT FROM NEW."perfilId"
      OR r."storeId" IS DISTINCT FROM NEW."storeId"
      OR (TG_TABLE_NAME = 'contas_pagar_titulos' AND r."natureza" <> 'DESPESA')
      OR (TG_TABLE_NAME = 'contas_receber_titulos' AND r."natureza" <> 'RECEITA')
      OR (TG_TABLE_NAME = 'movimentacoes_financeiras' AND r."natureza" <> CASE WHEN j->>'tipo' = 'saida' THEN 'DESPESA' ELSE 'RECEITA' END) THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."ativo" AND (TG_OP = 'INSERT' OR anterior->>'categoriaId' IS DISTINCT FROM j->>'categoriaId') THEN
      RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF j->>'fornecedorId' IS NOT NULL THEN
    SELECT * INTO r FROM "fornecedores" WHERE "id" = j->>'fornecedorId';
    IF NOT FOUND OR NEW."storeId" IS NULL OR r."storeId" IS DISTINCT FROM NEW."storeId" THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."active" AND (TG_OP = 'INSERT' OR OLD."fornecedorId" IS DISTINCT FROM NEW."fornecedorId") THEN
      RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF j->>'pagarTituloId' IS NOT NULL THEN
    SELECT * INTO r FROM "contas_pagar_titulos" WHERE "id" = j->>'pagarTituloId';
    IF NOT FOUND OR r."perfilId" IS DISTINCT FROM NEW."perfilId"
      OR r."storeId" IS DISTINCT FROM NEW."storeId" OR j->>'tipo' <> 'saida' THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."ativo" AND (TG_OP = 'INSERT' OR anterior->>'pagarTituloId' IS DISTINCT FROM j->>'pagarTituloId') THEN
      RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF j->>'receberTituloId' IS NOT NULL THEN
    SELECT * INTO r FROM "contas_receber_titulos" WHERE "id" = j->>'receberTituloId';
    IF NOT FOUND OR r."perfilId" IS DISTINCT FROM NEW."perfilId"
      OR r."storeId" IS DISTINCT FROM NEW."storeId" OR j->>'tipo' <> 'entrada' THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
    IF NOT r."ativo" AND (TG_OP = 'INSERT' OR anterior->>'receberTituloId' IS DISTINCT FROM j->>'receberTituloId') THEN
      RAISE EXCEPTION 'Vinculo financeiro inativo' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gastos_carteira_escopo BEFORE INSERT OR UPDATE ON "carteiras_financeiras" FOR EACH ROW EXECUTE FUNCTION gastos_validar_escopo();
CREATE TRIGGER gastos_categoria_escopo BEFORE INSERT OR UPDATE ON "categorias_gastos" FOR EACH ROW EXECUTE FUNCTION gastos_validar_escopo();
CREATE TRIGGER gastos_pagar_escopo BEFORE INSERT OR UPDATE ON "contas_pagar_titulos" FOR EACH ROW EXECUTE FUNCTION gastos_validar_escopo();
CREATE TRIGGER gastos_receber_escopo BEFORE INSERT OR UPDATE ON "contas_receber_titulos" FOR EACH ROW EXECUTE FUNCTION gastos_validar_escopo();
CREATE TRIGGER gastos_mov_escopo BEFORE INSERT OR UPDATE ON "movimentacoes_financeiras" FOR EACH ROW EXECUTE FUNCTION gastos_validar_escopo();

-- A FK histórica da venda aponta só para id; conferir o escopo também nessa entrada.
CREATE FUNCTION gastos_validar_titulo_venda() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE t record;
BEGIN
  IF NEW."contaReceberTituloId" IS NOT NULL THEN
    SELECT * INTO t FROM "contas_receber_titulos" WHERE "id" = NEW."contaReceberTituloId";
    IF NOT FOUND OR t."storeId" IS NULL OR t."storeId" IS DISTINCT FROM NEW."storeId" OR NOT t."ativo" THEN
      RAISE EXCEPTION 'Vinculo financeiro invalido' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gastos_venda_titulo_escopo BEFORE INSERT OR UPDATE OF "contaReceberTituloId", "storeId" ON "vendas" FOR EACH ROW EXECUTE FUNCTION gastos_validar_titulo_venda();

-- Mesmo padrão fechado do G001: sem política pública/BYPASSRLS ou privilégio produtivo.
ALTER TABLE "categorias_gastos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carteiras_financeiras" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contas_pagar_titulos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contas_receber_titulos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimentacoes_financeiras" ENABLE ROW LEVEL SECURITY;

-- Contrato de RLS (runtime restrito) na mesma transação do ENABLE.
CREATE POLICY gm_runtime_escopo ON "categorias_gastos" FOR ALL
  USING (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())))
  WITH CHECK (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())));
CREATE POLICY gm_runtime_escopo ON "carteiras_financeiras" FOR ALL
  USING (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())))
  WITH CHECK (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())));
CREATE POLICY gm_runtime_escopo ON "contas_pagar_titulos" FOR ALL
  USING (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())))
  WITH CHECK (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())));
CREATE POLICY gm_runtime_escopo ON "contas_receber_titulos" FOR ALL
  USING (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())))
  WITH CHECK (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())));
CREATE POLICY gm_runtime_escopo ON "movimentacoes_financeiras" FOR ALL
  USING (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())))
  WITH CHECK (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())));

COMMIT;
