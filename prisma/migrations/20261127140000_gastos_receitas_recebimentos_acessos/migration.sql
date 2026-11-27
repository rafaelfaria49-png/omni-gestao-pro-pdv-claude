-- OMNI-GESTOR-MONEY-CONVERSATIONAL-CONTRACTS-FINAL-001 (aditivo; aplicar DEPOIS de 20261127120000).
-- 1) Receita e recebimento canônicos no G004 (CHECK da revisão + ramos do gatilho de consistência;
--    o restante do corpo é o da 20261127100000, intacto). 2) Inbox G006 aceita PROCESSADO_G008.
-- 3) Auditoria imutável de provisionamento/concessão/revogação de acesso ao perfil EMPRESA.
-- Nenhuma tabela/coluna existente é removida; nenhum dado é reescrito.
BEGIN;
SET LOCAL lock_timeout = '500ms';

ALTER TABLE gastos_revisoes DROP CONSTRAINT g004_revisao_check;
ALTER TABLE gastos_revisoes ADD CONSTRAINT g004_revisao_check CHECK (
  versao > 0 AND length("grupoChave") BETWEEN 1 AND 191 AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND estado IN ('PRONTA','APLICADA','SUBSTITUIDA','CANCELADA','EXPIRADA')
  AND tipo IN ('GASTO_PAGO','CONTA_PAGAR','PAGAR_TITULO','COMPRA_CREDITO','PAGAR_FATURA','ESTORNAR_PAGAMENTO','ESTORNAR_LEGADO',
    'TRANSFERENCIA_INTERNA','RECEITA_RECEBIDA','RECEBER_TITULO')
  AND jsonb_typeof(proposta)='object' AND proposta->>'tipo'=tipo
  AND "expiraEm">"createdAt" AND ((estado='PRONTA')=("decididaEm" IS NULL)));

