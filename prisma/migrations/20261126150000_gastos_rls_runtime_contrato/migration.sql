-- OMNI-GESTOR-MONEY-FOUNDATION-HARDENING-P0-002 — contrato de RLS compatível com runtime restrito.
--
-- As migrations G001–G004 ligam RLS (sem FORCE) nas tabelas financeiras centrais e nas novas,
-- sem policies: um papel de runtime que não seja o dono das tabelas passava a ler ZERO linhas
-- de carteiras/títulos/movimentações (indisponibilidade total de PDV/Financeiro).
--
-- Contrato (sem BYPASSRLS, sem superusuário, sem desligar RLS, sem policy indiscriminada):
--   * EMPRESA ("storeId" NOT NULL): visível ao runtime, como antes das migrations. O isolamento
--     entre lojas continua na aplicação (requireModuleApi/canAccessStore + filtros por storeId),
--     exatamente como na main — esta migration não o enfraquece nem o substitui.
--   * PESSOAL ("storeId" NULL): visível/gravável SOMENTE quando a transação declara o dono em
--     app.gm_owner_user (set_config(..., true) = local à transação), o que o servidor só faz
--     depois da revalidação do contexto opaco G001. Sem contexto → nenhuma linha pessoal.
--     O valor local some no COMMIT/ROLLBACK: conexões reutilizadas pelo pool não herdam.
--   * Papéis do worker G006 (omni_gastos_*) ficam fora destas policies: o acesso deles continua
--     exclusivamente o das policies por papel do G006 (policies permissivas somam com OR).
--   * Sem FORCE: o dono das tabelas continua isento, como antes. Com runtime dono, a privacidade
--     pessoal é garantida pela aplicação; FORCE é decisão do GOAL de ativação.
-- Nenhum DML, nenhum backfill, nenhum GRANT.

BEGIN;

CREATE OR REPLACE FUNCTION gm_contexto_owner() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.gm_owner_user', true), '')
$$;

CREATE OR REPLACE FUNCTION gm_papel_g006() RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT current_user IN ('omni_gastos_ingress', 'omni_gastos_worker', 'omni_gastos_operator')
$$;

-- Perfil pessoal do dono declarado na transação (NULL sem contexto). Lê financeiro_perfis como o
-- próprio invocador, sob a policy gm_runtime_perfis abaixo (sem recursão: ela não chama esta função).
CREATE OR REPLACE FUNCTION gm_perfil_pessoal_contexto() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT p."id" FROM "financeiro_perfis" p
  WHERE p."tipo" = 'PESSOAL' AND p."storeId" IS NULL AND p."ownerAdminUserId" = gm_contexto_owner()
$$;

CREATE POLICY gm_runtime_perfis ON "financeiro_perfis" FOR ALL
  USING (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("ownerAdminUserId" IS NOT NULL AND "ownerAdminUserId" = gm_contexto_owner())))
  WITH CHECK (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
    OR ("ownerAdminUserId" IS NOT NULL AND "ownerAdminUserId" = gm_contexto_owner())));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- centrais (legado) + G002
    'carteiras_financeiras', 'contas_pagar_titulos', 'contas_receber_titulos', 'movimentacoes_financeiras',
    'categorias_gastos', 'financeiro_perfil_membros',
    -- G003
    'documentos_gastos', 'documentos_vinculos',
    -- G004 (o motor grava estas tabelas na transação da aplicação)
    'gastos_revisoes', 'financeiro_operacoes', 'gastos', 'pagamentos_financeiros', 'alocacoes_pagamento',
    'cartoes_instrumentos', 'cartoes_ciclos', 'financeiro_operacao_eventos', 'gastos_outbox'
  ] LOOP
    EXECUTE format($p$
      CREATE POLICY gm_runtime_escopo ON %I FOR ALL
        USING (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
          OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())))
        WITH CHECK (NOT gm_papel_g006() AND ("storeId" IS NOT NULL
          OR ("perfilId" IS NOT NULL AND "perfilId" = gm_perfil_pessoal_contexto())))
    $p$, t);
  END LOOP;
END $$;

COMMIT;
