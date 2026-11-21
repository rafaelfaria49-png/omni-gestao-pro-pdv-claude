-- Private comparison material: the harness never logs or saves these digests.
-- All row hashing happens on the server; no IDs, amounts or customer data leave it.
SELECT json_build_object('check', 'private_snapshot', 'data', jsonb_build_object(
  'estoque_produtos', (SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM public.estoque_produtos t),
  'produto_depositos', (SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM public.produto_depositos t),
  'movimentacoes_estoque', (SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM public.movimentacoes_estoque t),
  'vendas', (SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM public.vendas t),
  'sessoes_caixa', (SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM public.sessoes_caixa t),
  '_prisma_migrations', (SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM public._prisma_migrations t)
), 'schema', (
  SELECT md5(coalesce(string_agg(item, E'\n' ORDER BY item), '')) FROM (
    SELECT concat_ws('|', 'relation', c.oid, c.relname, c.relkind, c.relowner, c.relacl::text,
      c.relpersistence, c.relrowsecurity, c.relforcerowsecurity) AS item
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT concat_ws('|', 'column', c.oid, a.attnum, a.attname, a.atttypid, a.atttypmod,
      a.attnotnull, a.attidentity, a.attgenerated, a.attisdropped, a.attacl::text,
      pg_get_expr(d.adbin, d.adrelid))
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND a.attnum > 0
    UNION ALL
    SELECT concat_ws('|', 'constraint', co.oid, co.conname, pg_get_constraintdef(co.oid))
      FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT concat_ws('|', 'index', i.indexrelid, pg_get_indexdef(i.indexrelid))
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT concat_ws('|', 'trigger', t.oid, pg_get_triggerdef(t.oid))
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT concat_ws('|', 'policy', p.oid, to_jsonb(p)::text)
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT concat_ws('|', 'function', p.oid, p.proowner, p.proacl::text, p.prosrc, p.proconfig::text, p.prosecdef)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT concat_ws('|', 'type', t.oid, t.typname, t.typowner, t.typacl::text, t.typbasetype, t.typtype)
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT concat_ws('|', 'enum', e.enumtypid, e.enumsortorder, e.enumlabel)
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT concat_ws('|', 'schema', n.oid, n.nspname, n.nspowner, n.nspacl::text) FROM pg_namespace n
    UNION ALL
    SELECT concat_ws('|', 'database', d.oid, d.datname, d.datdba, d.datacl::text) FROM pg_database d WHERE d.datname = current_database()
    UNION ALL
    SELECT concat_ws('|', 'role', r.oid, r.rolname, r.rolcanlogin, r.rolsuper, r.rolbypassrls,
      r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolinherit, r.rolconfig::text) FROM pg_roles r
    UNION ALL
    SELECT concat_ws('|', 'membership', to_jsonb(m)::text) FROM pg_auth_members m
  ) structural_items
));

SELECT json_build_object('check', 'migration_state', 'total', count(*),
  'finished', count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
  'kg_records', count(*) FILTER (WHERE migration_name = '20261025120000_estoque_quantidade_fracionada'))
FROM public._prisma_migrations;

SELECT json_build_object('check', 'old_runtime',
  'login', (SELECT rolcanlogin FROM pg_roles WHERE rolname = 'neondb_owner'),
  'connect', has_database_privilege('neondb_owner', current_database(), 'CONNECT'),
  'stock_update_catalog_only', has_table_privilege('neondb_owner', 'public.estoque_produtos', 'UPDATE'));

-- Only technical session counts; application names and SQL text are not exported.
SELECT json_build_object('check', 'sessions', 'rows', coalesce(json_agg(x ORDER BY x.role, x.origin), '[]'))
FROM (
  SELECT usename AS role, CASE WHEN application_name LIKE 'kg-a4-%' THEN 'A4' ELSE 'other' END AS origin,
         count(*) AS sessions
  FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2
) x;