CREATE OR REPLACE FUNCTION g004_consistencia_final() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE op record; rev record; p record; m record; soma numeric; qtd integer; esperado integer; ident text;
BEGIN
  IF TG_TABLE_NAME='financeiro_operacoes' THEN ident:=NEW.id;
  ELSIF TG_TABLE_NAME='alocacoes_pagamento' THEN SELECT "operacaoId" INTO ident FROM pagamentos_financeiros WHERE id=NEW."pagamentoId";
  ELSIF TG_TABLE_NAME='movimentacoes_financeiras' THEN ident:=NEW."operacaoFinanceiraId";
  ELSIF TG_TABLE_NAME='contas_pagar_titulos' THEN SELECT "operacaoId" INTO ident FROM gastos WHERE id=NEW."gastoId";
  ELSE ident:=NEW."operacaoId"; END IF;
  SELECT * INTO op FROM financeiro_operacoes WHERE id=ident;
  SELECT * INTO rev FROM gastos_revisoes WHERE id=op."revisaoId";
  IF op.estado<>'APLICADA' OR rev.estado<>'APLICADA' OR op."grupoChave" IS DISTINCT FROM rev."grupoChave"
    OR op."payloadHash" IS DISTINCT FROM rev."payloadHash" OR op.tipo IS DISTINCT FROM rev.tipo
    OR op.resultado->>'operacaoId' IS DISTINCT FROM op.id OR op.resultado->>'revisaoId' IS DISTINCT FROM rev.id
    OR op.resultado->>'estado' IS DISTINCT FROM 'APLICADA'
    OR NOT EXISTS(SELECT 1 FROM financeiro_operacao_eventos WHERE "operacaoId"=op.id AND dados=op.resultado)
    OR NOT EXISTS(SELECT 1 FROM gastos_outbox WHERE "operacaoId"=op.id AND payload=op.resultado) THEN
    RAISE EXCEPTION 'G004 operacao incompleta' USING ERRCODE='23514';
  END IF;
  -- RECEITA_RECEBIDA / RECEBER_TITULO: sem fato nem pagamento; exatamente UMA entrada na conta da proposta.
  IF op.tipo='RECEITA_RECEBIDA' THEN
    IF EXISTS(SELECT 1 FROM gastos WHERE "operacaoId"=op.id) OR EXISTS(SELECT 1 FROM pagamentos_financeiros WHERE "operacaoId"=op.id) THEN
      RAISE EXCEPTION 'G004 receita_recebida com fato ou pagamento' USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO qtd FROM movimentacoes_financeiras WHERE "operacaoFinanceiraId"=op.id;
    SELECT * INTO m FROM movimentacoes_financeiras WHERE "operacaoFinanceiraId"=op.id;
    IF qtd<>1 OR m.tipo IS DISTINCT FROM 'entrada' OR m.origem IS DISTINCT FROM 'receita'
      OR m."perfilId" IS DISTINCT FROM op."perfilId" OR m."storeId" IS DISTINCT FROM op."storeId"
      OR m."carteiraId" IS DISTINCT FROM rev.proposta->>'carteiraId'
      OR m."formaPagamento" IS DISTINCT FROM rev.proposta->>'formaPagamento'
      OR op.resultado->>'valorCentavos' IS DISTINCT FROM m."valorCentavos"::text
      OR m."compensaMovimentacaoId" IS NOT NULL OR m."pagarTituloId" IS NOT NULL
      OR m."valorCentavos" IS DISTINCT FROM (rev.proposta->>'valorCentavos')::numeric
      OR m."categoriaId" IS DISTINCT FROM rev.proposta->>'categoriaId' OR m."receberTituloId" IS NOT NULL
      OR op.resultado->>'pagamentoId' IS NOT NULL OR op.resultado->>'gastoId' IS NOT NULL
      OR op.resultado->'movimentoIds' IS DISTINCT FROM jsonb_build_array(m.id) THEN
      RAISE EXCEPTION 'G004 receita_recebida inconsistente' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END IF;
  IF op.tipo='RECEBER_TITULO' THEN
    IF EXISTS(SELECT 1 FROM gastos WHERE "operacaoId"=op.id) OR EXISTS(SELECT 1 FROM pagamentos_financeiros WHERE "operacaoId"=op.id) THEN
      RAISE EXCEPTION 'G004 receber_titulo com fato ou pagamento' USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO qtd FROM movimentacoes_financeiras WHERE "operacaoFinanceiraId"=op.id;
    SELECT * INTO m FROM movimentacoes_financeiras WHERE "operacaoFinanceiraId"=op.id;
    IF qtd<>1 OR m.tipo IS DISTINCT FROM 'entrada' OR m.origem IS DISTINCT FROM 'receber'
      OR m."perfilId" IS DISTINCT FROM op."perfilId" OR m."storeId" IS DISTINCT FROM op."storeId"
      OR m."carteiraId" IS DISTINCT FROM rev.proposta->>'carteiraId'
      OR m."formaPagamento" IS DISTINCT FROM rev.proposta->>'formaPagamento'
      OR op.resultado->>'valorCentavos' IS DISTINCT FROM m."valorCentavos"::text
      OR m."compensaMovimentacaoId" IS NOT NULL OR m."pagarTituloId" IS NOT NULL
      OR m."receberTituloId" IS DISTINCT FROM rev.proposta->>'tituloId'
      OR (rev.proposta ? 'valorCentavos' AND m."valorCentavos" IS DISTINCT FROM (rev.proposta->>'valorCentavos')::numeric)
      OR op.resultado->>'pagamentoId' IS NOT NULL OR op.resultado->>'gastoId' IS NOT NULL
      OR op.resultado->'movimentoIds' IS DISTINCT FROM jsonb_build_array(m.id) THEN
      RAISE EXCEPTION 'G004 receber_titulo inconsistente' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END IF;
  -- TRANSFERENCIA_INTERNA: sem fato nem pagamento; exatamente uma saída e uma entrada do mesmo valor e instante,
  -- em contas distintas do mesmo perfil/escopo, marcadas como transferência (fora de receita/despesa).
  IF op.tipo='TRANSFERENCIA_INTERNA' THEN
    IF EXISTS(SELECT 1 FROM gastos WHERE "operacaoId"=op.id) OR EXISTS(SELECT 1 FROM pagamentos_financeiros WHERE "operacaoId"=op.id) THEN
      RAISE EXCEPTION 'G004 transferencia com fato ou pagamento' USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO qtd FROM movimentacoes_financeiras WHERE "operacaoFinanceiraId"=op.id;
    SELECT * INTO p FROM movimentacoes_financeiras WHERE "operacaoFinanceiraId"=op.id AND tipo='saida';
    SELECT * INTO m FROM movimentacoes_financeiras WHERE "operacaoFinanceiraId"=op.id AND tipo='entrada';
    IF qtd<>2 OR p.id IS NULL OR m.id IS NULL
      OR p.origem IS DISTINCT FROM 'transferencia' OR m.origem IS DISTINCT FROM 'transferencia'
      OR p."perfilId" IS DISTINCT FROM op."perfilId" OR m."perfilId" IS DISTINCT FROM op."perfilId"
      OR p."storeId" IS DISTINCT FROM op."storeId" OR m."storeId" IS DISTINCT FROM op."storeId"
      OR p."valorCentavos" IS DISTINCT FROM (rev.proposta->>'valorCentavos')::numeric
      OR m."valorCentavos" IS DISTINCT FROM p."valorCentavos"
      OR op.resultado->>'valorCentavos' IS DISTINCT FROM p."valorCentavos"::text
      OR p."carteiraId" IS DISTINCT FROM rev.proposta->>'carteiraOrigemId'
      OR m."carteiraId" IS DISTINCT FROM rev.proposta->>'carteiraDestinoId' OR p."carteiraId"=m."carteiraId"
      OR p."ocorridoEm" IS DISTINCT FROM m."ocorridoEm"
      OR p."compensaMovimentacaoId" IS NOT NULL OR m."compensaMovimentacaoId" IS NOT NULL
      OR p."pagarTituloId" IS NOT NULL OR m."pagarTituloId" IS NOT NULL OR p."categoriaId" IS NOT NULL OR m."categoriaId" IS NOT NULL
      OR op.resultado->>'pagamentoId' IS NOT NULL OR op.resultado->>'gastoId' IS NOT NULL
      OR op.resultado->'movimentoIds' IS DISTINCT FROM jsonb_build_array(p.id, m.id) THEN
      RAISE EXCEPTION 'G004 transferencia inconsistente' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END IF;
  esperado:=CASE WHEN op.tipo IN ('GASTO_PAGO','CONTA_PAGAR','COMPRA_CREDITO') THEN 1 ELSE 0 END;
  SELECT count(*) INTO qtd FROM gastos WHERE "operacaoId"=op.id AND "revisaoId"=rev.id AND "grupoChave"=op."grupoChave" AND tipo=op.tipo;
  IF qtd<>esperado THEN RAISE EXCEPTION 'G004 fato inconsistente' USING ERRCODE='23514'; END IF;
  IF esperado=1 AND NOT EXISTS(SELECT 1 FROM gastos WHERE "operacaoId"=op.id
    AND "valorCentavos"=(rev.proposta->>'valorCentavos')::numeric
    AND "valorCentavos"=(op.resultado->>'valorCentavos')::numeric AND id=op.resultado->>'gastoId') THEN
    RAISE EXCEPTION 'G004 valor do fato inconsistente' USING ERRCODE='23514';
  END IF;
  esperado:=CASE WHEN op.tipo IN ('CONTA_PAGAR','COMPRA_CREDITO') THEN 0 ELSE 1 END;
  SELECT count(*) INTO qtd FROM pagamentos_financeiros WHERE "operacaoId"=op.id;
  IF qtd<>esperado THEN RAISE EXCEPTION 'G004 pagamento inconsistente' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO qtd FROM movimentacoes_financeiras WHERE "operacaoFinanceiraId"=op.id;
  IF qtd<>esperado THEN RAISE EXCEPTION 'G004 movimento inconsistente' USING ERRCODE='23514'; END IF;
  IF esperado=1 THEN
    SELECT * INTO p FROM pagamentos_financeiros WHERE "operacaoId"=op.id;
    SELECT * INTO m FROM movimentacoes_financeiras WHERE id=p."movimentoId";
    SELECT coalesce(sum("valorCentavos"),0),count(*) INTO soma,qtd FROM alocacoes_pagamento WHERE "pagamentoId"=p.id;
    IF soma<>p."valorCentavos" OR qtd=0 OR m."operacaoFinanceiraId" IS DISTINCT FROM op.id
      OR m."perfilId" IS DISTINCT FROM p."perfilId" OR m."storeId" IS DISTINCT FROM p."storeId"
      OR m."valorCentavos" IS DISTINCT FROM p."valorCentavos" OR m."carteiraId" IS DISTINCT FROM p."carteiraId"
      OR m."ocorridoEm" IS DISTINCT FROM p."pagoEm" OR m."formaPagamento" IS DISTINCT FROM p."formaPagamento"
      OR m.tipo IS DISTINCT FROM (CASE WHEN p.tipo='ESTORNO' THEN 'entrada' ELSE 'saida' END)
      OR (p.tipo='PAGAMENTO' AND m."compensaMovimentacaoId" IS NOT NULL)
      OR (p.tipo='ESTORNO' AND m."compensaMovimentacaoId" IS DISTINCT FROM coalesce(p."compensaMovimentoLegadoId",
        (SELECT "movimentoId" FROM pagamentos_financeiros WHERE id=p."compensaPagamentoId")))
      OR op.resultado->>'pagamentoId' IS DISTINCT FROM p.id
      OR op.resultado->>'valorCentavos' IS DISTINCT FROM p."valorCentavos"::text
      OR op.resultado->'movimentoIds' IS DISTINCT FROM jsonb_build_array(m.id) THEN
      RAISE EXCEPTION 'G004 pagamento movimento alocacao divergente' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT sum(t."valorCentavos") INTO soma FROM contas_pagar_titulos t JOIN gastos g ON g.id=t."gastoId" WHERE g."operacaoId"=op.id;
    IF soma IS DISTINCT FROM (op.resultado->>'valorCentavos')::numeric THEN RAISE EXCEPTION 'G004 obrigacao inconsistente' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;

