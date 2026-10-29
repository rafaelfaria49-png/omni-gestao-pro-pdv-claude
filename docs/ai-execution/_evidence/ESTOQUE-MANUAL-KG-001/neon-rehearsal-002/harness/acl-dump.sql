-- Fotografia de posse/ACL/pertencimento para comparar antes × depois da suspensão/retomada do compute.
BEGIN READ ONLY;
SELECT 'db ' || datname || ' owner=' || pg_get_userbyid(datdba) || ' acl=' || coalesce(datacl::text, 'NULL') FROM pg_database WHERE NOT datistemplate ORDER BY datname;
SELECT 'role ' || rolname || ' super=' || rolsuper || ' login=' || rolcanlogin || ' createrole=' || rolcreaterole || ' createdb=' || rolcreatedb || ' bypassrls=' || rolbypassrls || ' inherit=' || rolinherit
  FROM pg_roles WHERE rolname IN ('neondb_owner', 'omni_owner', 'omni_migrator', 'omni_runtime_v2', 'neon_superuser') ORDER BY rolname;
SELECT 'member ' || pg_get_userbyid(roleid) || ' > ' || pg_get_userbyid(member) || ' admin=' || admin_option || ' inherit=' || inherit_option || ' set=' || set_option || ' grantor=' || pg_get_userbyid(grantor)
  FROM pg_auth_members WHERE pg_get_userbyid(roleid) LIKE 'omni%' OR pg_get_userbyid(member) LIKE 'omni%' OR pg_get_userbyid(member) = 'neondb_owner' ORDER BY 1;
SELECT 'schema public owner=' || pg_get_userbyid(nspowner) || ' acl=' || coalesce(nspacl::text, 'NULL') FROM pg_namespace WHERE nspname = 'public';
SELECT 'owners ' || string_agg(o || ':' || n, ' ' ORDER BY o) FROM (
  SELECT pg_get_userbyid(c.relowner) || '/' || c.relkind::text AS o, count(*) AS n FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace GROUP BY 1
  UNION ALL SELECT pg_get_userbyid(t.typowner) || '/type' || t.typtype::text, count(*) FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace AND t.typtype IN ('e','d','r') GROUP BY 1
  UNION ALL SELECT pg_get_userbyid(p.proowner) || '/proc', count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace GROUP BY 1) x;
SELECT 'table_acl_md5 ' || md5(string_agg(relname || ':' || coalesce(relacl::text, 'NULL'), ',' ORDER BY relname)) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p','v','m','S');
SELECT 'runtime_v2_dml_tables ' || count(*) FILTER (WHERE has_table_privilege('omni_runtime_v2', c.oid, 'SELECT') AND has_table_privilege('omni_runtime_v2', c.oid, 'INSERT') AND has_table_privilege('omni_runtime_v2', c.oid, 'UPDATE') AND has_table_privilege('omni_runtime_v2', c.oid, 'DELETE')) || '/' || count(*)
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p');
SELECT 'default_acl ' || pg_get_userbyid(defaclrole) || ' ns=' || coalesce(defaclnamespace::regnamespace::text, '*') || ' type=' || defaclobjtype::text || ' acl=' || defaclacl::text FROM pg_default_acl ORDER BY 1;
SELECT 'connect ' || r || '=' || has_database_privilege(r, current_database(), 'CONNECT') FROM unnest(ARRAY['neondb_owner','omni_migrator','omni_runtime_v2']) r;
ROLLBACK;
