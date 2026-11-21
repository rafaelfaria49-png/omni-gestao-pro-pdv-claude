-- A4: catalog-only checks, used inside an already guarded READ ONLY transaction.
SELECT json_build_object('check', 'roles', 'rows', coalesce(json_agg(x ORDER BY x.role), '[]'))
FROM (
  SELECT rolname AS role, rolcanlogin AS login, rolsuper AS superuser,
         rolbypassrls AS bypassrls, rolcreaterole AS createrole, rolcreatedb AS createdb,
         rolreplication AS replication, rolinherit AS inherit, rolconnlimit AS connection_limit,
         rolconfig IS NULL AS no_role_settings
  FROM pg_roles WHERE rolname IN ('omni_owner', 'omni_runtime_v2', 'omni_migrator', 'neondb_owner')
) x;

SELECT json_build_object('check', 'memberships', 'rows', coalesce(json_agg(x ORDER BY x.member, x.role), '[]'))
FROM (
  SELECT pg_get_userbyid(member) AS member, pg_get_userbyid(roleid) AS role,
         admin_option, inherit_option, set_option, pg_get_userbyid(grantor) AS grantor
  FROM pg_auth_members
  WHERE member IN ('omni_runtime_v2'::regrole, 'omni_migrator'::regrole, 'omni_owner'::regrole)
     OR roleid IN ('omni_runtime_v2'::regrole, 'omni_migrator'::regrole, 'omni_owner'::regrole)
) x;

SELECT json_build_object('check', 'reachable_roles', 'rows', coalesce(json_agg(x ORDER BY x.subject, x.role), '[]'))
FROM (
  SELECT subject.name AS subject, r.rolname AS role,
         pg_has_role(subject.name, r.oid, 'MEMBER') AS member,
         pg_has_role(subject.name, r.oid, 'USAGE') AS inherited,
         pg_has_role(subject.name, r.oid, 'SET') AS can_set
  FROM (VALUES ('omni_runtime_v2'), ('omni_migrator'), ('omni_owner')) subject(name)
  CROSS JOIN pg_roles r
  WHERE r.rolname <> subject.name
    AND (pg_has_role(subject.name, r.oid, 'MEMBER')
      OR pg_has_role(subject.name, r.oid, 'USAGE')
      OR pg_has_role(subject.name, r.oid, 'SET'))
) x;

SELECT json_build_object('check', 'database_privileges', 'owner', pg_get_userbyid(d.datdba),
  'rows', (
    SELECT json_agg(json_build_object('role', r.rolname,
      'connect', has_database_privilege(r.oid, d.oid, 'CONNECT'),
      'create', has_database_privilege(r.oid, d.oid, 'CREATE'),
      'temp', has_database_privilege(r.oid, d.oid, 'TEMP')) ORDER BY r.rolname)
    FROM pg_roles r WHERE r.rolname IN ('omni_owner', 'omni_runtime_v2', 'omni_migrator', 'neondb_owner')
  ))
FROM pg_database d WHERE d.datname = current_database();

SELECT json_build_object('check', 'schema_privileges',
  'runtime_public_usage', has_schema_privilege('omni_runtime_v2', 'public', 'USAGE'),
  'runtime_public_create', has_schema_privilege('omni_runtime_v2', 'public', 'CREATE'),
  'runtime_schemas_with_create', (
    SELECT count(*) FROM pg_namespace WHERE has_schema_privilege('omni_runtime_v2', oid, 'CREATE')
  ),
  'migrator_public_usage', has_schema_privilege('omni_migrator', 'public', 'USAGE'),
  'migrator_public_create', has_schema_privilege('omni_migrator', 'public', 'CREATE'));

SELECT json_build_object('check', 'runtime_table_grants', 'tables', count(*),
  'select', count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'SELECT')),
  'insert', count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'INSERT')),
  'update', count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'UPDATE')),
  'delete', count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'DELETE')),
  'missing_dml', count(*) FILTER (WHERE NOT (
    has_table_privilege('omni_runtime_v2', c.oid, 'SELECT') AND
    has_table_privilege('omni_runtime_v2', c.oid, 'INSERT') AND
    has_table_privilege('omni_runtime_v2', c.oid, 'UPDATE') AND
    has_table_privilege('omni_runtime_v2', c.oid, 'DELETE'))),
  'truncate', count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'TRUNCATE')),
  'references', count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'REFERENCES')),
  'trigger', count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'TRIGGER')),
  'maintain', count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'MAINTAIN')),
  'grant_options', count(*) FILTER (WHERE
    has_table_privilege('omni_runtime_v2', c.oid, 'SELECT WITH GRANT OPTION') OR
    has_table_privilege('omni_runtime_v2', c.oid, 'INSERT WITH GRANT OPTION') OR
    has_table_privilege('omni_runtime_v2', c.oid, 'UPDATE WITH GRANT OPTION') OR
    has_table_privilege('omni_runtime_v2', c.oid, 'DELETE WITH GRANT OPTION')),
  'runtime_owned', count(*) FILTER (WHERE c.relowner = 'omni_runtime_v2'::regrole),
  'rls_enabled', count(*) FILTER (WHERE c.relrowsecurity))
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');

SELECT json_build_object('check', 'runtime_sequence_grants', 'sequences', count(*),
  'missing_usage_select_update', count(*) FILTER (WHERE NOT (
    has_sequence_privilege('omni_runtime_v2', c.oid, 'USAGE') AND
    has_sequence_privilege('omni_runtime_v2', c.oid, 'SELECT') AND
    has_sequence_privilege('omni_runtime_v2', c.oid, 'UPDATE'))))
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'S';

SELECT json_build_object('check', 'migrator_pre_transfer',
  'owner_member', pg_has_role('omni_migrator', 'omni_owner', 'MEMBER'),
  'owner_inherited', pg_has_role('omni_migrator', 'omni_owner', 'USAGE'),
  'owner_set', pg_has_role('omni_migrator', 'omni_owner', 'SET'),
  'stock_select', has_table_privilege('omni_migrator', 'public.estoque_produtos', 'SELECT'),
  'stock_update', has_table_privilege('omni_migrator', 'public.estoque_produtos', 'UPDATE'),
  'omni_owner_public_relations', (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relowner = 'omni_owner'::regrole),
  'old_owner_public_relations', (
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relowner = 'neondb_owner'::regrole));

-- pg_catalog is used because information_schema hides columns from a migrator
-- that has not yet received ownership. This query reads no business rows.
SELECT json_build_object('check', 'stock_columns', 'rows', coalesce(json_agg(x ORDER BY x.table_name, x.column_name), '[]'))
FROM (
  SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
    AND (c.relname, a.attname) IN (
      ('estoque_produtos', 'stock'), ('produto_depositos', 'quantidade'),
      ('movimentacoes_estoque', 'quantidade'), ('movimentacoes_estoque', 'estoqueAntes'),
      ('movimentacoes_estoque', 'estoqueDepois'))
) x;

SELECT json_build_object('check', 'ssl', 'enabled', ssl, 'protocol', version)
FROM pg_stat_ssl WHERE pid = pg_backend_pid();