ALTER TABLE whatsapp_gestao_inbox DROP CONSTRAINT g006_inbox_check;
ALTER TABLE whatsapp_gestao_inbox ADD CONSTRAINT g006_inbox_check CHECK (
  provedor='META' AND length("externalMessageId") BETWEEN 1 AND 260 AND "canalVersao">0
  AND "remetenteE164" ~ '^\+[1-9][0-9]{7,14}$' AND "conteudoHash" ~ '^[a-f0-9]{64}$'
  AND length("correlacaoId") BETWEEN 1 AND 260 AND proveniencia='INGRESSO_TECNICO_G006'
  AND jsonb_typeof(conteudo)='object' AND octet_length(conteudo::text)<=65536
  AND estado IN ('RECEBIDO','AGUARDANDO_VINCULO','PROCESSADO_G008'));

-- CreateTable
CREATE TABLE "financeiro_perfil_membros_eventos" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "autorAdminUserId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financeiro_perfil_membros_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financeiro_perfil_membros_eventos_perfilId_createdAt_idx" ON "financeiro_perfil_membros_eventos"("perfilId", "createdAt");

-- CreateIndex
CREATE INDEX "financeiro_perfil_membros_eventos_adminUserId_createdAt_idx" ON "financeiro_perfil_membros_eventos"("adminUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "financeiro_perfil_membros_eventos" ADD CONSTRAINT "financeiro_perfil_membros_eventos_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "financeiro_perfis"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE financeiro_perfil_membros_eventos ADD CONSTRAINT gm_membro_evento_check CHECK (
  acao IN ('PROVISIONADO','CONCEDIDO','REATIVADO','REVOGADO') AND length("storeId") BETWEEN 1 AND 191
  AND length("adminUserId") BETWEEN 1 AND 191 AND length("autorAdminUserId") BETWEEN 1 AND 191
  AND (motivo IS NULL OR length(motivo) BETWEEN 1 AND 500));
-- Imutável: UPDATE/DELETE recusados pelo mesmo guard do G004 (tabela fora da lista de exceções).
CREATE TRIGGER g004_imutavel BEFORE UPDATE OR DELETE ON financeiro_perfil_membros_eventos FOR EACH ROW EXECUTE FUNCTION g004_imutabilidade();
-- Mesmo contrato RLS dos membros: linhas EMPRESA visíveis ao runtime; papéis G006 fora.
ALTER TABLE financeiro_perfil_membros_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY gm_runtime_escopo ON financeiro_perfil_membros_eventos FOR ALL
  USING (NOT gm_papel_g006() AND "storeId" IS NOT NULL) WITH CHECK (NOT gm_papel_g006() AND "storeId" IS NOT NULL);

COMMIT;
