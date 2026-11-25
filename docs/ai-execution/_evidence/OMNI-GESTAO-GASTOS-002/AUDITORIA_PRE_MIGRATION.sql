-- G002: diagnóstico antes de aplicar a expansão, SEM corrigir ou preencher dados.
-- Compatível com o schema-base: não depende de perfilId/categoria ou colunas novas.
-- A execução deste GOAL usa somente massa sintética própria. Dados reais exigem
-- autorização separada. Resultado não concede permissões nem substitui R/gates.
-- BLOQUEIO = relação empresarial inconsistente; preparar decisão de saneamento.
-- REVISAR = precisão legada; preservar valor, sem arredondamento/backfill automático.
-- INFORMATIVO = vínculo histórico com conta inativa; não equivale a novo destino.
BEGIN TRANSACTION READ ONLY;
-- G002_AUDIT_QUERY_BEGIN
WITH valores AS (
  SELECT 'contas_pagar_titulos' AS tabela, "id", "storeId", 'valor' AS campo, "valor" AS valor FROM public."contas_pagar_titulos"
  UNION ALL SELECT 'contas_receber_titulos', "id", "storeId", 'valor', "valor" FROM public."contas_receber_titulos"
  UNION ALL SELECT 'movimentacoes_financeiras', "id", "storeId", 'valor', "valor" FROM public."movimentacoes_financeiras"
  UNION ALL SELECT 'carteiras_financeiras', "id", "storeId", 'saldoInicial', "saldoInicial" FROM public."carteiras_financeiras"
  UNION ALL SELECT 'carteiras_financeiras', "id", "storeId", 'saldoAtual', "saldoAtual" FROM public."carteiras_financeiras"
), problemas AS (
  SELECT 'FORNECEDOR_OUTRA_LOJA' AS codigo, 'BLOQUEIO' AS severidade,
    'contas_pagar_titulos' AS tabela, p."id", p."storeId", p."fornecedorId" AS relacionado, 'fornecedorId' AS campo
  FROM public."contas_pagar_titulos" p JOIN public."fornecedores" f ON f."id" = p."fornecedorId"
  WHERE p."storeId" IS DISTINCT FROM f."storeId"
  UNION ALL
  SELECT 'VENDA_TITULO_OUTRA_LOJA', 'BLOQUEIO', 'vendas', v."id", v."storeId", v."contaReceberTituloId", 'contaReceberTituloId'
  FROM public."vendas" v JOIN public."contas_receber_titulos" r ON r."id" = v."contaReceberTituloId"
  WHERE v."storeId" IS DISTINCT FROM r."storeId"
  UNION ALL
  SELECT 'MOVIMENTO_CONTA_OUTRA_LOJA', 'BLOQUEIO', 'movimentacoes_financeiras', m."id", m."storeId", m."carteiraId", 'carteiraId'
  FROM public."movimentacoes_financeiras" m JOIN public."carteiras_financeiras" c ON c."id" = m."carteiraId"
  WHERE m."storeId" IS DISTINCT FROM c."storeId"
  UNION ALL
  SELECT 'HISTORICO_CONTA_INATIVA', 'INFORMATIVO', 'movimentacoes_financeiras', m."id", m."storeId", m."carteiraId", 'carteiraId'
  FROM public."movimentacoes_financeiras" m JOIN public."carteiras_financeiras" c ON c."id" = m."carteiraId"
  WHERE NOT c."ativo" AND m."storeId" IS NOT DISTINCT FROM c."storeId"
  UNION ALL
  SELECT CASE WHEN valor::text IN ('NaN', 'Infinity', '-Infinity') THEN 'VALOR_NAO_FINITO' ELSE 'PRECISAO_LEGADA_NAO_CANONICA' END,
    CASE WHEN valor::text IN ('NaN', 'Infinity', '-Infinity') THEN 'BLOQUEIO' ELSE 'REVISAR' END, tabela, "id", "storeId", NULL::text, campo
  FROM valores
  WHERE CASE WHEN valor::text IN ('NaN', 'Infinity', '-Infinity') THEN true
    ELSE abs(valor) > 90000000000
      OR abs(valor::numeric * 100 - round(valor::numeric * 100)) > 0.000001 END
)
SELECT jsonb_build_object(
  'database', current_database(), 'usuario', current_user, 'porta', inet_server_port(),
  'papel', (SELECT jsonb_build_object('superuser', rolsuper, 'bypassrls', rolbypassrls, 'createdb', rolcreatedb, 'createrole', rolcreaterole)
    FROM pg_roles WHERE rolname = current_user),
  'tabelas', (SELECT jsonb_agg(jsonb_build_object('nome', c.relname, 'owner', pg_get_userbyid(c.relowner),
    'owner_atual', c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user),
    'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
    'policies', (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (
      'financeiro_perfis', 'financeiro_perfil_membros', 'categorias_gastos', 'carteiras_financeiras',
      'contas_pagar_titulos', 'contas_receber_titulos', 'movimentacoes_financeiras')),
  'problemas', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY severidade, codigo, tabela, "id") FROM problemas p), '[]'::jsonb),
  'contagens', (SELECT jsonb_build_object('bloqueios', count(*) FILTER (WHERE severidade = 'BLOQUEIO'),
    'revisar', count(*) FILTER (WHERE severidade = 'REVISAR'), 'informativos', count(*) FILTER (WHERE severidade = 'INFORMATIVO')) FROM problemas),
  'gate_runtime', 'Antes de aplicar RLS fora do ensaio, confirmar papel efetivo e ownership/politicas autorizadas; nunca conceder BYPASSRLS para fabricar PASS.'
) AS auditoria;
-- G002_AUDIT_QUERY_END
ROLLBACK;
